package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.domain.PaymentAllocation;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.VoidPaymentRequest;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentBatchRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Voiding a payment — Phase 4 of the financial correctness plan.
 *
 * <p>The invariant every reversal must satisfy:
 * <pre>
 *   state before the payment + payment + void == state before the payment
 * </pre>
 * Money must not survive its own reversal, and equally must not vanish twice.
 *
 * <p>These assert the round trip rather than the end state alone: a record left
 * at the right balance but the wrong status is still a bug, because status is
 * what the outstanding query filters on.
 *
 * <p>Reversal is append-only — the batch is marked VOIDED and the allocation
 * rows survive, so history is not rewritten (PaymentService.java:273-340).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PaymentService.voidPayment — reversal invariants")
class PaymentVoidReversalTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";

    @Mock private PaymentBatchRepository batchRepository;
    @Mock private PaymentRecordRepository paymentRecordRepository;
    @Mock private PaymentAllocationRepository allocationRepository;
    @Mock private PlanExpiryChecker planExpiryChecker;
    @Mock private PaymentEventPublisher eventPublisher;
    @Mock private com.chitfund.paymentservice.client.MemberServiceClient memberServiceClient;
    @Mock private com.chitfund.paymentservice.client.ChitServiceClient chitServiceClient;
    @Mock private AdminWalletService adminWalletService;
    @Mock private NotificationService notificationService;
    @Mock private MemberCreditService memberCreditService;
    @Mock private ChitMonthDrawService chitMonthDrawService;

    @InjectMocks private PaymentService service;

    private UUID batchId;
    private UUID memberId;
    private UUID chitId;
    private UUID adminId;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT);
        batchId = UUID.randomUUID();
        memberId = UUID.randomUUID();
        chitId = UUID.randomUUID();
        adminId = UUID.randomUUID();
        when(batchRepository.save(any(PaymentBatch.class))).thenAnswer(i -> i.getArgument(0));
        when(paymentRecordRepository.save(any(PaymentRecord.class))).thenAnswer(i -> i.getArgument(0));
        when(allocationRepository.findByBatchId(any())).thenReturn(List.of());
        // voidPayment builds a notification and calls isBlank() on the name, so an
        // unstubbed lookup surfaces as an NPE well away from the logic under test.
        when(memberServiceClient.getMemberName(any())).thenReturn("Test Member");
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ── fixtures ─────────────────────────────────────────────────────────────

    private PaymentBatch batch(BatchStatus status, String amount, PaymentMode mode) {
        return PaymentBatch.builder()
                .id(batchId).tenantId(TENANT).chitId(chitId).memberId(memberId)
                .totalAmount(new BigDecimal(amount))
                .paymentMode(mode)
                .status(status)
                .build();
    }

    private PaymentRecord rec(int month, String due, String paid, PaymentRecordStatus status) {
        return PaymentRecord.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).chitId(chitId).memberId(memberId)
                .monthNumber(month)
                .amountDue(new BigDecimal(due)).amountPaid(new BigDecimal(paid))
                .status(status).dueDate(LocalDate.of(2026, month, 1))
                .build();
    }

    private PaymentAllocation alloc(PaymentRecord r, String amount) {
        return PaymentAllocation.builder()
                .id(UUID.randomUUID()).batchId(batchId)
                .paymentRecordId(r.getId()).chitId(r.getChitId())
                .monthNumber(r.getMonthNumber())
                .allocatedAmount(new BigDecimal(amount))
                .build();
    }

    private void arrange(PaymentBatch b, List<PaymentRecord> records, List<PaymentAllocation> allocs) {
        when(batchRepository.findByIdAndTenantIdForUpdate(batchId, TENANT)).thenReturn(Optional.of(b));
        when(allocationRepository.findByBatchId(batchId)).thenReturn(new ArrayList<>(allocs));
        for (PaymentRecord r : records) {
            when(paymentRecordRepository.findById(r.getId())).thenReturn(Optional.of(r));
        }
    }

    private void doVoid() {
        VoidPaymentRequest req = new VoidPaymentRequest();
        req.setReason("recorded against the wrong member");
        service.voidPayment(batchId, req, adminId);
    }

    // ── the round trip ───────────────────────────────────────────────────────

    @Test
    @DisplayName("VOID-01: a settled month returns to exactly its pre-payment state")
    void fullReversalRestoresOriginalState() {
        // Before: month 1 owed 1,000, nothing paid.
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.COMPLETED, "1000", PaymentMode.UPI), List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        // After the round trip the record must be indistinguishable from before.
        assertThat(r.getAmountPaid()).isEqualByComparingTo("0");
        assertThat(r.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
    }

    @Test
    @DisplayName("VOID-02: a part-paid month keeps the portion other batches paid")
    void partialReversalKeepsOtherBatchesMoney() {
        // 1,000 due; 400 from an earlier batch, 600 from this one.
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.COMPLETED, "600", PaymentMode.UPI), List.of(r), List.of(alloc(r, "600")));

        doVoid();

        // Only this batch's 600 comes off — the other 400 is not ours to reverse.
        assertThat(r.getAmountPaid()).isEqualByComparingTo("400");
        assertThat(r.getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);
    }

    @Test
    @DisplayName("VOID-03: a batch spanning several months reverses each one")
    void reversesEveryAllocatedMonth() {
        PaymentRecord m1 = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        PaymentRecord m2 = rec(2, "1000", "1000", PaymentRecordStatus.SETTLED);
        PaymentRecord m3 = rec(3, "1000", "500", PaymentRecordStatus.PARTIALLY_PAID);
        arrange(batch(BatchStatus.COMPLETED, "2500", PaymentMode.UPI),
                List.of(m1, m2, m3),
                List.of(alloc(m1, "1000"), alloc(m2, "1000"), alloc(m3, "500")));

        doVoid();

        assertThat(m1.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
        assertThat(m2.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
        assertThat(m3.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
        assertThat(m1.getAmountPaid().add(m2.getAmountPaid()).add(m3.getAmountPaid()))
                .isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("VOID-04: reversal never drives a balance negative")
    void neverGoesNegative() {
        // Defensive: an allocation larger than what the record shows as paid — a
        // state that should not arise, but must not produce negative money if it does.
        PaymentRecord r = rec(1, "1000", "300", PaymentRecordStatus.PARTIALLY_PAID);
        arrange(batch(BatchStatus.COMPLETED, "1000", PaymentMode.UPI), List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        assertThat(r.getAmountPaid()).isGreaterThanOrEqualTo(BigDecimal.ZERO);
        assertThat(r.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
    }

    // ── treasury ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("VOID-05: voiding a completed cash payment takes the money back out of treasury")
    void completedBatchReversesTreasury() {
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.COMPLETED, "1000", PaymentMode.CASH), List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        ArgumentCaptor<AdminWalletEntryRequest> w = ArgumentCaptor.forClass(AdminWalletEntryRequest.class);
        verify(adminWalletService).addEntry(w.capture(), eq(adminId), any());
        // An OUT of the same size — the treasury must end where it started.
        assertThat(w.getValue().getEntryType()).isEqualTo(WalletEntryType.OUT);
        assertThat(w.getValue().getAmount()).isEqualByComparingTo("1000");
    }

    @Test
    @DisplayName("VOID-06: voiding cash that was never remitted must not debit treasury")
    void awaitingRemittanceDoesNotTouchTreasury() {
        // The money never reached the treasury, so reversing it would create a
        // phantom outflow and understate the balance.
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.AWAITING_REMITTANCE, "1000", PaymentMode.CASH),
                List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        verify(adminWalletService, never()).addEntry(any(), any(), any());
    }

    // ── credit ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("VOID-07: credit this batch consumed or created is reversed too")
    void reversesCreditMovements() {
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.COMPLETED, "1000", PaymentMode.UPI), List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        // Without this a member could overpay, have the excess banked as credit,
        // then have the payment voided and keep the credit.
        verify(memberCreditService).reverseCreditForVoidedBatch(batchId, memberId, adminId);
    }

    @Test
    @DisplayName("credit is reversed even before remittance, since it moves at collection time")
    void reversesCreditEvenWhenAwaitingRemittance() {
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.AWAITING_REMITTANCE, "1000", PaymentMode.CASH),
                List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        verify(memberCreditService).reverseCreditForVoidedBatch(batchId, memberId, adminId);
    }

    // ── idempotency and history ──────────────────────────────────────────────

    @Test
    @DisplayName("VOID-08: voiding twice is refused rather than reversing twice")
    void doubleVoidIsRejected() {
        PaymentRecord r = rec(1, "1000", "0", PaymentRecordStatus.OUTSTANDING);
        arrange(batch(BatchStatus.VOIDED, "1000", PaymentMode.UPI), List.of(r), List.of(alloc(r, "1000")));

        // A second reversal would subtract the same allocation again and drive
        // the member's dues below what they owe.
        assertThatThrownBy(this::doVoid)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already voided");

        verify(paymentRecordRepository, never()).save(any());
        verify(adminWalletService, never()).addEntry(any(), any(), any());
        verify(memberCreditService, never()).reverseCreditForVoidedBatch(any(), any(), any());
    }

    @Test
    @DisplayName("VOID-09: the batch is marked voided with who and why, not deleted")
    void voidIsAppendOnly() {
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        PaymentBatch b = batch(BatchStatus.COMPLETED, "1000", PaymentMode.UPI);
        arrange(b, List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        assertThat(b.getStatus()).isEqualTo(BatchStatus.VOIDED);
        assertThat(b.getVoidedBy()).isEqualTo(adminId);
        assertThat(b.getVoidedAt()).isNotNull();
        assertThat(b.getVoidReason()).isEqualTo("recorded against the wrong member");
        // Financial history must remain reconstructable.
        verify(batchRepository, never()).delete(any());
        verify(allocationRepository, never()).deleteAll(any());
    }

    @Test
    @DisplayName("VOID-10: a month closed by this payment is reopened for collection")
    void reopensDrawThatThisPaymentClosed() {
        PaymentRecord r = rec(1, "1000", "1000", PaymentRecordStatus.SETTLED);
        arrange(batch(BatchStatus.COMPLETED, "1000", PaymentMode.UPI), List.of(r), List.of(alloc(r, "1000")));

        doVoid();

        // Otherwise the month stays closed while the member once again owes money.
        verify(chitMonthDrawService).autoReopenIfNotFullySettled(chitId, 1);
    }

    @Test
    @DisplayName("voiding an unknown batch fails without changing anything")
    void unknownBatchChangesNothing() {
        when(batchRepository.findByIdAndTenantIdForUpdate(batchId, TENANT)).thenReturn(Optional.empty());

        assertThatThrownBy(this::doVoid).isInstanceOf(BusinessException.class);

        verify(paymentRecordRepository, never()).save(any());
        verify(adminWalletService, never()).addEntry(any(), any(), any());
    }

    @Test
    @DisplayName("a batch from another tenant is not found, so cannot be voided")
    void cannotVoidAnotherTenantsBatch() {
        // The lookup is tenant-scoped; a foreign batch simply does not resolve.
        TenantContext.set("20000000-0000-0000-0000-000000000002");
        when(batchRepository.findByIdAndTenantIdForUpdate(eq(batchId), eq(TENANT)))
                .thenReturn(Optional.of(batch(BatchStatus.COMPLETED, "1000", PaymentMode.UPI)));

        assertThatThrownBy(this::doVoid).isInstanceOf(BusinessException.class);
        verify(paymentRecordRepository, never()).save(any());
    }
}

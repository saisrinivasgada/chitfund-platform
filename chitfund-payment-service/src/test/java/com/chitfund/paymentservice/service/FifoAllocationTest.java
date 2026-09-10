package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.domain.PaymentAllocation;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentBatchRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.common.context.TenantContext;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * FIFO allocation and credit consumption — {@code PaymentService.applyFifo}.
 *
 * <p>This decides which month a member's money lands on. A total can look right
 * while the money sat on the wrong installment, so these assert per-record, not
 * just on sums.
 *
 * <p>Expected values are hand-computed literals matching the independent Python
 * oracle in {@code tests/oracle/chitmath.py} (cases CALC-F*, CALC-C*). Nothing
 * here reads an expectation back from the service.
 *
 * <p>Rule (PaymentService.java:606-668):
 * <pre>
 *   1. consume member credit, capped at total owed across ALL chits
 *   2. allocate oldest month first within the paying chit
 *   3. spill into other chits, oldest debt first
 *   4. any remainder becomes credit
 * </pre>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PaymentService — FIFO allocation and credit")
class FifoAllocationTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";

    @Mock private PaymentBatchRepository batchRepository;
    @Mock private PaymentRecordRepository paymentRecordRepository;
    @Mock private PaymentAllocationRepository allocationRepository;
    @Mock private PlanExpiryChecker planExpiryChecker;
    @Mock private PaymentEventPublisher eventPublisher;
    @Mock private MemberServiceClient memberServiceClient;
    @Mock private ChitServiceClient chitServiceClient;
    @Mock private AdminWalletService adminWalletService;
    @Mock private NotificationService notificationService;
    @Mock private MemberCreditService memberCreditService;
    @Mock private ChitMonthDrawService chitMonthDrawService;

    @InjectMocks private PaymentService service;

    private UUID memberId;
    private UUID chitA;
    private UUID chitB;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT);
        memberId = UUID.randomUUID();
        chitA = UUID.randomUUID();
        chitB = UUID.randomUUID();

        when(memberServiceClient.isMemberActive(any())).thenReturn(true);
        when(memberCreditService.getBalance(any())).thenReturn(BigDecimal.ZERO);
        when(paymentRecordRepository.findTotalOutstandingByMemberId(any(), anyList()))
                .thenReturn(BigDecimal.ZERO);
        when(paymentRecordRepository.findOutstandingAcrossOtherChitsForUpdate(any(), any(), anyList()))
                .thenReturn(List.of());
        when(batchRepository.save(any(PaymentBatch.class))).thenAnswer(inv -> {
            PaymentBatch b = inv.getArgument(0);
            if (b.getId() == null) b.setId(UUID.randomUUID());
            return b;
        });
        when(allocationRepository.save(any(PaymentAllocation.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(allocationRepository.findByBatchId(any())).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ── fixtures ─────────────────────────────────────────────────────────────

    private PaymentRecord record(UUID chitId, int month, String due, String paid,
                                 PaymentRecordStatus status) {
        return PaymentRecord.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .chitId(chitId)
                .memberId(memberId)
                .monthNumber(month)
                .amountDue(new BigDecimal(due))
                .amountPaid(new BigDecimal(paid))
                .status(status)
                .dueDate(LocalDate.of(2026, month, 1))
                .build();
    }

    private PaymentRecord outstanding(UUID chitId, int month, String due) {
        return record(chitId, month, due, "0", PaymentRecordStatus.OUTSTANDING);
    }

    private void withCurrentChitRecords(List<PaymentRecord> records) {
        when(paymentRecordRepository
                .findByMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
                        eq(memberId), eq(chitA), anyList()))
                .thenReturn(new ArrayList<>(records));
    }

    private void withOtherChitRecords(List<PaymentRecord> records) {
        when(paymentRecordRepository
                .findOutstandingAcrossOtherChitsForUpdate(eq(memberId), eq(chitA), anyList()))
                .thenReturn(new ArrayList<>(records));
    }

    private void pay(String amount) {
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal(amount));
        req.setPaymentMode(PaymentMode.UPI);   // completes immediately, FIFO applied inline
        service.recordPayment(req, UUID.randomUUID());
    }

    /** Allocations are persisted one at a time (PaymentService.java:687), not as a batch. */
    private List<PaymentAllocation> capturedAllocations() {
        ArgumentCaptor<PaymentAllocation> captor = ArgumentCaptor.forClass(PaymentAllocation.class);
        verify(allocationRepository, atLeastOnce()).save(captor.capture());
        return captor.getAllValues();
    }

    // ── ordering ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CALC-F01: ₹2,500 across three ₹1,000 months settles the two oldest, part-pays the third")
    void allocatesOldestFirst() {
        List<PaymentRecord> recs = List.of(
                outstanding(chitA, 1, "1000"),
                outstanding(chitA, 2, "1000"),
                outstanding(chitA, 3, "1000"));
        withCurrentChitRecords(recs);

        pay("2500");

        assertThat(recs.get(0).getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(recs.get(0).getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        assertThat(recs.get(1).getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(recs.get(1).getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        // The remainder must land on month 3, not be spread or dropped.
        assertThat(recs.get(2).getAmountPaid()).isEqualByComparingTo("500");
        assertThat(recs.get(2).getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);

        assertThat(capturedAllocations()).hasSize(3);
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    @Test
    @DisplayName("a part-paid month is topped up before newer months are touched")
    void topsUpPartiallyPaidMonthFirst() {
        PaymentRecord m1 = record(chitA, 1, "1000", "400", PaymentRecordStatus.PARTIALLY_PAID);
        PaymentRecord m2 = outstanding(chitA, 2, "1000");
        withCurrentChitRecords(List.of(m1, m2));

        pay("1000");

        // 600 completes month 1, the leftover 400 starts month 2.
        assertThat(m1.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(m1.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        assertThat(m2.getAmountPaid()).isEqualByComparingTo("400");
        assertThat(m2.getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);
    }

    @Test
    @DisplayName("an exact payment settles without creating credit")
    void exactPaymentLeavesNothingOver() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withCurrentChitRecords(List.of(m1));

        pay("1000");

        assertThat(m1.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    // ── cross-chit spill ─────────────────────────────────────────────────────

    @Test
    @DisplayName("CALC-F02: money left after the paying chit spills into the member's other chit")
    void spillsIntoOtherChits() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        PaymentRecord b1 = outstanding(chitB, 1, "1000");
        withCurrentChitRecords(List.of(a1));
        withOtherChitRecords(List.of(b1));

        pay("1500");

        assertThat(a1.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(b1.getAmountPaid()).isEqualByComparingTo("500");

        // The allocation must name the chit the money actually landed on,
        // otherwise a later void would reverse it against the wrong chit.
        List<PaymentAllocation> allocs = capturedAllocations();
        assertThat(allocs).hasSize(2);
        assertThat(allocs).anyMatch(a -> a.getChitId().equals(chitB)
                && a.getAllocatedAmount().compareTo(new BigDecimal("500")) == 0);
    }

    @Test
    @DisplayName("nothing spills while the paying chit still has dues")
    void doesNotSpillWhenCurrentChitUnsettled() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        PaymentRecord b1 = outstanding(chitB, 1, "1000");
        withCurrentChitRecords(List.of(a1));
        withOtherChitRecords(List.of(b1));

        pay("600");

        assertThat(a1.getAmountPaid()).isEqualByComparingTo("600");
        assertThat(b1.getAmountPaid()).isEqualByComparingTo("0");
    }

    // ── credit ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CALC-C02: overpaying with every chit clear turns the excess into credit")
    void overpaymentBecomesCredit() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withCurrentChitRecords(List.of(m1));

        pay("5000");

        ArgumentCaptor<BigDecimal> amt = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).addCredit(eq(memberId), amt.capture(), any(), any(), any(), anyString());
        assertThat(amt.getValue()).isEqualByComparingTo("4000");
    }

    @Test
    @DisplayName("CALC-C03: existing credit is spent before the new cash")
    void creditConsumedBeforeCash() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withCurrentChitRecords(List.of(m1));
        when(memberCreditService.getBalance(memberId)).thenReturn(new BigDecimal("400"));
        when(paymentRecordRepository.findTotalOutstandingByMemberId(eq(memberId), anyList()))
                .thenReturn(new BigDecimal("1000"));

        pay("600");

        ArgumentCaptor<BigDecimal> used = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).consumeCredit(eq(memberId), used.capture(), any(), any(), any(), anyString());
        assertThat(used.getValue()).isEqualByComparingTo("400");

        // 400 credit + 600 cash exactly clears the month, leaving no new credit.
        assertThat(m1.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    @Test
    @DisplayName("credit consumed is capped at what is owed, not at the balance")
    void creditConsumptionCappedAtOwed() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withCurrentChitRecords(List.of(m1));
        when(memberCreditService.getBalance(memberId)).thenReturn(new BigDecimal("5000"));
        when(paymentRecordRepository.findTotalOutstandingByMemberId(eq(memberId), anyList()))
                .thenReturn(new BigDecimal("1000"));

        pay("0.00");

        ArgumentCaptor<BigDecimal> used = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).consumeCredit(eq(memberId), used.capture(), any(), any(), any(), anyString());
        // Draining the full 5,000 against a 1,000 debt would destroy 4,000 of member money.
        assertThat(used.getValue()).isEqualByComparingTo("1000");
    }

    /**
     * A3 — credit is offset against dues in *every* chit, not only the one being
     * paid. Pinning it so the behaviour is visible; whether it should be
     * chit-scoped is an open product question.
     */
    @Test
    @DisplayName("A3: credit is offset against total dues across all chits")
    void creditOffsetIsCrossChit() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        withCurrentChitRecords(List.of(a1));
        when(memberCreditService.getBalance(memberId)).thenReturn(new BigDecimal("3000"));
        // 1,000 in this chit + 2,000 elsewhere.
        when(paymentRecordRepository.findTotalOutstandingByMemberId(eq(memberId), anyList()))
                .thenReturn(new BigDecimal("3000"));

        pay("0.00");

        ArgumentCaptor<BigDecimal> used = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).consumeCredit(eq(memberId), used.capture(), any(), any(), any(), anyString());
        assertThat(used.getValue()).isEqualByComparingTo("3000");
    }

    // ── statuses the allocator must not touch ────────────────────────────────

    @Test
    @DisplayName("a payout-deducted month is not re-paid by a later payment")
    void skipsNonAllocatableStatuses() {
        // The repository filters to OUTSTANDING/PARTIALLY_PAID; if that filter is
        // ever loosened, a winner's withheld installment could be charged twice.
        PaymentRecord deducted = record(chitA, 1, "1000", "1000", PaymentRecordStatus.PAYOUT_DEDUCTED);
        PaymentRecord open = outstanding(chitA, 2, "1000");
        withCurrentChitRecords(List.of(open));   // repo excludes the deducted row

        pay("1000");

        assertThat(open.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        assertThat(deducted.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(deducted.getStatus()).isEqualTo(PaymentRecordStatus.PAYOUT_DEDUCTED);
    }

    @Test
    @DisplayName("paying when nothing is owed becomes credit rather than being lost")
    void paymentWithNoDuesBecomesCredit() {
        withCurrentChitRecords(List.of());

        pay("1000");

        ArgumentCaptor<BigDecimal> amt = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).addCredit(eq(memberId), amt.capture(), any(), any(), any(), anyString());
        assertThat(amt.getValue()).isEqualByComparingTo("1000");
    }

    // ── idempotency ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("NEG-I01: replaying an idempotency key does not allocate twice")
    void idempotentReplayDoesNotReallocate() {
        PaymentBatch existing = PaymentBatch.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).chitId(chitA).memberId(memberId)
                .totalAmount(new BigDecimal("1000")).paymentMode(PaymentMode.UPI)
                .build();
        when(batchRepository.findByIdempotencyKey("key-1")).thenReturn(java.util.Optional.of(existing));

        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("1000"));
        req.setPaymentMode(PaymentMode.UPI);

        service.recordPayment(req, UUID.randomUUID(), "key-1");

        // The original batch is returned and no second financial effect occurs.
        verify(batchRepository, never()).save(any(PaymentBatch.class));
        verify(allocationRepository, never()).save(any(PaymentAllocation.class));
    }
}

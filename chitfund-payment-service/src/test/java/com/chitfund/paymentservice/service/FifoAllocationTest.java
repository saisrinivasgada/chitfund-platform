package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.domain.PaymentAllocation;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.request.CollectCashRequest;
import com.chitfund.paymentservice.dto.request.RequestedChitAllocation;
import com.chitfund.paymentservice.dto.response.PaymentPreviewResponse;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
 * <p>Rule (PaymentService.applyFifo):
 * <pre>
 *   1. one member-wide locked read of every outstanding record; total owed is
 *      summed from those same locked rows
 *   2. consume member credit, capped at total owed across ALL chits
 *   3. apply credit + cash to the oldest unpaid installment ACROSS ALL chits —
 *      regardless of the chit the request named — ordered by dueDate, then a
 *      deterministic tie-break of chitId, monthNumber, record id
 *   4. any remainder becomes credit
 * </pre>
 *
 * <p>Operator-selected explicit allocations ({@code applyExplicitChitAllocations})
 * are a separate path and stay chit-scoped — covered by the explicit-* tests below.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PaymentService — FIFO allocation and credit")
class FifoAllocationTest {
    @org.mockito.Mock FinancialCommandLock commandLocks;

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
    @Mock private com.chitfund.paymentservice.client.AuditClient auditClient;
    @Mock private OfflinePaymentReviewCapture offlineReviews;

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
        when(memberCreditService.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);
        when(paymentRecordRepository.findMemberOutstandingForUpdate(anyString(), any(), anyList()))
                .thenReturn(new ArrayList<>());
        when(batchRepository.saveAndFlush(any(PaymentBatch.class))).thenAnswer(inv -> {
            PaymentBatch b = inv.getArgument(0);
            if (b.getId() == null) b.setId(UUID.randomUUID());
            return b;
        });
        when(allocationRepository.save(any(PaymentAllocation.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(allocationRepository.findByTenantIdAndBatchId(anyString(), any())).thenReturn(List.of());
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

    /**
     * The automatic FIFO path takes a single member-wide locked read of every
     * outstanding record across all chits. The service sorts a copy, so order here
     * is irrelevant — the records may be handed over in any order.
     */
    private void withMemberOutstanding(List<PaymentRecord> records) {
        when(paymentRecordRepository.findMemberOutstandingForUpdate(
                eq(TENANT), eq(memberId), anyList()))
                .thenReturn(new ArrayList<>(records));
    }

    /** Explicit (operator-selected) path still reads per selected chit. */
    private void withCurrentChitRecords(List<PaymentRecord> records) {
        when(paymentRecordRepository
                .findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
                        eq(TENANT), eq(memberId), eq(chitA), anyList()))
                .thenReturn(new ArrayList<>(records));
    }

    private void pay(String amount) {
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal(amount));
        req.setPaymentMode(PaymentMode.UPI);   // completes immediately, FIFO applied inline
        req.setPaymentReference("UPI-FIFO-1");
        service.recordPayment(req, UUID.randomUUID());
    }

    private void payExplicit(String amount, UUID... chits) {
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chits[0]);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal(amount));
        req.setPaymentMode(PaymentMode.UPI);
        List<RequestedChitAllocation> requested = new ArrayList<>();
        BigDecimal each = new BigDecimal(amount).divide(BigDecimal.valueOf(chits.length));
        for (UUID chit : chits) {
            RequestedChitAllocation allocation = new RequestedChitAllocation();
            allocation.setChitId(chit);
            allocation.setAmount(each);
            requested.add(allocation);
        }
        req.setAllocations(requested);
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
        withMemberOutstanding(recs);

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
        withMemberOutstanding(List.of(m1, m2));

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
        withMemberOutstanding(List.of(m1));

        pay("1000");

        assertThat(m1.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    // ── cross-chit oldest-first ──────────────────────────────────────────────

    @Test
    @DisplayName("CALC-F02: cash settles equal-date dues in deterministic chit order")
    void spillsIntoOtherChits() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        PaymentRecord b1 = outstanding(chitB, 1, "1000");
        withMemberOutstanding(List.of(b1, a1));

        pay("1500");

        PaymentRecord first = chitA.toString().compareTo(chitB.toString()) < 0 ? a1 : b1;
        PaymentRecord second = first == a1 ? b1 : a1;
        assertThat(first.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(second.getAmountPaid()).isEqualByComparingTo("500");

        // The allocation must name the chit the money actually landed on,
        // otherwise a later void would reverse it against the wrong chit.
        List<PaymentAllocation> allocs = capturedAllocations();
        assertThat(allocs).hasSize(2);
        assertThat(allocs).anyMatch(a -> a.getChitId().equals(second.getChitId())
                && a.getAllocatedAmount().compareTo(new BigDecimal("500")) == 0);
    }

    @Test
    @DisplayName("an older due in another chit wins over the selected chit")
    void doesNotSpillWhenCurrentChitUnsettled() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        PaymentRecord b1 = outstanding(chitB, 1, "1000");
        a1.setDueDate(LocalDate.of(2026, 2, 1));
        b1.setDueDate(LocalDate.of(2026, 1, 1));
        withMemberOutstanding(List.of(a1, b1));

        pay("600");

        assertThat(b1.getAmountPaid()).isEqualByComparingTo("600");
        assertThat(a1.getAmountPaid()).isEqualByComparingTo("0");
    }

    // ── credit ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CALC-C02: overpaying with every chit clear turns the excess into credit")
    void overpaymentBecomesCredit() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(m1));

        pay("5000");

        ArgumentCaptor<BigDecimal> amt = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).addCredit(eq(memberId), amt.capture(), any(), any(), any(), anyString());
        assertThat(amt.getValue()).isEqualByComparingTo("4000");
    }

    @Test
    @DisplayName("CALC-C03: existing credit is spent before the new cash")
    void creditConsumedBeforeCash() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(m1));
        when(memberCreditService.getBalanceForUpdate(memberId)).thenReturn(new BigDecimal("400"));

        pay("600");

        ArgumentCaptor<BigDecimal> used = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).consumeCredit(eq(memberId), used.capture(), any(), any(), any(), anyString());
        assertThat(used.getValue()).isEqualByComparingTo("400");

        // 400 credit + 600 cash exactly clears the month, leaving no new credit.
        assertThat(m1.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    @Test
    @DisplayName("credit and new cash together clear the oldest other-chit due first")
    void creditAndCashFollowGlobalOldestFirst() {
        PaymentRecord selected = outstanding(chitA, 1, "1000");
        PaymentRecord older = outstanding(chitB, 1, "1000");
        selected.setDueDate(LocalDate.of(2026, 2, 1));
        older.setDueDate(LocalDate.of(2026, 1, 1));
        withMemberOutstanding(List.of(selected, older));
        when(memberCreditService.getBalanceForUpdate(memberId)).thenReturn(new BigDecimal("500"));

        pay("1000");

        verify(memberCreditService).consumeCredit(eq(memberId), eq(new BigDecimal("500")),
                any(), any(), any(), anyString());
        assertThat(older.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(selected.getAmountPaid()).isEqualByComparingTo("500");
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    @Test
    @DisplayName("server preview separates existing credit from new cash in global FIFO order")
    void previewMatchesPostedAllocationAcrossChits() {
        PaymentRecord selected = outstanding(chitA, 1, "1000");
        PaymentRecord older = outstanding(chitB, 1, "1000");
        selected.setDueDate(LocalDate.of(2026, 2, 1));
        older.setDueDate(LocalDate.of(2026, 1, 1));
        withMemberOutstanding(List.of(selected, older));
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndStatusInOrderById(
                eq(TENANT), eq(memberId), anyList())).thenReturn(List.of(selected, older));
        when(memberCreditService.getBalance(memberId)).thenReturn(new BigDecimal("500"));
        when(memberCreditService.getBalanceForUpdate(memberId)).thenReturn(new BigDecimal("500"));

        PaymentPreviewResponse preview = service.previewPayment(memberId, chitA, new BigDecimal("1000"));

        assertThat(preview.creditConsumed()).isEqualByComparingTo("500");
        assertThat(preview.totalOutstanding()).isEqualByComparingTo("2000");
        assertThat(preview.selectedChitOutstanding()).isEqualByComparingTo("1000");
        assertThat(preview.projectedNewCredit()).isEqualByComparingTo("0");
        assertThat(preview.balanceVersion()).isNotBlank();
        assertThat(preview.allocations()).hasSize(2);
        assertThat(preview.allocations().get(0).chitId()).isEqualTo(chitB);
        assertThat(preview.allocations().get(0).creditApplied()).isEqualByComparingTo("500");
        assertThat(preview.allocations().get(0).newPaymentApplied()).isEqualByComparingTo("500");
        assertThat(preview.allocations().get(1).chitId()).isEqualTo(chitA);
        assertThat(preview.allocations().get(1).creditApplied()).isEqualByComparingTo("0");
        assertThat(preview.allocations().get(1).newPaymentApplied()).isEqualByComparingTo("500");
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));

        pay("1000");
        assertThat(older.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(selected.getAmountPaid()).isEqualByComparingTo("500");
    }

    @Test
    @DisplayName("preview shows the full overpayment becoming new credit when no dues exist")
    void previewNoDuesProjectsNewCreditWithoutWriting() {
        when(memberCreditService.getBalance(memberId)).thenReturn(BigDecimal.ZERO);
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndStatusInOrderById(
                eq(TENANT), eq(memberId), anyList())).thenReturn(List.of());

        PaymentPreviewResponse preview = service.previewPayment(memberId, chitA, new BigDecimal("1200"));

        assertThat(preview.totalOutstanding()).isEqualByComparingTo("0");
        assertThat(preview.projectedNewCredit()).isEqualByComparingTo("1200");
        assertThat(preview.allocations()).isEmpty();
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    @Test
    @DisplayName("zero-cash preview shows exactly which old dues existing credit will clear")
    void previewCreditOnlyUsesNoCash() {
        PaymentRecord due = outstanding(chitA, 1, "1000");
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndStatusInOrderById(
                eq(TENANT), eq(memberId), anyList())).thenReturn(List.of(due));
        when(memberCreditService.getBalance(memberId)).thenReturn(new BigDecimal("400"));

        PaymentPreviewResponse preview = service.previewPayment(memberId, chitA, BigDecimal.ZERO);

        assertThat(preview.requestedAmount()).isEqualByComparingTo("0");
        assertThat(preview.creditConsumed()).isEqualByComparingTo("400");
        assertThat(preview.allocations()).hasSize(1);
        assertThat(preview.allocations().get(0).creditApplied()).isEqualByComparingTo("400");
        assertThat(preview.allocations().get(0).newPaymentApplied()).isEqualByComparingTo("0");
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));
    }

    @Test
    @DisplayName("credit-only posting requires the reviewed balance and consumes credit once")
    void creditOnlyPostingRequiresCurrentReview() {
        PaymentRecord due = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(due));
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndStatusInOrderById(
                eq(TENANT), eq(memberId), anyList())).thenReturn(List.of(due));
        when(memberCreditService.getBalance(memberId)).thenReturn(new BigDecimal("400"));
        when(memberCreditService.getBalanceForUpdate(memberId)).thenReturn(new BigDecimal("400"));
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(BigDecimal.ZERO);
        req.setPaymentMode(PaymentMode.CREDIT);

        assertThatThrownBy(() -> service.recordPayment(req, UUID.randomUUID(), "credit-review"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("Review the current payment allocation");
        req.setBalanceVersion("stale");
        assertThatThrownBy(() -> service.recordPayment(req, UUID.randomUUID(), "credit-review"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("balances changed");
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));

        req.setBalanceVersion(service.previewPayment(memberId, chitA, BigDecimal.ZERO).balanceVersion());
        service.recordPayment(req, UUID.randomUUID(), "credit-review");
        assertThat(due.getAmountPaid()).isEqualByComparingTo("400");
        verify(memberCreditService).consumeCredit(eq(memberId), eq(new BigDecimal("400")), any(), any(), any(), anyString());
        verify(batchRepository).saveAndFlush(any(PaymentBatch.class));
        verify(adminWalletService, never()).addEntry(any(), any(), anyString());
    }

    @Test
    @DisplayName("admin cash collection needs a current review before creating a receipt")
    void adminCashCollectionRequiresCurrentReview() {
        PaymentRecord due = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(due));
        when(memberCreditService.getBalance(memberId)).thenReturn(BigDecimal.ZERO);
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndStatusInOrderById(
                eq(TENANT), eq(memberId), anyList())).thenReturn(List.of(due));
        CollectCashRequest req = new CollectCashRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("600"));

        assertThatThrownBy(() -> service.collectCash(req, UUID.randomUUID(), true, "admin-cash-review"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("Review the current cash allocation");
        req.setBalanceVersion("stale");
        assertThatThrownBy(() -> service.collectCash(req, UUID.randomUUID(), true, "admin-cash-review"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("balances changed");
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));

        req.setBalanceVersion(service.previewPayment(memberId, chitA, req.getAmount()).balanceVersion());
        service.collectCash(req, UUID.randomUUID(), true, "admin-cash-review");
        assertThat(due.getAmountPaid()).isEqualByComparingTo("600");
        verify(batchRepository).saveAndFlush(any(PaymentBatch.class));
    }

    @Test
    @DisplayName("stale online review stops before receipt or credit movement")
    void staleReviewDoesNotPostMoney() {
        PaymentRecord due = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(due));
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("600"));
        req.setPaymentMode(PaymentMode.UPI);
        req.setBalanceVersion("stale-review");

        assertThatThrownBy(() -> service.recordPayment(req, UUID.randomUUID(), "review-key"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("balances changed");
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));
        verify(memberCreditService, never()).consumeCredit(any(), any(), any(), any(), any(), anyString());
        assertThat(due.getAmountPaid()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("current server preview version permits exactly the reviewed online allocation")
    void currentReviewPostsPayment() {
        PaymentRecord due = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(due));
        when(paymentRecordRepository.findByTenantIdAndMemberIdAndStatusInOrderById(
                eq(TENANT), eq(memberId), anyList())).thenReturn(List.of(due));
        when(memberCreditService.getBalance(memberId)).thenReturn(BigDecimal.ZERO);
        PaymentPreviewResponse preview = service.previewPayment(memberId, chitA, new BigDecimal("600"));

        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("600"));
        req.setPaymentMode(PaymentMode.UPI);
        req.setBalanceVersion(preview.balanceVersion());
        service.recordPayment(req, UUID.randomUUID(), "review-current-key");

        assertThat(due.getAmountPaid()).isEqualByComparingTo("600");
        verify(batchRepository).saveAndFlush(any(PaymentBatch.class));
    }

    @Test
    @DisplayName("positive CREDIT amount cannot create a payment without cash or existing credit")
    void positiveCreditAmountCannotFabricatePayment() {
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("1000"));
        req.setPaymentMode(PaymentMode.CREDIT);

        assertThatThrownBy(() -> service.recordPayment(req, UUID.randomUUID(), "credit-forgery"))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("zero cash amount");
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));
        verify(paymentRecordRepository, never()).save(any(PaymentRecord.class));
        verify(memberCreditService, never()).consumeCredit(any(), any(), any(), any(), any(), anyString());
        verify(adminWalletService, never()).addEntry(any(), any(), anyString());
    }

    @Test
    @DisplayName("credit consumed is capped at what is owed, not at the balance")
    void creditConsumptionCappedAtOwed() {
        PaymentRecord m1 = outstanding(chitA, 1, "1000");
        withMemberOutstanding(List.of(m1));
        when(memberCreditService.getBalanceForUpdate(memberId)).thenReturn(new BigDecimal("5000"));

        pay("0.00");

        ArgumentCaptor<BigDecimal> used = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).consumeCredit(eq(memberId), used.capture(), any(), any(), any(), anyString());
        // Draining the full 5,000 against a 1,000 debt would destroy 4,000 of member money.
        assertThat(used.getValue()).isEqualByComparingTo("1000");
    }

    /** Existing credit settles dues across chits, including the oldest other chit. */
    @Test
    @DisplayName("A3: credit is offset against total dues across all chits")
    void creditOffsetIsCrossChit() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        PaymentRecord b1 = outstanding(chitB, 1, "2000");
        b1.setDueDate(LocalDate.of(2025, 12, 1));
        withMemberOutstanding(List.of(a1, b1));
        when(memberCreditService.getBalanceForUpdate(memberId)).thenReturn(new BigDecimal("3000"));

        pay("0.00");

        ArgumentCaptor<BigDecimal> used = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).consumeCredit(eq(memberId), used.capture(), any(), any(), any(), anyString());
        assertThat(used.getValue()).isEqualByComparingTo("3000");
        assertThat(b1.getAmountPaid()).isEqualByComparingTo("2000");
        assertThat(a1.getAmountPaid()).isEqualByComparingTo("1000");
    }

    // ── statuses the allocator must not touch ────────────────────────────────

    @Test
    @DisplayName("a payout-deducted month is not re-paid by a later payment")
    void skipsNonAllocatableStatuses() {
        // The repository filters to OUTSTANDING/PARTIALLY_PAID; if that filter is
        // ever loosened, a winner's withheld installment could be charged twice.
        PaymentRecord deducted = record(chitA, 1, "1000", "1000", PaymentRecordStatus.PAYOUT_DEDUCTED);
        PaymentRecord open = outstanding(chitA, 2, "1000");
        withMemberOutstanding(List.of(open));   // repo excludes the deducted row

        pay("1000");

        assertThat(open.getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
        assertThat(deducted.getAmountPaid()).isEqualByComparingTo("1000");
        assertThat(deducted.getStatus()).isEqualTo(PaymentRecordStatus.PAYOUT_DEDUCTED);
    }

    @Test
    @DisplayName("paying when nothing is owed becomes credit rather than being lost")
    void paymentWithNoDuesBecomesCredit() {
        withMemberOutstanding(List.of());

        pay("1000");

        ArgumentCaptor<BigDecimal> amt = ArgumentCaptor.forClass(BigDecimal.class);
        verify(memberCreditService).addCredit(eq(memberId), amt.capture(), any(), any(), any(), anyString());
        assertThat(amt.getValue()).isEqualByComparingTo("1000");
    }

    @Test
    @DisplayName("explicit multi-chit allocation never spills into an unselected chit")
    void explicitAllocationStaysWithinSelectedChits() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        PaymentRecord b1 = outstanding(chitB, 1, "1000");
        when(paymentRecordRepository
                .findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
                        eq(TENANT), eq(memberId), any(UUID.class), anyList()))
                .thenAnswer(invocation -> invocation.getArgument(2, UUID.class).equals(chitA)
                        ? new ArrayList<>(List.of(a1)) : new ArrayList<>(List.of(b1)));

        payExplicit("1000", chitA, chitB);

        assertThat(a1.getAmountPaid()).isEqualByComparingTo("500");
        assertThat(b1.getAmountPaid()).isEqualByComparingTo("500");
        verify(paymentRecordRepository, never())
                .findOutstandingAcrossOtherChitsForUpdateByTenant(
                        anyString(), any(), any(), anyList());
        verify(memberCreditService, never()).addCredit(any(), any(), any(), any(), any(), anyString());
    }

    @Test
    @DisplayName("explicit allocation rejects an amount that exceeds the selected chit")
    void explicitAllocationRejectsSelectedChitOverage() {
        PaymentRecord a1 = outstanding(chitA, 1, "1000");
        withCurrentChitRecords(List.of(a1));
        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("1500"));
        req.setPaymentMode(PaymentMode.UPI);
        RequestedChitAllocation allocation = new RequestedChitAllocation();
        allocation.setChitId(chitA);
        allocation.setAmount(new BigDecimal("1500"));
        req.setAllocations(List.of(allocation));

        assertThatThrownBy(() -> service.recordPayment(req, UUID.randomUUID()))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("exceeds the selected chit");
        // The service is @Transactional; the intermediate allocation is rolled
        // back by the database transaction when this validation fails.
    }

    // ── idempotency ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("NEG-I01: replaying an idempotency key does not allocate twice")
    void idempotentReplayDoesNotReallocate() {
        PaymentBatch existing = PaymentBatch.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).chitId(chitA).memberId(memberId)
                .totalAmount(new BigDecimal("1000")).paymentMode(PaymentMode.UPI)
                .idempotencyOperation("RECORD_PAYMENT")
                .idempotencyKey("key-1")
                .idempotencyRequestHash(IdempotencyFingerprint.of(
                        chitA, memberId, new BigDecimal("1000"), PaymentMode.UPI, null,
                        "UPI-FIFO-IDEMPOTENT"))
                .build();
        when(batchRepository.findByTenantIdAndIdempotencyOperationAndIdempotencyKey(
                TENANT, "RECORD_PAYMENT", "key-1"))
                .thenReturn(java.util.Optional.of(existing));

        RecordPaymentRequest req = new RecordPaymentRequest();
        req.setChitId(chitA);
        req.setMemberId(memberId);
        req.setAmount(new BigDecimal("1000"));
        req.setPaymentMode(PaymentMode.UPI);
        req.setPaymentReference("UPI-FIFO-IDEMPOTENT");
        req.setBalanceVersion("stale-after-first-success");

        service.recordPayment(req, UUID.randomUUID(), "key-1");

        // The original batch is returned and no second financial effect occurs.
        verify(batchRepository, never()).saveAndFlush(any(PaymentBatch.class));
        verify(allocationRepository, never()).save(any(PaymentAllocation.class));
    }
}

package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.ChitServiceClient.ChitDto;
import com.chitfund.paymentservice.client.ChitServiceClient.EnrollmentDto;
import com.chitfund.paymentservice.client.ChitServiceClient.ReservationDto;
import com.chitfund.paymentservice.client.PayoutServiceClient;
import com.chitfund.paymentservice.client.PayoutServiceClient.PayoutDto;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.Settlement;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.domain.enums.SettlementCase;
import com.chitfund.paymentservice.domain.enums.SettlementMode;
import com.chitfund.paymentservice.dto.request.ConfirmSettlementRequest;
import com.chitfund.paymentservice.dto.request.SettlementPreviewRequest;
import com.chitfund.paymentservice.dto.response.SettlementChitPreviewResponse;
import com.chitfund.paymentservice.dto.response.SettlementPreviewResponse;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.paymentservice.repository.SettlementRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for SettlementService.
 *
 * All external collaborators (chit-service, payout-service, repos) are mocked.
 * Tests verify both the calculation formulas and the confirm() side-effects.
 *
 * WHY test the service in isolation (unit test) rather than with Spring context (integration)?
 * - Fast: no Spring container startup
 * - Precise: we can control every input and verify every output
 * - Reliable: no database, no network, no test data setup
 * For integration tests you'd use @SpringBootTest + Testcontainers for the DB.
 *
 * INTERVIEW: "We follow the test pyramid: many unit tests (fast, cheap, precise),
 * fewer integration tests (slower but catch wiring issues), even fewer E2E tests.
 * SettlementService has pure business logic — unit tests are ideal here."
 */
@ExtendWith(MockitoExtension.class)
class SettlementServiceTest {

    @Mock private PaymentRecordRepository paymentRecordRepository;
    @Mock private ChitMonthDrawRepository chitMonthDrawRepository;
    @Mock private SettlementRepository settlementRepository;
    @Mock private ChitServiceClient chitServiceClient;
    @Mock private PayoutServiceClient payoutServiceClient;
    @Mock private AdminWalletService adminWalletService;

    @InjectMocks
    private SettlementService settlementService;

    // Shared test identifiers
    private final UUID MEMBER_ID = UUID.randomUUID();
    private final UUID ADMIN_ID  = UUID.randomUUID();
    private final UUID CHIT_A_ID = UUID.randomUUID();
    private final UUID CHIT_B_ID = UUID.randomUUID();

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private ChitDto chit(UUID id, int durationMonths, int installmentAmt,
                         boolean postPayoutEnabled, Integer postPayoutDefault) {
        ChitDto dto = new ChitDto();
        dto.setId(id);
        dto.setName("Test Chit " + id.toString().substring(0, 8));
        dto.setStatus("ACTIVE");
        dto.setChitValue(BigDecimal.valueOf((long) installmentAmt * durationMonths));
        dto.setInstallmentAmount(BigDecimal.valueOf(installmentAmt));
        dto.setTotalMembers(durationMonths);
        dto.setDurationMonths(durationMonths);
        dto.setPostPayoutContributionEnabled(postPayoutEnabled);
        dto.setDefaultPostPayoutContribution(postPayoutDefault != null ? BigDecimal.valueOf(postPayoutDefault) : null);
        return dto;
    }

    private PayoutDto payout(UUID chitId, String status, int monthNumber,
                              long netPayoutAmount, long disbursedAmount) {
        PayoutDto dto = new PayoutDto();
        dto.setId(UUID.randomUUID());
        dto.setChitId(chitId);
        dto.setMemberId(MEMBER_ID);
        dto.setMonthNumber(monthNumber);
        dto.setNetPayoutAmount(BigDecimal.valueOf(netPayoutAmount));
        dto.setDisbursedAmount(BigDecimal.valueOf(disbursedAmount));
        dto.setStatus(status);
        return dto;
    }

    private PaymentRecord record(UUID chitId, int monthNumber, long amountDue, long amountPaid,
                                  PaymentRecordStatus status) {
        return PaymentRecord.builder()
                .id(UUID.randomUUID())
                .chitId(chitId)
                .memberId(MEMBER_ID)
                .monthNumber(monthNumber)
                .amountDue(BigDecimal.valueOf(amountDue))
                .amountPaid(BigDecimal.valueOf(amountPaid))
                .status(status)
                .dueDate(LocalDate.now())
                .build();
    }

    private com.chitfund.paymentservice.domain.ChitMonthDraw draw(UUID chitId, int monthNumber) {
        return com.chitfund.paymentservice.domain.ChitMonthDraw.builder()
                .id(UUID.randomUUID())
                .chitId(chitId)
                .monthNumber(monthNumber)
                .installmentAmount(BigDecimal.valueOf(10_000))
                .dueDate(LocalDate.now())
                .status(com.chitfund.paymentservice.domain.enums.DrawStatus.CLOSED)
                .build();
    }

    private ReservationDto reservation(UUID chitId, int monthNumber, long payoutAmount) {
        ReservationDto dto = new ReservationDto();
        dto.setId(UUID.randomUUID());
        dto.setChitId(chitId);
        dto.setMemberId(MEMBER_ID);
        dto.setMonthNumber(monthNumber);
        dto.setPayoutAmount(BigDecimal.valueOf(payoutAmount));
        dto.setStatus("RESERVED");
        return dto;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Case A — Full payout, future installments owed
    //
    // Chit: ₹1,00,000, 10 members, 10 months, installmentAmount=₹10,000, postPayoutContribution=₹8,000
    // Member won month 3 (DISBURSED), netPayoutAmount=₹90,000
    // Current month: 5 (months 3,4,5 drawn). Months 4,5 = SETTLED. Month 6-10 = future (5 months)
    // Expected settlement: 0 unpaid + 5 × ₹8,000 = ₹40,000 member owes
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 1: Case A — member won month 3 (DISBURSED), owes 5 future installments at ₹8,000")
    void test1_caseA_fullDisburse_futureInstallments() {
        ChitDto chit = chit(CHIT_A_ID, 10, 10_000, true, 8_000);
        PayoutDto p = payout(CHIT_A_ID, "DISBURSED", 3, 90_000, 90_000);

        // Months 3,4,5 drawn; months 4,5 SETTLED
        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 3), draw(CHIT_A_ID, 4), draw(CHIT_A_ID, 5));
        List<PaymentRecord> records = List.of(
                record(CHIT_A_ID, 4, 10_000, 10_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 5, 8_000,   8_000, PaymentRecordStatus.SETTLED),
                // Month 3 was DISBURSEMENT_SETTLED (handled at payout creation)
                record(CHIT_A_ID, 3, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED)
        );

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(p);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(records);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());  // no OUTSTANDING / PARTIALLY_PAID
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        SettlementChitPreviewResponse result =
                settlementService.computeChitPreview(MEMBER_ID, CHIT_A_ID, SettlementMode.FAIR);

        assertThat(result).isNotNull();
        assertThat(result.getSettlementCase()).isEqualTo(SettlementCase.CASE_A);
        assertThat(result.getUnpaidDues()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.getFutureMonthsCount()).isEqualTo(5);
        assertThat(result.getPostPayoutRate()).isEqualByComparingTo(BigDecimal.valueOf(8_000));
        assertThat(result.getFutureInstallments()).isEqualByComparingTo(BigDecimal.valueOf(40_000));
        assertThat(result.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(40_000));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Case B1 — No payout, has reserved slot
    //
    // Chit: ₹60,000, 6 members, 6 months, installmentAmount=₹10,000
    // Member has MonthReservation for month 5, payoutAmount=₹55,000
    // Current month: 2. Months 1,2 paid (SETTLED). Months 3-6 future (4 months)
    // Expected: -₹55,000 + 0 unpaid + 4×₹10,000 = -₹55,000 + ₹40,000 = -₹15,000 (fund refunds ₹15,000)
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 2: Case B1 — no payout, reserved slot month 5, fund refunds ₹15,000")
    void test2_caseB1_reservedSlot_fundRefunds() {
        ChitDto chit = chit(CHIT_A_ID, 6, 10_000, false, null);
        // No payout
        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(null);

        // Months 1,2 billed; months 1,2 SETTLED
        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 1), draw(CHIT_A_ID, 2));
        List<PaymentRecord> records = List.of(
                record(CHIT_A_ID, 1, 10_000, 10_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 2, 10_000, 10_000, PaymentRecordStatus.SETTLED)
        );

        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(records);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        // Has reserved slot for month 5
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(List.of(reservation(CHIT_A_ID, 5, 55_000)));

        SettlementChitPreviewResponse result =
                settlementService.computeChitPreview(MEMBER_ID, CHIT_A_ID, SettlementMode.FAIR);

        assertThat(result).isNotNull();
        assertThat(result.getSettlementCase()).isEqualTo(SettlementCase.CASE_B1);
        assertThat(result.getReservedPayoutAmount()).isEqualByComparingTo(BigDecimal.valueOf(55_000));
        assertThat(result.getUnpaidDues()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.getFutureMonthsCount()).isEqualTo(4); // months 3,4,5,6
        assertThat(result.getFutureInstallments()).isEqualByComparingTo(BigDecimal.valueOf(40_000));
        // -55,000 + 0 + 40,000 = -15,000
        assertThat(result.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(-15_000));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Case B2 — No payout, no slot
    //
    // Member paid months 1-3 (₹30,000 total, all SETTLED). No MonthReservation.
    // Expected: refund ₹30,000
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 3: Case B2 — no payout, no slot, fund refunds everything paid (₹30,000)")
    void test3_caseB2_noSlot_pureRefund() {
        ChitDto chit = chit(CHIT_A_ID, 5, 10_000, false, null);
        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(null);

        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 1), draw(CHIT_A_ID, 2), draw(CHIT_A_ID, 3));
        List<PaymentRecord> records = List.of(
                record(CHIT_A_ID, 1, 10_000, 10_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 2, 10_000, 10_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 3, 10_000, 10_000, PaymentRecordStatus.SETTLED)
        );

        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(records);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList()); // no reservation

        SettlementChitPreviewResponse result =
                settlementService.computeChitPreview(MEMBER_ID, CHIT_A_ID, SettlementMode.FAIR);

        assertThat(result).isNotNull();
        assertThat(result.getSettlementCase()).isEqualTo(SettlementCase.CASE_B2);
        assertThat(result.getTotalPaidIn()).isEqualByComparingTo(BigDecimal.valueOf(30_000));
        // Refund = -30,000
        assertThat(result.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(-30_000));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Case C — Partial disbursement, Fair Move
    //
    // Chit: ₹1,20,000, 12 members, 12 months, installment=₹10,000, postPayout=₹8,000
    // Won month 4, netPayoutAmount=₹1,10,000, disbursedAmount=₹60,000 (PARTIALLY_DISBURSED)
    // stillOwedByFund = ₹50,000
    // Current month 6: months 5,6 paid post-payout (₹8,000 each = ₹16,000)
    // Future months 7-12 = 6 months × ₹8,000 = ₹48,000
    // Fair Move expected: ₹0 unpaid + ₹48,000 future - ₹50,000 credit = -₹2,000 (fund refunds ₹2,000)
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 4: Case C — partial payout, Fair Move: fund refunds ₹2,000")
    void test4_caseC_fairMove() {
        ChitDto chit = chit(CHIT_A_ID, 12, 10_000, true, 8_000);
        PayoutDto p = payout(CHIT_A_ID, "PARTIALLY_DISBURSED", 4, 110_000, 60_000);

        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 1), draw(CHIT_A_ID, 2), draw(CHIT_A_ID, 3),
                draw(CHIT_A_ID, 4), draw(CHIT_A_ID, 5), draw(CHIT_A_ID, 6));

        // Months 1-4 DISBURSEMENT_SETTLED or SETTLED; months 5,6 SETTLED post-payout
        List<PaymentRecord> records = List.of(
                record(CHIT_A_ID, 1,  10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 2,  10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 3,  10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 4,  10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 5,   8_000,  8_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 6,   8_000,  8_000, PaymentRecordStatus.SETTLED)
        );

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(p);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(records);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList()); // no OUTSTANDING
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        SettlementChitPreviewResponse result =
                settlementService.computeChitPreview(MEMBER_ID, CHIT_A_ID, SettlementMode.FAIR);

        assertThat(result).isNotNull();
        assertThat(result.getSettlementCase()).isEqualTo(SettlementCase.CASE_C);
        assertThat(result.getCurrentMode()).isEqualTo(SettlementMode.FAIR);
        assertThat(result.getStillOwedByFund()).isEqualByComparingTo(BigDecimal.valueOf(50_000));
        assertThat(result.getInstallmentsPaidSincePayout()).isEqualByComparingTo(BigDecimal.valueOf(16_000));
        assertThat(result.getFutureMonthsCount()).isEqualTo(6); // months 7-12
        assertThat(result.getFutureInstallments()).isEqualByComparingTo(BigDecimal.valueOf(48_000));
        // 0 + 48,000 - 50,000 = -2,000
        assertThat(result.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(-2_000));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Case C — Partial disbursement, Admin Win
    // Same scenario as Test 4
    // Admin Win: max(0, 60,000 - 16,000) = 44,000 member owes
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 5: Case C — partial payout, Admin Win: member owes ₹44,000")
    void test5_caseC_adminWin() {
        ChitDto chit = chit(CHIT_A_ID, 12, 10_000, true, 8_000);
        PayoutDto p = payout(CHIT_A_ID, "PARTIALLY_DISBURSED", 4, 110_000, 60_000);

        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 1), draw(CHIT_A_ID, 2), draw(CHIT_A_ID, 3),
                draw(CHIT_A_ID, 4), draw(CHIT_A_ID, 5), draw(CHIT_A_ID, 6));

        List<PaymentRecord> records = List.of(
                record(CHIT_A_ID, 1, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 2, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 3, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 4, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 5,  8_000,  8_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 6,  8_000,  8_000, PaymentRecordStatus.SETTLED)
        );

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(p);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(records);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        SettlementChitPreviewResponse result =
                settlementService.computeChitPreview(MEMBER_ID, CHIT_A_ID, SettlementMode.ADMIN_WIN);

        assertThat(result).isNotNull();
        assertThat(result.getSettlementCase()).isEqualTo(SettlementCase.CASE_C);
        assertThat(result.getCurrentMode()).isEqualTo(SettlementMode.ADMIN_WIN);
        // max(0, 60,000 - 16,000) = 44,000
        assertThat(result.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(44_000));
        // Alternative (Fair Move) should show -2,000
        assertThat(result.getAlternativeModeAmount()).isEqualByComparingTo(BigDecimal.valueOf(-2_000));
        assertThat(result.getAlternativeModeName()).isEqualTo("FAIR");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Multi-chit — Case A (₹20,000 owes) + Case B2 (₹15,000 refund) = net ₹5,000 owes
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 6: Multi-chit — Chit A owes ₹20,000, Chit B refunds ₹15,000 → net ₹5,000")
    void test6_multiChit_netAmount() {
        // Chit A: Case A — 10 months, post-payout ₹10,000/mo, won month 8, 2 future months
        ChitDto chitA = chit(CHIT_A_ID, 10, 10_000, false, null);
        PayoutDto payoutA = payout(CHIT_A_ID, "DISBURSED", 8, 90_000, 90_000);

        // Chit B: Case B2 — paid ₹15,000 total, no payout, no slot
        ChitDto chitB = chit(CHIT_B_ID, 5, 5_000, false, null);

        // Enrollments
        EnrollmentDto enrollA = new EnrollmentDto();
        enrollA.setChitId(CHIT_A_ID);
        enrollA.setMemberId(MEMBER_ID);
        enrollA.setActive(true);

        EnrollmentDto enrollB = new EnrollmentDto();
        enrollB.setChitId(CHIT_B_ID);
        enrollB.setMemberId(MEMBER_ID);
        enrollB.setActive(true);

        when(chitServiceClient.getEnrollmentsForMember(MEMBER_ID)).thenReturn(List.of(enrollA, enrollB));

        // Chit A mocks — months 1-8 drawn, 2 future months (9,10)
        List<com.chitfund.paymentservice.domain.ChitMonthDraw> drawsA = new ArrayList<>();
        for (int i = 1; i <= 8; i++) drawsA.add(draw(CHIT_A_ID, i));

        List<PaymentRecord> recordsA = new ArrayList<>();
        for (int i = 1; i <= 8; i++) {
            recordsA.add(record(CHIT_A_ID, i, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED));
        }

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chitA);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(payoutA);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(recordsA);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(drawsA);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        // Chit B mocks — 3 months drawn, all SETTLED, no payout, no reservation
        List<com.chitfund.paymentservice.domain.ChitMonthDraw> drawsB = List.of(
                draw(CHIT_B_ID, 1), draw(CHIT_B_ID, 2), draw(CHIT_B_ID, 3));
        List<PaymentRecord> recordsB = List.of(
                record(CHIT_B_ID, 1, 5_000, 5_000, PaymentRecordStatus.SETTLED),
                record(CHIT_B_ID, 2, 5_000, 5_000, PaymentRecordStatus.SETTLED),
                record(CHIT_B_ID, 3, 5_000, 5_000, PaymentRecordStatus.SETTLED)
        );

        when(chitServiceClient.getChit(CHIT_B_ID)).thenReturn(chitB);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_B_ID)).thenReturn(null);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_B_ID))
                .thenReturn(recordsB);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_B_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_B_ID)).thenReturn(drawsB);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_B_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        SettlementPreviewRequest req = new SettlementPreviewRequest();
        req.setMemberId(MEMBER_ID);

        SettlementPreviewResponse response = settlementService.preview(req);

        assertThat(response.getChitItems()).hasSize(2);

        SettlementChitPreviewResponse itemA = response.getChitItems().stream()
                .filter(i -> CHIT_A_ID.equals(i.getChitId())).findFirst().orElseThrow();
        SettlementChitPreviewResponse itemB = response.getChitItems().stream()
                .filter(i -> CHIT_B_ID.equals(i.getChitId())).findFirst().orElseThrow();

        // Chit A: 2 future months × ₹10,000 = ₹20,000
        assertThat(itemA.getSettlementCase()).isEqualTo(SettlementCase.CASE_A);
        assertThat(itemA.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(20_000));

        // Chit B: -₹15,000 refund
        assertThat(itemB.getSettlementCase()).isEqualTo(SettlementCase.CASE_B2);
        assertThat(itemB.getNetAmount()).isEqualByComparingTo(BigDecimal.valueOf(-15_000));

        // Grand total: 20,000 - 15,000 = 5,000
        assertThat(response.getTotalOwed()).isEqualByComparingTo(BigDecimal.valueOf(20_000));
        assertThat(response.getTotalRefunded()).isEqualByComparingTo(BigDecimal.valueOf(15_000));
        assertThat(response.getGrandTotal()).isEqualByComparingTo(BigDecimal.valueOf(5_000));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: Toggle exclusion — admin only settles Chit A, excludes Chit B
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 7: Toggle exclusion — only Chit A included → net ₹20,000")
    void test7_toggleExclusion_onlyChitA() {
        // Same chit A setup as Test 6
        ChitDto chitA = chit(CHIT_A_ID, 10, 10_000, false, null);
        PayoutDto payoutA = payout(CHIT_A_ID, "DISBURSED", 8, 90_000, 90_000);

        EnrollmentDto enrollA = new EnrollmentDto();
        enrollA.setChitId(CHIT_A_ID);
        enrollA.setMemberId(MEMBER_ID);
        enrollA.setActive(true);

        when(chitServiceClient.getEnrollmentsForMember(MEMBER_ID)).thenReturn(List.of(enrollA));

        List<com.chitfund.paymentservice.domain.ChitMonthDraw> drawsA = new ArrayList<>();
        for (int i = 1; i <= 8; i++) drawsA.add(draw(CHIT_A_ID, i));

        List<PaymentRecord> recordsA = new ArrayList<>();
        for (int i = 1; i <= 8; i++) {
            recordsA.add(record(CHIT_A_ID, i, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED));
        }

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chitA);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(payoutA);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(recordsA);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(drawsA);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        // Preview with only CHIT_A_ID specified (Chit B excluded/toggled off)
        SettlementPreviewRequest req = new SettlementPreviewRequest();
        req.setMemberId(MEMBER_ID);
        req.setChitIds(List.of(CHIT_A_ID));

        SettlementPreviewResponse response = settlementService.preview(req);

        assertThat(response.getChitItems()).hasSize(1);
        assertThat(response.getGrandTotal()).isEqualByComparingTo(BigDecimal.valueOf(20_000));
        assertThat(response.getTotalRefunded()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8: Confirm settlement — verify side effects
    //
    // After confirm():
    //   - OUTSTANDING PaymentRecord → SETTLEMENT_CLEARED
    //   - Settlement entity saved with correct amounts
    //   - AdminWalletService called with correct amount and direction
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Test 8: Confirm settlement — OUTSTANDING → SETTLEMENT_CLEARED, wallet credited")
    void test8_confirmSettlement_sideEffects() {
        ChitDto chit = chit(CHIT_A_ID, 5, 10_000, false, null);
        PayoutDto p = payout(CHIT_A_ID, "DISBURSED", 2, 45_000, 45_000);

        // One OUTSTANDING record (month 3 unpaid)
        PaymentRecord outstanding = record(CHIT_A_ID, 3, 10_000, 0, PaymentRecordStatus.OUTSTANDING);
        List<PaymentRecord> allRecords = List.of(
                record(CHIT_A_ID, 1, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 2, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                outstanding
        );

        // Months 1,2,3 drawn; months 4,5 future
        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 1), draw(CHIT_A_ID, 2), draw(CHIT_A_ID, 3));

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(p);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(allRecords);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(List.of(outstanding)); // one OUTSTANDING
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        // Settlement: 10,000 unpaid dues + 2 × 10,000 future = 30,000
        when(settlementRepository.save(any(Settlement.class))).thenAnswer(inv -> {
            Settlement s = inv.getArgument(0);
            s.setId(UUID.randomUUID()); // simulate DB-generated ID
            if (s.getChitItems() != null) {
                s.getChitItems().forEach(item -> item.setId(UUID.randomUUID()));
            }
            return s;
        });

        ConfirmSettlementRequest req = new ConfirmSettlementRequest();
        req.setMemberId(MEMBER_ID);
        ConfirmSettlementRequest.ChitItemRequest itemReq = new ConfirmSettlementRequest.ChitItemRequest();
        itemReq.setChitId(CHIT_A_ID);
        itemReq.setMode(SettlementMode.FAIR);
        req.setChitItems(List.of(itemReq));
        req.setNotes("Exit settlement");

        settlementService.confirm(req, ADMIN_ID);

        // Verify the OUTSTANDING record was marked SETTLEMENT_CLEARED
        ArgumentCaptor<PaymentRecord> recordCaptor = ArgumentCaptor.forClass(PaymentRecord.class);
        verify(paymentRecordRepository, atLeastOnce()).save(recordCaptor.capture());
        boolean foundCleared = recordCaptor.getAllValues().stream()
                .anyMatch(r -> r.getStatus() == PaymentRecordStatus.SETTLEMENT_CLEARED);
        assertThat(foundCleared).isTrue();

        // Verify AdminWalletService was called (member owes → IN entry)
        ArgumentCaptor<com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest> walletCaptor =
                ArgumentCaptor.forClass(com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest.class);
        verify(adminWalletService).addEntry(walletCaptor.capture(), eq(ADMIN_ID));
        com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest walletReq = walletCaptor.getValue();
        assertThat(walletReq.getEntryType()).isEqualTo(com.chitfund.paymentservice.domain.enums.WalletEntryType.IN);
        assertThat(walletReq.getCategory()).isEqualTo("SETTLEMENT");
        // netAmount = 10,000 unpaid + 2 × 10,000 future = 30,000
        assertThat(walletReq.getAmount()).isEqualByComparingTo(BigDecimal.valueOf(30_000));

        // Verify Settlement entity was saved
        verify(settlementRepository).save(any(Settlement.class));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: zero-balance edge case
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    @DisplayName("Edge case: net = zero (accounts balance out), no wallet entry created")
    void test_netZero_noWalletEntry() {
        // Case A: exactly one future installment = amount already owed = zero net
        // If unpaid = 0 and futureInstallments = 0 → net = 0, no wallet call
        ChitDto chit = chit(CHIT_A_ID, 3, 10_000, false, null);
        PayoutDto p = payout(CHIT_A_ID, "DISBURSED", 1, 28_000, 28_000);

        // All 3 months drawn, all SETTLED — 0 future months
        List<com.chitfund.paymentservice.domain.ChitMonthDraw> draws = List.of(
                draw(CHIT_A_ID, 1), draw(CHIT_A_ID, 2), draw(CHIT_A_ID, 3));
        List<PaymentRecord> records = List.of(
                record(CHIT_A_ID, 1, 10_000, 10_000, PaymentRecordStatus.DISBURSEMENT_SETTLED),
                record(CHIT_A_ID, 2, 10_000, 10_000, PaymentRecordStatus.SETTLED),
                record(CHIT_A_ID, 3, 10_000, 10_000, PaymentRecordStatus.SETTLED)
        );

        when(chitServiceClient.getChit(CHIT_A_ID)).thenReturn(chit);
        when(payoutServiceClient.getPayoutForMemberInChit(MEMBER_ID, CHIT_A_ID)).thenReturn(p);
        when(paymentRecordRepository.findByMemberIdAndChitIdOrderByMonthNumberAsc(MEMBER_ID, CHIT_A_ID))
                .thenReturn(records);
        when(paymentRecordRepository.findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                eq(MEMBER_ID), eq(CHIT_A_ID), anyList()))
                .thenReturn(Collections.emptyList());
        when(chitMonthDrawRepository.findByChitIdOrderByMonthNumberAsc(CHIT_A_ID)).thenReturn(draws);
        when(chitServiceClient.getReservationsForMemberInChit(CHIT_A_ID, MEMBER_ID))
                .thenReturn(Collections.emptyList());

        when(settlementRepository.save(any(Settlement.class))).thenAnswer(inv -> {
            Settlement s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });

        ConfirmSettlementRequest req = new ConfirmSettlementRequest();
        req.setMemberId(MEMBER_ID);
        ConfirmSettlementRequest.ChitItemRequest itemReq = new ConfirmSettlementRequest.ChitItemRequest();
        itemReq.setChitId(CHIT_A_ID);
        req.setChitItems(List.of(itemReq));

        settlementService.confirm(req, ADMIN_ID);

        // Net = 0 → no wallet entry
        verify(adminWalletService, never()).addEntry(any(), any());
    }
}

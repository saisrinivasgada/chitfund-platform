package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.dto.response.LateJoinPreviewResponse;
import com.chitfund.paymentservice.dto.response.LateJoinPreviewResponse.CatchUpInstallmentItem;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
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
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LateJoinServiceTest {

    @Mock ChitMonthDrawRepository drawRepository;
    @Mock PaymentRecordRepository paymentRecordRepository;
    @Mock MemberCreditService memberCreditService;
    @Mock ChitServiceClient chitServiceClient;

    @InjectMocks LateJoinService lateJoinService;

    static final String TENANT = "t1";
    static final UUID CHIT_ID = UUID.randomUUID();
    static final UUID MEMBER_ID = UUID.randomUUID();
    static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setTenant() {
        TenantContext.set(TENANT);
        when(memberCreditService.getBalance(MEMBER_ID)).thenReturn(BigDecimal.ZERO);
        when(memberCreditService.getBalanceForUpdate(MEMBER_ID)).thenReturn(BigDecimal.ZERO);
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ChitServiceClient.ChitDto activeChit(String mode) {
        ChitServiceClient.ChitDto c = new ChitServiceClient.ChitDto();
        c.setId(CHIT_ID);
        c.setName("Test Chit");
        c.setStatus("ACTIVE");
        c.setWinnerSelectionMode(mode);
        c.setInstallmentAmount(bd(10_000));
        c.setCapacity(10);
        c.setDurationMonths(12);
        return c;
    }

    private ChitMonthDraw draw(int month, DrawStatus status) {
        return ChitMonthDraw.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .chitId(CHIT_ID)
                .monthNumber(month)
                .dueDate(LocalDate.of(2026, month, 5))
                .installmentAmount(bd(10_000))
                .status(status)
                .build();
    }

    private PaymentRecord existingRecord(UUID memberId, int month, BigDecimal amountDue) {
        return PaymentRecord.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .chitId(CHIT_ID)
                .memberId(memberId)
                .monthNumber(month)
                .dueDate(LocalDate.of(2026, month, 5))
                .amountDue(amountDue)
                .amountPaid(BigDecimal.ZERO)
                .status(PaymentRecordStatus.OUTSTANDING)
                .build();
    }

    private static BigDecimal bd(int value) {
        return BigDecimal.valueOf(value);
    }

    // ── Preview tests ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("preview: RESERVATION chit with 3 open draws and no existing records returns 3 catch-up items")
    void preview_reservationChit_noExistingRecords() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("RESERVATION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED), draw(2, DrawStatus.CLOSED), draw(3, DrawStatus.OPEN)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());

        LateJoinPreviewResponse resp = lateJoinService.preview(CHIT_ID, MEMBER_ID, TENANT);

        assertThat(resp.getCatchUpInstallments()).hasSize(3);
        assertThat(resp.getCatchUpInstallments()).noneMatch(CatchUpInstallmentItem::isAlreadyPosted);
        assertThat(resp.getTotalCatchUpAmount()).isEqualByComparingTo(bd(30_000));
        assertThat(resp.getNetCashRequired()).isEqualByComparingTo(bd(30_000));
        assertThat(resp.getAlreadyPostedMonths()).isZero();
        // RESERVATION draws have no dividend
        resp.getCatchUpInstallments().forEach(i -> assertThat(i.getDividendDeductedAmount()).isNull());
    }

    @Test
    @DisplayName("preview: SKIPPED and AWAITING_AUCTION draws are excluded from catch-up")
    void preview_skippedAndAwaitingAuction_excluded() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("LOTTERY"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(
                        draw(1, DrawStatus.CLOSED),
                        draw(2, DrawStatus.SKIPPED),
                        draw(3, DrawStatus.AWAITING_AUCTION),
                        draw(4, DrawStatus.OPEN)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());

        LateJoinPreviewResponse resp = lateJoinService.preview(CHIT_ID, MEMBER_ID, TENANT);

        // Only months 1 and 4 should appear
        assertThat(resp.getCatchUpInstallments()).hasSize(2);
        assertThat(resp.getCatchUpInstallments())
                .extracting(CatchUpInstallmentItem::getMonthNumber)
                .containsExactlyInAnyOrder(1, 4);
        assertThat(resp.getTotalCatchUpAmount()).isEqualByComparingTo(bd(20_000));
    }

    @Test
    @DisplayName("preview: already-posted months counted correctly and excluded from totalCatchUpAmount")
    void preview_alreadyPostedMonths_counted() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("RESERVATION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED), draw(2, DrawStatus.CLOSED), draw(3, DrawStatus.OPEN)));

        // Month 1 already has a record
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(TENANT, CHIT_ID, MEMBER_ID, 1))
                .thenReturn(Optional.of(existingRecord(MEMBER_ID, 1, bd(10_000))));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(TENANT, CHIT_ID, MEMBER_ID, 2))
                .thenReturn(Optional.empty());
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(TENANT, CHIT_ID, MEMBER_ID, 3))
                .thenReturn(Optional.empty());

        LateJoinPreviewResponse resp = lateJoinService.preview(CHIT_ID, MEMBER_ID, TENANT);

        assertThat(resp.getAlreadyPostedMonths()).isEqualTo(1);
        assertThat(resp.getCatchUpInstallments()).hasSize(3);
        // totalCatchUpAmount excludes already-posted months
        assertThat(resp.getTotalCatchUpAmount()).isEqualByComparingTo(bd(20_000));
    }

    @Test
    @DisplayName("preview: credit balance reduces netCashRequired correctly")
    void preview_creditReducesNetCash() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("RESERVATION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED), draw(2, DrawStatus.CLOSED)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());
        when(memberCreditService.getBalance(MEMBER_ID)).thenReturn(bd(5_000));

        LateJoinPreviewResponse resp = lateJoinService.preview(CHIT_ID, MEMBER_ID, TENANT);

        assertThat(resp.getTotalCatchUpAmount()).isEqualByComparingTo(bd(20_000));
        assertThat(resp.getCreditApplicable()).isEqualByComparingTo(bd(5_000));
        assertThat(resp.getNetCashRequired()).isEqualByComparingTo(bd(15_000));
    }

    @Test
    @DisplayName("preview: AUCTION draw copies amounts from peer PaymentRecord")
    void preview_auctionChit_copiesPeerAmounts() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("AUCTION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.OPEN)));  // OPEN = auction completed
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumber(TENANT, CHIT_ID, MEMBER_ID, 1))
                .thenReturn(Optional.empty());

        // Peer member's record has dividend
        UUID peerMember = UUID.randomUUID();
        PaymentRecord peerRecord = PaymentRecord.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).chitId(CHIT_ID).memberId(peerMember)
                .monthNumber(1).dueDate(LocalDate.of(2026, 1, 5))
                .grossInstallmentAmount(bd(10_000)).dividendDeductedAmount(bd(1_000))
                .amountDue(bd(9_000)).amountPaid(BigDecimal.ZERO)
                .status(PaymentRecordStatus.OUTSTANDING).build();
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, CHIT_ID, 1))
                .thenReturn(List.of(peerRecord));

        LateJoinPreviewResponse resp = lateJoinService.preview(CHIT_ID, MEMBER_ID, TENANT);

        assertThat(resp.getCatchUpInstallments()).hasSize(1);
        CatchUpInstallmentItem item = resp.getCatchUpInstallments().get(0);
        assertThat(item.getGrossAmount()).isEqualByComparingTo(bd(10_000));
        assertThat(item.getDividendDeductedAmount()).isEqualByComparingTo(bd(1_000));
        assertThat(item.getAmountDue()).isEqualByComparingTo(bd(9_000));
    }

    @Test
    @DisplayName("preview: non-ACTIVE chit returns a validation error")
    void preview_nonActiveChit_throws() {
        ChitServiceClient.ChitDto closed = activeChit("RESERVATION");
        closed.setStatus("COMPLETED");
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(closed);

        assertThatThrownBy(() -> lateJoinService.preview(CHIT_ID, MEMBER_ID, TENANT))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("only available for ACTIVE chits");
    }

    // ── Create dues tests ─────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("createDues: creates PaymentRecord for each eligible draw and sets catchUpSource")
    void createDues_createsRecordsWithProvenance() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("RESERVATION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED), draw(2, DrawStatus.OPEN)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        int created = lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        assertThat(created).isEqualTo(2);

        ArgumentCaptor<List<PaymentRecord>> captor = ArgumentCaptor.forClass(List.class);
        verify(paymentRecordRepository).saveAll(captor.capture());
        List<PaymentRecord> saved = captor.getValue();
        assertThat(saved).hasSize(2);
        saved.forEach(r -> {
            assertThat(r.getCatchUpSource()).isEqualTo("LATE_JOIN");
            assertThat(r.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
            assertThat(r.getMemberId()).isEqualTo(MEMBER_ID);
            assertThat(r.getChitId()).isEqualTo(CHIT_ID);
            assertThat(r.getTenantId()).isEqualTo(TENANT);
        });
    }

    @Test
    @DisplayName("createDues: idempotent — existing records are skipped and 0 new records are created")
    void createDues_idempotent_skipsExistingRecords() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("RESERVATION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED), draw(2, DrawStatus.OPEN)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), eq(1)))
                .thenReturn(Optional.of(existingRecord(MEMBER_ID, 1, bd(10_000))));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), eq(2)))
                .thenReturn(Optional.of(existingRecord(MEMBER_ID, 2, bd(10_000))));

        int created = lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        assertThat(created).isZero();
        verify(paymentRecordRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("createDues: records are always OUTSTANDING with amountPaid=0 — credit applied by FIFO at next payment")
    void createDues_noCreditAutoApplied() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("RESERVATION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PaymentRecord>> captor = ArgumentCaptor.forClass(List.class);
        verify(paymentRecordRepository).saveAll(captor.capture());
        PaymentRecord saved = captor.getValue().get(0);

        assertThat(saved.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
        assertThat(saved.getAmountPaid()).isEqualByComparingTo(BigDecimal.ZERO);
        verify(memberCreditService, never()).consumeCredit(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("createDues: even with large credit balance, record is OUTSTANDING — FIFO handles allocation")
    void createDues_largeCreditBalance_stillOutstanding() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("LOTTERY"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.CLOSED)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PaymentRecord>> captor = ArgumentCaptor.forClass(List.class);
        verify(paymentRecordRepository).saveAll(captor.capture());
        PaymentRecord saved = captor.getValue().get(0);

        assertThat(saved.getStatus()).isEqualTo(PaymentRecordStatus.OUTSTANDING);
        assertThat(saved.getAmountPaid()).isEqualByComparingTo(BigDecimal.ZERO);
        verify(memberCreditService, never()).consumeCredit(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("createDues: AWAITING_AUCTION draws are excluded (auction close will handle them)")
    void createDues_awaitingAuction_excluded() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("AUCTION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.AWAITING_AUCTION)));
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        int created = lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        assertThat(created).isZero();
        verify(paymentRecordRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("createDues: AUCTION draw uses peer member amounts (gross, dividend, net)")
    void createDues_auctionDraw_copiesPeerAmounts() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("AUCTION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.OPEN)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());

        UUID peerMember = UUID.randomUUID();
        PaymentRecord peer = PaymentRecord.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).chitId(CHIT_ID).memberId(peerMember)
                .monthNumber(1).dueDate(LocalDate.of(2026, 1, 5))
                .grossInstallmentAmount(bd(10_000)).dividendDeductedAmount(bd(500))
                .amountDue(bd(9_500)).amountPaid(BigDecimal.ZERO)
                .status(PaymentRecordStatus.OUTSTANDING).build();
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, CHIT_ID, 1))
                .thenReturn(List.of(peer));
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PaymentRecord>> captor = ArgumentCaptor.forClass(List.class);
        verify(paymentRecordRepository).saveAll(captor.capture());
        PaymentRecord saved = captor.getValue().get(0);

        assertThat(saved.getGrossInstallmentAmount()).isEqualByComparingTo(bd(10_000));
        assertThat(saved.getDividendDeductedAmount()).isEqualByComparingTo(bd(500));
        assertThat(saved.getAmountDue()).isEqualByComparingTo(bd(9_500));
    }

    @Test
    @DisplayName("createDues: AUCTION draw with multi-spot peer derives per-spot dividend correctly")
    void createDues_auctionDraw_multiSpotPeer_derivesPerSpotAmounts() {
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(activeChit("AUCTION"));
        when(drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(TENANT, CHIT_ID))
                .thenReturn(List.of(draw(1, DrawStatus.OPEN)));
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(any(), any(), any(), anyInt()))
                .thenReturn(Optional.empty());

        // Peer holds 2 spots: gross=20_000, dividend=2_000 (1_000 per spot), net=18_000
        UUID peerMember = UUID.randomUUID();
        PaymentRecord peer = PaymentRecord.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).chitId(CHIT_ID).memberId(peerMember)
                .monthNumber(1).dueDate(LocalDate.of(2026, 1, 5))
                .grossInstallmentAmount(bd(20_000)).dividendDeductedAmount(bd(2_000))
                .amountDue(bd(18_000)).amountPaid(BigDecimal.ZERO)
                .status(PaymentRecordStatus.OUTSTANDING).build();
        when(paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(TENANT, CHIT_ID, 1))
                .thenReturn(List.of(peer));
        when(paymentRecordRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PaymentRecord>> captor = ArgumentCaptor.forClass(List.class);
        verify(paymentRecordRepository).saveAll(captor.capture());
        PaymentRecord saved = captor.getValue().get(0);

        // draw.installmentAmount=10_000; peer has 2 spots; dividend per spot=1_000; net=9_000
        assertThat(saved.getGrossInstallmentAmount()).isEqualByComparingTo(bd(10_000));
        assertThat(saved.getDividendDeductedAmount()).isEqualByComparingTo(bd(1_000));
        assertThat(saved.getAmountDue()).isEqualByComparingTo(bd(9_000));
    }

    @Test
    @DisplayName("createDues: non-ACTIVE chit throws a validation error before touching the DB")
    void createDues_nonActiveChit_throws() {
        ChitServiceClient.ChitDto draft = activeChit("RESERVATION");
        draft.setStatus("DRAFT");
        when(chitServiceClient.getChit(CHIT_ID)).thenReturn(draft);

        assertThatThrownBy(() -> lateJoinService.createDues(CHIT_ID, MEMBER_ID, TENANT, ACTOR_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ACTIVE chits");

        verify(paymentRecordRepository, never()).saveAll(anyList());
    }
}

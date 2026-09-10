package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.client.PaymentServiceClient;
import com.chitfund.chitservice.domain.entity.AuctionSession;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import com.chitfund.chitservice.dto.request.CloseAuctionRequest;
import com.chitfund.chitservice.repository.AuctionBidRepository;
import com.chitfund.chitservice.repository.AuctionSessionRepository;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.common.context.TenantContext;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Arithmetic of {@link AuctionService#closeAuction}: commission, distributable
 * discount and dividend per spot.
 *
 * <p>chit-service had no tests at all, and this is the only place the dividend
 * is computed, so an error here silently changes what every member of an auction
 * chit owes for that month.
 *
 * <p>Expected values are hand-computed from the rule and written as literals.
 * They are never read back from the object under test, which would only prove
 * the code agrees with itself. They match the Python oracle in
 * {@code tests/oracle/chitmath.py}; the two were derived independently.
 *
 * <p>Rule (AuctionService.java:246-269):
 * <pre>
 *   discount     = scheduledPayoutAmount - wonAmount
 *   commission   = PERCENTAGE ? discount x value/100 (HALF_UP)  : value    , capped at discount
 *   distributable= discount - commission
 *   dividendPerSpot = distributable / totalSpots  (ROUND_DOWN)
 * </pre>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AuctionService.closeAuction — commission and dividend arithmetic")
class AuctionCloseCalculationTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";

    @Mock private ChitService chitService;
    @Mock private AuctionSessionRepository auctionSessionRepository;
    @Mock private AuctionBidRepository auctionBidRepository;
    @Mock private ChitEnrollmentRepository enrollmentRepository;
    @Mock private MonthlyWinnerRepository winnerRepository;
    @Mock private WinnerService winnerService;
    @Mock private PaymentServiceClient paymentServiceClient;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private NotificationClient notificationClient;
    @Mock private AuditClient auditClient;

    private AuctionService service;

    private UUID chitId;
    private UUID auctionId;
    private UUID winnerId;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT);
        chitId = UUID.randomUUID();
        auctionId = UUID.randomUUID();
        winnerId = UUID.randomUUID();

        service = new AuctionService(
                chitService, auctionSessionRepository, auctionBidRepository,
                enrollmentRepository, winnerRepository, winnerService,
                paymentServiceClient, messagingTemplate, notificationClient, auditClient);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ── fixtures ─────────────────────────────────────────────────────────────

    private AuctionSession openSession(String scheduledPayout, String commissionType,
                                       String commissionValue) {
        AuctionSession s = new AuctionSession();
        s.setId(auctionId);
        s.setChitId(chitId);
        s.setTenantId(TENANT);
        s.setMonthNumber(3);
        s.setStatus(AuctionStatus.OPEN);
        s.setAuctionMode(AuctionMode.OFFLINE);   // avoids needing a bid row
        s.setScheduledPayoutAmount(new BigDecimal(scheduledPayout));
        s.setCommissionType(commissionType);
        s.setCommissionValue(commissionValue == null ? null : new BigDecimal(commissionValue));
        return s;
    }

    private Chit chit(String installment) {
        Chit c = new Chit();
        c.setId(chitId);
        c.setTenantId(TENANT);
        c.setInstallmentAmount(new BigDecimal(installment));
        return c;
    }

    /** Distinct member ids repeated to represent multiple spots, as the repo returns. */
    private List<UUID> spots(int total) {
        UUID[] members = { winnerId, UUID.randomUUID(), UUID.randomUUID(),
                           UUID.randomUUID(), UUID.randomUUID() };
        return java.util.stream.IntStream.range(0, total)
                .mapToObj(i -> members[i % members.length])
                .toList();
    }

    private void arrange(AuctionSession session, Chit chit, int totalSpots) {
        when(auctionSessionRepository.findByIdAndChitIdAndTenantId(auctionId, chitId, TENANT))
                .thenReturn(Optional.of(session));
        when(auctionSessionRepository.findById(auctionId)).thenReturn(Optional.of(session));
        when(chitService.findByIdScoped(chitId)).thenReturn(chit);
        when(enrollmentRepository.findActiveMemberIdsByChitId(chitId)).thenReturn(spots(totalSpots));
        when(auctionSessionRepository.save(any(AuctionSession.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    private CloseAuctionRequest offlineClose(String wonAmount) {
        CloseAuctionRequest r = new CloseAuctionRequest();
        r.setWinnerId(winnerId);
        r.setWonAmount(new BigDecimal(wonAmount));
        return r;
    }

    /** The dividend actually handed to payment-service — what members are charged against. */
    private BigDecimal capturedDividendPerSpot() {
        ArgumentCaptor<BigDecimal> dividend = ArgumentCaptor.forClass(BigDecimal.class);
        verify(paymentServiceClient).applyAuctionDividend(
                eq(chitId), anyInt(), any(BigDecimal.class), dividend.capture(),
                anyList(), anyString(), any());
        return dividend.getValue();
    }

    /**
     * The distributable total sent alongside the per-spot dividend. payment-service
     * needs it to redistribute the paise that rounding down would otherwise strand.
     */
    private BigDecimal capturedDistributable() {
        ArgumentCaptor<BigDecimal> distributable = ArgumentCaptor.forClass(BigDecimal.class);
        verify(paymentServiceClient).applyAuctionDividend(
                eq(chitId), anyInt(), any(BigDecimal.class), any(BigDecimal.class),
                anyList(), anyString(), distributable.capture());
        return distributable.getValue();
    }

    // ── commission ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("CALC-A01: 10% commission on a 20,000 discount is 2,000")
    void percentageCommission() {
        AuctionSession s = openSession("120000", "PERCENTAGE", "10");
        arrange(s, chit("1000"), 12);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        assertThat(s.getDiscountAmount()).isEqualByComparingTo("20000");
        assertThat(s.getCommissionAmount()).isEqualByComparingTo("2000");
    }

    @Test
    @DisplayName("CALC-A05: a fixed commission larger than the discount is capped at the discount")
    void fixedCommissionCappedAtDiscount() {
        AuctionSession s = openSession("120000", "FIXED", "30000");
        arrange(s, chit("1000"), 12);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        // Uncapped this would make the distributable amount negative and members'
        // dues would rise instead of fall.
        assertThat(s.getCommissionAmount()).isEqualByComparingTo("20000");
        assertThat(capturedDividendPerSpot()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("no commission configured leaves the whole discount distributable")
    void noCommission() {
        AuctionSession s = openSession("120000", null, null);
        arrange(s, chit("1000"), 10);

        service.closeAuction(chitId, auctionId, offlineClose("110000"), UUID.randomUUID());

        assertThat(s.getCommissionAmount()).isEqualByComparingTo("0");
        // 10,000 / 10 spots = 1,000.00
        assertThat(capturedDividendPerSpot()).isEqualByComparingTo("1000.00");
    }

    // ── dividend ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CALC-A02: (20,000 - 2,000) / 12 spots = 1,500.00 exactly")
    void dividendDividesEvenly() {
        AuctionSession s = openSession("120000", "PERCENTAGE", "10");
        arrange(s, chit("1000"), 12);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        assertThat(s.getDividendPerSpot()).isEqualByComparingTo("1500.00");
        assertThat(capturedDividendPerSpot()).isEqualByComparingTo("1500.00");
    }

    /**
     * Boundary sweep. Each row is hand-computed:
     *   discount = pot - bid; distributable = discount - commission;
     *   dividend = floor(distributable / spots, 2dp)
     */
    @ParameterizedTest(name = "pot {0} bid {1} comm {2}% over {3} spots -> {4}")
    @CsvSource({
            // pot,   bid,     comm%, spots, expected dividend per spot
            "120000, 100000,  10,    12,    1500.00",   // exact
            "120000, 100000,  0,     12,    1666.66",   // 20000/12 = 1666.666… -> DOWN
            "110000, 100000,  0,     3,     3333.33",   // 10000/3   = 3333.333… -> DOWN
            "110000, 100000,  0,     7,     1428.57",   // 10000/7   = 1428.571… -> DOWN
            "120000, 119999,  0,     10,    0.10",      // 1 rupee over 10 spots
            "120000, 119999,  0,     11,    0.09",      // 1/11 = 0.0909… -> DOWN
    })
    @DisplayName("CALC-R01: dividend rounds DOWN at the 2nd decimal")
    void dividendRoundsDown(String pot, String bid, String commPct, int spots, String expected) {
        AuctionSession s = openSession(pot, "PERCENTAGE", commPct);
        arrange(s, chit("1000"), spots);

        service.closeAuction(chitId, auctionId, offlineClose(bid), UUID.randomUUID());

        assertThat(s.getDividendPerSpot()).isEqualByComparingTo(expected);
    }

    /**
     * A1 — the rounding remainder must reach the members.
     *
     * <p>The per-spot dividend rounds DOWN, so spots x perSpot can fall short of
     * what was actually distributable — ₹0.01 here, up to (spots-1) x ₹0.01 in
     * general. Those paise belong to the members, so chit-service now sends the
     * distributable total and payment-service hands the shortfall out one paisa
     * at a time.
     *
     * <p>This asserts the total is sent and is large enough to cover the gap. The
     * distribution itself is payment-service's job and is tested there.
     */
    @Test
    @DisplayName("A1: the distributable total is sent so stranded paise can reach members")
    void sendsDistributableTotalForRemainder() {
        AuctionSession s = openSession("110000", null, null);   // discount 10,000
        arrange(s, chit("1000"), 3);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        BigDecimal perSpot = s.getDividendPerSpot();                       // 3333.33
        BigDecimal distributed = perSpot.multiply(BigDecimal.valueOf(3));  // 9999.99
        BigDecimal distributable = capturedDistributable();                // 10000.00

        assertThat(distributable).isEqualByComparingTo("10000.00");

        // The gap payment-service is expected to close.
        assertThat(distributable.subtract(distributed)).isEqualByComparingTo("0.01");

        // Without the total, payment-service could not know a gap existed at all.
        assertThat(distributable).isGreaterThan(distributed);
    }

    @Test
    @DisplayName("an evenly-divisible auction leaves no gap to redistribute")
    void noRemainderWhenDivisionIsExact() {
        AuctionSession s = openSession("120000", "PERCENTAGE", "10");
        arrange(s, chit("1000"), 12);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        BigDecimal distributed = s.getDividendPerSpot().multiply(BigDecimal.valueOf(12));
        assertThat(capturedDistributable()).isEqualByComparingTo(distributed);
    }

    @Test
    @DisplayName("zero enrolled spots must not divide by zero")
    void zeroSpotsYieldsZeroDividend() {
        AuctionSession s = openSession("120000", "PERCENTAGE", "10");
        arrange(s, chit("1000"), 0);
        when(enrollmentRepository.findActiveMemberIdsByChitId(chitId)).thenReturn(List.of());

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        assertThat(s.getDividendPerSpot()).isEqualByComparingTo("0");
    }

    // ── winner recording ─────────────────────────────────────────────────────

    @Test
    @DisplayName("the winner is recorded with the bid and discount that were used for the maths")
    void winnerRecordedWithConsistentAmounts() {
        AuctionSession s = openSession("120000", "PERCENTAGE", "10");
        arrange(s, chit("1000"), 12);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        var captor = ArgumentCaptor.forClass(
                com.chitfund.chitservice.dto.request.AssignWinnerRequest.class);
        verify(winnerService).assignWinner(eq(chitId), captor.capture(), any());

        // The payout is derived from these downstream, so a mismatch between what
        // the session stored and what the winner row got would surface as a wrong
        // payout rather than an obvious error.
        assertThat(captor.getValue().getWinningAmount()).isEqualByComparingTo("100000");
        assertThat(captor.getValue().getDiscountAmount()).isEqualByComparingTo("20000");
        assertThat(captor.getValue().getWinnerId()).isEqualTo(winnerId);
    }

    @Test
    @DisplayName("closing sets status CLOSED and stamps the winner")
    void closingStampsSession() {
        AuctionSession s = openSession("120000", "PERCENTAGE", "10");
        arrange(s, chit("1000"), 12);

        service.closeAuction(chitId, auctionId, offlineClose("100000"), UUID.randomUUID());

        assertThat(s.getStatus()).isEqualTo(AuctionStatus.CLOSED);
        assertThat(s.getWinnerId()).isEqualTo(winnerId);
        assertThat(s.getWonAmount()).isEqualByComparingTo("100000");
        assertThat(s.getClosedAt()).isNotNull();
    }
}

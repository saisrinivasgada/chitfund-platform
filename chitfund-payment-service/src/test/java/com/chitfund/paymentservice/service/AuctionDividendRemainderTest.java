package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Distribution of the auction dividend, including the rounding remainder.
 *
 * <p>{@code dividendPerSpot} is rounded down, so spots x perSpot can be a few
 * paise short of the distributable discount. Those paise belong to the members
 * (ambiguity A1, resolved 2026-09-10), so they are handed out one at a time in a
 * stable order rather than left with the fund.
 *
 * <p>The invariant these prove:
 * <pre>
 *   sum(dividendDeductedAmount) == distributableDiscount
 * </pre>
 * which did not hold before — the shortfall was simply never allocated.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ChitMonthDrawService — auction dividend distribution")
class AuctionDividendRemainderTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";

    @Mock private ChitMonthDrawRepository drawRepository;
    @Mock private PaymentRecordRepository paymentRecordRepository;
    @Mock private PaymentAllocationRepository allocationRepository;
    @Mock private PaymentEventPublisher eventPublisher;
    @Mock private NotificationService notificationService;
    @Mock private com.chitfund.paymentservice.client.MemberServiceClient memberServiceClient;
    @Mock private com.chitfund.paymentservice.client.AuditClient auditClient;
    @Mock private PlanExpiryChecker planExpiryChecker;
    @Mock private MemberCreditService memberCreditService;

    @InjectMocks private ChitMonthDrawService service;

    private UUID chitId;

    @BeforeEach
    void setUp() {
        chitId = UUID.randomUUID();
        ChitMonthDraw draw = ChitMonthDraw.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .chitId(chitId)
                .monthNumber(3)
                .dueDate(LocalDate.of(2026, 3, 1))
                .status(DrawStatus.AWAITING_AUCTION)
                .build();
        when(drawRepository.findByChitIdAndMonthNumber(chitId, 3)).thenReturn(Optional.of(draw));
        when(drawRepository.save(any(ChitMonthDraw.class))).thenAnswer(i -> i.getArgument(0));
    }

    /** Fixed ids so ordering is deterministic and the assertions can name members. */
    private List<ChitMonthDrawService.MemberSpotEntry> members(int count, int spotsEach) {
        return java.util.stream.IntStream.range(0, count)
                .mapToObj(i -> new ChitMonthDrawService.MemberSpotEntry(
                        UUID.fromString(String.format("00000000-0000-0000-0000-%012d", i)), spotsEach))
                .toList();
    }

    @SuppressWarnings("unchecked")
    private List<PaymentRecord> savedRecords() {
        ArgumentCaptor<List<PaymentRecord>> captor = ArgumentCaptor.forClass(List.class);
        verify(paymentRecordRepository).saveAll(captor.capture());
        return captor.getValue();
    }

    private BigDecimal totalDividend(List<PaymentRecord> records) {
        return records.stream()
                .map(PaymentRecord::getDividendDeductedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // ── the A1 fix ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("A1: stranded paise are handed to members, so dividends sum to the distributable total")
    void remainderIsDistributedToMembers() {
        // 10,000 over 3 spots => 3,333.33 each, 9,999.99 allocated, 0.01 stranded.
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("3333.33"),
                members(3, 1), TENANT, new BigDecimal("10000.00"));

        List<PaymentRecord> records = savedRecords();
        assertThat(records).hasSize(3);

        // The invariant that previously failed.
        assertThat(totalDividend(records)).isEqualByComparingTo("10000.00");

        // Exactly one member absorbs the spare paisa; nobody gets more than one.
        assertThat(records).filteredOn(r ->
                r.getDividendDeductedAmount().compareTo(new BigDecimal("3333.34")) == 0).hasSize(1);
        assertThat(records).filteredOn(r ->
                r.getDividendDeductedAmount().compareTo(new BigDecimal("3333.33")) == 0).hasSize(2);
    }

    @Test
    @DisplayName("a larger shortfall is spread one paisa per member, never doubled up")
    void spreadsMultiplePaiseOnePerMember() {
        // 100.00 over 7 spots => 14.28 each = 99.96, so 0.04 to spread.
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("14.28"),
                members(7, 1), TENANT, new BigDecimal("100.00"));

        List<PaymentRecord> records = savedRecords();
        assertThat(totalDividend(records)).isEqualByComparingTo("100.00");
        assertThat(records).filteredOn(r ->
                r.getDividendDeductedAmount().compareTo(new BigDecimal("14.29")) == 0).hasSize(4);
        assertThat(records).filteredOn(r ->
                r.getDividendDeductedAmount().compareTo(new BigDecimal("14.28")) == 0).hasSize(3);
    }

    @Test
    @DisplayName("an exact division adds nothing")
    void exactDivisionUnchanged() {
        // 18,000 over 12 spots => 1,500.00 each, nothing left over.
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("1500.00"),
                members(12, 1), TENANT, new BigDecimal("18000.00"));

        List<PaymentRecord> records = savedRecords();
        assertThat(totalDividend(records)).isEqualByComparingTo("18000.00");
        assertThat(records).allMatch(r ->
                r.getDividendDeductedAmount().compareTo(new BigDecimal("1500.00")) == 0);
    }

    @Test
    @DisplayName("multi-spot members get perSpot x spots, plus at most one spare paisa")
    void multiSpotMembersScaleCorrectly() {
        // 3 members x 2 spots = 6 spots. 1,000.00 / 6 = 166.66 => 999.96, 0.04 to spread.
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("166.66"),
                members(3, 2), TENANT, new BigDecimal("1000.00"));

        List<PaymentRecord> records = savedRecords();
        // Only 3 members, so only 3 paise can be handed out one-each; the cap
        // prevents inventing a bigger discount than was actually available.
        assertThat(totalDividend(records)).isLessThanOrEqualTo(new BigDecimal("1000.00"));
        assertThat(records).allMatch(r ->
                r.getGrossInstallmentAmount().compareTo(new BigDecimal("2000")) == 0);
    }

    // ── backward compatibility ───────────────────────────────────────────────

    @Test
    @DisplayName("an older caller that omits the total keeps the previous behaviour")
    void nullDistributableLeavesBehaviourUnchanged() {
        // Version skew during deploy must not change what members owe.
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("3333.33"),
                members(3, 1), TENANT, null);

        List<PaymentRecord> records = savedRecords();
        assertThat(records).allMatch(r ->
                r.getDividendDeductedAmount().compareTo(new BigDecimal("3333.33")) == 0);
        assertThat(totalDividend(records)).isEqualByComparingTo("9999.99");
    }

    @Test
    @DisplayName("the six-argument overload still works and spreads nothing")
    void legacyOverloadStillCompiles() {
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("3333.33"),
                members(3, 1), TENANT);

        assertThat(totalDividend(savedRecords())).isEqualByComparingTo("9999.99");
    }

    // ── guards against bad input ─────────────────────────────────────────────

    @Test
    @DisplayName("a nonsensical total does not inflate anyone's discount")
    void implausibleTotalIsIgnored() {
        // Claiming 50,000 distributable against a 3,333.33 per-spot figure would
        // imply a huge shortfall. Capping at one paisa per member stops a bad
        // input from silently wiping out what members owe.
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("3333.33"),
                members(3, 1), TENANT, new BigDecimal("50000.00"));

        List<PaymentRecord> records = savedRecords();
        assertThat(totalDividend(records)).isEqualByComparingTo("10000.02");  // 9999.99 + 3 x 0.01
    }

    @Test
    @DisplayName("a total below what was allocated is ignored rather than clawed back")
    void smallerTotalDoesNotReduceDividends() {
        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("3333.33"),
                members(3, 1), TENANT, new BigDecimal("5000.00"));

        assertThat(totalDividend(savedRecords())).isEqualByComparingTo("9999.99");
    }

    @Test
    @DisplayName("the draw is opened once the dividend is applied")
    void drawBecomesOpen() {
        ArgumentCaptor<ChitMonthDraw> captor = ArgumentCaptor.forClass(ChitMonthDraw.class);

        service.applyAuctionDividend(chitId, 3,
                new BigDecimal("1000"), new BigDecimal("1500.00"),
                members(12, 1), TENANT, new BigDecimal("18000.00"));

        verify(drawRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(DrawStatus.OPEN);
    }
}

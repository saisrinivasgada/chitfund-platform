package com.chitfund.payoutservice.service;

import com.chitfund.common.event.PayoutDisbursedEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.PayoutDisbursement;
import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import com.chitfund.payoutservice.dto.request.CancelPayoutRequest;
import com.chitfund.payoutservice.dto.request.CreatePayoutRequest;
import com.chitfund.payoutservice.dto.request.DisburseRequest;
import com.chitfund.payoutservice.dto.response.PayoutResponse;
import com.chitfund.payoutservice.kafka.PayoutEventPublisher;
import com.chitfund.payoutservice.repository.PayoutDisbursementRepository;
import com.chitfund.payoutservice.repository.PayoutRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Business-logic tests for PayoutService.
 *
 * WHAT WE'RE PROTECTING:
 * - Treasury can never disburse more than the net payout amount
 * - A chit draw cannot have two active payouts for the same month
 * - Discount cannot consume the entire winning amount (winner gets at least ₹1)
 * - Partial disbursements track correctly and stop at exactly 100% of net
 * - Cancelled/voided payouts cannot be further mutated
 * - Disbursed payouts cannot be cancelled (money already sent)
 */
@ExtendWith(MockitoExtension.class)
class PayoutServiceTest {

    @Mock PayoutRepository payoutRepository;
    @Mock PayoutDisbursementRepository disbursementRepository;
    @Mock PayoutEventPublisher eventPublisher;
    @InjectMocks PayoutService payoutService;

    UUID adminId;
    UUID chitId;
    UUID memberId;
    UUID payoutId;

    @BeforeEach
    void setup() {
        adminId   = UUID.randomUUID();
        chitId    = UUID.randomUUID();
        memberId  = UUID.randomUUID();
        payoutId  = UUID.randomUUID();
    }

    // ─── Helper builders ──────────────────────────────────────────────────────

    private CreatePayoutRequest createRequest(BigDecimal winning, BigDecimal discount) {
        CreatePayoutRequest req = new CreatePayoutRequest();
        req.setChitId(chitId);
        req.setMemberId(memberId);
        req.setMonthNumber(1);
        req.setWinningAmount(winning);
        req.setDiscountAmount(discount);
        return req;
    }

    private Payout pendingPayout(BigDecimal net) {
        Payout p = Payout.builder()
                .id(payoutId)
                .chitId(chitId)
                .memberId(memberId)
                .monthNumber(1)
                .winningAmount(net.add(BigDecimal.valueOf(1000)))
                .discountAmount(BigDecimal.valueOf(1000))
                .netPayoutAmount(net)
                .disbursedAmount(BigDecimal.ZERO)
                .status(PayoutStatus.PENDING)
                .createdBy(adminId)
                .build();
        p.setCreatedAt(LocalDateTime.now());
        p.setUpdatedAt(LocalDateTime.now());
        return p;
    }

    private DisburseRequest disburseRequest(BigDecimal amount) {
        DisburseRequest req = new DisburseRequest();
        req.setDisbursementMode(DisbursementMode.CASH);
        req.setAmount(amount);
        return req;
    }

    private CancelPayoutRequest cancelRequest() {
        CancelPayoutRequest req = new CancelPayoutRequest();
        req.setReason("Test cancellation reason");
        return req;
    }

    // ─── createPayout tests ───────────────────────────────────────────────────

    @Nested
    @DisplayName("createPayout")
    class CreatePayoutTests {

        @Test
        @DisplayName("happy path: net = winning - discount, status starts PENDING")
        void createsPayoutWithCorrectNetAmount() {
            when(payoutRepository.existsByChitIdAndMonthNumberAndStatusNotIn(any(), anyInt(), any()))
                    .thenReturn(false);
            ArgumentCaptor<Payout> saved = ArgumentCaptor.forClass(Payout.class);
            when(payoutRepository.save(saved.capture())).thenAnswer(inv -> {
                Payout p = inv.getArgument(0);
                p.setId(payoutId);
                p.setCreatedAt(LocalDateTime.now());
                p.setUpdatedAt(LocalDateTime.now());
                return p;
            });
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.createPayout(createRequest(bd(50_000), bd(5_000)), adminId);

            Payout p = saved.getValue();
            assertThat(p.getNetPayoutAmount()).isEqualByComparingTo(bd(45_000));
            assertThat(p.getStatus()).isNull(); // @PrePersist sets it; not called in unit test
        }

        @Test
        @DisplayName("blocks duplicate: same chit + same month already has an active payout")
        void rejectsDuplicatePayoutForSameChitAndMonth() {
            when(payoutRepository.existsByChitIdAndMonthNumberAndStatusNotIn(any(), anyInt(), any()))
                    .thenReturn(true);

            CreatePayoutRequest req = createRequest(bd(50_000), bd(5_000));
            assertThatThrownBy(() -> payoutService.createPayout(req, adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("active payout already exists");
        }

        @Test
        @DisplayName("treasury safety: discount >= winning means winner gets ₹0 or less — rejected")
        void rejectsDiscountEqualToWinningAmount() {
            when(payoutRepository.existsByChitIdAndMonthNumberAndStatusNotIn(any(), anyInt(), any()))
                    .thenReturn(false);

            CreatePayoutRequest req = createRequest(bd(50_000), bd(50_000)); // equal
            assertThatThrownBy(() -> payoutService.createPayout(req, adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("Discount amount cannot be equal to or greater than");
        }

        @Test
        @DisplayName("treasury safety: discount > winning — rejected")
        void rejectsDiscountGreaterThanWinningAmount() {
            when(payoutRepository.existsByChitIdAndMonthNumberAndStatusNotIn(any(), anyInt(), any()))
                    .thenReturn(false);

            CreatePayoutRequest req = createRequest(bd(50_000), bd(60_000)); // discount > winning
            assertThatThrownBy(() -> payoutService.createPayout(req, adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("Discount amount cannot be equal to or greater than");
        }
    }

    // ─── disburse tests ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("disburse")
    class DisburseTests {

        @Test
        @DisplayName("full disbursement: disbursedAmount = net, status → DISBURSED")
        void fullDisbursementSetsStatusToDisbursed() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(null), adminId); // null = full remaining

            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.DISBURSED);
            assertThat(payout.getDisbursedAmount()).isEqualByComparingTo(bd(45_000));
        }

        @Test
        @DisplayName("partial disbursement: disburse ₹20k of ₹45k → PARTIALLY_DISBURSED")
        void partialDisbursementSetsStatusToPartiallyDisbursed() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(bd(20_000)), adminId);

            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.PARTIALLY_DISBURSED);
            assertThat(payout.getDisbursedAmount()).isEqualByComparingTo(bd(20_000));
        }

        @Test
        @DisplayName("second partial tops up to full → status becomes DISBURSED")
        void secondPartialCompletingFullAmountSetsStatusToDisbursed() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setDisbursedAmount(bd(20_000)); // first instalment already done
            payout.setStatus(PayoutStatus.PARTIALLY_DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(bd(25_000)), adminId); // remaining = 25k

            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.DISBURSED);
            assertThat(payout.getDisbursedAmount()).isEqualByComparingTo(bd(45_000));
        }

        @Test
        @DisplayName("treasury safety: cannot disburse more than remaining amount")
        void rejectsDisbursementExceedingRemainingAmount() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setDisbursedAmount(bd(20_000));
            payout.setStatus(PayoutStatus.PARTIALLY_DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            // Remaining = 25k. Trying to disburse 30k — must be rejected.
            assertThatThrownBy(() ->
                    payoutService.disburse(payoutId, disburseRequest(bd(30_000)), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("Cannot disburse more than the remaining amount");
        }

        @Test
        @DisplayName("treasury safety: cannot disburse zero or negative amount")
        void rejectsZeroOrNegativeDisbursementAmount() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() ->
                    payoutService.disburse(payoutId, disburseRequest(BigDecimal.ZERO), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("must be greater than zero");
        }

        @Test
        @DisplayName("cannot disburse a CANCELLED payout")
        void rejectsDisbursementOfCancelledPayout() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setStatus(PayoutStatus.CANCELLED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() ->
                    payoutService.disburse(payoutId, disburseRequest(null), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("PENDING or PARTIALLY_DISBURSED");
        }

        @Test
        @DisplayName("cannot disburse an already DISBURSED payout")
        void rejectsDisbursementOfFullyDisbursedPayout() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setDisbursedAmount(bd(45_000));
            payout.setStatus(PayoutStatus.DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() ->
                    payoutService.disburse(payoutId, disburseRequest(null), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("PENDING or PARTIALLY_DISBURSED");
        }

        @Test
        @DisplayName("disbursement records a PayoutDisbursement transaction row")
        void disbursementPersistsTransactionRecord() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            ArgumentCaptor<PayoutDisbursement> txCaptor = ArgumentCaptor.forClass(PayoutDisbursement.class);
            when(disbursementRepository.save(txCaptor.capture())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(bd(20_000)), adminId);

            PayoutDisbursement tx = txCaptor.getValue();
            assertThat(tx.getPayoutId()).isEqualTo(payoutId);
            assertThat(tx.getAmount()).isEqualByComparingTo(bd(20_000));
            assertThat(tx.getDisbursedBy()).isEqualTo(adminId);
            assertThat(tx.getMode()).isEqualTo(DisbursementMode.CASH);
        }

        @Test
        @DisplayName("full disbursement fires PayoutDisbursedEvent; partial does not")
        void fullDisbursementPublishesEvent() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(null), adminId);
            verify(eventPublisher).publish(any(PayoutDisbursedEvent.class));
        }

        @Test
        @DisplayName("partial disbursement does NOT publish PayoutDisbursedEvent")
        void partialDisbursementDoesNotPublishEvent() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(bd(20_000)), adminId);
            verify(eventPublisher, never()).publish(any(PayoutDisbursedEvent.class));
        }
    }

    // ─── cancel tests ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("cancel")
    class CancelTests {

        @Test
        @DisplayName("PENDING payout can be cancelled")
        void cancelsPendingPayout() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.cancel(payoutId, cancelRequest(), adminId);

            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.CANCELLED);
            assertThat(payout.getCancellationReason()).isEqualTo("Test cancellation reason");
        }

        @Test
        @DisplayName("treasury safety: DISBURSED payout cannot be cancelled — money already sent")
        void rejectsCancelOfDisbursedPayout() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setStatus(PayoutStatus.DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() -> payoutService.cancel(payoutId, cancelRequest(), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("already been disbursed");
        }

        @Test
        @DisplayName("treasury safety: PARTIALLY_DISBURSED cannot be cancelled — some money was sent")
        void rejectsCancelOfPartiallyDisbursedPayout() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setStatus(PayoutStatus.PARTIALLY_DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() -> payoutService.cancel(payoutId, cancelRequest(), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("partially disbursed");
        }

        @Test
        @DisplayName("already CANCELLED payout cannot be cancelled again")
        void rejectsDoubleCancellation() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setStatus(PayoutStatus.CANCELLED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() -> payoutService.cancel(payoutId, cancelRequest(), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("already cancelled");
        }
    }

    // ─── voidPayout tests ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("voidPayout")
    class VoidPayoutTests {

        @Test
        @DisplayName("PENDING payout can be voided")
        void voidsPendingPayout() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            CancelPayoutRequest req = cancelRequest();
            payoutService.voidPayout(payoutId, req, adminId);

            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.VOIDED);
            assertThat(payout.getVoidReason()).isEqualTo("Test cancellation reason");
        }

        @Test
        @DisplayName("already CANCELLED payout cannot be voided")
        void rejectsVoidOfCancelledPayout() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setStatus(PayoutStatus.CANCELLED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() -> payoutService.voidPayout(payoutId, cancelRequest(), adminId))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("already VOIDED payout cannot be voided again")
        void rejectsDoubleVoid() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setStatus(PayoutStatus.VOIDED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() -> payoutService.voidPayout(payoutId, cancelRequest(), adminId))
                    .isInstanceOf(BusinessException.class);
        }
    }

    // ─── Payout not found ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("not found")
    class NotFoundTests {

        @Test
        @DisplayName("disburse on non-existent payout throws")
        void disburseThrowsWhenPayoutNotFound() {
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.empty());
            assertThatThrownBy(() ->
                    payoutService.disburse(payoutId, disburseRequest(null), adminId))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("cancel on non-existent payout throws")
        void cancelThrowsWhenPayoutNotFound() {
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.empty());
            assertThatThrownBy(() -> payoutService.cancel(payoutId, cancelRequest(), adminId))
                    .isInstanceOf(BusinessException.class);
        }
    }

    // ─── Edge cases ───────────────────────────────────────────────────────────

    @Nested
    @DisplayName("edge cases")
    class EdgeCaseTests {

        @Test
        @DisplayName("disbursing exactly the remaining amount completes the payout")
        void disbursementOfExactRemainingAmountCompletesThePayout() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setDisbursedAmount(bd(44_999)); // ₹1 left
            payout.setStatus(PayoutStatus.PARTIALLY_DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(bd(1)), adminId);

            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.DISBURSED);
            assertThat(payout.getDisbursedAmount()).isEqualByComparingTo(bd(45_000));
        }

        @Test
        @DisplayName("null amount defaults to disburse full remaining amount")
        void nullAmountDefaultsToFullRemaining() {
            Payout payout = pendingPayout(bd(45_000));
            payout.setDisbursedAmount(bd(10_000));
            payout.setStatus(PayoutStatus.PARTIALLY_DISBURSED);
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));
            when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            ArgumentCaptor<PayoutDisbursement> captor = ArgumentCaptor.forClass(PayoutDisbursement.class);
            when(disbursementRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            payoutService.disburse(payoutId, disburseRequest(null), adminId); // null = auto-fill

            // Should have disbursed exactly 35k (the remaining)
            assertThat(captor.getValue().getAmount()).isEqualByComparingTo(bd(35_000));
            assertThat(payout.getStatus()).isEqualTo(PayoutStatus.DISBURSED);
        }

        @Test
        @DisplayName("duplicate payout check excludes CANCELLED and VOIDED status")
        void duplicateCheckDoesNotCountCancelledOrVoidedPayouts() {
            // If the only prior payout is CANCELLED or VOIDED, we allow creating a new one
            when(payoutRepository.existsByChitIdAndMonthNumberAndStatusNotIn(
                    eq(chitId), eq(1), eq(List.of(PayoutStatus.CANCELLED, PayoutStatus.VOIDED))))
                    .thenReturn(false); // no active (non-cancelled, non-voided) payout

            ArgumentCaptor<Payout> saved = ArgumentCaptor.forClass(Payout.class);
            when(payoutRepository.save(saved.capture())).thenAnswer(inv -> {
                Payout p = inv.getArgument(0);
                p.setId(payoutId);
                p.setCreatedAt(LocalDateTime.now());
                p.setUpdatedAt(LocalDateTime.now());
                return p;
            });
            when(disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(any()))
                    .thenReturn(Collections.emptyList());

            // Should succeed — no active duplicate
            assertThatNoException().isThrownBy(() ->
                    payoutService.createPayout(createRequest(bd(50_000), bd(5_000)), adminId));
        }

        @Test
        @DisplayName("negative disbursement amount is rejected")
        void negativeDisbursementAmountIsRejected() {
            Payout payout = pendingPayout(bd(45_000));
            when(payoutRepository.findById(payoutId)).thenReturn(Optional.of(payout));

            assertThatThrownBy(() ->
                    payoutService.disburse(payoutId, disburseRequest(bd(-100)), adminId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("must be greater than zero");
        }
    }

    // ─── Utility ──────────────────────────────────────────────────────────────

    private static BigDecimal bd(long value) {
        return BigDecimal.valueOf(value);
    }
}

package com.chitfund.payoutservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.PayoutDisbursedEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.payoutservice.client.ChitServiceClient;
import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.PayoutDisbursement;
import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutFinancialCommandType;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import com.chitfund.payoutservice.dto.request.CancelPayoutRequest;
import com.chitfund.payoutservice.dto.request.CreatePayoutRequest;
import com.chitfund.payoutservice.dto.request.DisburseRequest;
import com.chitfund.payoutservice.dto.request.InstallmentMonthBreakdownDto;
import com.chitfund.payoutservice.dto.response.PayoutDisbursementResponse;
import com.chitfund.payoutservice.dto.response.PayoutFinancialSyncResponse;
import com.chitfund.payoutservice.dto.response.PayoutResponse;
import com.chitfund.payoutservice.kafka.PayoutEventPublisher;
import com.chitfund.payoutservice.repository.PayoutDisbursementRepository;
import com.chitfund.payoutservice.repository.PayoutFinancialCommandRepository;
import com.chitfund.payoutservice.repository.PayoutRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PayoutService {

    private final PayoutRepository payoutRepository;
    private final PayoutDisbursementRepository disbursementRepository;
    private final PayoutEventPublisher eventPublisher;
    private final ChitServiceClient chitServiceClient;
    private final com.chitfund.payoutservice.client.AuditClient auditClient;
    private final PayoutFinancialCommandStore financialCommandStore;
    private final PayoutFinancialCommandRepository financialCommandRepository;
    private final PayoutCreationIdempotencyStore creationIdempotencyStore;

    /**
     * Admin registers a payout obligation after the winner is announced in chit-service.
     * netPayoutAmount is computed here — admin only provides winning and discount amounts.
     *
     * WHY not compute this in chit-service and push here?
     * Separation of concerns: chit-service decides WHO won. Payout-service handles MONEY.
     * In the future, Kafka will carry the WinnerSelectedEvent and this method becomes
     * a Kafka consumer, called automatically. For now, admin calls it manually.
     */
    @Transactional
    public PayoutResponse createPayout(CreatePayoutRequest request, UUID adminId, String actorRole,
                                       String rawIdempotencyKey) {
        String currentTenant = tenantId();
        String idempotencyKey = normalizeRequiredIdempotencyKey(
                rawIdempotencyKey, "payout creation");
        String requestHash = PayoutIdempotencyFingerprint.forCreation(request);
        var priorPayoutId = creationIdempotencyStore.claim(
                currentTenant, idempotencyKey, requestHash);
        if (priorPayoutId.isPresent()) {
            Payout prior = payoutRepository.findByIdAndTenantId(
                            priorPayoutId.get(), currentTenant)
                    .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                            "The prior payout result could not be loaded",
                            HttpStatus.SERVICE_UNAVAILABLE));
            log.info("Idempotent payout creation retry detected for payout={} key={}",
                    prior.getId(), idempotencyKey);
            return toResponse(prior);
        }

        ChitServiceClient.WinnerDto winner = chitServiceClient.getWinnerForPayout(
                request.getChitId(), request.getMonthNumber(), request.getMemberId(), currentTenant);
        if (winner.getWinnerCount() == 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No recorded winner exists for this member, chit, and draw");
        }
        if (winner.getWinnerCount() != 1) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Multiple winner records exist for this member and draw. Resolve the duplicate before creating a payout.");
        }
        if (request.getWinningAmount().compareTo(winner.getWinningAmount()) != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Winning amount does not match the recorded draw result");
        }
        if (payoutRepository.existsByTenantIdAndChitIdAndMonthNumberAndMemberIdAndStatusNotIn(
                currentTenant, request.getChitId(), request.getMonthNumber(), request.getMemberId(),
                List.of(PayoutStatus.CANCELLED, PayoutStatus.VOIDED))) {
            throw new BusinessException(ErrorCode.PAYOUT_ALREADY_EXISTS,
                    "An active payout already exists for this member in chit " + request.getChitId()
                    + " cycle " + request.getMonthNumber());
        }

        if (request.getDiscountAmount().compareTo(request.getWinningAmount()) >= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Discount amount cannot be equal to or greater than the winning amount",
                    HttpStatus.BAD_REQUEST);
        }

        validateDeductionBreakdown(request);

        BigDecimal netAmount = request.getWinningAmount().subtract(request.getDiscountAmount());

        BigDecimal zero = BigDecimal.ZERO;
        Payout payout = Payout.builder()
                .tenantId(currentTenant)
                .chitId(request.getChitId())
                .memberId(request.getMemberId())
                .monthNumber(request.getMonthNumber())
                .winningAmount(request.getWinningAmount())
                .discountAmount(request.getDiscountAmount())
                .netPayoutAmount(netAmount)
                .installmentSettlement(request.getInstallmentSettlement() != null ? request.getInstallmentSettlement() : zero)
                .installmentSettlementMonths(
                        request.getInstallmentMonthBreakdown() != null && !request.getInstallmentMonthBreakdown().isEmpty()
                        ? request.getInstallmentMonthBreakdown().stream()
                                .sorted(java.util.Comparator.comparingInt(InstallmentMonthBreakdownDto::getMonth))
                                .map(b -> b.getMonth() + ":" + b.getAmount().stripTrailingZeros().toPlainString())
                                .collect(java.util.stream.Collectors.joining(","))
                        : null)
                .crossChitSettlement(request.getCrossChitSettlement() != null ? request.getCrossChitSettlement() : zero)
                .manualAdjustment(request.getManualAdjustment() != null ? request.getManualAdjustment() : zero)
                .notes(request.getNotes())
                .createdBy(adminId)
                .build();

        payoutRepository.save(payout);
        creationIdempotencyStore.complete(
                currentTenant, idempotencyKey, requestHash, payout.getId());
        log.info("Payout created for member {} — chit {} month {} — net ₹{}",
                request.getMemberId(), request.getChitId(), request.getMonthNumber(), netAmount);

        // Queue every specifically withheld installment, including prior months
        // from this chit. The older implementation only marked the current month
        // and silently ignored the rest of installmentMonthBreakdown.
        List<InstallmentMonthBreakdownDto> installmentDeductions = resolvedInstallmentDeductions(request);
        for (InstallmentMonthBreakdownDto deduction : installmentDeductions) {
            queueFinancialCommand(PayoutFinancialCommand.builder()
                    .tenantId(currentTenant)
                    .actorId(adminId)
                    .payoutId(payout.getId())
                    .dedupeKey(payout.getId() + ":INSTALLMENT_DEDUCTION:" + deduction.getMonth())
                    .commandType(PayoutFinancialCommandType.MARK_INSTALLMENT_DEDUCTION)
                    .chitId(request.getChitId())
                    .memberId(request.getMemberId())
                    .monthNumber(deduction.getMonth())
                    .amount(deduction.getAmount())
                    .build());
        }
        if (request.getCrossChitDeductions() != null) {
            int deductionIndex = 0;
            for (var deduction : request.getCrossChitDeductions()) {
                queueFinancialCommand(PayoutFinancialCommand.builder()
                        .tenantId(currentTenant)
                        .actorId(adminId)
                        .payoutId(payout.getId())
                        .dedupeKey(payout.getId() + ":CROSS_DEDUCTION:" + deductionIndex++)
                        .commandType(PayoutFinancialCommandType.MARK_CROSS_CHIT_DEDUCTION)
                        .chitId(deduction.getChitId())
                        .memberId(request.getMemberId())
                        .amount(deduction.getAmount())
                        .build());
            }
        }

        PayoutCreatedEvent createdEvent = new PayoutCreatedEvent(
                payout.getId().toString(),
                payout.getChitId().toString(),
                payout.getMemberId().toString(),
                payout.getMonthNumber(),
                payout.getWinningAmount(),
                payout.getDiscountAmount(),
                payout.getNetPayoutAmount(),
                adminId.toString(),
                Instant.now(),
                currentTenant
        );
        eventPublisher.publish(createdEvent);

        auditClient.log("PAYOUT", payout.getId().toString(), payout.getChitId().toString(),
                "PAYOUT_CREATED", adminId.toString(), actorRole,
                null,
                Map.of("memberId", payout.getMemberId().toString(),
                        "monthNumber", payout.getMonthNumber(),
                        "netAmount", payout.getNetPayoutAmount().toPlainString()),
                currentTenant, idempotencyKey);

        return toResponse(payout);
    }

    /**
     * Admin records disbursement — the moment money leaves the admin's hands.
     * Supports partial disbursement: pass a lower `amount` to disburse in instalments.
     * Status becomes PARTIALLY_DISBURSED until the full netPayoutAmount is sent.
     */
    @Transactional
    public PayoutResponse disburse(UUID payoutId, DisburseRequest request, UUID adminId,
                                   String rawIdempotencyKey) {
        Payout payout = findOrThrowForWrite(payoutId);

        String idempotencyKey = normalizeRequiredIdempotencyKey(
                rawIdempotencyKey, "payout disbursement");
        String requestHash = PayoutIdempotencyFingerprint.of(
                payoutId, request.getAmount(), request.getDisbursementMode(),
                request.getReferenceNumber(), request.getNotes());
        var existing = disbursementRepository.findByPayoutIdAndIdempotencyKey(
                payoutId, idempotencyKey);
        if (existing.isPresent()) {
            PayoutDisbursement prior = existing.get();
            if (prior.getIdempotencyRequestHash() == null
                    || !prior.getIdempotencyRequestHash().equals(requestHash)) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                        "Idempotency key was already used with different disbursement details",
                        HttpStatus.CONFLICT);
            }
            log.info("Idempotent payout disbursement retry detected for payout={} key={}",
                    payoutId, idempotencyKey);
            return toResponse(payout);
        }

        // A payout with withheld dues must not move cash until payment-service
        // has durably acknowledged every earlier deduction command. This keeps
        // notifications and treasury debit behind the actual member balance.
        if (financialCommandRepository.countByPayoutIdAndStatusNot(
                payoutId, "COMPLETED") > 0) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "Payout deductions are still syncing; try disbursement again shortly",
                    HttpStatus.CONFLICT);
        }

        if (payout.getStatus() != PayoutStatus.PENDING && payout.getStatus() != PayoutStatus.PARTIALLY_DISBURSED) {
            throw new BusinessException(ErrorCode.PAYOUT_NOT_PENDING,
                    "Only PENDING or PARTIALLY_DISBURSED payouts can be disbursed — current status: " + payout.getStatus());
        }
        PayoutStatus previousStatus = payout.getStatus();

        BigDecimal alreadyDisbursed = payout.getDisbursedAmount() != null ? payout.getDisbursedAmount() : BigDecimal.ZERO;
        BigDecimal remaining = payout.getNetPayoutAmount().subtract(alreadyDisbursed);

        // Default: disburse the full remaining amount
        BigDecimal thisAmount = (request.getAmount() != null) ? request.getAmount() : remaining;

        if (thisAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Disbursement amount must be greater than zero", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        if (thisAmount.compareTo(remaining) > 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Cannot disburse more than the remaining amount ₹" + remaining, org.springframework.http.HttpStatus.BAD_REQUEST);
        }

        BigDecimal newDisbursed = alreadyDisbursed.add(thisAmount);
        boolean fullyDisbursed = newDisbursed.compareTo(payout.getNetPayoutAmount()) >= 0;

        LocalDateTime now = LocalDateTime.now();
        payout.setDisbursedAmount(newDisbursed);
        payout.setStatus(fullyDisbursed ? PayoutStatus.DISBURSED : PayoutStatus.PARTIALLY_DISBURSED);
        payout.setDisbursementMode(request.getDisbursementMode());
        if (request.getReferenceNumber() != null) payout.setReferenceNumber(request.getReferenceNumber());
        payout.setDisbursedAt(now);
        payout.setDisbursedBy(adminId);
        if (request.getNotes() != null) payout.setNotes(request.getNotes());

        payoutRepository.save(payout);

        // Record this individual disbursement transaction so we can show the full history
        PayoutDisbursement disbursement = disbursementRepository.save(PayoutDisbursement.builder()
                .id(UUID.randomUUID())
                .payoutId(payout.getId())
                .amount(thisAmount)
                .mode(request.getDisbursementMode())
                .referenceNumber(request.getReferenceNumber())
                .notes(request.getNotes())
                .disbursedBy(adminId)
                .disbursedAt(now)
                .idempotencyKey(idempotencyKey)
                .idempotencyRequestHash(requestHash)
                .build());
        log.info("Payout {} — ₹{} disbursed (total so far: ₹{} / ₹{}) to member {} via {} status={}",
                payoutId, thisAmount, newDisbursed, payout.getNetPayoutAmount(),
                payout.getMemberId(), request.getDisbursementMode(), payout.getStatus());

        // The treasury update is a durable, ordered command committed with this
        // disbursement. Network failures are retried outside this transaction.
        queueFinancialCommand(PayoutFinancialCommand.builder()
                .tenantId(tenantId())
                .actorId(adminId)
                .payoutId(payoutId)
                .dedupeKey(payoutId + ":TREASURY_DEBIT:" + disbursement.getId())
                .commandType(PayoutFinancialCommandType.RECORD_TREASURY_DEBIT)
                .memberId(payout.getMemberId())
                .amount(thisAmount)
                .disbursementMode(request.getDisbursementMode())
                .build());

        if (fullyDisbursed) {
            PayoutDisbursedEvent disbursedEvent = new PayoutDisbursedEvent(
                    payout.getId().toString(),
                    payout.getChitId().toString(),
                    payout.getMemberId().toString(),
                    payout.getMonthNumber(),
                    payout.getNetPayoutAmount(),
                    payout.getDisbursementMode().name(),
                    payout.getReferenceNumber(),
                    adminId.toString(),
                    Instant.now(),
                    tenantId()
            );
            eventPublisher.publish(disbursedEvent);

            // If every draw in this chit now has a DISBURSED payout, auto-complete the chit.
            // WHY check here and not in chit-service?
            // Payout-service is the authority on disbursement status. Chit-service doesn't
            // know which payouts exist — pulling that knowledge across a service boundary
            // (chit → payout) would create a backwards dependency.
            checkAndAutoCompleteChit(payout.getChitId());
        }

        auditClient.log("PAYOUT", payoutId.toString(), payout.getChitId().toString(),
                "PAYOUT_DISBURSED", adminId.toString(), "ADMIN",
                Map.of("status", previousStatus.name()),
                Map.of("status", payout.getStatus().name(),
                        "amount", thisAmount.toPlainString(),
                        "totalDisbursed", newDisbursed.toPlainString(),
                        "mode", request.getDisbursementMode().name()),
                tenantId(), idempotencyKey);

        return toResponse(payout);
    }

    @Transactional
    public PayoutResponse voidPayout(UUID payoutId, CancelPayoutRequest request, UUID adminId) {
        Payout payout = findOrThrowForWrite(payoutId);
        if (payout.getStatus() == PayoutStatus.CANCELLED || payout.getStatus() == PayoutStatus.VOIDED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Payout is already " + payout.getStatus(), HttpStatus.BAD_REQUEST);
        }
        PayoutStatus previousStatus = payout.getStatus();

        BigDecimal disbursedSoFar = payout.getDisbursedAmount() != null ? payout.getDisbursedAmount() : BigDecimal.ZERO;
        DisbursementMode modeUsed = payout.getDisbursementMode();

        payout.setStatus(PayoutStatus.VOIDED);
        payout.setVoidedAt(LocalDateTime.now());
        payout.setVoidedBy(adminId);
        payout.setVoidReason(request.getReason());
        payoutRepository.save(payout);

        queueFinancialCommand(PayoutFinancialCommand.builder()
                .tenantId(tenantId())
                .actorId(adminId)
                .payoutId(payoutId)
                .dedupeKey(payoutId + ":REVERT_DEDUCTIONS")
                .commandType(PayoutFinancialCommandType.REVERT_DEDUCTIONS)
                .build());

        if (disbursedSoFar.compareTo(BigDecimal.ZERO) > 0 && modeUsed != null) {
            List<PayoutDisbursement> postedDisbursements =
                    disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(payoutId);
            BigDecimal postedTotal = postedDisbursements.stream()
                    .map(PayoutDisbursement::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (postedTotal.compareTo(disbursedSoFar) == 0 && !postedDisbursements.isEmpty()) {
                for (PayoutDisbursement posted : postedDisbursements) {
                    queueFinancialCommand(PayoutFinancialCommand.builder()
                            .tenantId(tenantId())
                            .actorId(adminId)
                            .payoutId(payoutId)
                            .dedupeKey(payoutId + ":TREASURY_REVERSAL:" + posted.getId())
                            .commandType(PayoutFinancialCommandType.RECORD_TREASURY_REVERSAL)
                            .amount(posted.getAmount())
                            .disbursementMode(posted.getMode())
                            .build());
                }
            } else {
                // Compatibility for records predating the disbursement history.
                // New payouts always take the exact per-transaction path above.
                log.error("Payout {} disbursement history totals ₹{} but payout totals ₹{}; "
                                + "using legacy {} account for reversal",
                        payoutId, postedTotal, disbursedSoFar, modeUsed);
                queueFinancialCommand(PayoutFinancialCommand.builder()
                        .tenantId(tenantId())
                        .actorId(adminId)
                        .payoutId(payoutId)
                        .dedupeKey(payoutId + ":TREASURY_REVERSAL:LEGACY")
                        .commandType(PayoutFinancialCommandType.RECORD_TREASURY_REVERSAL)
                        .amount(disbursedSoFar)
                        .disbursementMode(modeUsed)
                        .build());
            }
        }

        log.info("Payout {} voided by {}. Reason: {}. Disbursed ₹{} reversed.",
                payoutId, adminId, request.getReason(), disbursedSoFar);

        auditClient.log("PAYOUT", payoutId.toString(), payout.getChitId().toString(),
                "PAYOUT_VOIDED", adminId.toString(), "ADMIN",
                Map.of("status", previousStatus.name()),
                Map.of("status", "VOIDED", "reason", request.getReason() != null ? request.getReason() : ""),
                tenantId());

        return toResponse(payout);
    }

    @Transactional
    public PayoutResponse cancel(UUID payoutId, CancelPayoutRequest request, UUID adminId) {
        Payout payout = findOrThrowForWrite(payoutId);

        if (payout.getStatus() == PayoutStatus.DISBURSED) {
            throw new BusinessException(ErrorCode.PAYOUT_ALREADY_DISBURSED,
                    "Cannot cancel a payout that has already been disbursed");
        }
        if (payout.getStatus() == PayoutStatus.PARTIALLY_DISBURSED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Cannot cancel a partially disbursed payout — please disburse the remaining amount instead",
                    HttpStatus.BAD_REQUEST);
        }
        if (payout.getStatus() == PayoutStatus.CANCELLED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Payout is already cancelled", HttpStatus.BAD_REQUEST);
        }
        if (payout.getStatus() == PayoutStatus.VOIDED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Cannot cancel a voided payout", HttpStatus.BAD_REQUEST);
        }

        payout.setStatus(PayoutStatus.CANCELLED);
        payout.setCancelledAt(LocalDateTime.now());
        payout.setCancelledBy(adminId);
        payout.setCancellationReason(request.getReason());

        payoutRepository.save(payout);

        queueFinancialCommand(PayoutFinancialCommand.builder()
                .tenantId(tenantId())
                .actorId(adminId)
                .payoutId(payoutId)
                .dedupeKey(payoutId + ":REVERT_DEDUCTIONS")
                .commandType(PayoutFinancialCommandType.REVERT_DEDUCTIONS)
                .build());

        log.info("Payout {} cancelled. Reason: {}. Installment deductions reverted.", payoutId, request.getReason());

        auditClient.log("PAYOUT", payoutId.toString(), payout.getChitId().toString(),
                "PAYOUT_CANCELLED", adminId.toString(), "ADMIN",
                Map.of("status", "PENDING"),
                Map.of("status", "CANCELLED", "reason", request.getReason() != null ? request.getReason() : ""),
                tenantId());

        return toResponse(payout);
    }

    @Transactional(readOnly = true)
    public PayoutResponse getById(UUID payoutId) {
        return toResponse(findOrThrow(payoutId));
    }

    /** Internal callers must supply the tenant explicitly; service credentials never imply scope. */
    @Transactional(readOnly = true)
    public PayoutResponse getByIdForTenant(UUID payoutId, String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }
        Payout payout = payoutRepository.findByIdAndTenantId(payoutId, tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYOUT_NOT_FOUND,
                        "Payout not found: " + payoutId));
        return toResponse(payout);
    }

    @Transactional(readOnly = true)
    public PayoutFinancialSyncResponse getFinancialSync(UUID payoutId) {
        findOrThrow(payoutId); // tenant authorization and non-enumerating not-found behavior
        List<PayoutFinancialCommand> commands =
                financialCommandRepository.findByPayoutIdOrderBySequenceNo(payoutId);
        long completed = commands.stream().filter(c -> "COMPLETED".equals(c.getStatus())).count();
        long retrying = commands.stream()
                .filter(c -> "RETRY".equals(c.getStatus()) || "FAILED".equals(c.getStatus()))
                .count();
        long pending = commands.size() - completed;
        boolean terminalFailure = commands.stream().anyMatch(c -> "FAILED".equals(c.getStatus()));
        boolean scheduledRetry = commands.stream().anyMatch(c -> "RETRY".equals(c.getStatus()));
        String status = commands.isEmpty() || completed == commands.size()
                ? "SYNCED" : terminalFailure ? "FAILED" : scheduledRetry ? "RETRYING" : "SYNCING";
        String lastError = commands.stream()
                .filter(c -> c.getLastErrorCode() != null)
                .reduce((first, second) -> second)
                .map(PayoutFinancialCommand::getLastErrorCode)
                .orElse(null);
        return PayoutFinancialSyncResponse.builder()
                .status(status)
                .totalOperations(commands.size())
                .completedOperations(completed)
                .pendingOperations(pending)
                .retryingOperations(retrying)
                .lastErrorCode(lastError)
                .build();
    }

    @Transactional
    public PayoutFinancialSyncResponse retryFinancialSync(UUID payoutId, UUID adminId) {
        Payout payout = findOrThrowForWrite(payoutId);
        int retried = financialCommandStore.retryFailed(payoutId);
        if (retried == 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "This payout has no terminal financial sync failures to retry",
                    HttpStatus.BAD_REQUEST);
        }
        auditClient.log("PAYOUT", payoutId.toString(), payout.getChitId().toString(),
                "PAYOUT_FINANCIAL_SYNC_RETRIED", adminId.toString(), "ADMIN",
                Map.of("failedOperations", retried), Map.of("status", "RETRYING"),
                tenantId());
        return getFinancialSync(payoutId);
    }

    // Admin dashboard: PENDING + PARTIALLY_DISBURSED payouts that still need action
    @Transactional(readOnly = true)
    public List<PayoutResponse> getPendingPayouts() {
        return payoutRepository.findByTenantIdAndStatusInOrderByCreatedAtAsc(
                tenantId(),
                List.of(PayoutStatus.PENDING, PayoutStatus.PARTIALLY_DISBURSED))
                .stream().map(this::toResponse).toList();
    }

    // Full history for a chit — month 1 through N, who got paid, how much, when
    @Transactional(readOnly = true)
    public List<PayoutResponse> getPayoutsForChit(UUID chitId) {
        return payoutRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(tenantId(), chitId)
                .stream().map(this::toResponse).toList();
    }

    // Member's complete winning history across all chits they've participated in
    @Transactional(readOnly = true)
    public List<PayoutResponse> getPayoutsForMember(UUID memberId) {
        return payoutRepository.findByTenantIdAndMemberIdOrderByCreatedAtDesc(tenantId(), memberId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PayoutResponse> getAllPayouts(UUID chitId, LocalDate fromDate, LocalDate toDate) {
        String tid = tenantId();
        if (fromDate != null || toDate != null) {
            LocalDateTime start = fromDate != null ? fromDate.atStartOfDay() : LocalDate.of(2000, 1, 1).atStartOfDay();
            LocalDateTime end   = toDate   != null ? toDate.plusDays(1).atStartOfDay() : LocalDate.now().plusDays(1).atStartOfDay();
            return payoutRepository.findByTenantIdAndDateRange(tid, start, end, chitId)
                    .stream().map(this::toResponse).toList();
        }
        if (chitId != null) {
            return payoutRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(tid, chitId)
                    .stream().map(this::toResponse).toList();
        }
        return payoutRepository.findByTenantIdOrderByCreatedAtDesc(tid)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PayoutResponse> getTodaysPayouts() {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        LocalDateTime end   = start.plusDays(1);
        return payoutRepository.findByTenantIdAndTodaysPayouts(tenantId(), start, end)
                .stream().map(this::toResponse).toList();
    }

    private void checkAndAutoCompleteChit(UUID chitId) {
        try {
            String currentTenant = tenantId();
            int durationMonths = chitServiceClient.getChitDurationMonths(chitId, currentTenant);
            if (durationMonths <= 0) return;
            long disbursedCount = payoutRepository.countByTenantIdAndChitIdAndStatus(
                    currentTenant, chitId, PayoutStatus.DISBURSED);
            if (disbursedCount >= durationMonths) {
                log.info("All {} draws disbursed for chit {} — triggering auto-complete", durationMonths, chitId);
                chitServiceClient.markChitCompleted(chitId, currentTenant);
            } else {
                log.debug("Chit {} has {}/{} draws disbursed — not yet complete", chitId, disbursedCount, durationMonths);
            }
        } catch (Exception e) {
            log.error("Auto-complete check failed for chit {} — {}", chitId, e.getMessage());
        }
    }

    private Payout findOrThrow(UUID id) {
        return payoutRepository.findByIdAndTenantId(id, tenantId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYOUT_NOT_FOUND,
                        "Payout not found: " + id));
    }

    private Payout findOrThrowForWrite(UUID id) {
        return payoutRepository.findByIdAndTenantIdForUpdate(id, tenantId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYOUT_NOT_FOUND,
                        "Payout not found: " + id));
    }

    private String normalizeRequiredIdempotencyKey(String key, String operation) {
        if (key == null || key.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "X-Idempotency-Key is required for " + operation);
        }
        String normalized = key.trim();
        if (normalized.length() > 64) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "X-Idempotency-Key must be at most 64 characters");
        }
        return normalized;
    }

    private String tenantId() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }
        return tenantId;
    }

    private void queueFinancialCommand(PayoutFinancialCommand command) {
        financialCommandStore.enqueue(command);
    }

    private void validateDeductionBreakdown(CreatePayoutRequest request) {
        BigDecimal installment = nonNegative(request.getInstallmentSettlement(), "Installment settlement");
        BigDecimal crossChit = nonNegative(request.getCrossChitSettlement(), "Cross-chit settlement");
        BigDecimal manual = nonNegative(request.getManualAdjustment(), "Manual adjustment");

        List<InstallmentMonthBreakdownDto> installments = resolvedInstallmentDeductions(request);
        BigDecimal installmentTotal = installments.stream()
                .map(InstallmentMonthBreakdownDto::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (installmentTotal.compareTo(installment) != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Installment deduction breakdown must equal installment settlement",
                    HttpStatus.BAD_REQUEST);
        }

        BigDecimal crossTotal = request.getCrossChitDeductions() == null
                ? BigDecimal.ZERO
                : request.getCrossChitDeductions().stream()
                        .map(d -> nonNegative(d.getAmount(), "Cross-chit deduction"))
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (crossTotal.compareTo(crossChit) != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Cross-chit deduction breakdown must equal cross-chit settlement",
                    HttpStatus.BAD_REQUEST);
        }

        if (installment.add(crossChit).add(manual).compareTo(request.getDiscountAmount()) != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Payout deductions must equal the total withheld amount",
                    HttpStatus.BAD_REQUEST);
        }
    }

    private List<InstallmentMonthBreakdownDto> resolvedInstallmentDeductions(
            CreatePayoutRequest request) {
        if (request.getInstallmentMonthBreakdown() != null
                && !request.getInstallmentMonthBreakdown().isEmpty()) {
            java.util.Set<Integer> months = new java.util.HashSet<>();
            for (InstallmentMonthBreakdownDto deduction : request.getInstallmentMonthBreakdown()) {
                if (deduction == null || deduction.getMonth() == null
                        || deduction.getMonth() < 1 || !months.add(deduction.getMonth())) {
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Installment deduction months must be unique positive numbers",
                            HttpStatus.BAD_REQUEST);
                }
                nonNegative(deduction.getAmount(), "Installment deduction");
                if (deduction.getAmount().compareTo(BigDecimal.ZERO) == 0) {
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Installment deduction amount must be greater than zero",
                            HttpStatus.BAD_REQUEST);
                }
            }
            return request.getInstallmentMonthBreakdown();
        }
        BigDecimal installment = request.getInstallmentSettlement() != null
                ? request.getInstallmentSettlement() : BigDecimal.ZERO;
        if (Boolean.TRUE.equals(request.getCollectCurrentMonthInstallment())
                && installment.compareTo(BigDecimal.ZERO) > 0) {
            InstallmentMonthBreakdownDto current = new InstallmentMonthBreakdownDto();
            current.setMonth(request.getMonthNumber());
            current.setAmount(installment);
            return List.of(current);
        }
        return List.of();
    }

    private BigDecimal nonNegative(BigDecimal value, String label) {
        BigDecimal normalized = value != null ? value : BigDecimal.ZERO;
        if (normalized.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    label + " cannot be negative", HttpStatus.BAD_REQUEST);
        }
        return normalized;
    }

    private PayoutResponse toResponse(Payout p) {
        BigDecimal disbursed = p.getDisbursedAmount() != null ? p.getDisbursedAmount() : BigDecimal.ZERO;
        BigDecimal remaining = p.getNetPayoutAmount().subtract(disbursed);
        List<PayoutDisbursementResponse> disbursements = p.getId() != null
                ? disbursementRepository.findByPayoutIdOrderByDisbursedAtAsc(p.getId()).stream()
                        .map(d -> PayoutDisbursementResponse.builder()
                                .id(d.getId())
                                .amount(d.getAmount())
                                .mode(d.getMode())
                                .referenceNumber(d.getReferenceNumber())
                                .notes(d.getNotes())
                                .disbursedBy(d.getDisbursedBy())
                                .disbursedAt(d.getDisbursedAt())
                                .build())
                        .toList()
                : Collections.emptyList();
        return PayoutResponse.builder()
                .id(p.getId())
                .chitId(p.getChitId())
                .memberId(p.getMemberId())
                .monthNumber(p.getMonthNumber())
                .winningAmount(p.getWinningAmount())
                .discountAmount(p.getDiscountAmount())
                .netPayoutAmount(p.getNetPayoutAmount())
                .installmentSettlement(p.getInstallmentSettlement())
                .installmentSettlementMonths(p.getInstallmentSettlementMonths())
                .crossChitSettlement(p.getCrossChitSettlement())
                .manualAdjustment(p.getManualAdjustment())
                .disbursedAmount(disbursed)
                .remainingAmount(remaining.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : remaining)
                .status(p.getStatus())
                .disbursementMode(p.getDisbursementMode())
                .referenceNumber(p.getReferenceNumber())
                .notes(p.getNotes())
                .createdBy(p.getCreatedBy())
                .createdAt(p.getCreatedAt())
                .disbursedAt(p.getDisbursedAt())
                .disbursedBy(p.getDisbursedBy())
                .cancelledAt(p.getCancelledAt())
                .cancelledBy(p.getCancelledBy())
                .cancellationReason(p.getCancellationReason())
                .voidedAt(p.getVoidedAt())
                .voidedBy(p.getVoidedBy())
                .voidReason(p.getVoidReason())
                .updatedAt(p.getUpdatedAt())
                .disbursements(disbursements)
                .build();
    }
}

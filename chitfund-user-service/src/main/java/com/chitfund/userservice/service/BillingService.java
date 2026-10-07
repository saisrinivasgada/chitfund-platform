package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.dto.request.RecordPaymentRequest;
import com.chitfund.userservice.dto.request.RecordRefundRequest;
import com.chitfund.userservice.dto.request.RecordUpgradeRequest;
import com.chitfund.userservice.dto.response.PaymentResponse;
import com.chitfund.userservice.dto.response.ReceiptResponse;
import com.chitfund.userservice.dto.response.UpgradePreviewResponse;
import com.chitfund.userservice.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class BillingService {

    private static final int PLAN_DURATION_DAYS = 30;
    private static final DateTimeFormatter RECEIPT_MONTH_FMT = DateTimeFormatter.ofPattern("yyyyMM");
    private static final Set<String> PAYMENT_METHODS = Set.of("UPI", "CASH", "BANK_TRANSFER");

    private final PlanPaymentRepository paymentRepo;
    private final PlanReceiptRepository receiptRepo;
    private final ReceiptNumberSeqRepository seqRepo;
    private final TenantRepository tenantRepo;
    private final PlanLimitsRepository planRepo;
    private final UserRepository userRepo;
    private final TenantCustomLimitsRepository customLimitsRepo;
    private final AuditClient auditClient;

    // ── Preview proration for an upgrade ──────────────────────────────────────

    public UpgradePreviewResponse previewUpgrade(String tenantId, String newPlanCode) {
        Tenant tenant = findTenant(tenantId);
        PlanLimits currentPlan = findPlan(tenant.getPlan());
        PlanLimits newPlan     = findActivePlan(newPlanCode);

        // Use org-specific price if set (custom pricing), otherwise fall back to plan's base price
        TenantCustomLimits customLimits = customLimitsRepo.findById(tenantId).orElse(null);
        long currentPlanPricePaise = (customLimits != null && customLimits.getPriceMonthlyInr() > 0)
                ? customLimits.getPriceMonthlyInr()
                : currentPlan.getPriceMonthlyInr();

        LocalDate today      = LocalDate.now();
        LocalDate planEnd    = tenant.getPlanExpiresAt() != null
                ? tenant.getPlanExpiresAt().toLocalDate() : today;
        LocalDate planStart  = planEnd.minusDays(PLAN_DURATION_DAYS);

        boolean expired = today.isAfter(planEnd) || today.isEqual(planEnd);
        long daysRemaining = expired ? 0 : ChronoUnit.DAYS.between(today, planEnd);
        long daysUsed      = Math.max(0, ChronoUnit.DAYS.between(planStart, today));

        long creditPaise = expired ? 0
                : (currentPlanPricePaise * daysRemaining) / PLAN_DURATION_DAYS;
        boolean isDowngrade = newPlan.getPriceMonthlyInr() < currentPlanPricePaise;
        long creditToReturnPaise = isDowngrade ? Math.max(0L, creditPaise - newPlan.getPriceMonthlyInr()) : 0L;
        long chargePaise = Math.max(0, newPlan.getPriceMonthlyInr() - creditPaise);

        LocalDate newPeriodStart = today;
        LocalDate newPeriodEnd   = today.plusDays(PLAN_DURATION_DAYS);

        return UpgradePreviewResponse.builder()
                .currentPlan(currentPlan.getPlan())
                .currentPlanName(currentPlan.getDisplayName())
                .currentPlanPricePaise(currentPlanPricePaise)
                .newPlan(newPlan.getPlan())
                .newPlanName(newPlan.getDisplayName())
                .newPlanPricePaise(newPlan.getPriceMonthlyInr())
                .planPeriodStart(planStart)
                .planPeriodEnd(planEnd)
                .daysInPeriod(PLAN_DURATION_DAYS)
                .daysUsed((int) daysUsed)
                .daysRemaining((int) daysRemaining)
                .creditPaise(creditPaise)
                .chargePaise(chargePaise)
                .newPeriodStart(newPeriodStart)
                .newPeriodEnd(newPeriodEnd)
                .planExpired(expired)
                .downgrade(isDowngrade)
                .creditToReturnPaise(creditToReturnPaise)
                .build();
    }

    // ── Record a PURCHASE or RENEWAL ──────────────────────────────────────────

    @Transactional
    public PaymentResponse recordPayment(RecordPaymentRequest req, String actorUserId) {
        Tenant tenant = findTenantForUpdate(req.getTenantId());
        Map<String, Object> before = tenantBillingState(tenant);
        PlanLimits plan = findActivePlan(req.getToPlan());

        String type = req.getType().trim().toUpperCase(Locale.ROOT);
        if (!type.equals("PURCHASE") && !type.equals("RENEWAL")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Use the upgrade endpoint for UPGRADE payments");
        }
        if (type.equals("RENEWAL") && !plan.getPlan().equalsIgnoreCase(tenant.getPlan())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A renewal must keep the organization's current plan; use the plan-change flow instead");
        }

        // For renewal: new period starts from current expiry (or today if expired)
        LocalDate periodStart = determinePeriodStart(tenant, type);
        LocalDate periodEnd   = periodStart.plusDays(PLAN_DURATION_DAYS);

        // Resolve credit application
        long grossPaise = req.getGrossAmountPaise() != null && req.getGrossAmountPaise() > 0
                ? req.getGrossAmountPaise() : req.getAmountPaise();
        long creditApplied = req.getCreditAppliedPaise() != null ? req.getCreditAppliedPaise() : 0L;
        validatePaymentMethod(req.getPaymentMethod());
        validateCreditAndNet(tenant, grossPaise, creditApplied, req.getAmountPaise());
        String fingerprint = fingerprint("PAYMENT", req.getTenantId(), type, plan.getPlan(),
                req.getAmountPaise(), grossPaise, creditApplied,
                req.getPaymentMethod().trim().toUpperCase(Locale.ROOT), req.getPaymentReference(),
                req.getPaymentDate(), req.getNotes());
        PaymentResponse replay = replayIfPresent(req.getIdempotencyKey(), fingerprint, tenant);
        if (replay != null) return replay;

        PlanPayment payment = PlanPayment.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(req.getTenantId())
                .type(type)
                .status("COMPLETED")
                .amountPaise(req.getAmountPaise())
                .grossAmountPaise(grossPaise)
                .accountCreditAppliedPaise(creditApplied)
                .toPlan(plan.getPlan())
                .toPlanName(plan.getDisplayName())
                .planPeriodStart(periodStart)
                .planPeriodEnd(periodEnd)
                .paymentMethod(req.getPaymentMethod().trim().toUpperCase(Locale.ROOT))
                .paymentReference(req.getPaymentReference())
                .paymentDate(req.getPaymentDate())
                .notes(req.getNotes())
                .idempotencyKey(req.getIdempotencyKey().trim())
                .requestFingerprint(fingerprint)
                .createdBy(actorUserId)
                .build();

        paymentRepo.save(payment);

        // Deduct credit from tenant balance
        if (creditApplied > 0) {
            java.math.BigDecimal deductInr = java.math.BigDecimal.valueOf(creditApplied)
                    .divide(java.math.BigDecimal.valueOf(100));
            java.math.BigDecimal newBalance = tenant.getCreditBalanceInr().subtract(deductInr)
                    .max(java.math.BigDecimal.ZERO);
            tenant.setCreditBalanceInr(newBalance);
        }

        // Update tenant plan + expiry
        tenant.setPlan(plan.getPlan());
        tenant.setPlanExpiresAt(periodEnd.atStartOfDay());
        tenant.setRenewalRequestedAt(null);
        tenantRepo.save(tenant);

        // Standard-plan payments must refresh the effective limits row. Every
        // activated tenant already has this row, so an "only when absent"
        // check leaves purchases on their previous plan's quotas. Bespoke
        // CUSTOM rows are preserved and only seeded when genuinely missing.
        if (!"CUSTOM".equals(plan.getPlan()) || !customLimitsRepo.existsById(req.getTenantId())) {
            syncLimitsFromPlan(req.getTenantId(), plan);
        }

        PlanReceipt receipt = generateReceipt(payment, "PAYMENT", tenant);
        auditBilling(payment, type + "_RECORDED", actorUserId, "SUPER_ADMIN", before,
                tenantBillingState(tenant), req.getNotes(), req.getIdempotencyKey());
        log.info("Recorded {} payment for tenant {} — receipt {}", type, req.getTenantId(), receipt.getReceiptNumber());

        return toResponse(payment, tenant, List.of(receipt));
    }

    // ── Record an UPGRADE with automatic proration ────────────────────────────

    @Transactional
    public PaymentResponse recordUpgrade(RecordUpgradeRequest req, String actorUserId) {
        Tenant tenant = findTenantForUpdate(req.getTenantId());
        Map<String, Object> before = tenantBillingState(tenant);
        PlanLimits newPlan = findActivePlan(req.getNewPlan());

        UpgradePreviewResponse preview = previewUpgrade(req.getTenantId(), req.getNewPlan());

        PlanLimits oldPlan = findPlan(tenant.getPlan());

        long creditApplied = req.getCreditAppliedPaise() != null ? req.getCreditAppliedPaise() : 0L;
        long netCharge = Math.max(0L, preview.getChargePaise() - creditApplied);
        validatePaymentMethod(req.getPaymentMethod());
        validateCreditAndNet(tenant, preview.getChargePaise(), creditApplied, netCharge);
        String fingerprint = fingerprint("UPGRADE", req.getTenantId(), newPlan.getPlan(),
                req.getPaymentMethod().trim().toUpperCase(Locale.ROOT), req.getPaymentReference(),
                req.getPaymentDate(), req.getNotes(), creditApplied);
        PaymentResponse replay = replayIfPresent(req.getIdempotencyKey(), fingerprint, tenant);
        if (replay != null) return replay;

        PlanPayment payment = PlanPayment.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(req.getTenantId())
                .type("UPGRADE")
                .status("COMPLETED")
                .amountPaise(netCharge)
                .grossAmountPaise(preview.getChargePaise())
                .accountCreditAppliedPaise(creditApplied)
                .toPlan(newPlan.getPlan())
                .toPlanName(newPlan.getDisplayName())
                .fromPlan(oldPlan.getPlan())
                .fromPlanName(oldPlan.getDisplayName())
                .prorationCreditPaise(preview.getCreditPaise())
                .fullPlanPricePaise(preview.getNewPlanPricePaise())
                .daysRemaining(preview.getDaysRemaining())
                .daysInPeriod(preview.getDaysInPeriod())
                .planPeriodStart(preview.getNewPeriodStart())
                .planPeriodEnd(preview.getNewPeriodEnd())
                .paymentMethod(req.getPaymentMethod().trim().toUpperCase(Locale.ROOT))
                .paymentReference(req.getPaymentReference())
                .paymentDate(req.getPaymentDate())
                .notes(req.getNotes())
                .idempotencyKey(req.getIdempotencyKey().trim())
                .requestFingerprint(fingerprint)
                .createdBy(actorUserId)
                .build();

        paymentRepo.save(payment);

        // Deduct account credit from tenant balance
        if (creditApplied > 0) {
            java.math.BigDecimal deductInr = java.math.BigDecimal.valueOf(creditApplied)
                    .divide(java.math.BigDecimal.valueOf(100));
            java.math.BigDecimal newBalance = tenant.getCreditBalanceInr().subtract(deductInr)
                    .max(java.math.BigDecimal.ZERO);
            tenant.setCreditBalanceInr(newBalance);
        }

        // Return prorated credit to balance when downgrading (credit > new plan cost)
        if (preview.getCreditToReturnPaise() > 0) {
            java.math.BigDecimal returnInr = java.math.BigDecimal.valueOf(preview.getCreditToReturnPaise())
                    .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            tenant.setCreditBalanceInr(tenant.getCreditBalanceInr().add(returnInr));
        }

        tenant.setPlan(newPlan.getPlan());
        tenant.setPlanExpiresAt(preview.getNewPeriodEnd().atStartOfDay());
        tenant.setRequestedPlan(null);
        tenant.setUpgradeRequestedAt(null);
        tenantRepo.save(tenant);

        // Upgrade resets limits to the new plan's defaults
        syncLimitsFromPlan(req.getTenantId(), newPlan);

        PlanReceipt receipt = generateReceipt(payment, "PAYMENT", tenant);
        auditBilling(payment, "UPGRADE_RECORDED", actorUserId, "SUPER_ADMIN", before,
                tenantBillingState(tenant), req.getNotes(), req.getIdempotencyKey());
        log.info("Recorded UPGRADE {} → {} for tenant {} — receipt {}",
                oldPlan.getPlan(), newPlan.getPlan(), req.getTenantId(), receipt.getReceiptNumber());

        return toResponse(payment, tenant, List.of(receipt));
    }

    // ── Admin-initiated instant downgrade ─────────────────────────────────────

    @Transactional
    public PaymentResponse applyDowngrade(String tenantId, String newPlanCode, String reason,
                                          String idempotencyKey, String actorUserId) {
        Tenant tenant = findTenantForUpdate(tenantId);
        Map<String, Object> before = tenantBillingState(tenant);
        PlanLimits newPlan = findActivePlan(newPlanCode);
        String requestFingerprint = fingerprint("DOWNGRADE", tenantId,
                newPlan.getPlan(), reason);
        PaymentResponse replay = replayIfPresent(idempotencyKey, requestFingerprint, tenant);
        if (replay != null) return replay;
        PlanLimits oldPlan = findPlan(tenant.getPlan());

        if (newPlan.getPriceMonthlyInr() >= oldPlan.getPriceMonthlyInr()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Use the upgrade request flow for upgrading to a higher plan");
        }

        UpgradePreviewResponse preview = previewUpgrade(tenantId, newPlanCode);
        LocalDate today = LocalDate.now();

        PlanPayment payment = PlanPayment.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .type("DOWNGRADE")
                .status("COMPLETED")
                .amountPaise(0L)
                .grossAmountPaise(0L)
                .fromPlan(oldPlan.getPlan())
                .fromPlanName(oldPlan.getDisplayName())
                .toPlan(newPlan.getPlan())
                .toPlanName(newPlan.getDisplayName())
                .prorationCreditPaise(preview.getCreditPaise())
                .fullPlanPricePaise(preview.getNewPlanPricePaise())
                .daysRemaining(preview.getDaysRemaining())
                .daysInPeriod(preview.getDaysInPeriod())
                .planPeriodStart(preview.getNewPeriodStart())
                .planPeriodEnd(preview.getNewPeriodEnd())
                .paymentMethod("SYSTEM")
                .paymentDate(today)
                .notes(reason.trim())
                .idempotencyKey(idempotencyKey.trim())
                .requestFingerprint(requestFingerprint)
                .createdBy(actorUserId)
                .build();
        paymentRepo.save(payment);

        if (preview.getCreditToReturnPaise() > 0) {
            java.math.BigDecimal returnInr = java.math.BigDecimal.valueOf(preview.getCreditToReturnPaise())
                    .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            tenant.setCreditBalanceInr(tenant.getCreditBalanceInr().add(returnInr));
        }

        tenant.setPlan(newPlan.getPlan());
        if ("BASIC".equalsIgnoreCase(newPlan.getPlan())) {
            tenant.setPlanExpiresAt(java.time.LocalDateTime.of(9999, 12, 31, 23, 59, 59));
        } else {
            tenant.setPlanExpiresAt(preview.getNewPeriodEnd().atStartOfDay());
        }
        tenant.setRequestedPlan(null);
        tenant.setUpgradeRequestedAt(null);
        tenantRepo.save(tenant);

        syncLimitsFromPlan(tenantId, newPlan);

        PlanReceipt receipt = generateReceipt(payment, "PAYMENT", tenant);
        auditBilling(payment, "DOWNGRADE_RECORDED", actorUserId, "ADMIN", before,
                tenantBillingState(tenant), reason.trim(), idempotencyKey);
        log.info("DOWNGRADE {} → {} for tenant {} — credit returned {}p, receipt {}, expires {}",
                oldPlan.getPlan(), newPlan.getPlan(), tenantId,
                preview.getCreditToReturnPaise(), receipt.getReceiptNumber(), tenant.getPlanExpiresAt());

        return toResponse(payment, tenant, List.of(receipt));
    }

    // ── Record a REFUND against an existing payment ───────────────────────────

    @Transactional
    public PaymentResponse recordRefund(String paymentId, RecordRefundRequest req, String actorUserId) {
        PlanPayment payment = paymentRepo.findByIdForUpdate(paymentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BILLING_PAYMENT_NOT_FOUND, "Payment not found"));

        String refundKey = req.getIdempotencyKey().trim();
        String refundMethod = req.getRefundMethod().trim().toUpperCase(Locale.ROOT);
        String refundFingerprint = fingerprint("REFUND", paymentId, req.getRefundAmountPaise(),
                req.getRefundReason(), refundMethod, req.getRefundReference(), req.getRefundDate());

        if ("REFUNDED".equals(payment.getStatus())) {
            if (refundKey.equals(payment.getRefundIdempotencyKey())) {
                if (!refundFingerprint.equals(payment.getRefundRequestFingerprint())) {
                    throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                            "Idempotency key was already used for a different refund request",
                            HttpStatus.CONFLICT);
                }
                Tenant tenant = findTenant(payment.getTenantId());
                return toResponse(payment, tenant, receiptRepo.findByPaymentId(paymentId));
            }
            throw new BusinessException(ErrorCode.BILLING_ALREADY_REFUNDED, "This payment has already been refunded");
        }
        if (req.getRefundAmountPaise() > payment.getAmountPaise()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Refund amount cannot exceed original payment amount");
        }

        payment.setStatus("REFUNDED");
        payment.setRefundAmountPaise(req.getRefundAmountPaise());
        payment.setRefundReason(req.getRefundReason().trim());
        payment.setRefundMethod(refundMethod);
        payment.setRefundReference(req.getRefundReference());
        payment.setRefundedAt(LocalDateTime.now());
        payment.setRefundedBy(actorUserId);
        payment.setRefundIdempotencyKey(refundKey);
        payment.setRefundRequestFingerprint(refundFingerprint);
        paymentRepo.save(payment);

        Tenant tenant = findTenant(payment.getTenantId());
        PlanReceipt refundReceipt = generateReceipt(payment, "REFUND", tenant);
        refundReceipt.setAmountPaise(req.getRefundAmountPaise());

        List<PlanReceipt> receipts = receiptRepo.findByPaymentId(paymentId);
        auditBilling(payment, "REFUND_RECORDED", actorUserId, "SUPER_ADMIN",
                Map.of("status", "COMPLETED", "refundedAmountPaise", 0L),
                Map.of("status", payment.getStatus(),
                        "refundedAmountPaise", req.getRefundAmountPaise(),
                        "refundMethod", refundMethod,
                        "refundDate", req.getRefundDate()),
                req.getRefundReason().trim(), refundKey);
        log.info("Recorded REFUND for payment {} — receipt {}", paymentId, refundReceipt.getReceiptNumber());

        return toResponse(payment, tenant, receipts);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    public Page<PaymentResponse> listAll(Pageable pageable) {
        return paymentRepo.findAllByOrderByCreatedAtDesc(pageable)
                .map(p -> toResponse(p, findTenantSafe(p.getTenantId()), List.of()));
    }

    public Page<PaymentResponse> listByTenant(String tenantId, Pageable pageable) {
        return paymentRepo.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable)
                .map(p -> toResponse(p, findTenantSafe(p.getTenantId()), List.of()));
    }

    public PaymentResponse getPayment(String paymentId) {
        PlanPayment p = paymentRepo.findById(paymentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BILLING_PAYMENT_NOT_FOUND, "Payment not found"));
        Tenant tenant = findTenantSafe(p.getTenantId());
        List<PlanReceipt> receipts = receiptRepo.findByPaymentId(paymentId);
        return toResponse(p, tenant, receipts);
    }

    public ReceiptResponse getReceipt(String receiptId) {
        PlanReceipt r = receiptRepo.findById(receiptId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BILLING_PAYMENT_NOT_FOUND, "Receipt not found"));
        Tenant tenant = findTenantSafe(r.getTenantId());
        return toReceiptResponse(r, tenant);
    }

    public List<PaymentResponse> listMyPayments(String tenantId) {
        return paymentRepo.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .map(p -> toResponse(p, null, receiptRepo.findByPaymentId(p.getId())))
                .toList();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private LocalDate determinePeriodStart(Tenant tenant, String type) {
        if ("RENEWAL".equals(type) && tenant.getPlanExpiresAt() != null) {
            LocalDate expiry = tenant.getPlanExpiresAt().toLocalDate();
            LocalDate today = LocalDate.now();
            // If not yet expired, new period starts from expiry date
            return expiry.isAfter(today) ? expiry : today;
        }
        return LocalDate.now(); // PURCHASE always starts today
    }

    private PlanReceipt generateReceipt(PlanPayment payment, String type, Tenant tenant) {
        ReceiptNumberSeq seq = seqRepo.save(new ReceiptNumberSeq());
        String receiptNumber = "CHW-" + LocalDate.now().format(RECEIPT_MONTH_FMT)
                + "-" + String.format("%06d", seq.getId());

        PlanReceipt receipt = PlanReceipt.builder()
                .id(UUID.randomUUID().toString())
                .receiptNumber(receiptNumber)
                .paymentId(payment.getId())
                .tenantId(payment.getTenantId())
                .type(type)
                .amountPaise("REFUND".equals(type) && payment.getRefundAmountPaise() != null
                        ? payment.getRefundAmountPaise() : payment.getAmountPaise())
                .build();

        return receiptRepo.save(receipt);
    }

    private Tenant findTenant(String tenantId) {
        return tenantRepo.findById(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Tenant not found", HttpStatus.NOT_FOUND));
    }

    private Tenant findTenantForUpdate(String tenantId) {
        try {
            return tenantRepo.findByIdForUpdate(UUID.fromString(tenantId))
                    .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Tenant not found", HttpStatus.NOT_FOUND));
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Tenant ID is invalid");
        }
    }

    private Tenant findTenantSafe(String tenantId) {
        try { return tenantRepo.findById(UUID.fromString(tenantId)).orElse(null); }
        catch (Exception e) { return null; }
    }

    private PlanLimits findPlan(String code) {
        return planRepo.findById(code != null ? code.toUpperCase() : "BASIC")
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Plan not found: " + code));
    }

    private PlanLimits findActivePlan(String code) {
        PlanLimits plan = findPlan(code);
        if (!plan.isActive()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Plan is not available: " + code);
        }
        return plan;
    }

    private PaymentResponse replayIfPresent(String idempotencyKey, String fingerprint, Tenant tenant) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "An idempotency key is required for billing operations");
        }
        return paymentRepo.findByIdempotencyKey(idempotencyKey.trim())
                .map(existing -> {
                    if (!fingerprint.equals(existing.getRequestFingerprint())) {
                        throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                                "Idempotency key was already used for a different billing request",
                                HttpStatus.CONFLICT);
                    }
                    return toResponse(existing, tenant, receiptRepo.findByPaymentId(existing.getId()));
                })
                .orElse(null);
    }

    private static void validatePaymentMethod(String rawMethod) {
        String method = rawMethod == null ? "" : rawMethod.trim().toUpperCase(Locale.ROOT);
        if (!PAYMENT_METHODS.contains(method)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Payment method must be UPI, CASH, or BANK_TRANSFER");
        }
    }

    private static void validateCreditAndNet(Tenant tenant, long grossPaise,
                                             long creditAppliedPaise, long netPaise) {
        if (grossPaise < 0 || creditAppliedPaise < 0 || netPaise < 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Billing amounts cannot be negative");
        }
        long expectedNet;
        try {
            expectedNet = Math.subtractExact(grossPaise, creditAppliedPaise);
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Billing amount is outside the supported range");
        }
        if (creditAppliedPaise > grossPaise || netPaise != expectedNet) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Net amount must equal gross amount minus applied account credit");
        }
        BigDecimal balanceInr = tenant.getCreditBalanceInr() != null
                ? tenant.getCreditBalanceInr() : BigDecimal.ZERO;
        long availablePaise;
        try {
            availablePaise = balanceInr.movePointRight(2)
                    .setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        } catch (ArithmeticException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Account credit balance is invalid");
        }
        if (creditAppliedPaise > availablePaise) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Applied account credit exceeds the available balance");
        }
    }

    private static String fingerprint(Object... values) {
        String canonical = java.util.Arrays.stream(values)
                .map(value -> value == null ? "<null>" : value.toString().trim())
                .collect(java.util.stream.Collectors.joining("\u001f"));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not fingerprint billing request", exception);
        }
    }

    private void syncLimitsFromPlan(String tenantId, PlanLimits plan) {
        TenantCustomLimits limits = customLimitsRepo.findById(tenantId)
                .orElse(TenantCustomLimits.builder().tenantId(tenantId).build());
        limits.setMaxActiveChits(plan.getMaxActiveChits());
        limits.setMaxMembers(plan.getMaxMembers());
        limits.setMaxStaff(plan.getMaxStaff());
        limits.setCapabilities(plan.getCapabilities());
        limits.setAllowedChitTypes(plan.getAllowedChitTypes());
        limits.setPriceMonthlyInr(plan.getPriceMonthlyInr());
        limits.setPlanCode(plan.getPlan());
        limits.setNotes(null);
        customLimitsRepo.save(limits);
    }

    private void auditBilling(PlanPayment payment, String action, String actorUserId,
                              String actorRole,
                              Object before, Object after, String reason,
                              String idempotencyKey) {
        auditClient.log("PLAN_PAYMENT", payment.getId(), action,
                actorUserId, actorRole, before, after, payment.getTenantId(),
                "HUB", "SUCCESS", reason, payment.getId(), idempotencyKey);
    }

    private static Map<String, Object> tenantBillingState(Tenant tenant) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("plan", tenant.getPlan());
        state.put("planExpiresAt", tenant.getPlanExpiresAt());
        state.put("creditBalanceInr", tenant.getCreditBalanceInr());
        return state;
    }

    private PaymentResponse toResponse(PlanPayment p, Tenant tenant, List<PlanReceipt> receipts) {
        String actorName = resolveActorName(p.getCreatedBy());
        return PaymentResponse.builder()
                .id(p.getId())
                .tenantId(p.getTenantId())
                .tenantName(tenant != null ? tenant.getName() : null)
                .type(p.getType())
                .status(p.getStatus())
                .amountPaise(p.getAmountPaise())
                .grossAmountPaise(p.getGrossAmountPaise())
                .accountCreditAppliedPaise(p.getAccountCreditAppliedPaise())
                .toPlan(p.getToPlan())
                .toPlanName(p.getToPlanName())
                .fromPlan(p.getFromPlan())
                .fromPlanName(p.getFromPlanName())
                .prorationCreditPaise(p.getProrationCreditPaise())
                .fullPlanPricePaise(p.getFullPlanPricePaise())
                .daysRemaining(p.getDaysRemaining())
                .daysInPeriod(p.getDaysInPeriod())
                .planPeriodStart(p.getPlanPeriodStart())
                .planPeriodEnd(p.getPlanPeriodEnd())
                .paymentMethod(p.getPaymentMethod())
                .paymentReference(p.getPaymentReference())
                .paymentDate(p.getPaymentDate())
                .refundAmountPaise(p.getRefundAmountPaise())
                .refundReason(p.getRefundReason())
                .refundMethod(p.getRefundMethod())
                .refundReference(p.getRefundReference())
                .refundedAt(p.getRefundedAt())
                .notes(p.getNotes())
                .createdBy(actorName)
                .createdAt(p.getCreatedAt())
                .receipts(receipts.stream().map(r -> toReceiptResponse(r, tenant)).toList())
                .build();
    }

    private ReceiptResponse toReceiptResponse(PlanReceipt r, Tenant tenant) {
        return ReceiptResponse.builder()
                .id(r.getId())
                .receiptNumber(r.getReceiptNumber())
                .paymentId(r.getPaymentId())
                .tenantId(r.getTenantId())
                .tenantName(tenant != null ? tenant.getName() : null)
                .type(r.getType())
                .amountPaise(r.getAmountPaise())
                .issuedAt(r.getIssuedAt())
                .build();
    }

    private String resolveActorName(String userId) {
        if (userId == null) return null;
        try {
            return userRepo.findById(UUID.fromString(userId))
                    .map(u -> u.getFullName() != null ? u.getFullName() : u.getUsername())
                    .orElse(userId);
        } catch (Exception e) { return userId; }
    }
}

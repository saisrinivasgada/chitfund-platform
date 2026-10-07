package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.PlanCapabilityDef;
import com.chitfund.userservice.domain.entity.PlanLimits;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.TenantDiscount;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.CreateCapabilityDefRequest;
import com.chitfund.userservice.dto.request.CreatePlanRequest;
import com.chitfund.userservice.dto.request.SetTenantDiscountRequest;
import com.chitfund.userservice.dto.request.UpdatePlanRequest;
import com.chitfund.userservice.dto.response.CapabilityDefResponse;
import com.chitfund.userservice.dto.response.CapabilityGateResponse;
import com.chitfund.userservice.dto.response.PlanResponse;
import com.chitfund.userservice.dto.response.TenantDiscountResponse;
import com.chitfund.userservice.repository.PlanCapabilityDefRepository;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.TenantDiscountRepository;
import com.chitfund.userservice.repository.TenantCustomLimitsRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.util.CapabilityJson;
import com.chitfund.userservice.util.PlanInputValidator;
import com.chitfund.userservice.client.AuditClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlanService {

    private final PlanLimitsRepository planRepo;
    private final PlanCapabilityDefRepository capabilityRepo;
    private final TenantDiscountRepository discountRepo;
    private final TenantCustomLimitsRepository customLimitsRepo;
    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final AuditClient auditClient;

    private static final List<Role> STAFF_ROLES = List.of(Role.MANAGER, Role.STAFF);
    private static final String PLATFORM_AUDIT_TENANT = "PLATFORM";

    public void checkStaffLimit(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Organization context is required");
        }
        // The tenant row is the quota mutex. The caller creates the employee in
        // the same transaction, so concurrent exact-limit requests serialize.
        Tenant tenant = tenantRepository.findByIdForUpdate(UUID.fromString(tenantId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Organization not found"));

        if (!"ACTIVE".equalsIgnoreCase(tenant.getStatus())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization is not active. Contact ChitWise support to restore access");
        }

        if (tenant.getPlanExpiresAt() != null && tenant.getPlanExpiresAt().isBefore(java.time.LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                    "Your subscription has expired. Please renew your plan to add team members.");
        }

        if (tenant.getPlan() == null || tenant.getPlan().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Organization has no subscription plan assigned");
        }
        String planCode = tenant.getPlan().toUpperCase(Locale.ROOT);
        int maxStaff;
        String displayName;
        if ("CUSTOM".equals(planCode)) {
            var custom = customLimitsRepo.findById(tenantId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Organization custom plan limits are missing"));
            maxStaff = custom.getMaxStaff();
            displayName = "Custom";
        } else {
            PlanLimits limits = planRepo.findById(planCode)
                    .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Organization subscription plan is invalid"));
            maxStaff = limits.getMaxStaff();
            displayName = limits.getDisplayName();
        }

        if (maxStaff == -1) return; // unlimited
        if (maxStaff == 0) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + displayName + " plan does not include manager or staff accounts. "
                    + "Upgrade to Growth or higher to add team members.");
        }

        long currentCount = userRepository.countByTenantIdAndRoleInAndDeletedAtIsNullAndEnabledTrue(tenantId, STAFF_ROLES);
        if (currentCount >= maxStaff) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + displayName + " plan allows a maximum of " + maxStaff
                    + " staff account" + (maxStaff == 1 ? "" : "s") + " (managers + staff). "
                    + "Contact ChitWise support to upgrade your plan.");
        }
    }

    public List<PlanResponse> getPublicPlans() {
        return planRepo.findByIsPublicTrueAndIsActiveTrueOrderByDisplayOrderAsc()
                .stream().map(this::toResponse).toList();
    }

    public List<PlanResponse> getAllPlans() {
        return planRepo.findAllByOrderByDisplayOrderAsc()
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public PlanResponse createPlan(CreatePlanRequest req) {
        return createPlan(req, null);
    }

    @Transactional
    public PlanResponse createPlan(CreatePlanRequest req, String actorId) {
        String code = req.getPlan().toUpperCase();
        List<String> caps = req.getEnabledCapabilities() != null
                ? validateCapabilityKeys(req.getEnabledCapabilities()) : List.of();
        PlanLimits p = PlanLimits.builder()
                .plan(code)
                .displayName(req.getDisplayName())
                .tagline(req.getTagline())
                .features(serializeFeatures(req.getFeatures()))
                .capabilities(serializeFeatures(caps))
                .maxActiveChits(req.getMaxActiveChits())
                .maxMembers(req.getMaxMembers())
                .allowedChitTypes(PlanInputValidator.normalizeAllowedChitTypes(
                        req.getAllowedChitTypes() != null ? req.getAllowedChitTypes() : "RESERVATION"))
                .priceMonthlyInr(req.getPriceMonthlyInr())
                .globalDiscountPct(req.getGlobalDiscountPct())
                .isPublic(req.isPublic())
                .isActive(true)
                .displayOrder(req.getDisplayOrder())
                .maxStaff(req.getMaxStaff())
                .build();
        PlanResponse created = toResponse(planRepo.save(p));
        auditClient.log("PLAN", code, "CREATED", actorId, "SUPER_ADMIN",
                null, created, PLATFORM_AUDIT_TENANT);
        return created;
    }

    @Transactional
    public PlanResponse updatePlan(String code, UpdatePlanRequest req, String actorId, String reason) {
        String auditReason = hasSensitivePlanChange(req)
                ? requireChangeReason(reason, "A reason is required for plan entitlement changes")
                : normalizeOptionalReason(reason);
        PlanLimits p = planRepo.findById(code.toUpperCase())
                .orElseThrow(() -> new RuntimeException("Plan not found: " + code));
        PlanResponse before = toResponse(p);
        if (req.getDisplayName() != null) p.setDisplayName(req.getDisplayName());
        if (req.getTagline() != null) p.setTagline(req.getTagline());
        if (req.getFeatures() != null) p.setFeatures(serializeFeatures(req.getFeatures()));
        if (req.getMaxActiveChits() != null) p.setMaxActiveChits(req.getMaxActiveChits());
        if (req.getMaxMembers() != null) p.setMaxMembers(req.getMaxMembers());
        if (req.getAllowedChitTypes() != null)
            p.setAllowedChitTypes(PlanInputValidator.normalizeAllowedChitTypes(req.getAllowedChitTypes()));
        if (req.getPriceMonthlyInr() != null) p.setPriceMonthlyInr(req.getPriceMonthlyInr());
        if (req.getGlobalDiscountPct() != null) p.setGlobalDiscountPct(req.getGlobalDiscountPct());
        if (req.getIsPublic() != null) p.setPublic(req.getIsPublic());
        if (req.getIsActive() != null) p.setActive(req.getIsActive());
        if (req.getDisplayOrder() != null) p.setDisplayOrder(req.getDisplayOrder());
        if (req.getMaxStaff() != null) p.setMaxStaff(req.getMaxStaff());
        if (req.getEnabledCapabilities() != null)
            p.setCapabilities(serializeFeatures(validateCapabilityKeys(req.getEnabledCapabilities())));
        if (req.getBadges() != null) p.setBadges(req.getBadges().isBlank() ? null : req.getBadges());
        PlanResponse after = toResponse(p);
        if (before.equals(after)) {
            return before;
        }
        planRepo.save(p);
        if (hasEffectiveLimitChange(req)) {
            propagateStandardPlanDefaults(p, actorId, auditReason);
        }
        auditClient.log("PLAN", p.getPlan(), "UPDATED", actorId, "SUPER_ADMIN",
                before, after, PLATFORM_AUDIT_TENANT, auditReason);
        return after;
    }

    @Transactional
    public void deletePlan(String code, String actorId, String reason) {
        String auditReason = requireChangeReason(reason, "A reason is required to deactivate a plan");
        PlanLimits p = planRepo.findById(code.toUpperCase())
                .orElseThrow(() -> new RuntimeException("Plan not found: " + code));
        if (!p.isActive() && !p.isPublic()) {
            return;
        }
        PlanResponse before = toResponse(p);
        p.setActive(false);
        p.setPublic(false);
        planRepo.save(p);
        auditClient.log("PLAN", p.getPlan(), "DEACTIVATED", actorId, "SUPER_ADMIN",
                before, toResponse(p),
                PLATFORM_AUDIT_TENANT, auditReason);
    }

    @Transactional
    public TenantDiscountResponse setTenantDiscount(String tenantId, SetTenantDiscountRequest req) {
        return setTenantDiscount(tenantId, req, null);
    }

    @Transactional
    public TenantDiscountResponse setTenantDiscount(String tenantId, SetTenantDiscountRequest req,
                                                     String actorId) {
        try {
            tenantRepository.findById(UUID.fromString(tenantId))
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                            "Organization not found"));
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Organization ID is invalid");
        }
        TenantDiscount.DiscountType discountType;
        try {
            discountType = TenantDiscount.DiscountType.valueOf(
                    req.getDiscountType().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Discount type must be PERCENTAGE or FIXED_PAISE");
        }
        if (discountType == TenantDiscount.DiscountType.PERCENTAGE
                && req.getDiscountValue().compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Percentage discount cannot exceed 100");
        }
        if (req.getExpiresAt() != null && !req.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Discount expiry must be in the future");
        }
        TenantDiscountResponse before = discountRepo.findByTenantId(tenantId)
                .map(this::toDiscountResponse).orElse(null);
        TenantDiscount d = discountRepo.findByTenantId(tenantId)
                .orElse(TenantDiscount.builder().tenantId(tenantId).build());
        d.setDiscountType(discountType);
        d.setDiscountValue(req.getDiscountValue());
        d.setReason(req.getReason().trim());
        d.setExpiresAt(req.getExpiresAt());
        TenantDiscountResponse after = toDiscountResponse(discountRepo.save(d));
        auditClient.log("TENANT", tenantId, "DISCOUNT_SET", actorId, "SUPER_ADMIN",
                before, after, tenantId, req.getReason().trim());
        return after;
    }

    @Transactional
    public void removeTenantDiscount(String tenantId) {
        removeTenantDiscount(tenantId, null);
    }

    @Transactional
    public void removeTenantDiscount(String tenantId, String actorId) {
        Optional<TenantDiscount> existing = discountRepo.findByTenantId(tenantId);
        discountRepo.deleteByTenantId(tenantId);
        existing.ifPresent(discount -> auditClient.log(
                "TENANT", tenantId, "DISCOUNT_REMOVED", actorId, "SUPER_ADMIN",
                toDiscountResponse(discount), null, tenantId,
                "Tenant discount removed by Super Admin"));
    }

    public Optional<TenantDiscountResponse> getTenantDiscount(String tenantId) {
        return discountRepo.findByTenantId(tenantId).map(this::toDiscountResponse);
    }

    public Optional<PlanLimits> findByCode(String code) {
        return planRepo.findById(code != null ? code.toUpperCase() : "BASIC");
    }

    // ── Capability definitions ───────────────────────────────────────────────────

    public List<CapabilityDefResponse> getCapabilityDefs() {
        return capabilityRepo.findAllByOrderBySortOrderAscLabelAsc()
                .stream().map(this::toCapabilityResponse).toList();
    }

    @Transactional
    public CapabilityDefResponse addCapabilityDef(CreateCapabilityDefRequest req) {
        return addCapabilityDef(req, null);
    }

    @Transactional
    public CapabilityDefResponse addCapabilityDef(CreateCapabilityDefRequest req, String actorId) {
        String label = req.getLabel().trim();
        if (capabilityRepo.existsByLabel(label)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Capability \"" + label + "\" already exists");
        }
        String key = label.toLowerCase().replaceAll("[^a-z0-9]+", "_");
        if (capabilityRepo.existsById(key)) key = key + "_" + System.currentTimeMillis();
        int maxOrder = capabilityRepo.findAllByOrderBySortOrderAscLabelAsc()
                .stream().mapToInt(PlanCapabilityDef::getSortOrder).max().orElse(0);
        PlanCapabilityDef def = PlanCapabilityDef.builder()
                .key(key).label(label).sortOrder(maxOrder + 1).build();
        CapabilityDefResponse created = toCapabilityResponse(capabilityRepo.save(def));
        auditClient.log("CAPABILITY", key, "CREATED", actorId, "SUPER_ADMIN",
                null, created, PLATFORM_AUDIT_TENANT);
        return created;
    }

    @Transactional
    public void deleteCapabilityDef(String key, String actorId, String reason) {
        String auditReason = requireChangeReason(reason,
                "A reason is required to delete a capability definition");
        PlanCapabilityDef definition = capabilityRepo.findById(key)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.RESOURCE_NOT_FOUND, "Capability not found: " + key));
        boolean assignedToPlan = planRepo.findAll().stream()
                .anyMatch(plan -> CapabilityJson.parse(plan.getCapabilities(), objectMapper).contains(key));
        boolean assignedToCustomPlan = customLimitsRepo.findAll().stream()
                .anyMatch(custom -> CapabilityJson.parse(custom.getCapabilities(), objectMapper).contains(key));
        if (assignedToPlan || assignedToCustomPlan) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Remove this capability from every standard and custom plan before deleting it");
        }
        CapabilityDefResponse before = toCapabilityResponse(definition);
        capabilityRepo.delete(definition);
        auditClient.log("CAPABILITY", key, "DELETED", actorId, "SUPER_ADMIN",
                before, null, PLATFORM_AUDIT_TENANT,
                auditReason);
    }

    private static boolean hasSensitivePlanChange(UpdatePlanRequest req) {
        return req.getMaxActiveChits() != null
                || req.getMaxMembers() != null
                || req.getAllowedChitTypes() != null
                || req.getPriceMonthlyInr() != null
                || req.getGlobalDiscountPct() != null
                || req.getIsPublic() != null
                || req.getIsActive() != null
                || req.getMaxStaff() != null
                || req.getEnabledCapabilities() != null;
    }

    private static boolean hasEffectiveLimitChange(UpdatePlanRequest req) {
        return req.getMaxActiveChits() != null
                || req.getMaxMembers() != null
                || req.getAllowedChitTypes() != null
                || req.getPriceMonthlyInr() != null
                || req.getMaxStaff() != null
                || req.getEnabledCapabilities() != null;
    }

    private static String requireChangeReason(String reason, String message) {
        String normalized = normalizeOptionalReason(reason);
        if (normalized == null || normalized.length() < 5) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, message + " (minimum 5 characters)");
        }
        return normalized;
    }

    private static String normalizeOptionalReason(String reason) {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }

    private CapabilityDefResponse toCapabilityResponse(PlanCapabilityDef d) {
        return CapabilityDefResponse.builder()
                .key(d.getKey()).label(d.getLabel()).sortOrder(d.getSortOrder()).build();
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    private PlanResponse toResponse(PlanLimits p) {
        return PlanResponse.builder()
                .plan(p.getPlan())
                .displayName(p.getDisplayName())
                .tagline(p.getTagline())
                .features(CapabilityJson.parse(p.getFeatures(), objectMapper))
                .enabledCapabilities(CapabilityJson.parse(p.getCapabilities(), objectMapper))
                .maxActiveChits(p.getMaxActiveChits())
                .maxMembers(p.getMaxMembers())
                .allowedChitTypes(p.getAllowedChitTypes())
                .priceMonthlyInr(p.getPriceMonthlyInr())
                .globalDiscountPct(p.getGlobalDiscountPct())
                .effectivePriceInr(computeEffective(p.getPriceMonthlyInr(), p.getGlobalDiscountPct()))
                .isPublic(p.isPublic())
                .isActive(p.isActive())
                .displayOrder(p.getDisplayOrder())
                .maxStaff(p.getMaxStaff())
                .badges(p.getBadges())
                .build();
    }

    private TenantDiscountResponse toDiscountResponse(TenantDiscount d) {
        return TenantDiscountResponse.builder()
                .tenantId(d.getTenantId())
                .discountType(d.getDiscountType().name())
                .discountValue(d.getDiscountValue())
                .reason(d.getReason())
                .expiresAt(d.getExpiresAt() != null ? d.getExpiresAt().toString() : null)
                .build();
    }

    private long computeEffective(long price, BigDecimal discPct) {
        if (discPct == null || price <= 0) return price;
        BigDecimal p = BigDecimal.valueOf(price);
        BigDecimal disc = p.multiply(discPct).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
        return p.subtract(disc).longValue();
    }

    public List<String> getAllCapabilityKeys() {
        return capabilityRepo.findAllByOrderBySortOrderAscLabelAsc()
                .stream().map(PlanCapabilityDef::getKey).toList();
    }

    public CapabilityGateResponse getCapabilityGate(String capKey, String tenantId) {
        PlanCapabilityDef def = capabilityRepo.findById(capKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Unknown capability: " + capKey));

        long currentPlanPrice = 0;
        if (tenantId != null) {
            Tenant tenant = tenantRepository.findById(UUID.fromString(tenantId)).orElse(null);
            if (tenant != null) {
                PlanLimits current = planRepo.findById(
                        tenant.getPlan() != null ? tenant.getPlan().toUpperCase() : "BASIC").orElse(null);
                if (current != null) currentPlanPrice = current.getPriceMonthlyInr();
            }
        }

        final long threshold = currentPlanPrice;
        List<PlanResponse> upgradePlans = planRepo.findByIsPublicTrueAndIsActiveTrueOrderByDisplayOrderAsc()
                .stream()
                .filter(p -> {
                    boolean hasCapability = CapabilityJson.parse(p.getCapabilities(), objectMapper).contains(capKey);
                    boolean aboveCurrentPrice = p.getPriceMonthlyInr() > threshold || "CUSTOM".equalsIgnoreCase(p.getPlan());
                    return hasCapability && aboveCurrentPrice;
                })
                .map(this::toResponse)
                .toList();

        return CapabilityGateResponse.builder()
                .capabilityKey(capKey)
                .name(def.getLabel())
                .description(def.getDescription())
                .importance(def.getImportance())
                .upgradePlans(upgradePlans)
                .build();
    }

    private String serializeFeatures(List<String> features) {
        if (features == null) return null;
        try {
            return objectMapper.writeValueAsString(features);
        } catch (Exception e) {
            return "[]";
        }
    }

    private List<String> validateCapabilityKeys(List<String> requested) {
        List<String> normalized = requested.stream()
                .filter(java.util.Objects::nonNull)
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
        Set<String> known = capabilityRepo.findAllById(normalized).stream()
                .map(PlanCapabilityDef::getKey).collect(Collectors.toSet());
        List<String> unknown = normalized.stream().filter(key -> !known.contains(key)).toList();
        if (!unknown.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Unknown capability keys: " + String.join(", ", unknown));
        }
        return normalized;
    }

    private void propagateStandardPlanDefaults(PlanLimits plan, String actorId, String reason) {
        if ("CUSTOM".equals(plan.getPlan())) return;
        for (var limits : customLimitsRepo.findAllByPlanCode(plan.getPlan())) {
            var before = limitSnapshot(limits);
            limits.setMaxActiveChits(plan.getMaxActiveChits());
            limits.setMaxMembers(plan.getMaxMembers());
            limits.setMaxStaff(plan.getMaxStaff());
            limits.setCapabilities(plan.getCapabilities());
            limits.setAllowedChitTypes(plan.getAllowedChitTypes());
            limits.setPriceMonthlyInr(plan.getPriceMonthlyInr());
            var after = limitSnapshot(limits);
            if (before.equals(after)) continue;
            customLimitsRepo.save(limits);
            auditClient.log("TENANT", limits.getTenantId(),
                    "PLAN_DEFAULTS_APPLIED", actorId, "SUPER_ADMIN",
                    before, after, limits.getTenantId(),
                    "Standard plan " + plan.getPlan() + " was updated: " + reason);
        }
    }

    private static java.util.Map<String, Object> limitSnapshot(
            com.chitfund.userservice.domain.entity.TenantCustomLimits limits) {
        java.util.Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("plan", limits.getPlanCode());
        snapshot.put("maxActiveChits", limits.getMaxActiveChits());
        snapshot.put("maxMembers", limits.getMaxMembers());
        snapshot.put("maxStaff", limits.getMaxStaff());
        snapshot.put("capabilities", limits.getCapabilities());
        snapshot.put("allowedChitTypes", limits.getAllowedChitTypes());
        snapshot.put("priceMonthlyInr", limits.getPriceMonthlyInr());
        return snapshot;
    }
}

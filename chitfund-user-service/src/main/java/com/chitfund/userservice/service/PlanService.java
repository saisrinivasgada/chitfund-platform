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
import com.chitfund.userservice.dto.response.PlanResponse;
import com.chitfund.userservice.dto.response.TenantDiscountResponse;
import com.chitfund.userservice.repository.PlanCapabilityDefRepository;
import com.chitfund.userservice.repository.PlanLimitsRepository;
import com.chitfund.userservice.repository.TenantDiscountRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
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

@Service
@RequiredArgsConstructor
@Slf4j
public class PlanService {

    private final PlanLimitsRepository planRepo;
    private final PlanCapabilityDefRepository capabilityRepo;
    private final TenantDiscountRepository discountRepo;
    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    private static final List<Role> STAFF_ROLES = List.of(Role.MANAGER, Role.STAFF);

    public void checkStaffLimit(String tenantId) {
        Tenant tenant = tenantRepository.findById(UUID.fromString(tenantId)).orElse(null);
        if (tenant == null) return;

        if (tenant.getPlanExpiresAt() != null && tenant.getPlanExpiresAt().isBefore(java.time.LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                    "Your subscription has expired. Please renew your plan to add team members.");
        }

        PlanLimits limits = planRepo.findById(
                tenant.getPlan() != null ? tenant.getPlan().toUpperCase() : "BASIC")
                .orElse(null);
        if (limits == null) return;

        int maxStaff = limits.getMaxStaff();
        if (maxStaff == -1) return; // unlimited
        if (maxStaff == 0) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + limits.getDisplayName() + " plan does not include manager or staff accounts. "
                    + "Upgrade to Growth or higher to add team members.");
        }

        long currentCount = userRepository.countByTenantIdAndRoleInAndDeletedAtIsNullAndEnabledTrue(tenantId, STAFF_ROLES);
        if (currentCount >= maxStaff) {
            throw new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                    "Your " + limits.getDisplayName() + " plan allows a maximum of " + maxStaff
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
        String code = req.getPlan().toUpperCase();
        PlanLimits p = PlanLimits.builder()
                .plan(code)
                .displayName(req.getDisplayName())
                .tagline(req.getTagline())
                .features(serializeFeatures(req.getFeatures()))
                .maxActiveChits(req.getMaxActiveChits())
                .maxMembers(req.getMaxMembers())
                .allowedChitTypes(req.getAllowedChitTypes() != null ? req.getAllowedChitTypes() : "RESERVATION")
                .priceMonthlyInr(req.getPriceMonthlyInr())
                .globalDiscountPct(req.getGlobalDiscountPct())
                .isPublic(req.isPublic())
                .isActive(true)
                .displayOrder(req.getDisplayOrder())
                .maxStaff(req.getMaxStaff())
                .analyticsEnabled(req.isAnalyticsEnabled())
                .prioritySupport(req.isPrioritySupport())
                .build();
        return toResponse(planRepo.save(p));
    }

    @Transactional
    public PlanResponse updatePlan(String code, UpdatePlanRequest req) {
        PlanLimits p = planRepo.findById(code.toUpperCase())
                .orElseThrow(() -> new RuntimeException("Plan not found: " + code));
        if (req.getDisplayName() != null) p.setDisplayName(req.getDisplayName());
        if (req.getTagline() != null) p.setTagline(req.getTagline());
        if (req.getFeatures() != null) p.setFeatures(serializeFeatures(req.getFeatures()));
        if (req.getMaxActiveChits() != null) p.setMaxActiveChits(req.getMaxActiveChits());
        if (req.getMaxMembers() != null) p.setMaxMembers(req.getMaxMembers());
        if (req.getAllowedChitTypes() != null) p.setAllowedChitTypes(req.getAllowedChitTypes());
        if (req.getPriceMonthlyInr() != null) p.setPriceMonthlyInr(req.getPriceMonthlyInr());
        if (req.getGlobalDiscountPct() != null) p.setGlobalDiscountPct(req.getGlobalDiscountPct());
        if (req.getIsPublic() != null) p.setPublic(req.getIsPublic());
        if (req.getIsActive() != null) p.setActive(req.getIsActive());
        if (req.getDisplayOrder() != null) p.setDisplayOrder(req.getDisplayOrder());
        if (req.getMaxStaff() != null) p.setMaxStaff(req.getMaxStaff());
        if (req.getAnalyticsEnabled() != null) p.setAnalyticsEnabled(req.getAnalyticsEnabled());
        if (req.getPrioritySupport() != null) p.setPrioritySupport(req.getPrioritySupport());
        return toResponse(planRepo.save(p));
    }

    @Transactional
    public void deletePlan(String code) {
        PlanLimits p = planRepo.findById(code.toUpperCase())
                .orElseThrow(() -> new RuntimeException("Plan not found: " + code));
        p.setActive(false);
        p.setPublic(false);
        planRepo.save(p);
    }

    @Transactional
    public TenantDiscountResponse setTenantDiscount(String tenantId, SetTenantDiscountRequest req) {
        TenantDiscount d = discountRepo.findByTenantId(tenantId)
                .orElse(TenantDiscount.builder().tenantId(tenantId).build());
        d.setDiscountType(TenantDiscount.DiscountType.valueOf(req.getDiscountType()));
        d.setDiscountValue(req.getDiscountValue());
        d.setReason(req.getReason());
        d.setExpiresAt(req.getExpiresAt() != null && !req.getExpiresAt().isBlank()
                ? LocalDateTime.parse(req.getExpiresAt()) : null);
        return toDiscountResponse(discountRepo.save(d));
    }

    @Transactional
    public void removeTenantDiscount(String tenantId) {
        discountRepo.deleteByTenantId(tenantId);
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
        return toCapabilityResponse(capabilityRepo.save(def));
    }

    @Transactional
    public void deleteCapabilityDef(String key) {
        capabilityRepo.deleteById(key);
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
                .features(parseFeatures(p.getFeatures()))
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
                .analyticsEnabled(p.isAnalyticsEnabled())
                .prioritySupport(p.isPrioritySupport())
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

    private List<String> parseFeatures(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private String serializeFeatures(List<String> features) {
        if (features == null) return null;
        try {
            return objectMapper.writeValueAsString(features);
        } catch (Exception e) {
            return "[]";
        }
    }
}

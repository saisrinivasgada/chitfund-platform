package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.Promotion;
import com.chitfund.userservice.domain.entity.ReferralCredit;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.dto.request.CreatePromotionRequest;
import com.chitfund.userservice.dto.request.UpdatePromotionRequest;
import com.chitfund.userservice.dto.response.PromoValidateResponse;
import com.chitfund.userservice.dto.response.PromotionResponse;
import com.chitfund.userservice.repository.PromotionRepository;
import com.chitfund.userservice.repository.ReferralCreditRepository;
import com.chitfund.userservice.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PromotionService {

    private final PromotionRepository promotionRepository;
    private final ReferralCreditRepository referralCreditRepository;
    private final TenantRepository tenantRepository;

    // ── Super-admin CRUD ─────────────────────────────────────────────────────

    public List<PromotionResponse> listAll() {
        return promotionRepository.findAll().stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public PromotionResponse create(CreatePromotionRequest req) {
        if (promotionRepository.findByCodeIgnoreCase(req.getCode()).isPresent()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Promo code '" + req.getCode().toUpperCase() + "' already exists");
        }
        String durType = req.getDiscountDurationType() != null
                ? req.getDiscountDurationType().toUpperCase() : "FOREVER";
        Promotion p = Promotion.builder()
                .code(req.getCode().toUpperCase().trim())
                .label(req.getLabel())
                .description(req.getDescription())
                .promoType(req.getPromoType().toUpperCase())
                .discountPct(req.getDiscountPct())
                .appliesToPlans(req.getAppliesToPlans())
                .referrerCreditInr(req.getReferrerCreditInr())
                .discountDurationType(durType)
                .discountDurationMonths("MONTHS".equals(durType) ? req.getDiscountDurationMonths() : null)
                .validFrom(req.getValidFrom())
                .validUntil(req.getValidUntil())
                .maxUses(req.getMaxUses())
                .isPublic(req.isPublic())
                .isActive(true)
                .build();
        return toResponse(promotionRepository.save(p));
    }

    @Transactional
    public PromotionResponse update(UUID id, UpdatePromotionRequest req) {
        Promotion p = getOrThrow(id);
        if (req.getLabel() != null)              p.setLabel(req.getLabel());
        if (req.getDescription() != null)        p.setDescription(req.getDescription());
        if (req.getDiscountPct() != null)        p.setDiscountPct(req.getDiscountPct());
        if (req.getAppliesToPlans() != null)     p.setAppliesToPlans(req.getAppliesToPlans());
        if (req.getReferrerCreditInr() != null)  p.setReferrerCreditInr(req.getReferrerCreditInr());
        if (req.getValidFrom() != null)          p.setValidFrom(req.getValidFrom());
        if (req.getValidUntil() != null)         p.setValidUntil(req.getValidUntil());
        if (req.getMaxUses() != null)            p.setMaxUses(req.getMaxUses());
        if (req.getIsPublic() != null)           p.setPublic(req.getIsPublic());
        if (req.getIsActive() != null)           p.setActive(req.getIsActive());
        if (req.getDiscountDurationType() != null) {
            String durType = req.getDiscountDurationType().toUpperCase();
            p.setDiscountDurationType(durType);
            p.setDiscountDurationMonths("MONTHS".equals(durType) ? req.getDiscountDurationMonths() : null);
        }
        return toResponse(promotionRepository.save(p));
    }

    @Transactional
    public PromotionResponse setVisibility(UUID id, boolean isPublic) {
        Promotion p = getOrThrow(id);
        p.setPublic(isPublic);
        return toResponse(promotionRepository.save(p));
    }

    @Transactional
    public PromotionResponse deactivate(UUID id) {
        Promotion p = getOrThrow(id);
        p.setActive(false);
        p.setPublic(false);
        return toResponse(promotionRepository.save(p));
    }

    // ── Public endpoints ─────────────────────────────────────────────────────

    public List<PromotionResponse> listPublic() {
        return promotionRepository.findAllByIsPublicTrueAndIsActiveTrue().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public PromoValidateResponse validate(String code, String planCode) {
        String upper = code.toUpperCase().trim();

        // 1. Try as a standard promo code
        Optional<Promotion> promoOpt = promotionRepository.findByCodeIgnoreCase(upper);
        if (promoOpt.isPresent()) {
            Promotion p = promoOpt.get();
            if (!p.isActive()) return invalid("This promo code is no longer active.");
            if (p.getValidFrom() != null && LocalDateTime.now().isBefore(p.getValidFrom()))
                return invalid("This promo code is not yet valid.");
            if (p.getValidUntil() != null && LocalDateTime.now().isAfter(p.getValidUntil()))
                return invalid("This promo code has expired.");
            if (p.getMaxUses() != null && p.getUsesCount() >= p.getMaxUses())
                return invalid("This promo code has reached its usage limit.");
            if (planCode != null && p.getAppliesToPlans() != null && !p.getAppliesToPlans().isBlank()) {
                boolean planMatch = List.of(p.getAppliesToPlans().split(",")).stream()
                        .map(String::trim).anyMatch(pl -> pl.equalsIgnoreCase(planCode));
                if (!planMatch) return invalid("This promo code is not valid for the " + planCode + " plan.");
            }
            return PromoValidateResponse.builder()
                    .valid(true)
                    .promoType(p.getPromoType())
                    .label(p.getLabel())
                    .description(p.getDescription())
                    .discountPct(p.getDiscountPct())
                    .build();
        }

        // 2. Try as a referral code (tenant.referralCode)
        Optional<Tenant> referrerOpt = tenantRepository.findByReferralCode(upper);
        if (referrerOpt.isPresent()) {
            Optional<Promotion> referralProgram = promotionRepository.findFirstByPromoTypeAndIsActiveTrue("REFERRAL");
            if (referralProgram.isEmpty()) return invalid("Referral program is not currently active.");
            Promotion rp = referralProgram.get();
            return PromoValidateResponse.builder()
                    .valid(true)
                    .promoType("REFERRAL")
                    .label(rp.getLabel())
                    .description(rp.getDescription())
                    .discountPct(rp.getDiscountPct())
                    .referralOrgName(referrerOpt.get().getName())
                    .build();
        }

        return invalid("Promo or referral code not found.");
    }

    // ── Called from TenantService.registerOrg ────────────────────────────────

    @Transactional
    public void applyPromoToTenant(Tenant newTenant, String code) {
        if (code == null || code.isBlank()) return;
        String upper = code.toUpperCase().trim();

        // Try standard promo first
        Optional<Promotion> promoOpt = promotionRepository.findByCodeIgnoreCase(upper);
        if (promoOpt.isPresent()) {
            Promotion p = promoOpt.get();
            if (!p.isActive()) return; // silently skip — already validated on frontend
            newTenant.setAppliedPromoId(p.getId().toString());
            p.setUsesCount(p.getUsesCount() + 1);
            promotionRepository.save(p);
            return;
        }

        // Try referral code
        Optional<Tenant> referrerOpt = tenantRepository.findByReferralCode(upper);
        if (referrerOpt.isPresent()) {
            Optional<Promotion> referralProgram = promotionRepository.findFirstByPromoTypeAndIsActiveTrue("REFERRAL");
            if (referralProgram.isEmpty()) return;

            Promotion rp = referralProgram.get();
            Tenant referrer = referrerOpt.get();

            // Guard: can't refer yourself, and each tenant can only be referred once
            if (referrer.getId().equals(newTenant.getId())) return;
            if (referralCreditRepository.existsByReferredTenantId(newTenant.getId())) return;

            newTenant.setAppliedPromoId(rp.getId().toString());
            rp.setUsesCount(rp.getUsesCount() + 1);
            promotionRepository.save(rp);

            // Create PENDING credit — released 30 days after the referred org is activated
            BigDecimal credit = rp.getReferrerCreditInr() != null ? rp.getReferrerCreditInr() : BigDecimal.ZERO;
            if (credit.compareTo(BigDecimal.ZERO) > 0) {
                ReferralCredit rc = ReferralCredit.builder()
                        .referrerTenantId(referrer.getId())
                        .referredTenantId(newTenant.getId())
                        .promoId(rp.getId())
                        .creditInr(credit)
                        .status("PENDING")
                        // creditEligibleAt is null until super-admin activates the org
                        .build();
                referralCreditRepository.save(rc);
            }
        }
    }

    // ── Called when super-admin activates a referred org ─────────────────────
    // Starts the 30-day countdown for the referrer's credit.

    @Transactional
    public void onTenantActivated(UUID tenantId) {
        // 1. Compute and save promoDiscountUntil on the tenant (based on promo duration type)
        tenantRepository.findById(tenantId).ifPresent(tenant -> {
            if (tenant.getAppliedPromoId() != null) {
                try {
                    promotionRepository.findById(UUID.fromString(tenant.getAppliedPromoId())).ifPresent(promo -> {
                        String durType = promo.getDiscountDurationType();
                        LocalDateTime discountUntil = null;
                        if ("ONCE".equals(durType)) {
                            discountUntil = LocalDateTime.now().plusMonths(1);
                        } else if ("MONTHS".equals(durType) && promo.getDiscountDurationMonths() != null) {
                            discountUntil = LocalDateTime.now().plusMonths(promo.getDiscountDurationMonths());
                        }
                        // FOREVER: discountUntil stays null
                        tenant.setPromoDiscountUntil(discountUntil);
                        tenantRepository.save(tenant);
                    });
                } catch (IllegalArgumentException ignored) { /* bad UUID in appliedPromoId */ }
            }
        });

        // 2. Start 30-day countdown for referrer credit (if this org was referred)
        referralCreditRepository.findByReferredTenantId(tenantId)
                .filter(rc -> "PENDING".equals(rc.getStatus()) && rc.getCreditEligibleAt() == null)
                .ifPresent(rc -> {
                    rc.setCreditEligibleAt(LocalDateTime.now().plusDays(30));
                    referralCreditRepository.save(rc);
                });
    }

    // ── Called by daily job to release matured credits ────────────────────────

    @Transactional
    public void releaseMaturedCredits() {
        List<ReferralCredit> matured = referralCreditRepository
                .findAllByStatusAndCreditEligibleAtBefore("PENDING", LocalDateTime.now());
        for (ReferralCredit rc : matured) {
            tenantRepository.findById(rc.getReferrerTenantId()).ifPresent(referrer -> {
                referrer.setCreditBalanceInr(referrer.getCreditBalanceInr().add(rc.getCreditInr()));
                tenantRepository.save(referrer);
            });
            rc.setStatus("CREDITED");
            rc.setCreditedAt(LocalDateTime.now());
            referralCreditRepository.save(rc);
        }
    }

    // ── Super-admin: referral credit pipeline ─────────────────────────────────

    public List<Map<String, Object>> listReferralCredits(String status) {
        List<ReferralCredit> credits = status != null
                ? referralCreditRepository.findAllByStatusOrderByCreatedAtDesc(status)
                : referralCreditRepository.findAllByOrderByCreatedAtDesc();
        return credits.stream().map(rc -> {
            String referrerName = tenantRepository.findById(rc.getReferrerTenantId())
                    .map(com.chitfund.userservice.domain.entity.Tenant::getName).orElse("Unknown");
            String referredName = tenantRepository.findById(rc.getReferredTenantId())
                    .map(com.chitfund.userservice.domain.entity.Tenant::getName).orElse("Unknown");
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", rc.getId());
            m.put("referrerTenantId", rc.getReferrerTenantId());
            m.put("referrerName", referrerName);
            m.put("referredTenantId", rc.getReferredTenantId());
            m.put("referredName", referredName);
            m.put("creditInr", rc.getCreditInr());
            m.put("status", rc.getStatus());
            m.put("creditEligibleAt", rc.getCreditEligibleAt());
            m.put("creditedAt", rc.getCreditedAt());
            m.put("createdAt", rc.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
    }

    // ── Referral info for org admin dashboard ────────────────────────────────

    public String getReferralCode(UUID tenantId) {
        return tenantRepository.findById(tenantId)
                .map(Tenant::getReferralCode)
                .orElse(null);
    }

    public BigDecimal getCreditBalance(UUID tenantId) {
        return tenantRepository.findById(tenantId)
                .map(Tenant::getCreditBalanceInr)
                .orElse(BigDecimal.ZERO);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Promotion getOrThrow(UUID id) {
        return promotionRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Promotion not found"));
    }

    private PromoValidateResponse invalid(String msg) {
        return PromoValidateResponse.builder().valid(false).errorMessage(msg).build();
    }

    public PromotionResponse toResponse(Promotion p) {
        return PromotionResponse.builder()
                .id(p.getId())
                .code(p.getCode())
                .label(p.getLabel())
                .description(p.getDescription())
                .promoType(p.getPromoType())
                .discountPct(p.getDiscountPct())
                .appliesToPlans(p.getAppliesToPlans())
                .referrerCreditInr(p.getReferrerCreditInr())
                .discountDurationType(p.getDiscountDurationType())
                .discountDurationMonths(p.getDiscountDurationMonths())
                .validFrom(p.getValidFrom())
                .validUntil(p.getValidUntil())
                .maxUses(p.getMaxUses())
                .usesCount(p.getUsesCount())
                .isPublic(p.isPublic())
                .isActive(p.isActive())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }
}

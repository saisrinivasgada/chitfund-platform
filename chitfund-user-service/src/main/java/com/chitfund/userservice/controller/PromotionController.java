package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.CreatePromotionRequest;
import com.chitfund.userservice.dto.request.UpdatePromotionRequest;
import com.chitfund.userservice.dto.response.PromoValidateResponse;
import com.chitfund.userservice.dto.response.PromotionResponse;
import com.chitfund.userservice.service.PromotionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class PromotionController {

    private final PromotionService promotionService;

    // ── Super-admin management ────────────────────────────────────────────────

    @GetMapping("/api/superadmin/promotions")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<List<PromotionResponse>>> listAll() {
        return ResponseEntity.ok(ApiResponse.success(promotionService.listAll()));
    }

    @PostMapping("/api/superadmin/promotions")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PromotionResponse>> create(
            @Valid @RequestBody CreatePromotionRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(promotionService.create(req), "Promotion created"));
    }

    @PutMapping("/api/superadmin/promotions/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PromotionResponse>> update(
            @PathVariable UUID id,
            @RequestBody UpdatePromotionRequest req) {
        return ResponseEntity.ok(ApiResponse.success(promotionService.update(id, req)));
    }

    @PatchMapping("/api/superadmin/promotions/{id}/visibility")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PromotionResponse>> setVisibility(
            @PathVariable UUID id,
            @RequestBody Map<String, Boolean> body) {
        boolean isPublic = Boolean.TRUE.equals(body.get("isPublic"));
        return ResponseEntity.ok(ApiResponse.success(promotionService.setVisibility(id, isPublic)));
    }

    @DeleteMapping("/api/superadmin/promotions/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PromotionResponse>> deactivate(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(
                promotionService.deactivate(id), "Promotion deactivated"));
    }

    @GetMapping("/api/superadmin/promotions/referral-credits")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listReferralCredits(
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(promotionService.listReferralCredits(status)));
    }

    // ── Public endpoints (no auth) ────────────────────────────────────────────

    @GetMapping("/api/public/promotions")
    public ResponseEntity<ApiResponse<List<PromotionResponse>>> listPublic() {
        return ResponseEntity.ok(ApiResponse.success(promotionService.listPublic()));
    }

    @GetMapping("/api/public/promotions/validate")
    public ResponseEntity<ApiResponse<PromoValidateResponse>> validate(
            @RequestParam String code,
            @RequestParam(required = false) String plan) {
        return ResponseEntity.ok(ApiResponse.success(promotionService.validate(code, plan)));
    }
}

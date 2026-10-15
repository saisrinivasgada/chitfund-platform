package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.CreateAddOnDefRequest;
import com.chitfund.userservice.dto.request.CreatePlanRequest;
import com.chitfund.userservice.dto.request.SetTenantDiscountRequest;
import com.chitfund.userservice.dto.request.UpdatePlanRequest;
import com.chitfund.userservice.dto.response.AddOnDefResponse;
import com.chitfund.userservice.dto.response.PlanResponse;
import com.chitfund.userservice.dto.response.TenantDiscountResponse;
import com.chitfund.userservice.service.PlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import com.chitfund.userservice.domain.entity.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@RestController
@PreAuthorize("hasAuthority('SUPER_ADMIN')")
@RequiredArgsConstructor
public class SuperAdminPlanController {

    private final PlanService planService;

    // ── Plan CRUD ──────────────────────────────────────────────────────────────

    @GetMapping("/api/super-admin/plans")
    public ResponseEntity<ApiResponse<List<PlanResponse>>> listPlans() {
        return ResponseEntity.ok(ApiResponse.success(planService.getAllPlans()));
    }

    @PostMapping("/api/super-admin/plans")
    public ResponseEntity<ApiResponse<PlanResponse>> createPlan(
            @Valid @RequestBody CreatePlanRequest req,
            @AuthenticationPrincipal User principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        planService.createPlan(req, principal.getId().toString()), "Plan created"));
    }

    @PutMapping("/api/super-admin/plans/{code}")
    public ResponseEntity<ApiResponse<PlanResponse>> updatePlan(
            @PathVariable String code,
            @Valid @RequestBody UpdatePlanRequest req,
            @RequestHeader(value = "X-Change-Reason", required = false) String reason,
            @AuthenticationPrincipal User principal) {
        return ResponseEntity.ok(ApiResponse.success(
                planService.updatePlan(code, req, principal.getId().toString(), reason), "Plan updated"));
    }

    @DeleteMapping("/api/super-admin/plans/{code}")
    public ResponseEntity<ApiResponse<Void>> deletePlan(
            @PathVariable String code,
            @RequestHeader("X-Change-Reason") String reason,
            @AuthenticationPrincipal User principal) {
        planService.deletePlan(code, principal.getId().toString(), reason);
        return ResponseEntity.ok(ApiResponse.success(null, "Plan deactivated"));
    }

    // ── Add-on definitions ────────────────────────────────────────────────

    @GetMapping("/api/super-admin/add-ons")
    public ResponseEntity<ApiResponse<List<AddOnDefResponse>>> listAddOns() {
        return ResponseEntity.ok(ApiResponse.success(planService.getAddOnDefs()));
    }

    @PostMapping("/api/super-admin/add-ons")
    public ResponseEntity<ApiResponse<AddOnDefResponse>> createAddOn(
            @Valid @RequestBody CreateAddOnDefRequest req,
            @AuthenticationPrincipal User principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        planService.createAddOnDef(req, principal.getId().toString()), "Add-on added"));
    }

    @DeleteMapping("/api/super-admin/add-ons/{key}")
    public ResponseEntity<ApiResponse<Void>> deleteAddOn(
            @PathVariable String key,
            @RequestHeader("X-Change-Reason") String reason,
            @AuthenticationPrincipal User principal) {
        planService.deleteAddOnDef(key, principal.getId().toString(), reason);
        return ResponseEntity.ok(ApiResponse.success(null, "Add-on removed"));
    }

    // ── Per-tenant discount ────────────────────────────────────────────────────

    @GetMapping("/api/super-admin/tenants/{tenantId}/discount")
    public ResponseEntity<ApiResponse<TenantDiscountResponse>> getDiscount(
            @PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(
                planService.getTenantDiscount(tenantId.toString()).orElse(null)));
    }

    @PostMapping("/api/super-admin/tenants/{tenantId}/discount")
    public ResponseEntity<ApiResponse<TenantDiscountResponse>> setDiscount(
            @PathVariable UUID tenantId,
            @Valid @RequestBody SetTenantDiscountRequest req,
            @AuthenticationPrincipal User principal) {
        return ResponseEntity.ok(ApiResponse.success(
                planService.setTenantDiscount(
                        tenantId.toString(), req, principal.getId().toString()), "Discount set"));
    }

    @DeleteMapping("/api/super-admin/tenants/{tenantId}/discount")
    public ResponseEntity<ApiResponse<Void>> removeDiscount(
            @PathVariable UUID tenantId, @AuthenticationPrincipal User principal) {
        planService.removeTenantDiscount(tenantId.toString(), principal.getId().toString());
        return ResponseEntity.ok(ApiResponse.success(null, "Discount removed"));
    }
}

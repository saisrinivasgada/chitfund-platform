package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.CreatePlanRequest;
import com.chitfund.userservice.dto.request.SetTenantDiscountRequest;
import com.chitfund.userservice.dto.request.UpdatePlanRequest;
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
            @Valid @RequestBody CreatePlanRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(planService.createPlan(req), "Plan created"));
    }

    @PutMapping("/api/super-admin/plans/{code}")
    public ResponseEntity<ApiResponse<PlanResponse>> updatePlan(
            @PathVariable String code,
            @RequestBody UpdatePlanRequest req) {
        return ResponseEntity.ok(ApiResponse.success(planService.updatePlan(code, req), "Plan updated"));
    }

    @DeleteMapping("/api/super-admin/plans/{code}")
    public ResponseEntity<ApiResponse<Void>> deletePlan(@PathVariable String code) {
        planService.deletePlan(code);
        return ResponseEntity.ok(ApiResponse.success(null, "Plan deactivated"));
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
            @Valid @RequestBody SetTenantDiscountRequest req) {
        return ResponseEntity.ok(ApiResponse.success(
                planService.setTenantDiscount(tenantId.toString(), req), "Discount set"));
    }

    @DeleteMapping("/api/super-admin/tenants/{tenantId}/discount")
    public ResponseEntity<ApiResponse<Void>> removeDiscount(@PathVariable UUID tenantId) {
        planService.removeTenantDiscount(tenantId.toString());
        return ResponseEntity.ok(ApiResponse.success(null, "Discount removed"));
    }
}

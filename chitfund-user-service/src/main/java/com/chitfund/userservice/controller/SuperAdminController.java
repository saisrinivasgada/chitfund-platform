package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.AddOrgUserRequest;
import com.chitfund.userservice.dto.request.SetCustomLimitsRequest;
import com.chitfund.userservice.dto.request.UpdateTenantRequest;
import com.chitfund.userservice.dto.response.ActivationResponse;
import com.chitfund.userservice.dto.response.EffectiveLimitsResponse;
import com.chitfund.userservice.dto.response.OrgUserResponse;
import com.chitfund.userservice.dto.response.ProxyTokenResponse;
import com.chitfund.userservice.dto.response.ResetPasswordResponse;
import com.chitfund.userservice.dto.response.TenantResponse;
import com.chitfund.userservice.service.ProxyService;
import com.chitfund.userservice.service.TenantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/super-admin/tenants")
@PreAuthorize("hasAuthority('SUPER_ADMIN')")
@RequiredArgsConstructor
public class SuperAdminController {

    private final TenantService tenantService;
    private final ProxyService proxyService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<TenantResponse>>> listTenants(
            @RequestParam(required = false) String status) {
        List<TenantResponse> tenants = (status != null && !status.isBlank())
                ? tenantService.listAllTenants().stream()
                    .filter(t -> t.getStatus().equalsIgnoreCase(status)).toList()
                : tenantService.listAllTenants();
        return ResponseEntity.ok(ApiResponse.success(tenants));
    }

    @GetMapping("/{tenantId}")
    public ResponseEntity<ApiResponse<TenantResponse>> getTenant(@PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(tenantService.getTenant(tenantId)));
    }

    @PostMapping("/{tenantId}/activate")
    public ResponseEntity<ApiResponse<ActivationResponse>> activate(@PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.activateTenant(tenantId), "Tenant activated"));
    }

    @PostMapping("/{tenantId}/proxy")
    public ResponseEntity<ApiResponse<ProxyTokenResponse>> proxy(
            @PathVariable UUID tenantId,
            @RequestParam String role,
            @RequestParam(required = false) UUID userId) {
        return ResponseEntity.ok(ApiResponse.success(
                proxyService.generateProxyToken(tenantId, role, userId), "Proxy token ready"));
    }

    @GetMapping("/{tenantId}/credentials")
    public ResponseEntity<ApiResponse<OrgUserResponse>> getAdminCredentials(@PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(tenantService.getAdminCredentials(tenantId)));
    }

    @PostMapping("/{tenantId}/suspend")
    public ResponseEntity<ApiResponse<TenantResponse>> suspend(@PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.suspendTenant(tenantId), "Tenant suspended"));
    }

    @PatchMapping("/{tenantId}/status")
    public ResponseEntity<ApiResponse<TenantResponse>> setStatus(
            @PathVariable UUID tenantId,
            @RequestParam String status) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.setTenantStatus(tenantId, status), "Status updated"));
    }

    @PostMapping("/{tenantId}/reactivate")
    public ResponseEntity<ApiResponse<TenantResponse>> reactivate(
            @PathVariable UUID tenantId,
            @RequestParam(required = false) String newSlug) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.reactivateTenant(tenantId, newSlug), "Tenant reactivated"));
    }

    @PostMapping("/{tenantId}/plan")
    public ResponseEntity<ApiResponse<TenantResponse>> updatePlan(
            @PathVariable UUID tenantId,
            @RequestParam String plan) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.updatePlan(tenantId, plan), "Plan updated"));
    }

    @PutMapping("/{tenantId}/plan-expiry")
    public ResponseEntity<ApiResponse<TenantResponse>> setPlanExpiry(
            @PathVariable UUID tenantId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime expiresAt) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.setPlanExpiry(tenantId, expiresAt), "Plan expiry updated"));
    }

    @PutMapping("/{tenantId}/custom-limits")
    public ResponseEntity<ApiResponse<EffectiveLimitsResponse>> setCustomLimits(
            @PathVariable UUID tenantId,
            @Valid @RequestBody SetCustomLimitsRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.setCustomLimits(tenantId, request), "Custom limits saved"));
    }

    @DeleteMapping("/{tenantId}/custom-limits")
    public ResponseEntity<ApiResponse<Void>> removeCustomLimits(
            @PathVariable UUID tenantId,
            @RequestParam(defaultValue = "BASIC") String fallbackPlan) {
        tenantService.removeCustomLimits(tenantId, fallbackPlan);
        return ResponseEntity.ok(ApiResponse.success(null, "Custom limits removed"));
    }

    @GetMapping("/{tenantId}/effective-limits")
    public ResponseEntity<ApiResponse<EffectiveLimitsResponse>> getEffectiveLimits(
            @PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.getEffectiveLimits(tenantId.toString())));
    }

    @GetMapping("/limits-bulk")
    public ResponseEntity<ApiResponse<java.util.List<java.util.Map<String, Object>>>> getAllLimits() {
        return ResponseEntity.ok(ApiResponse.success(tenantService.getAllTenantLimits()));
    }

    @GetMapping("/{tenantId}/users")
    public ResponseEntity<ApiResponse<List<OrgUserResponse>>> listOrgUsers(@PathVariable UUID tenantId) {
        return ResponseEntity.ok(ApiResponse.success(tenantService.listOrgUsers(tenantId)));
    }

    @PostMapping("/users/{userId}/setup-app-access")
    public ResponseEntity<ApiResponse<ResetPasswordResponse>> setupAppAccess(
            @PathVariable UUID userId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.setupAppAccess(userId, body.get("username")), "App access set up"));
    }

    @PutMapping("/{tenantId}")
    public ResponseEntity<ApiResponse<TenantResponse>> updateTenant(
            @PathVariable UUID tenantId,
            @Valid @RequestBody UpdateTenantRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.updateTenant(tenantId, request), "Org updated"));
    }

    @PostMapping("/{tenantId}/users")
    public ResponseEntity<ApiResponse<OrgUserResponse>> addOrgUser(
            @PathVariable UUID tenantId,
            @Valid @RequestBody AddOrgUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(tenantService.addOrgUser(tenantId, request), "User added"));
    }

    @GetMapping("/upgrade-requests")
    public ResponseEntity<ApiResponse<List<TenantResponse>>> listUpgradeRequests() {
        return ResponseEntity.ok(ApiResponse.success(tenantService.listPendingUpgradeRequests()));
    }

    @GetMapping("/renewal-requests")
    public ResponseEntity<ApiResponse<List<TenantResponse>>> listRenewalRequests() {
        return ResponseEntity.ok(ApiResponse.success(tenantService.listPendingRenewalRequests()));
    }

    @DeleteMapping("/{tenantId}/renewal-request")
    public ResponseEntity<ApiResponse<Void>> clearRenewalRequest(@PathVariable UUID tenantId) {
        tenantService.clearRenewalRequest(tenantId);
        return ResponseEntity.ok(ApiResponse.success(null, "Renewal request cleared"));
    }

    @PostMapping("/{tenantId}/credits")
    public ResponseEntity<ApiResponse<TenantResponse>> addCredit(
            @PathVariable UUID tenantId,
            @RequestBody Map<String, Object> body) {
        BigDecimal amount = new BigDecimal(body.get("amountInr").toString());
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.addCredit(tenantId, amount), "Credit added"));
    }

    @PostMapping("/{tenantId}/credits/deduct")
    public ResponseEntity<ApiResponse<TenantResponse>> deductCredit(
            @PathVariable UUID tenantId,
            @RequestBody Map<String, Object> body) {
        BigDecimal amount = new BigDecimal(body.get("amountInr").toString());
        return ResponseEntity.ok(ApiResponse.success(
                tenantService.deductCredit(tenantId, amount), "Credit deducted"));
    }
}

package com.chitfund.userservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.dto.response.AddOnGateResponse;
import com.chitfund.userservice.dto.response.PlanResponse;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.service.PlanService;
import com.chitfund.userservice.service.TenantService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/plans")
@RequiredArgsConstructor
public class PlanController {

    private final PlanService planService;
    private final TenantService tenantService;

    @GetMapping("/public")
    public ResponseEntity<ApiResponse<List<PlanResponse>>> getPublicPlans() {
        return ResponseEntity.ok(ApiResponse.success(planService.getPublicPlans()));
    }

    @PostMapping("/upgrade-request")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> requestUpgrade(
            @RequestParam String toPlan, @AuthenticationPrincipal User principal) {
        String tenantId = TenantContext.get();
        if (tenantId == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "No tenant context");
        tenantService.requestPlanUpgrade(tenantId, toPlan, principal.getId().toString());
        return ResponseEntity.ok(ApiResponse.success(null, "Upgrade request submitted. Our team will review it shortly."));
    }

    @GetMapping("/add-on-gate")
    public ResponseEntity<ApiResponse<AddOnGateResponse>> getAddOnGate(@RequestParam String key) {
        String tenantId = TenantContext.get();
        return ResponseEntity.ok(ApiResponse.success(planService.getAddOnGate(key, tenantId)));
    }

    @PostMapping("/renewal-request")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> requestRenewal(@AuthenticationPrincipal User principal) {
        String tenantId = TenantContext.get();
        if (tenantId == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "No tenant context");
        tenantService.requestRenewal(tenantId, principal.getId().toString());
        return ResponseEntity.ok(ApiResponse.success(null, "Renewal request sent. Our team will contact you shortly."));
    }
}

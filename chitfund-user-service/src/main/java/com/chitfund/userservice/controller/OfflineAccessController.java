package com.chitfund.userservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.service.OfflineAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me/offline-access")
@RequiredArgsConstructor
public class OfflineAccessController {
    private final OfflineAccessService service;

    @PostMapping
    @PreAuthorize("hasAnyAuthority('ADMIN','MANAGER','STAFF','MEMBER')")
    public ResponseEntity<ApiResponse<OfflineAccessService.Access>> issue(Authentication authentication) {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "An organisation account is required");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                ApiResponse.success(service.issue((User) authentication.getPrincipal(), tenantId)));
    }
}

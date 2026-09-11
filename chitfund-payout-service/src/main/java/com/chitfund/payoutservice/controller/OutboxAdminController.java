package com.chitfund.payoutservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.payoutservice.dto.request.ReplayOutboxRequest;
import com.chitfund.payoutservice.kafka.PayoutOutboxStore;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/admin/outbox")
@RequiredArgsConstructor
public class OutboxAdminController {

    private final PayoutOutboxStore outboxStore;

    @PostMapping("/{deliveryId}/replay")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<String>> replay(
            @PathVariable String deliveryId,
            @Valid @RequestBody ReplayOutboxRequest request,
            Authentication authentication) {
        UUID actorId = (UUID) authentication.getPrincipal();
        boolean replayed = outboxStore.replayFailed(
                deliveryId, TenantContext.get(), actorId.toString(), request.getReason().trim());
        if (!replayed) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                    "Failed payout outbox delivery was not found", HttpStatus.NOT_FOUND);
        }
        return ResponseEntity.ok(ApiResponse.success(
                deliveryId, "Payout outbox delivery queued for replay"));
    }
}

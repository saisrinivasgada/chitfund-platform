package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.ResolveOfflinePaymentReviewRequest;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.request.RecordOfflineCollectionRefundRequest;
import com.chitfund.paymentservice.dto.request.RecoverOfflineCollectionRequest;
import com.chitfund.paymentservice.dto.request.CancelOfflineCollectionRequest;
import com.chitfund.paymentservice.dto.request.CancelSavedOfflinePaymentRequest;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
import com.chitfund.paymentservice.service.OfflinePaymentReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequestMapping("/payments/offline/reviews")
@RequiredArgsConstructor @PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class OfflinePaymentReviewController {
    private final OfflinePaymentReviewService reviews;
    @PostMapping("/legacy") public ApiResponse<?> preserveLegacy(@Valid @RequestBody RecordPaymentRequest original,
            @RequestHeader("X-Idempotency-Key") String operationId, Authentication auth) {
        throw new OfflineReviewRequiredException(reviews.preserveLegacy(original, (UUID) auth.getPrincipal(), operationId));
    }
    @PostMapping("/recover") public ApiResponse<?> recover(@Valid @RequestBody RecoverOfflineCollectionRequest request,
            @RequestHeader("X-Idempotency-Key") String operationId, Authentication auth) {
        return ApiResponse.success(java.util.Map.of("reviewId", reviews.preserveRecovered(request.original(),
                request.originalActorId(), operationId, (UUID) auth.getPrincipal())));
    }
    @PostMapping("/recover-legacy") public ApiResponse<?> recoverLegacy(@Valid @RequestBody RecoverOfflineCollectionRequest request,
            @RequestHeader("X-Idempotency-Key") String operationId, Authentication auth) {
        return ApiResponse.success(java.util.Map.of("reviewId", reviews.preserveRecoveredLegacy(request.original(),
                request.originalActorId(), operationId, (UUID) auth.getPrincipal())));
    }
    @PostMapping("/cancel-unsynced") public ApiResponse<?> cancelUnsynced(@Valid @RequestBody CancelSavedOfflinePaymentRequest request,
            @RequestHeader("X-Idempotency-Key") String operationId, Authentication auth) {
        return ApiResponse.success(reviews.cancelUnconfirmed(request, operationId, (UUID) auth.getPrincipal()));
    }
    @GetMapping public ApiResponse<?> list(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) { return ApiResponse.success(reviews.list(page, size)); }
    @GetMapping("/{id}") public ApiResponse<?> detail(@PathVariable UUID id) { return ApiResponse.success(reviews.detail(id)); }
    @GetMapping("/{id}/matches") public ApiResponse<?> matches(@PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(reviews.matches(id, page, size));
    }
    @PostMapping("/{id}/cancel") public ApiResponse<?> cancel(@PathVariable UUID id,
            @Valid @RequestBody CancelOfflineCollectionRequest request, Authentication auth) {
        return ApiResponse.success(reviews.cancelMistakenEntry(id, request, (UUID) auth.getPrincipal()));
    }
    @PostMapping("/{id}/refund") public ApiResponse<?> refund(@PathVariable UUID id,
            @Valid @RequestBody RecordOfflineCollectionRefundRequest refund, Authentication auth) {
        return ApiResponse.success(reviews.recordRefund(id, refund, (UUID) auth.getPrincipal()));
    }
    @PostMapping("/{id}/resolve") public ApiResponse<?> resolve(@PathVariable UUID id,
            @Valid @RequestBody ResolveOfflinePaymentReviewRequest decision, Authentication auth) {
        return ApiResponse.success(reviews.resolve(id, decision, (UUID) auth.getPrincipal()));
    }
}

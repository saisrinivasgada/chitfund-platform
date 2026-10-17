package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.*;
import com.chitfund.paymentservice.service.OfflineStaffReviewService;
import com.chitfund.paymentservice.exception.OfflineReviewRequiredException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/payments/offline/staff-actions/reviews") @RequiredArgsConstructor
public class OfflineStaffReviewController {
    private final OfflineStaffReviewService reviews;
    @PostMapping("/legacy") @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ApiResponse<?> legacy(@Valid @RequestBody LegacyOfflineStaffActionRequest r, Authentication auth) {
        String role = auth.getAuthorities().stream().map(a -> a.getAuthority().replace("ROLE_", ""))
                .filter(value -> "STAFF".equals(value) || "MANAGER".equals(value)).findFirst().orElseThrow();
        // Quarantine only: an older command can never replay an ordinary pickup.
        UUID id = reviews.preserveLegacy(r, (UUID) auth.getPrincipal(), role, null);
        throw new OfflineReviewRequiredException(id);
    }
    @PostMapping("/recover-legacy") @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResponse<?> recoverLegacy(@Valid @RequestBody RecoverLegacyOfflineStaffActionRequest r, Authentication auth) {
        return ApiResponse.success(Map.of("reviewId", reviews.preserveLegacy(r.original(), r.originalActorId(), r.originalRole(), (UUID) auth.getPrincipal())));
    }
    @PostMapping("/recover") @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResponse<?> recover(@Valid @RequestBody RecoverOfflineStaffActionRequest r, Authentication auth) {
        return ApiResponse.success(Map.of("reviewId", reviews.preserve(r.original(), r.originalActorId(), r.originalRole(), (UUID) auth.getPrincipal())));
    }
    @GetMapping @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResponse<?> list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size, Authentication auth) {
        return ApiResponse.success(reviews.list((UUID) auth.getPrincipal(), page, size));
    }
    @GetMapping("/{id}") @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ApiResponse<?> detail(@PathVariable UUID id, Authentication auth) {
        boolean admin = auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        return ApiResponse.success(reviews.detail(id, (UUID) auth.getPrincipal(), admin));
    }
    @PostMapping("/{id}/resolve") @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResponse<?> resolve(@PathVariable UUID id, @Valid @RequestBody ResolveOfflineStaffReviewRequest r, Authentication auth) {
        return ApiResponse.success(reviews.resolve(id, r, (UUID) auth.getPrincipal()));
    }
}

package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.AssignWorkerRequest;
import com.chitfund.paymentservice.dto.request.CreateCashRequestRequest;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.service.CashRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/payments/requests")
@RequiredArgsConstructor
public class CashRequestController {

    private final CashRequestService cashRequestService;

    /**
     * Member submits a cash pickup request.
     * memberId is derived from their JWT — members cannot create requests for other members.
     */
    @PostMapping
    @PreAuthorize("hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> createRequest(
            @Valid @RequestBody CreateCashRequestRequest request,
            Authentication auth) {
        UUID memberId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.createRequest(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin/Manager creates a cash pickup on behalf of a member.
     * workerId is optional — if provided the request is immediately assigned.
     */
    @PostMapping("/admin")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> createRequestByAdmin(
            @RequestParam UUID memberId,
            @RequestParam(required = false) UUID workerId,
            @Valid @RequestBody CreateCashRequestRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.createRequestByAdmin(memberId, workerId, request, adminId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: all PENDING requests (not yet assigned to a worker).
     */
    @GetMapping("/pending")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getPendingRequests() {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getPendingRequests()));
    }

    /**
     * Admin/Manager: all active requests (PENDING + ASSIGNED) — dashboard view.
     */
    @GetMapping("/active")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getActiveRequests() {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getActiveRequests()));
    }

    /**
     * Admin/Manager: assign a worker to a PENDING request.
     */
    @PatchMapping("/{requestId}/assign")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> assignWorker(
            @PathVariable UUID requestId,
            @Valid @RequestBody AssignWorkerRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        CashRequestResponse response = cashRequestService.assignWorker(requestId, request, adminId, role);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Worker: see all requests assigned to them (ASSIGNED status).
     */
    @GetMapping("/mine")
    @PreAuthorize("hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getMyAssignedRequests(Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getMyAssignedRequests(workerId)));
    }

    /**
     * Worker: their own past requests — COLLECTED and CANCELLED.
     */
    @GetMapping("/mine/history")
    @PreAuthorize("hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getMyRequestHistory(Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getMyRequestHistory(workerId)));
    }

    /**
     * Member: their own request history.
     */
    @GetMapping("/my-requests")
    @PreAuthorize("hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getMyRequests(Authentication auth) {
        UUID memberId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getMyRequests(memberId)));
    }

    /**
     * Worker: collect cash for a specific assigned request.
     * This delegates to PaymentService.collectCash() and creates a AWAITING_REMITTANCE batch.
     * Admin still needs to call /payments/{batchId}/remit after receiving the cash.
     */
    @PostMapping("/{requestId}/collect")
    @PreAuthorize("hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> collectForRequest(
            @PathVariable UUID requestId,
            Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        PaymentBatchResponse response = cashRequestService.collectForRequest(requestId, workerId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: full request history for a specific worker.
     */
    @GetMapping("/worker/{workerId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getWorkerRequests(@PathVariable UUID workerId) {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getWorkerRequests(workerId)));
    }

    /**
     * Admin/Manager: cancel a PENDING or ASSIGNED request.
     */
    @PatchMapping("/{requestId}/cancel")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> cancelRequest(
            @PathVariable UUID requestId,
            @RequestParam(required = false) String reason) {
        CashRequestResponse response = cashRequestService.cancelRequest(requestId, reason);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

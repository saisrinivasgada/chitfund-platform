package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.AssignWorkerRequest;
import com.chitfund.paymentservice.dto.request.CreateCashRequestRequest;
import com.chitfund.paymentservice.dto.response.CashRequestAuditLogResponse;
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

import java.time.LocalDateTime;
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
     * Worker: reschedule an ASSIGNED request to a future date (e.g. "tomorrow", "next week").
     * Status stays ASSIGNED; scheduledFor date is updated and admin is notified.
     */
    @PatchMapping("/{requestId}/reschedule")
    @PreAuthorize("hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> rescheduleRequest(
            @PathVariable UUID requestId,
            @RequestParam String scheduledFor,
            Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        LocalDateTime date = LocalDateTime.parse(scheduledFor);
        CashRequestResponse response = cashRequestService.rescheduleRequest(requestId, workerId, date);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Worker: cancel their own ASSIGNED request (e.g. member not available).
     * Only before physical pickup (ASSIGNED status only).
     */
    @PatchMapping("/{requestId}/cancel/worker")
    @PreAuthorize("hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> cancelByWorker(
            @PathVariable UUID requestId,
            @RequestParam(required = false) String reason,
            Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.cancelByWorker(requestId, workerId, reason);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Worker: marks that they have physically collected the cash from the member.
     * Transitions ASSIGNED → PICKED_UP. This creates a proof-of-pickup record.
     * Admin must then confirm receipt to credit the member's account.
     */
    @PatchMapping("/{requestId}/pickup")
    @PreAuthorize("hasRole('ROLE_WORKER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> markPickedUp(
            @PathVariable UUID requestId,
            Authentication auth) {
        UUID workerId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.markPickedUp(requestId, workerId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: confirms receipt of cash from the worker.
     * Transitions PICKED_UP → COLLECTED and credits the member's account.
     * The worker must have already marked the request as PICKED_UP first.
     */
    @PostMapping("/{requestId}/collect")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> collectForRequest(
            @PathVariable UUID requestId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        PaymentBatchResponse response = cashRequestService.collectForRequest(requestId, adminId);
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

    /**
     * Admin/Manager: void a PICKED_UP — reverts to ASSIGNED.
     * Use when worker accidentally marked pickup for the wrong member.
     * Worker still owns the task; they need to physically re-collect and re-mark.
     */
    @PatchMapping("/{requestId}/void-pickup")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> voidPickup(
            @PathVariable UUID requestId,
            @RequestParam(required = false) String reason,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        CashRequestResponse response = cashRequestService.voidPickup(requestId, adminId, role, reason);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: full audit trail for a specific cash request.
     * Returns every status change — who did what, when, and why.
     */
    @GetMapping("/{requestId}/audit")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestAuditLogResponse>>> getAuditLog(
            @PathVariable UUID requestId) {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getAuditLog(requestId)));
    }
}

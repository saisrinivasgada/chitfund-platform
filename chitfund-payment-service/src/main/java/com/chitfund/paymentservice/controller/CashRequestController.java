package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.AssignWorkerRequest;
import com.chitfund.paymentservice.dto.request.CreateCashRequestRequest;
import com.chitfund.paymentservice.dto.request.MemberApprovalRequest;
import com.chitfund.paymentservice.dto.request.PartialCollectRequest;
import com.chitfund.paymentservice.dto.request.UpdateCashRequestRequest;
import com.chitfund.paymentservice.dto.response.CashRequestAuditLogResponse;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.dto.response.CashRequestSummaryResponse;
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
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> createRequest(
            @Valid @RequestBody CreateCashRequestRequest request,
            Authentication auth) {
        UUID memberId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.createRequest(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin/Manager creates a cash pickup on behalf of a member.
     * staffId is optional — if provided the request is immediately assigned.
     */
    @PostMapping("/admin")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> createRequestByAdmin(
            @RequestParam UUID memberId,
            @RequestParam(required = false) UUID staffId,
            @RequestParam(required = false, defaultValue = "STAFF") String assigneeRole,
            @Valid @RequestBody CreateCashRequestRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.createRequestByAdmin(memberId, staffId, request, adminId, assigneeRole);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: all PENDING requests (not yet assigned to a worker).
     */
    @GetMapping("/pending")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getPendingRequests() {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getPendingRequests()));
    }

    /**
     * Admin/Manager: all active requests (PENDING + ASSIGNED) — dashboard view.
     */
    @GetMapping("/active")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getActiveRequests() {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getActiveRequests()));
    }

    /**
     * Admin/Manager: edit a PENDING or ASSIGNED request.
     * Can update amount, worker assignment, notes, and scheduled date.
     * Notifies member and worker of any changes.
     */
    @PatchMapping("/{requestId}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> updateRequest(
            @PathVariable UUID requestId,
            @Valid @RequestBody UpdateCashRequestRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        CashRequestResponse response = cashRequestService.updateRequest(requestId, request, adminId, role);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: assign a staff member to a PENDING request.
     */
    @PatchMapping("/{requestId}/assign")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> assignStaff(
            @PathVariable UUID requestId,
            @Valid @RequestBody AssignWorkerRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        CashRequestResponse response = cashRequestService.assignStaff(requestId, request, adminId, role);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Staff: see all requests assigned to them (ASSIGNED status).
     */
    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getMyAssignedRequests(Authentication auth) {
        UUID staffId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getMyAssignedRequests(staffId)));
    }

    /**
     * Staff/Manager: their own past requests — COLLECTED and CANCELLED.
     */
    @GetMapping("/mine/history")
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getMyRequestHistory(Authentication auth) {
        UUID staffId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getMyRequestHistory(staffId)));
    }

    /**
     * Member: their own request history.
     */
    @GetMapping("/my-requests")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getMyRequests(Authentication auth) {
        UUID memberId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getMyRequests(memberId)));
    }

    /**
     * Staff: reschedule an ASSIGNED request to a future date (e.g. "tomorrow", "next week").
     * Status stays ASSIGNED; scheduledFor date is updated and admin is notified.
     */
    @PatchMapping("/{requestId}/reschedule")
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> rescheduleRequest(
            @PathVariable UUID requestId,
            @RequestParam String scheduledFor,
            Authentication auth) {
        UUID staffId = (UUID) auth.getPrincipal();
        LocalDateTime date = LocalDateTime.parse(scheduledFor);
        CashRequestResponse response = cashRequestService.rescheduleRequest(requestId, staffId, date);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Staff: cancel their own ASSIGNED request (e.g. member not available).
     * Only before physical pickup (ASSIGNED status only).
     */
    @PatchMapping("/{requestId}/cancel/staff")
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> cancelByStaff(
            @PathVariable UUID requestId,
            @RequestParam(required = false) String reason,
            Authentication auth) {
        UUID staffId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.cancelByStaff(requestId, staffId, reason);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Staff: marks that they have physically collected the cash from the member.
     * Transitions ASSIGNED → PICKED_UP. This creates a proof-of-pickup record.
     * Admin must then confirm receipt to credit the member's account.
     */
    @PatchMapping("/{requestId}/pickup")
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> markPickedUp(
            @PathVariable UUID requestId,
            Authentication auth) {
        UUID collectorId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        CashRequestResponse response = cashRequestService.markPickedUp(requestId, collectorId, role);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: confirms receipt of cash from the worker.
     * Transitions PICKED_UP → COLLECTED and credits the member's account.
     * The worker must have already marked the request as PICKED_UP first.
     */
    @PostMapping("/{requestId}/collect")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentBatchResponse>> collectForRequest(
            @PathVariable UUID requestId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        PaymentBatchResponse response = cashRequestService.collectForRequest(requestId, adminId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: full request history for a specific staff member.
     */
    @GetMapping("/staff/{staffId}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getStaffRequests(@PathVariable UUID staffId) {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getStaffRequests(staffId)));
    }

    /**
     * Admin/Manager: cancel a PENDING or ASSIGNED request.
     */
    @PatchMapping("/{requestId}/cancel")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
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
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
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
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestAuditLogResponse>>> getAuditLog(
            @PathVariable UUID requestId) {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getAuditLog(requestId)));
    }

    /**
     * Staff: mark partial collection — collected less than the full requested amount.
     * Transitions ASSIGNED → PARTIALLY_COLLECTED. Member must approve via /member-approve.
     */
    @PatchMapping("/{requestId}/partial-collect")
    @PreAuthorize("hasAuthority('ROLE_STAFF') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> partiallyCollect(
            @PathVariable UUID requestId,
            @Valid @RequestBody PartialCollectRequest request,
            Authentication auth) {
        UUID collectorId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        CashRequestResponse response = cashRequestService.partiallyCollect(
                requestId, request.getCollectedAmount(), collectorId, role);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Member: approve or reject a partial collection recorded by the worker.
     * Only valid for PARTIALLY_COLLECTED requests belonging to this member.
     */
    @PatchMapping("/{requestId}/member-approve")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<CashRequestResponse>> memberApprovePartial(
            @PathVariable UUID requestId,
            @Valid @RequestBody MemberApprovalRequest request,
            Authentication auth) {
        UUID memberId = (UUID) auth.getPrincipal();
        CashRequestResponse response = cashRequestService.memberApprovePartial(
                requestId, request.getApproved(), request.getReason(), memberId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Admin/Manager: count of requests per status — used for dashboard summary cards.
     */
    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<CashRequestSummaryResponse>> getSummary() {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getSummary()));
    }

    /**
     * Admin/Manager: all cancelled cash requests, newest first.
     */
    @GetMapping("/cancelled")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<CashRequestResponse>>> getCancelledRequests() {
        return ResponseEntity.ok(ApiResponse.success(cashRequestService.getCancelledRequests()));
    }
}

package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.SubmitProspectContactRequest;
import com.chitfund.userservice.dto.request.SubmitSupportTicketRequest;
import com.chitfund.userservice.dto.response.ContactRequestMessageResponse;
import com.chitfund.userservice.dto.response.ContactRequestResponse;
import com.chitfund.userservice.service.ContactRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ContactController {

    private final ContactRequestService contactRequestService;

    // ── Public: landing page prospect inquiry ────────────────────────────────

    @PostMapping("/api/public/contact")
    public ResponseEntity<ApiResponse<Void>> submitProspect(
            @Valid @RequestBody SubmitProspectContactRequest req) {
        contactRequestService.submitProspect(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(null, "Thanks! We'll reach out to you shortly."));
    }

    // ── Authenticated: org admin/manager support ticket ──────────────────────

    @PostMapping("/api/support/ticket")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> submitSupportTicket(
            @Valid @RequestBody SubmitSupportTicketRequest req,
            @AuthenticationPrincipal User user) {
        contactRequestService.submitSupportTicket(req, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(null, "Support ticket submitted. We'll get back to you soon."));
    }

    // ── Super admin: manage contact requests ─────────────────────────────────

    @GetMapping("/api/super-admin/contact-requests")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<List<ContactRequestResponse>>> listAll() {
        return ResponseEntity.ok(ApiResponse.success(contactRequestService.listAll()));
    }

    /** Paginated + filterable list — powers the Helpdesk list page. */
    @GetMapping("/api/super-admin/contact-requests/search")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<Page<ContactRequestResponse>>> search(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        LocalDateTime from = fromDate != null ? fromDate.atStartOfDay() : null;
        LocalDateTime to = toDate != null ? LocalDateTime.of(toDate, LocalTime.MAX) : null;
        PageRequest pr = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return ResponseEntity.ok(ApiResponse.success(
                contactRequestService.search(type, status, from, to, pr)));
    }

    @GetMapping("/api/super-admin/contact-requests/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<ContactRequestResponse>> getOne(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(contactRequestService.getOne(id)));
    }

    @GetMapping("/api/super-admin/contact-requests/count-new")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Long>>> countNew() {
        return ResponseEntity.ok(ApiResponse.success(Map.of("count", contactRequestService.countNew())));
    }

    // ── In-app reply thread (super admin ↔ requester context) ────────────────

    @GetMapping("/api/super-admin/contact-requests/{id}/messages")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<List<ContactRequestMessageResponse>>> listMessages(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(contactRequestService.listMessages(id)));
    }

    @PostMapping("/api/super-admin/contact-requests/{id}/messages")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<ContactRequestMessageResponse>> addMessage(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal User user) {
        String senderName = user.getFullName() != null ? user.getFullName() : user.getUsername();
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                contactRequestService.addMessage(id, senderName, body.get("content"))));
    }

    @PatchMapping("/api/super-admin/contact-requests/{id}/status")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<ContactRequestResponse>> updateStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        String holdUntilStr = body.get("holdUntil");
        LocalDateTime holdUntil = holdUntilStr != null ? LocalDateTime.parse(holdUntilStr) : null;
        return ResponseEntity.ok(ApiResponse.success(
                contactRequestService.updateStatus(id, body.get("status"), holdUntil)));
    }

    @PatchMapping("/api/super-admin/contact-requests/{id}/contact-mode")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<ContactRequestResponse>> updateContactMode(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.success(
                contactRequestService.updateContactMode(id, body.get("preferredContact"))));
    }
}

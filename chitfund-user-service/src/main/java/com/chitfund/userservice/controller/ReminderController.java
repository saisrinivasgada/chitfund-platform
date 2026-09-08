package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.SendReminderRequest;
import com.chitfund.userservice.dto.response.ReminderResponse;
import com.chitfund.userservice.service.ReminderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/reminders")
@RequiredArgsConstructor
public class ReminderController {

    private final ReminderService reminderService;

    // ── Admin: send a reminder ─────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ReminderResponse>> send(
            @Valid @RequestBody SendReminderRequest req,
            Authentication auth) {
        User sender = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(reminderService.send(req, sender)));
    }

    // ── Admin: view all reminders for a member ─────────────────────────────────

    @GetMapping("/member/{memberProfileId}")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Page<ReminderResponse>>> listForMember(
            @PathVariable UUID memberProfileId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        Page<ReminderResponse> result = reminderService.listForMember(principal.getTenantId(), memberProfileId, page, size);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ── Admin: get single reminder ─────────────────────────────────────────────

    @GetMapping("/admin/{reminderId}")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ReminderResponse>> getForAdmin(
            @PathVariable UUID reminderId,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(reminderService.getForAdmin(reminderId, principal.getTenantId())));
    }

    // ── Member: list own reminders ─────────────────────────────────────────────

    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<Page<ReminderResponse>>> listMine(
            @RequestParam(defaultValue = "all") String filter,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        Page<ReminderResponse> result = reminderService.listMine(principal.getId(), filter, page, size);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ── Member: get single reminder (also marks read) ──────────────────────────

    @GetMapping("/{reminderId}")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<ReminderResponse>> getOne(
            @PathVariable UUID reminderId,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        reminderService.markRead(reminderId, principal.getId());
        return ResponseEntity.ok(ApiResponse.success(reminderService.getForMember(reminderId, principal.getId())));
    }

    // ── Member: mark seen (called when push notification tapped) ──────────────

    @PutMapping("/{reminderId}/seen")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<Void>> markSeen(
            @PathVariable UUID reminderId,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        reminderService.markSeen(reminderId, principal.getId());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    // ── Member: set promised date ──────────────────────────────────────────────

    @PutMapping("/{reminderId}/promised-date")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<ReminderResponse>> setPromisedDate(
            @PathVariable UUID reminderId,
            @RequestBody Map<String, String> body,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        LocalDate date = LocalDate.parse(body.get("promisedDate"));
        return ResponseEntity.ok(ApiResponse.success(reminderService.setPromisedDate(reminderId, principal.getId(), date)));
    }

    // ── Member: archive (soft delete) ─────────────────────────────────────────

    @DeleteMapping("/{reminderId}")
    @PreAuthorize("hasAuthority('MEMBER')")
    public ResponseEntity<ApiResponse<Void>> archive(
            @PathVariable UUID reminderId,
            Authentication auth) {
        User principal = (User) auth.getPrincipal();
        reminderService.archive(reminderId, principal.getId());
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}

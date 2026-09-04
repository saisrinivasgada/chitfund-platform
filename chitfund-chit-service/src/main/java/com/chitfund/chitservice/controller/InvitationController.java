package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.dto.request.OverrideResponseRequest;
import com.chitfund.chitservice.dto.request.RejectResponseRequest;
import com.chitfund.chitservice.dto.request.SendInvitationRequest;
import com.chitfund.chitservice.dto.response.ChitInvitationResponse;
import com.chitfund.chitservice.dto.response.InvitationResponseDTO;
import com.chitfund.chitservice.service.InvitationService;
import com.chitfund.common.dto.ApiResponse;
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
@RequestMapping("/api/chits/{chitId}/invitations")
@RequiredArgsConstructor
public class InvitationController {

    private final InvitationService invitationService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ChitInvitationResponse>> send(
            @PathVariable UUID chitId,
            @Valid @RequestBody SendInvitationRequest req,
            Authentication auth) {
        UUID staffId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(invitationService.sendInvitation(chitId, staffId, req), "Invitation sent"));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<ChitInvitationResponse>>> list(@PathVariable UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(invitationService.listInvitations(chitId)));
    }

    @GetMapping("/{invId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ChitInvitationResponse>> getDetail(
            @PathVariable UUID chitId,
            @PathVariable UUID invId) {
        return ResponseEntity.ok(ApiResponse.success(invitationService.getInvitationWithResponses(chitId, invId)));
    }

    @PatchMapping("/{invId}/close")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ChitInvitationResponse>> close(
            @PathVariable UUID chitId,
            @PathVariable UUID invId) {
        return ResponseEntity.ok(ApiResponse.success(invitationService.closeInvitation(chitId, invId), "Invitation closed"));
    }

    @PatchMapping("/{invId}/responses/{rid}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<InvitationResponseDTO>> override(
            @PathVariable UUID chitId,
            @PathVariable UUID invId,
            @PathVariable UUID rid,
            @RequestBody OverrideResponseRequest req) {
        return ResponseEntity.ok(ApiResponse.success(invitationService.overrideResponse(invId, rid, req), "Response updated"));
    }

    @PostMapping("/{invId}/responses/{rid}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<InvitationResponseDTO>> approve(
            @PathVariable UUID chitId,
            @PathVariable UUID invId,
            @PathVariable UUID rid,
            Authentication auth) {
        UUID approverId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                invitationService.approveResponse(chitId, invId, rid, approverId), "Response approved"));
    }

    @PostMapping("/{invId}/responses/{rid}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<InvitationResponseDTO>> reject(
            @PathVariable UUID chitId,
            @PathVariable UUID invId,
            @PathVariable UUID rid,
            @RequestBody RejectResponseRequest req,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                invitationService.rejectResponse(invId, rid, adminId, req.getReason()), "Response rejected"));
    }
}

package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.dto.request.RespondToInvitationRequest;
import com.chitfund.chitservice.dto.response.InvitationResponseDTO;
import com.chitfund.chitservice.dto.response.MyInvitationDTO;
import com.chitfund.chitservice.service.InvitationService;
import com.chitfund.common.context.MemberContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/invitations")
@RequiredArgsConstructor
public class MemberInvitationController {

    private final InvitationService invitationService;

    @GetMapping("/my")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<List<MyInvitationDTO>>> getMyInvitations() {
        String memberCtx = MemberContext.get();
        if (memberCtx == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Member context not found");
        }
        UUID memberId = UUID.fromString(memberCtx);
        return ResponseEntity.ok(ApiResponse.success(invitationService.getMyInvitations(memberId)));
    }

    @PostMapping("/{invId}/respond")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<InvitationResponseDTO>> respond(
            @PathVariable UUID invId,
            @Valid @RequestBody RespondToInvitationRequest req) {
        String memberCtx = MemberContext.get();
        if (memberCtx == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "Member context not found");
        }
        UUID memberId = UUID.fromString(memberCtx);
        return ResponseEntity.ok(ApiResponse.success(
                invitationService.respondToInvitation(invId, memberId, req), "Response submitted"));
    }
}

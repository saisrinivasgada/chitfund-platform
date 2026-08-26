package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.dto.request.CloseAuctionRequest;
import com.chitfund.chitservice.dto.request.ExtendAuctionRequest;
import com.chitfund.chitservice.dto.request.OpenAuctionRequest;
import com.chitfund.chitservice.dto.request.PlaceBidRequest;
import com.chitfund.chitservice.dto.response.AuctionSessionResponse;
import com.chitfund.chitservice.service.AuctionService;
import com.chitfund.common.context.MemberContext;
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
@RequestMapping("/api/chits/{chitId}/auction")
@RequiredArgsConstructor
public class AuctionController {

    private final AuctionService auctionService;

    // Admin opens the auction for a specific month
    @PostMapping("/open")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuctionSessionResponse>> openAuction(
            @PathVariable UUID chitId,
            @Valid @RequestBody OpenAuctionRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(auctionService.openAuction(chitId, request, adminId), "Auction opened"));
    }

    // Member places a bid (ONLINE mode only; auth principal is the member)
    // Admin/Manager may pass onBehalfOfMemberId in the body to bid on behalf of a member.
    @PostMapping("/{auctionId}/bid")
    @PreAuthorize("hasAnyRole('MEMBER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuctionSessionResponse>> placeBid(
            @PathVariable UUID chitId,
            @PathVariable UUID auctionId,
            @Valid @RequestBody PlaceBidRequest request,
            Authentication auth) {
        String memberCtx = MemberContext.get();
        String callerRole = auth.getAuthorities().stream()
                .findFirst().map(a -> a.getAuthority().replace("ROLE_", "")).orElse("");
        UUID memberId;
        if (request.getOnBehalfOfMemberId() != null
                && ("ADMIN".equals(callerRole) || "MANAGER".equals(callerRole))) {
            // Admin/Manager placing a proxy bid for a member
            memberId = request.getOnBehalfOfMemberId();
        } else if (memberCtx != null) {
            memberId = UUID.fromString(memberCtx);
        } else {
            memberId = (UUID) auth.getPrincipal();
        }
        return ResponseEntity.ok(
                ApiResponse.success(auctionService.placeBid(chitId, auctionId, request, memberId), "Bid placed"));
    }

    // Get live auction state + all bids (used for initial page load; WebSocket keeps it live after)
    @GetMapping("/{auctionId}")
    public ResponseEntity<ApiResponse<AuctionSessionResponse>> getAuction(
            @PathVariable UUID chitId,
            @PathVariable UUID auctionId) {
        return ResponseEntity.ok(ApiResponse.success(auctionService.getAuction(chitId, auctionId)));
    }

    // List all auction sessions for a chit (one per month)
    @GetMapping
    public ResponseEntity<ApiResponse<List<AuctionSessionResponse>>> listAuctions(
            @PathVariable UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(auctionService.listAuctions(chitId)));
    }

    // Admin extends the timer for an ONLINE auction
    @PatchMapping("/{auctionId}/extend")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuctionSessionResponse>> extendAuction(
            @PathVariable UUID chitId,
            @PathVariable UUID auctionId,
            @Valid @RequestBody ExtendAuctionRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                auctionService.extendAuction(chitId, auctionId, request.getAdditionalMinutes(), adminId),
                "Auction timer extended"));
    }

    // Admin voids a CLOSED auction — reverses winner + payments so a new auction can be opened for same month
    @PostMapping("/{auctionId}/void")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuctionSessionResponse>> voidAuction(
            @PathVariable UUID chitId,
            @PathVariable UUID auctionId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                auctionService.voidAuction(chitId, auctionId, adminId),
                "Auction voided — you can now open a fresh auction for this draw"));
    }

    // Admin closes the auction — triggers winner assignment + payment record creation
    @PostMapping("/{auctionId}/close")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<AuctionSessionResponse>> closeAuction(
            @PathVariable UUID chitId,
            @PathVariable UUID auctionId,
            @RequestBody(required = false) CloseAuctionRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        CloseAuctionRequest req = request != null ? request : new CloseAuctionRequest();
        return ResponseEntity.ok(
                ApiResponse.success(auctionService.closeAuction(chitId, auctionId, req, adminId), "Auction closed"));
    }
}

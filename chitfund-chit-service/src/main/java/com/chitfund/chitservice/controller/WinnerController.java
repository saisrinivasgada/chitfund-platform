package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.dto.request.AssignWinnerRequest;
import com.chitfund.chitservice.dto.response.MonthlyWinnerResponse;
import com.chitfund.chitservice.service.WinnerService;
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
@RequestMapping("/api/chits/{chitId}")
@RequiredArgsConstructor
public class WinnerController {

    private final WinnerService winnerService;

    @PostMapping("/winners")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MonthlyWinnerResponse>> assignWinner(
            @PathVariable UUID chitId,
            @Valid @RequestBody AssignWinnerRequest request,
            Authentication auth) {
        UUID assignedBy = (UUID) auth.getPrincipal();
        String actorRole = auth.getAuthorities().stream()
                .map(a -> a.getAuthority().replace("ROLE_", ""))
                .findFirst()
                .orElse("UNKNOWN");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        winnerService.assignWinner(chitId, request, assignedBy, actorRole), "Winner assigned"));
    }

    @GetMapping("/winners")
    public ResponseEntity<ApiResponse<List<MonthlyWinnerResponse>>> listWinners(@PathVariable UUID chitId) {
        return ResponseEntity.ok(ApiResponse.success(winnerService.listWinners(chitId)));
    }

}

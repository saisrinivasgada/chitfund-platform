package com.chitfund.memberservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.memberservice.dto.request.TeamNoteRequest;
import com.chitfund.memberservice.dto.response.TeamNoteResponse;
import com.chitfund.memberservice.service.TeamNoteService;
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
@RequestMapping("/notes")
@RequiredArgsConstructor
public class TeamNoteController {

    private final TeamNoteService teamNoteService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<TeamNoteResponse>>> getVisible(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        return ResponseEntity.ok(ApiResponse.success(teamNoteService.getVisible(userId, role)));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<TeamNoteResponse>> create(
            @Valid @RequestBody TeamNoteRequest req,
            Authentication auth) {
        UUID userId     = (UUID) auth.getPrincipal();
        String username = (String) auth.getCredentials();
        String role     = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(teamNoteService.create(userId, username != null ? username : userId.toString(), role, req)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<TeamNoteResponse>> update(
            @PathVariable UUID id,
            @Valid @RequestBody TeamNoteRequest req,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(teamNoteService.update(id, userId, req)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable UUID id,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        teamNoteService.delete(id, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}

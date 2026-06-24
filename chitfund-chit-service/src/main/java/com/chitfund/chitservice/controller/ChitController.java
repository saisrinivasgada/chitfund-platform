package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.dto.request.CreateChitRequest;
import com.chitfund.chitservice.dto.request.UpdateChitStatusRequest;
import com.chitfund.chitservice.dto.response.ChitResponse;
import com.chitfund.chitservice.service.ChitService;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.dto.PagedResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/chits")
@RequiredArgsConstructor
public class ChitController {

    private final ChitService chitService;

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ChitResponse>> createChit(
            @Valid @RequestBody CreateChitRequest request,
            Authentication auth) {
        UUID createdBy = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(chitService.createChit(request, createdBy), "Chit created"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ChitResponse>> getChit(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(chitService.getChit(id)));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ChitResponse>>> listChits(
            @RequestParam(required = false) ChitStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return ResponseEntity.ok(ApiResponse.success(chitService.listChits(status, pageable)));
    }

    @GetMapping("/deleted")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PagedResponse<ChitResponse>>> listDeletedChits(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("deletedAt").descending());
        return ResponseEntity.ok(ApiResponse.success(chitService.listDeletedChits(pageable)));
    }

    @GetMapping("/member/{memberId}")
    public ResponseEntity<ApiResponse<List<ChitResponse>>> listChitsForMember(
            @PathVariable UUID memberId,
            @RequestParam(required = false) ChitStatus status) {
        return ResponseEntity.ok(ApiResponse.success(chitService.listChitsForMember(memberId, status)));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ChitResponse>> updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateChitStatusRequest request,
            Authentication auth) {
        request.setUpdatedBy((UUID) auth.getPrincipal());
        return ResponseEntity.ok(ApiResponse.success(chitService.updateStatus(id, request)));
    }

    @PostMapping("/{id}/pause")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ChitResponse>> pauseChit(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(
                chitService.pauseChit(id, (UUID) auth.getPrincipal()), "Chit paused"));
    }

    @PostMapping("/{id}/resume")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ChitResponse>> resumeChit(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(
                chitService.resumeChit(id, (UUID) auth.getPrincipal()), "Chit resumed"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ChitResponse>> deleteChit(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(
                chitService.softDeleteChit(id, (UUID) auth.getPrincipal()), "Chit deleted"));
    }
}

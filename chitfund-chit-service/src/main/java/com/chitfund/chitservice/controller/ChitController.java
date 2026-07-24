package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.dto.request.CreateChitRequest;
import com.chitfund.chitservice.dto.request.UpdateChitNameRequest;
import com.chitfund.chitservice.dto.request.UpdateChitStatusRequest;
import com.chitfund.chitservice.dto.response.ChitResponse;
import com.chitfund.chitservice.dto.response.MonthReservationResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.MonthReservationRepository;
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

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/chits")
@RequiredArgsConstructor
public class ChitController {

    private final ChitService chitService;
    private final MonthReservationRepository reservationRepository;
    private final ChitMapper chitMapper;

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

    @GetMapping("/updated-today")
    @PreAuthorize("hasRole('ADMIN') or hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<List<ChitResponse>>> listUpdatedToday() {
        return ResponseEntity.ok(ApiResponse.success(chitService.listUpdatedToday()));
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

    @PatchMapping("/{id}/name")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ChitResponse>> updateName(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateChitNameRequest request) {
        return ResponseEntity.ok(ApiResponse.success(chitService.updateName(id, request), "Chit name updated"));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ChitResponse>> updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateChitStatusRequest request,
            Authentication auth) {
        request.setUpdatedBy((UUID) auth.getPrincipal());
        return ResponseEntity.ok(ApiResponse.success(chitService.updateStatus(id, request)));
    }

    @PostMapping("/{id}/pause")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<ChitResponse>> pauseChit(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(
                chitService.pauseChit(id, (UUID) auth.getPrincipal()), "Chit paused"));
    }

    @PostMapping("/{id}/resume")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
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

    @GetMapping("/org-reservations")
    @PreAuthorize("hasRole('ADMIN') or hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<List<MonthReservationResponse>>> getOrgReservations() {
        LocalDate today = LocalDate.now();
        List<MonthReservationResponse> list = reservationRepository.findAllOrgHeld()
                .stream()
                .map(r -> {
                    MonthReservationResponse resp = chitMapper.toReservationResponse(r);
                    resp.setChitName(r.getChit().getName());
                    resp.setEligibleToRealize(
                        r.getStatus() == ReservationStatus.RESERVED &&
                        r.getReservationMonth() != null &&
                        !r.getReservationMonth().isAfter(today)
                    );
                    return resp;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(list));
    }
}

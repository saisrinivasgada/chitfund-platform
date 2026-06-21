package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.dto.request.ReservationSlotRequest;
import com.chitfund.chitservice.dto.request.SwapSlotsRequest;
import com.chitfund.chitservice.dto.response.MonthReservationResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.service.ChitService;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Map;

@RestController
@RequestMapping("/api/chits/{chitId}/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private final ChitService chitService;
    private final MonthReservationRepository reservationRepository;
    private final ChitMapper chitMapper;

    @GetMapping
    public ResponseEntity<ApiResponse<List<MonthReservationResponse>>> list(@PathVariable UUID chitId) {
        chitService.findById(chitId); // validates existence
        List<MonthReservationResponse> list = reservationRepository
                .findByChitIdOrderByReservationMonthAscMonthNumberAsc(chitId)
                .stream().map(chitMapper::toReservationResponse).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(list));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> addSlot(
            @PathVariable UUID chitId,
            @Valid @RequestBody ReservationSlotRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        var chit = chitService.findById(chitId);

        long activeSlots = reservationRepository.countByChitIdAndStatusNot(chitId, ReservationStatus.VOIDED);
        if (activeSlots >= chit.getTotalMembers()) {
            throw new BusinessException(ErrorCode.CHIT_AT_CAPACITY,
                    "This chit already has " + activeSlots + " active schedule slots — the maximum for a " + chit.getTotalMembers() + "-member chit. Void an existing slot first to free up a spot.");
        }

        // Use the caller-supplied ordinal (filling a voided slot at its original position),
        // or auto-assign max+1 when adding a brand-new slot at the end.
        int nextNumber = (request.getMonthNumber() != null)
                ? request.getMonthNumber()
                : reservationRepository
                        .findMaxMonthNumberByChitId(chitId)
                        .map(n -> n + 1)
                        .orElse(1);

        com.chitfund.chitservice.domain.enums.ReservationStatus st =
                request.getMemberId() != null
                        ? com.chitfund.chitservice.domain.enums.ReservationStatus.RESERVED
                        : com.chitfund.chitservice.domain.enums.ReservationStatus.UNALLOCATED;

        MonthReservation slot = MonthReservation.builder()
                .chit(chit)
                .memberId(request.getMemberId())
                .monthNumber(nextNumber)
                .reservationMonth(request.getReservationMonth().withDayOfMonth(1))
                .payoutAmount(request.getPayoutAmount())
                .postPayoutContribution(request.getPostPayoutContribution())
                .status(st)
                .createdBy(adminId)
                .build();

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(chitMapper.toReservationResponse(reservationRepository.save(slot)), "Slot added"));
    }

    @PutMapping("/{reservationId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> updateSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            @Valid @RequestBody ReservationSlotRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));

        r.setMemberId(request.getMemberId());
        r.setReservationMonth(request.getReservationMonth().withDayOfMonth(1));
        r.setPayoutAmount(request.getPayoutAmount());
        r.setPostPayoutContribution(request.getPostPayoutContribution());
        r.setStatus(request.getMemberId() != null
                ? ReservationStatus.RESERVED : ReservationStatus.UNALLOCATED);
        r.setUpdatedBy(adminId);

        return ResponseEntity.ok(ApiResponse.success(
                chitMapper.toReservationResponse(reservationRepository.save(r)), "Slot updated"));
    }

    @PatchMapping("/{reservationId}/process")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> processSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));
        if (r.getStatus() != ReservationStatus.RESERVED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only RESERVED slots can be marked as processed");
        }
        r.setStatus(ReservationStatus.PROCESSED);
        r.setUpdatedBy(adminId);
        return ResponseEntity.ok(ApiResponse.success(
                chitMapper.toReservationResponse(reservationRepository.save(r)), "Slot marked as processed"));
    }

    @DeleteMapping("/{reservationId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> removeSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            @RequestParam(required = false) String reason,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));
        r.setStatus(ReservationStatus.VOIDED);
        r.setVoidReason(reason);
        r.setVoidedAt(LocalDateTime.now());
        r.setVoidedBy(adminId);
        r.setUpdatedBy(adminId);
        reservationRepository.save(r);
        return ResponseEntity.ok(ApiResponse.success(null, "Reservation voided"));
    }

    /**
     * Shifts all future (RESERVED + UNALLOCATED) reservation slots forward by one month,
     * starting from the given ordinal. Called immediately after a skip is recorded so that
     * the member who was scheduled for the skipped month is pushed to the next real cycle.
     *
     * Example: skip month 3 → Member B (was at slot 3) shifts to slot 4,
     * Member C (was at slot 4) shifts to slot 5, etc. PROCESSED and VOIDED slots are unchanged.
     */
    @PostMapping("/shift")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Integer>>> shiftReservations(
            @PathVariable UUID chitId,
            @RequestParam int fromMonth,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();

        List<MonthReservation> slots = reservationRepository.findShiftableFromMonth(
                chitId, fromMonth,
                List.of(ReservationStatus.RESERVED, ReservationStatus.UNALLOCATED));

        for (MonthReservation slot : slots) {
            slot.setMonthNumber(slot.getMonthNumber() + 1);
            if (slot.getReservationMonth() != null) {
                slot.setReservationMonth(slot.getReservationMonth().plusMonths(1));
            }
            slot.setUpdatedBy(adminId);
        }
        reservationRepository.saveAll(slots);

        return ResponseEntity.ok(ApiResponse.success(
                Map.of("shifted", slots.size()),
                slots.size() + " reservation slot(s) shifted forward by 1 month"));
    }

    @PostMapping("/swap")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> swapSlots(
            @PathVariable UUID chitId,
            @Valid @RequestBody SwapSlotsRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();

        MonthReservation a = reservationRepository.findById(request.getSlotAId())
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", request.getSlotAId()));
        MonthReservation b = reservationRepository.findById(request.getSlotBId())
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", request.getSlotBId()));

        if (!a.getChit().getId().equals(chitId) || !b.getChit().getId().equals(chitId)) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION, "Both slots must belong to this chit");
        }
        if (a.getStatus() != ReservationStatus.RESERVED || b.getStatus() != ReservationStatus.RESERVED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION, "Only RESERVED slots can be swapped");
        }

        UUID tempMember = a.getMemberId();
        a.setMemberId(b.getMemberId());
        b.setMemberId(tempMember);
        a.setUpdatedBy(adminId);
        b.setUpdatedBy(adminId);

        reservationRepository.save(a);
        reservationRepository.save(b);

        return ResponseEntity.ok(ApiResponse.success(null, "Slots swapped"));
    }

    // Permanently deletes a slot — only allowed if it is already VOIDED.
    // Use this after confirming with the admin; the void audit trail is lost on hard delete.
    @DeleteMapping("/{reservationId}/permanent")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> permanentlyDeleteSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            Authentication auth) {
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));
        if (r.getStatus() != ReservationStatus.VOIDED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only VOIDED slots can be permanently deleted");
        }
        reservationRepository.delete(r);
        return ResponseEntity.ok(ApiResponse.success(null, "Reservation permanently deleted"));
    }
}

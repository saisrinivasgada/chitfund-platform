package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.dto.request.ReservationSlotRequest;
import com.chitfund.chitservice.dto.request.SwapSlotsRequest;
import com.chitfund.chitservice.dto.response.MonthReservationResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.service.ChitService;
import com.chitfund.chitservice.service.PlanLimitChecker;
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

import java.time.LocalDate;
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
    private final AuditClient auditClient;
    private final PlanLimitChecker planLimitChecker;

    @GetMapping
    public ResponseEntity<ApiResponse<List<MonthReservationResponse>>> list(@PathVariable UUID chitId) {
        chitService.findById(chitId); // validates existence
        List<MonthReservationResponse> list = reservationRepository
                .findByChitIdOrderByReservationMonthAscMonthNumberAsc(chitId)
                .stream().map(chitMapper::toReservationResponse).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(list));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> addSlot(
            @PathVariable UUID chitId,
            @Valid @RequestBody ReservationSlotRequest request,
            Authentication auth) {
        planLimitChecker.checkNotExpired();
        UUID adminId = (UUID) auth.getPrincipal();
        var chit = chitService.findById(chitId);

        long activeSlots = reservationRepository.countByChitIdAndStatusNot(chitId, ReservationStatus.VOIDED);
        if (activeSlots >= chit.getCapacity()) {
            throw new BusinessException(ErrorCode.CHIT_AT_CAPACITY,
                    "This chit already has " + activeSlots + " active schedule slots — the maximum for a " + chit.getCapacity() + "-member chit. Void an existing slot first to free up a spot.");
        }

        // Use the caller-supplied ordinal (filling a voided slot at its original position),
        // or auto-assign max+1 when adding a brand-new slot at the end.
        int nextNumber = (request.getMonthNumber() != null)
                ? request.getMonthNumber()
                : reservationRepository
                        .findMaxMonthNumberByChitId(chitId)
                        .map(n -> n + 1)
                        .orElse(1);

        boolean isOrg = Boolean.TRUE.equals(request.getOrgHeld());
        if (isOrg) {
            int limit = chit.getOrgHeldSpotsCount() != null ? chit.getOrgHeldSpotsCount() : 0;
            long current = reservationRepository.countByChitIdAndOrgHeldTrueAndStatusNot(chitId, ReservationStatus.VOIDED);
            if (current >= limit) {
                throw new BusinessException(ErrorCode.CHIT_AT_CAPACITY,
                        "Org-held slot limit reached (" + limit + "). Increase the chit's org-held spots count to add more.");
            }
        }

        ReservationStatus st = (request.getMemberId() != null || isOrg)
                ? ReservationStatus.RESERVED
                : ReservationStatus.UNALLOCATED;

        MonthReservation slot = MonthReservation.builder()
                .chit(chit)
                .memberId(isOrg ? null : request.getMemberId())
                .orgHeld(isOrg)
                .monthNumber(nextNumber)
                .reservationMonth(request.getReservationMonth().withDayOfMonth(1))
                .payoutAmount(request.getPayoutAmount())
                .postPayoutContribution(request.getPostPayoutContribution())
                .status(st)
                .createdBy(adminId)
                .build();

        MonthReservation saved = reservationRepository.save(slot);
        auditClient.log("RESERVATION_SLOT", saved.getId().toString(), chitId.toString(),
                "SLOT_CREATED", adminId.toString(), "ADMIN", null, slotSnapshot(saved),
                com.chitfund.common.context.TenantContext.get());
        if (chit.getStatus() == ChitStatus.ACTIVE && saved.getMemberId() != null) {
            chitService.syncEnrollmentForMember(chit, saved.getMemberId());
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(chitMapper.toReservationResponse(saved), "Slot added"));
    }

    @PutMapping("/{reservationId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> updateSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            @Valid @RequestBody ReservationSlotRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String actorRole = auth.getAuthorities().stream().findFirst()
                .map(a -> a.getAuthority().replace("ROLE_", "")).orElse("ADMIN");
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));

        Map<String, Object> beforeSnap = slotSnapshot(r);
        UUID oldMemberId = r.getMemberId();

        boolean isOrg = Boolean.TRUE.equals(request.getOrgHeld());
        if (isOrg && !r.isOrgHeld()) {
            var chit = chitService.findById(chitId);
            int limit = chit.getOrgHeldSpotsCount() != null ? chit.getOrgHeldSpotsCount() : 0;
            long current = reservationRepository.countByChitIdAndOrgHeldTrueAndStatusNot(chitId, ReservationStatus.VOIDED);
            if (current >= limit) {
                throw new BusinessException(ErrorCode.CHIT_AT_CAPACITY,
                        "Org-held slot limit reached (" + limit + "). Only " + limit + " org-held slot(s) allowed for this chit.");
            }
        }
        r.setMemberId(isOrg ? null : request.getMemberId());
        r.setOrgHeld(isOrg);
        r.setReservationMonth(request.getReservationMonth().withDayOfMonth(1));
        r.setPayoutAmount(request.getPayoutAmount());
        r.setPostPayoutContribution(request.getPostPayoutContribution());
        r.setStatus(request.getMemberId() != null || isOrg
                ? ReservationStatus.RESERVED : ReservationStatus.UNALLOCATED);
        r.setUpdatedBy(adminId);

        MonthReservation saved = reservationRepository.save(r);
        auditClient.log("RESERVATION_SLOT", saved.getId().toString(), chitId.toString(),
                "SLOT_UPDATED", adminId.toString(), actorRole, beforeSnap, slotSnapshot(saved),
                com.chitfund.common.context.TenantContext.get());
        var chit = chitService.findById(chitId);
        if (chit.getStatus() == ChitStatus.ACTIVE) {
            UUID newMemberId = saved.getMemberId();
            if (oldMemberId != null) chitService.syncEnrollmentForMember(chit, oldMemberId);
            if (newMemberId != null && !newMemberId.equals(oldMemberId))
                chitService.syncEnrollmentForMember(chit, newMemberId);
        }
        return ResponseEntity.ok(ApiResponse.success(
                chitMapper.toReservationResponse(saved), "Slot updated"));
    }

    @PatchMapping("/{reservationId}/process")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> processSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String actorRole = auth.getAuthorities().stream().findFirst()
                .map(a -> a.getAuthority().replace("ROLE_", "")).orElse("ADMIN");
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));
        if (r.getStatus() != ReservationStatus.RESERVED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only RESERVED slots can be marked as processed");
        }
        r.setStatus(ReservationStatus.PROCESSED);
        r.setUpdatedBy(adminId);
        MonthReservation saved = reservationRepository.save(r);
        auditClient.log("RESERVATION_SLOT", saved.getId().toString(), chitId.toString(),
                "SLOT_PROCESSED", adminId.toString(), actorRole, null, slotSnapshot(saved),
                com.chitfund.common.context.TenantContext.get());
        return ResponseEntity.ok(ApiResponse.success(
                chitMapper.toReservationResponse(saved), "Slot marked as processed"));
    }

    @DeleteMapping("/{reservationId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> removeSlot(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            @RequestParam(required = false) String reason,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));
        Map<String, Object> beforeVoidSnap = slotSnapshot(r);

        UUID voidedMemberId = r.getMemberId();
        r.setStatus(ReservationStatus.VOIDED);
        r.setVoidReason(reason);
        r.setVoidedAt(LocalDateTime.now());
        r.setVoidedBy(adminId);
        r.setUpdatedBy(adminId);
        MonthReservation saved = reservationRepository.save(r);
        auditClient.log("RESERVATION_SLOT", saved.getId().toString(), chitId.toString(),
                "SLOT_VOIDED", adminId.toString(), "ADMIN", beforeVoidSnap, slotSnapshot(saved),
                com.chitfund.common.context.TenantContext.get());
        if (voidedMemberId != null) {
            var chit = chitService.findById(chitId);
            if (chit.getStatus() == ChitStatus.ACTIVE)
                chitService.syncEnrollmentForMember(chit, voidedMemberId);
        }
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
                slots.size() + " reservation slot(s) shifted forward by 1 draw"));
    }

    @PostMapping("/swap")
    @PreAuthorize("hasRole('ADMIN')")
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

        UUID memberA = a.getMemberId();
        UUID memberB = b.getMemberId();
        boolean orgA = a.isOrgHeld();
        boolean orgB = b.isOrgHeld();

        a.setMemberId(memberB);
        a.setOrgHeld(orgB);
        b.setMemberId(memberA);
        b.setOrgHeld(orgA);
        a.setUpdatedBy(adminId);
        b.setUpdatedBy(adminId);

        reservationRepository.save(a);
        reservationRepository.save(b);

        String tenantId = com.chitfund.common.context.TenantContext.get();
        auditClient.log("RESERVATION_SLOT", a.getId().toString(), chitId.toString(),
                "SLOT_SWAPPED", adminId.toString(), "ADMIN",
                java.util.Map.of("memberId", String.valueOf(memberA), "swappedWithSlot", b.getId().toString()),
                java.util.Map.of("memberId", String.valueOf(memberB), "swappedWithSlot", b.getId().toString()),
                tenantId);
        auditClient.log("RESERVATION_SLOT", b.getId().toString(), chitId.toString(),
                "SLOT_SWAPPED", adminId.toString(), "ADMIN",
                java.util.Map.of("memberId", String.valueOf(memberB), "swappedWithSlot", a.getId().toString()),
                java.util.Map.of("memberId", String.valueOf(memberA), "swappedWithSlot", a.getId().toString()),
                tenantId);

        return ResponseEntity.ok(ApiResponse.success(null, "Slots swapped"));
    }

    @PostMapping("/{reservationId}/realize-org")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<MonthReservationResponse>> realizeOrgPayout(
            @PathVariable UUID chitId,
            @PathVariable UUID reservationId,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        MonthReservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation", reservationId));

        if (!r.isOrgHeld()) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only org-held slots can be realized to treasury");
        }
        if (r.getStatus() != ReservationStatus.RESERVED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Slot is already " + r.getStatus() + " — only RESERVED slots can be realized");
        }
        if (r.getReservationMonth() != null && r.getReservationMonth().isAfter(LocalDate.now())) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot realize payout before the draw month arrives (" + r.getReservationMonth() + ")");
        }

        r.setStatus(ReservationStatus.PROCESSED);
        r.setUpdatedBy(adminId);
        MonthReservation saved = reservationRepository.save(r);

        auditClient.log("ORG_RESERVATION", saved.getId().toString(), chitId.toString(),
                "ORG_PAYOUT_REALIZED", adminId.toString(), "ADMIN",
                Map.of("status", "RESERVED"),
                Map.of("status", "PROCESSED", "payoutAmount", String.valueOf(saved.getPayoutAmount())),
                com.chitfund.common.context.TenantContext.get());

        return ResponseEntity.ok(ApiResponse.success(
                chitMapper.toReservationResponse(saved), "Org payout realized to treasury"));
    }

    private Map<String, Object> slotSnapshot(MonthReservation r) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        if (r.getMemberId() != null) m.put("memberId", r.getMemberId().toString());
        m.put("status", r.getStatus() != null ? r.getStatus().name() : null);
        if (r.getPayoutAmount() != null) m.put("payoutAmount", r.getPayoutAmount());
        if (r.getReservationMonth() != null) m.put("reservationMonth", r.getReservationMonth().toString());
        if (r.getMonthNumber() != null) m.put("monthNumber", r.getMonthNumber());
        m.put("orgHeld", r.isOrgHeld());
        return m;
    }

    // Permanently deletes a slot — only allowed if it is already VOIDED.
    // Use this after confirming with the admin; the void audit trail is lost on hard delete.
    @DeleteMapping("/{reservationId}/permanent")
    @PreAuthorize("hasRole('ADMIN')")
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

package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.dto.response.ChitEnrollmentResponse;
import com.chitfund.chitservice.dto.response.ChitResponse;
import com.chitfund.chitservice.dto.response.MonthReservationResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Internal endpoints called by payment-service SettlementService.
 * Not behind JWT — authenticated via X-Internal-Key header.
 *
 * WHY a separate controller for internal endpoints?
 * Clean separation of concerns: these endpoints have different security rules
 * (key-based, not JWT) and different consumers (internal services, not users).
 * Grouping them here makes SecurityConfig whitelisting and audit easier.
 *
 * IMPORTANT: These endpoints return ALL enrollments (active AND inactive)
 * because a COMPLETED chit has inactive enrollments that may still have
 * open PaymentRecords requiring settlement.
 */
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
@Slf4j
public class InternalSettlementController {

    private final ChitEnrollmentRepository enrollmentRepository;
    private final ChitRepository chitRepository;
    private final MonthReservationRepository reservationRepository;
    private final ChitMapper chitMapper;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Returns ALL enrollments for a member (active and inactive) across ALL chits.
     * Used by payment-service SettlementService to determine which chits to include.
     *
     * WHY include inactive enrollments?
     * A completed chit sets enrollment.active = false when the chit ends,
     * but the member may still have OUTSTANDING PaymentRecords in it.
     * Settlement must cover completed chits too.
     */
    @GetMapping("/enrollments/member/{memberId}")
    public ResponseEntity<?> getEnrollmentsForMember(
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Find all enrollments — active AND inactive (settlement covers completed chits too)
        List<ChitEnrollment> enrollments = enrollmentRepository.findAllByMemberId(memberId);

        List<ChitEnrollmentResponse> responses = enrollments.stream()
                .map(chitMapper::toEnrollmentResponse)
                .collect(Collectors.toList());

        log.debug("Internal: returning {} enrollments for member {}", responses.size(), memberId);
        return ResponseEntity.ok(ApiResponse.success(responses));
    }

    /**
     * Returns chit details by ID.
     * Internal version bypasses auth — used by settlement service to get chit config.
     */
    @GetMapping("/chits/{chitId}")
    public ResponseEntity<?> getChit(
            @PathVariable UUID chitId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Chit chit = chitRepository.findById(chitId)
                .orElseThrow(() -> new ResourceNotFoundException("Chit", chitId));

        // Map manually to include all fields needed by settlement service
        // (ChitMapper ignores enrolledCount/winnersAssigned — that's fine here)
        ChitResponse response = chitMapper.toResponse(chit);

        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Returns all MonthReservation rows for a member in a specific chit.
     * Returns all statuses (RESERVED, PROCESSED, VOIDED) — service filters as needed.
     */
    @GetMapping("/reservations/chit/{chitId}/member/{memberId}")
    public ResponseEntity<?> getReservationsForMemberInChit(
            @PathVariable UUID chitId,
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<MonthReservationResponse> responses = reservationRepository
                .findByChitIdAndMemberId(chitId, memberId)
                .stream()
                .map(chitMapper::toReservationResponse)
                .collect(Collectors.toList());

        log.debug("Internal: returning {} reservations for member {} in chit {}", responses.size(), memberId, chitId);
        return ResponseEntity.ok(ApiResponse.success(responses));
    }
}

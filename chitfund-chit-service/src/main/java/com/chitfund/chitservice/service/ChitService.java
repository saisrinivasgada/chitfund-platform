package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.chitservice.dto.request.CreateChitRequest;
import com.chitfund.chitservice.dto.request.ReservationSlotRequest;
import com.chitfund.chitservice.dto.request.UpdateChitStatusRequest;
import com.chitfund.chitservice.dto.response.ChitResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.common.dto.PagedResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class ChitService {

    private final ChitRepository chitRepository;
    private final ChitEnrollmentRepository enrollmentRepository;
    private final MonthlyWinnerRepository winnerRepository;
    private final MonthReservationRepository reservationRepository;
    private final ChitMapper chitMapper;
    private final ChitAttributeService attributeService;
    private final NotificationClient notificationClient;

    @Transactional
    public ChitResponse createChit(CreateChitRequest req, UUID createdBy) {
        BigDecimal installment = req.getInstallmentAmount() != null
                ? req.getInstallmentAmount()
                : req.getChitValue().divide(BigDecimal.valueOf(req.getNumberOfMembers()), 2, RoundingMode.HALF_UP);

        WinnerSelectionMode mode = req.getWinnerSelectionMode() != null
                ? req.getWinnerSelectionMode()
                : WinnerSelectionMode.valueOf(req.getChitType().name());

        LocalDate endDate = req.getStartDate() != null
                ? req.getStartDate().plusMonths(req.getNumberOfMonths())
                : null;

        Chit chit = Chit.builder()
                .chitType(req.getChitType())
                .name(req.getName())
                .description(req.getDescription())
                .chitValue(req.getChitValue())
                .installmentAmount(installment)
                .totalAmount(req.getChitValue())
                .totalMembers(req.getNumberOfMembers())
                .durationMonths(req.getNumberOfMonths())
                .monthlyDueDate(req.getMonthlyDueDate())
                .winnerSelectionMode(mode)
                .startDate(req.getStartDate())
                .endDate(endDate)
                .postPayoutContributionEnabled(req.isPostPayoutContributionEnabled())
                .defaultPostPayoutContribution(req.getDefaultPostPayoutContribution())
                .adminHeldSpotsCount(req.getAdminHeldSpotsCount() != null ? req.getAdminHeldSpotsCount() : 0)
                .createdBy(createdBy)
                .build();

        chit = chitRepository.save(chit);

        if (req.getReservationSchedule() != null && !req.getReservationSchedule().isEmpty()) {
            // Admin supplied a (partial or full) schedule — save as-is
            saveReservationSlots(chit, req.getReservationSchedule(), createdBy);
        } else if (chit.getChitType() == com.chitfund.chitservice.domain.enums.ChitType.RESERVATION
                && chit.getStartDate() != null) {
            // No schedule provided but start date is known — pre-populate every month as
            // UNALLOCATED so the Schedule tab shows all rows immediately.
            autoGenerateUnallocatedSlots(chit, createdBy);
        }

        return enrich(chit);
    }

    public ChitResponse getChit(UUID id) {
        return enrich(findById(id));
    }

    public PagedResponse<ChitResponse> listChits(ChitStatus status, Pageable pageable) {
        var page = (status != null)
                ? chitRepository.findByStatusAndDeletedAtIsNull(status, pageable)
                : chitRepository.findByDeletedAtIsNull(pageable);
        return PagedResponse.from(page.map(this::enrich));
    }

    public PagedResponse<ChitResponse> listDeletedChits(Pageable pageable) {
        return PagedResponse.from(chitRepository.findByDeletedAtIsNotNull(pageable).map(this::enrich));
    }

    public List<ChitResponse> listChitsForMember(UUID memberId, ChitStatus status) {
        List<UUID> chitIds = enrollmentRepository.findDistinctChitIdsByMemberId(memberId);
        if (chitIds.isEmpty()) return List.of();
        List<Chit> chits = (status != null)
                ? chitRepository.findByIdInAndStatusAndDeletedAtIsNull(chitIds, status)
                : chitRepository.findByIdInAndDeletedAtIsNull(chitIds);
        return chits.stream().map(this::enrich).toList();
    }

    @Transactional
    public ChitResponse updateStatus(UUID id, UpdateChitStatusRequest request) {
        Chit chit = findById(id);
        boolean activatingFromDraft = request.getStatus() == ChitStatus.ACTIVE
                && chit.getStatus() == ChitStatus.DRAFT;
        boolean completing = request.getStatus() == ChitStatus.COMPLETED;
        boolean revertingToDraft = request.getStatus() == ChitStatus.DRAFT
                && chit.getStatus() == ChitStatus.ACTIVE;
        chit.transitionTo(request.getStatus());
        chit.setUpdatedBy(request.getUpdatedBy());
        if (activatingFromDraft && request.getStartDate() != null && chit.getStartDate() == null) {
            chit.setStartDate(request.getStartDate());
            chit.setEndDate(request.getStartDate().plusMonths(chit.getDurationMonths()));
        }
        ChitResponse response = enrich(chitRepository.save(chit));
        if (activatingFromDraft) {
            syncEnrollmentsFromSchedule(chit);
            sendChitStatusNotifications(chit, "CHIT_ACTIVATED",
                    "Chit Activated — " + chit.getName(),
                    "Your chit '" + chit.getName() + "' is now active. Payments will begin as scheduled.");
        } else if (completing) {
            sendChitStatusNotifications(chit, "CHIT_COMPLETED",
                    "Chit Completed — " + chit.getName(),
                    "Your chit '" + chit.getName() + "' has been completed. Thank you for participating!");
        } else if (revertingToDraft) {
            // Clear enrollments so admin can freely edit the schedule and re-activate
            List<ChitEnrollment> existing = enrollmentRepository.findByChitIdAndActiveTrue(chit.getId());
            existing.forEach(e -> e.setActive(false));
            enrollmentRepository.saveAll(existing);
        }
        return response;
    }

    private void sendChitStatusNotifications(Chit chit, String type, String title, String message) {
        try {
            List<String> memberIds = enrollmentRepository.findActiveMemberIdsByChitId(chit.getId())
                    .stream().distinct().map(UUID::toString).toList();
            if (!memberIds.isEmpty()) {
                notificationClient.notifyUsers(memberIds, type, title, message,
                        "CHIT", chit.getId().toString(), "/member");
            }
            notificationClient.notifyRole("MANAGER", type,
                    title.replace("Your chit", "Chit"),
                    "Chit '" + chit.getName() + "' status changed — " + type.replace("CHIT_", "").toLowerCase() + ".",
                    "CHIT", chit.getId().toString(), "/chits");
        } catch (Exception ex) {
            log.warn("Could not send chit-status notifications for chit {}: {}", chit.getId(), ex.getMessage());
        }
    }

    private void syncEnrollmentsFromSchedule(Chit chit) {
        List<ChitEnrollment> existing = enrollmentRepository.findByChitIdAndActiveTrue(chit.getId());
        existing.forEach(e -> e.setActive(false));
        enrollmentRepository.saveAll(existing);

        List<ChitEnrollment> fromSchedule = reservationRepository
                .findByChitIdOrderByReservationMonthAscMonthNumberAsc(chit.getId())
                .stream()
                .filter(r -> r.getMemberId() != null
                        && r.getStatus() != ReservationStatus.VOIDED
                        && r.getStatus() != ReservationStatus.UNALLOCATED)
                .map(r -> ChitEnrollment.builder()
                        .chit(chit)
                        .memberId(r.getMemberId())
                        .build())
                .toList();
        enrollmentRepository.saveAll(fromSchedule);
        log.info("Chit {} activated — synced {} enrollment(s) from schedule ({} existing deactivated)",
                chit.getId(), fromSchedule.size(), existing.size());
    }

    @Transactional
    public ChitResponse pauseChit(UUID id, UUID adminId) {
        Chit chit = findById(id);
        chit.transitionTo(ChitStatus.PAUSED);
        chit.setPausedAt(LocalDateTime.now());
        chit.setPausedBy(adminId);
        chit.setUpdatedBy(adminId);
        return enrich(chitRepository.save(chit));
    }

    @Transactional
    public ChitResponse resumeChit(UUID id, UUID adminId) {
        Chit chit = findById(id);
        if (chit.getStatus() != ChitStatus.PAUSED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Chit is not paused — cannot resume");
        }
        // Count months elapsed since pause to shift end date
        if (chit.getPausedAt() != null && chit.getEndDate() != null) {
            long pausedMonths = java.time.temporal.ChronoUnit.MONTHS.between(
                    chit.getPausedAt().toLocalDate(), LocalDate.now());
            if (pausedMonths > 0) {
                chit.setTotalPausedMonths(chit.getTotalPausedMonths() + (int) pausedMonths);
                chit.setEndDate(chit.getEndDate().plusMonths(pausedMonths));
            }
        }
        chit.transitionTo(ChitStatus.ACTIVE);
        chit.setPausedAt(null);
        chit.setUpdatedBy(adminId);
        return enrich(chitRepository.save(chit));
    }

    @Transactional
    public ChitResponse softDeleteChit(UUID id, UUID adminId) {
        Chit chit = findById(id);
        chit.transitionTo(ChitStatus.DELETED);
        chit.setDeletedAt(LocalDateTime.now());
        chit.setDeletedBy(adminId);
        chit.setUpdatedBy(adminId);
        return enrich(chitRepository.save(chit));
    }

    // ── Reservation schedule helpers ──────────────────────────────────────────

    @Transactional
    public List<MonthReservation> saveReservationSlots(
            Chit chit, List<ReservationSlotRequest> slots, UUID createdBy) {
        int[] counter = {1};
        List<MonthReservation> entities = slots.stream().map(slot -> {
            // UNALLOCATED if no member set OR payout is not yet decided
            ReservationStatus st = (slot.getMemberId() != null && slot.getPayoutAmount() != null)
                    ? ReservationStatus.RESERVED
                    : ReservationStatus.UNALLOCATED;
            return MonthReservation.builder()
                    .chit(chit)
                    .memberId(slot.getMemberId())
                    .monthNumber(counter[0]++)
                    .reservationMonth(slot.getReservationMonth().withDayOfMonth(1))
                    .payoutAmount(slot.getPayoutAmount())       // may be null
                    .postPayoutContribution(slot.getPostPayoutContribution())
                    .status(st)
                    .createdBy(createdBy)
                    .build();
        }).toList();
        return reservationRepository.saveAll(entities);
    }

    // Pre-populate every month with an UNALLOCATED slot so the Schedule tab
    // is not empty when admin skips the schedule step during chit creation.
    private void autoGenerateUnallocatedSlots(Chit chit, UUID createdBy) {
        List<MonthReservation> slots = new java.util.ArrayList<>();
        for (int i = 0; i < chit.getDurationMonths(); i++) {
            LocalDate month = chit.getStartDate().plusMonths(i).withDayOfMonth(1);
            slots.add(MonthReservation.builder()
                    .chit(chit)
                    .monthNumber(i + 1)
                    .reservationMonth(month)
                    .status(ReservationStatus.UNALLOCATED)
                    .createdBy(createdBy)
                    .build());
        }
        reservationRepository.saveAll(slots);
    }

    public Chit findById(UUID id) {
        return chitRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Chit", id));
    }

    private ChitResponse enrich(Chit chit) {
        ChitResponse response = chitMapper.toResponse(chit);
        response.setEnrolledCount(enrollmentRepository.countByChitIdAndActiveTrue(chit.getId()));
        response.setWinnersAssigned(winnerRepository.countByChitId(chit.getId()));
        response.setAttributes(attributeService.getAll(chit));
        return response;
    }
}

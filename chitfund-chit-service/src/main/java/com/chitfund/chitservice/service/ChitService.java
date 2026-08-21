package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.common.context.TenantContext;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.chitservice.dto.request.CreateChitRequest;
import com.chitfund.chitservice.dto.request.ReservationSlotRequest;
import com.chitfund.chitservice.dto.request.UpdateChitDetailsRequest;
import com.chitfund.chitservice.dto.request.UpdateChitNameRequest;
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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

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
    private final PlanLimitChecker planLimitChecker;

    @Transactional
    public ChitResponse createChit(CreateChitRequest req, UUID createdBy) {
        planLimitChecker.checkCanCreateChit(req.getChitType());

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
                .tenantId(TenantContext.get())
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
                .orgHeldSpotsCount(req.getOrgHeldSpotsCount() != null ? req.getOrgHeldSpotsCount() : 0)
                .createdBy(createdBy)
                .build();

        chit = chitRepository.save(chit);

        if (req.getReservationSchedule() != null && !req.getReservationSchedule().isEmpty()) {
            // Admin supplied a (partial or full) schedule — save as-is
            saveReservationSlots(chit, req.getReservationSchedule(), createdBy);
        } else if ((chit.getChitType() == com.chitfund.chitservice.domain.enums.ChitType.RESERVATION
                || chit.getChitType() == com.chitfund.chitservice.domain.enums.ChitType.LOTTERY)
                && chit.getStartDate() != null) {
            // Pre-populate every draw slot as UNALLOCATED so the Schedule tab shows all rows.
            // Reservation chits: admin assigns members to slots. Lottery chits: admin sets payout amounts.
            autoGenerateUnallocatedSlots(chit, createdBy);
        }

        return enrich(chit);
    }

    public ChitResponse getChit(UUID id) {
        Chit chit = findById(id);
        String tid = TenantContext.get();
        if (tid != null && !tid.equals(chit.getTenantId())) {
            throw new com.chitfund.common.exception.ResourceNotFoundException("Chit", id);
        }
        return enrich(chit);
    }

    public PagedResponse<ChitResponse> listChits(ChitStatus status, Pageable pageable) {
        return listChits(status, null, pageable);
    }

    public PagedResponse<ChitResponse> listChits(ChitStatus status, String tenantFilter, Pageable pageable) {
        String tid = (tenantFilter != null && !tenantFilter.isBlank()) ? tenantFilter : TenantContext.get();
        var page = (status != null)
                ? chitRepository.findByTenantIdAndStatusAndDeletedAtIsNull(tid, status, pageable)
                : chitRepository.findByTenantIdAndDeletedAtIsNull(tid, pageable);
        return pagedResponse(page, enrichPage(page.toList()));
    }

    public PagedResponse<ChitResponse> listDeletedChits(Pageable pageable) {
        var page = chitRepository.findByTenantIdAndDeletedAtIsNotNull(TenantContext.get(), pageable);
        return pagedResponse(page, enrichPage(page.toList()));
    }

    public List<ChitResponse> listChitsForMember(UUID memberId, ChitStatus status) {
        List<UUID> chitIds = enrollmentRepository.findDistinctChitIdsByMemberId(memberId);
        if (chitIds.isEmpty()) return List.of();
        String tid = TenantContext.get();
        List<Chit> chits = (status != null)
                ? chitRepository.findByTenantIdAndIdInAndStatusAndDeletedAtIsNull(tid, chitIds, status)
                : chitRepository.findByTenantIdAndIdInAndDeletedAtIsNull(tid, chitIds);
        return enrichPage(chits);
    }

    private <C extends org.springframework.data.domain.Page<?>> PagedResponse<ChitResponse> pagedResponse(
            C page, List<ChitResponse> content) {
        return PagedResponse.<ChitResponse>builder()
                .content(content)
                .pageNumber(page.getNumber())
                .pageSize(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .last(page.isLast())
                .first(page.isFirst())
                .build();
    }

    // Batch-enrich a list of chits with 2 GROUP BY queries instead of 2N per-row queries.
    private List<ChitResponse> enrichPage(List<Chit> chits) {
        if (chits.isEmpty()) return List.of();
        List<UUID> ids = chits.stream().map(Chit::getId).toList();

        Map<UUID, Long> enrolledCounts = enrollmentRepository.countActiveByChitIds(ids).stream()
                .collect(Collectors.toMap(
                        m -> (UUID) m.get("chitId"),
                        m -> ((Number) m.get("cnt")).longValue(),
                        (a, b) -> a));
        Map<UUID, Long> winnerCounts = winnerRepository.countByChitIds(ids).stream()
                .collect(Collectors.toMap(
                        m -> (UUID) m.get("chitId"),
                        m -> ((Number) m.get("cnt")).longValue(),
                        (a, b) -> a));

        return chits.stream().map(chit -> {
            ChitResponse r = chitMapper.toResponse(chit);
            r.setEnrolledCount(enrolledCounts.getOrDefault(chit.getId(), 0L));
            r.setWinnersAssigned(winnerCounts.getOrDefault(chit.getId(), 0L));
            r.setAttributes(attributeService.getAll(chit));
            return r;
        }).toList();
    }

    @Transactional
    public ChitResponse updateStatus(UUID id, UpdateChitStatusRequest request) {
        Chit chit = findById(id);
        boolean activatingFromDraft = request.getStatus() == ChitStatus.ACTIVE
                && chit.getStatus() == ChitStatus.DRAFT;

        if (activatingFromDraft) {
            planLimitChecker.checkCanActivateChit();
        }
        boolean completing = request.getStatus() == ChitStatus.COMPLETED;
        boolean revertingToDraft = request.getStatus() == ChitStatus.DRAFT
                && chit.getStatus() == ChitStatus.ACTIVE;

        // Once any draw has been conducted, the chit cannot go back to DRAFT.
        // Draws are permanent financial records — enrollment and payment history depend on them.
        if (revertingToDraft && winnerRepository.countByChitId(id) > 0) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot revert to DRAFT — this chit already has " + winnerRepository.countByChitId(id)
                            + " draw(s) completed. Draws are permanent financial records.");
        }

        chit.transitionTo(request.getStatus());
        chit.setUpdatedBy(request.getUpdatedBy());
        if (activatingFromDraft && request.getStartDate() != null) {
            chit.setStartDate(request.getStartDate());
            chit.setEndDate(request.getStartDate().plusMonths(chit.getDurationMonths()));
        }
        ChitResponse response = enrich(chitRepository.save(chit));
        if (activatingFromDraft) {
            syncEnrollmentsFromSchedule(chit);
            final Chit activatedChit = chit;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    CompletableFuture.runAsync(() ->
                        sendChitStatusNotifications(activatedChit, "CHIT_ACTIVATED",
                                "Chit Activated — " + activatedChit.getName(),
                                "Your chit '" + activatedChit.getName() + "' is now active. Payments will begin as scheduled."));
                }
            });
        } else if (completing) {
            final Chit completedChit = chit;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    CompletableFuture.runAsync(() -> {
                        sendChitStatusNotifications(completedChit, "CHIT_COMPLETED",
                                "Chit Completed — " + completedChit.getName(),
                                "Your chit '" + completedChit.getName() + "' has been completed. Thank you for participating!");
                        notificationClient.closeDrawsForChit(completedChit.getId());
                    });
                }
            });
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
                // In-app bell notification via notification-service (resolves memberId → userId)
                notificationClient.notifyUsersInApp(memberIds, type, title, message, "/member/chits/" + chit.getId());
                // Legacy payment-service channel (role-based push, kept for existing admin tooling)
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
    public void syncEnrollmentForMember(Chit chit, UUID memberId) {
        boolean hasActiveSlot = reservationRepository.existsByChitIdAndMemberIdAndStatusNot(
                chit.getId(), memberId, ReservationStatus.VOIDED);
        List<ChitEnrollment> existing = enrollmentRepository.findByChitIdAndMemberIdAndActiveTrue(chit.getId(), memberId);
        if (hasActiveSlot) {
            if (existing.isEmpty()) {
                enrollmentRepository.save(ChitEnrollment.builder().chit(chit).memberId(memberId).build());
                log.info("Chit {} — enrolled member {} after slot assignment", chit.getId(), memberId);
            }
        } else {
            existing.forEach(e -> e.setActive(false));
            if (!existing.isEmpty()) {
                enrollmentRepository.saveAll(existing);
                log.info("Chit {} — deactivated enrollment for member {} (no active slots)", chit.getId(), memberId);
            }
        }
    }

    @Transactional
    public ChitResponse updateName(UUID id, UpdateChitNameRequest request) {
        Chit chit = findById(id);
        chit.setName(request.getName().trim());
        if (request.getDescription() != null) {
            chit.setDescription(request.getDescription().trim().isEmpty() ? null : request.getDescription().trim());
        }
        chit = chitRepository.save(chit);
        log.info("Chit {} name updated to '{}'", id, chit.getName());
        return enrich(chit);
    }

    @Transactional
    public ChitResponse updateDetails(UUID id, UpdateChitDetailsRequest req, UUID updatedBy) {
        Chit chit = findById(id);
        ChitStatus status = chit.getStatus();
        if (status == ChitStatus.COMPLETED || status == ChitStatus.CANCELLED || status == ChitStatus.DELETED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot edit details of a " + status + " chit");
        }
        boolean isDraft = status == ChitStatus.DRAFT;

        if (req.getName() != null && !req.getName().isBlank()) {
            chit.setName(req.getName().trim());
        }
        if (req.getDescription() != null) {
            chit.setDescription(req.getDescription().isBlank() ? null : req.getDescription().trim());
        }
        if (req.getChitValue() != null) {
            chit.setChitValue(req.getChitValue());
            chit.setTotalAmount(req.getChitValue());
        }
        if (req.getInstallmentAmount() != null) {
            chit.setInstallmentAmount(req.getInstallmentAmount());
        } else if (req.getChitValue() != null && chit.getTotalMembers() != null && chit.getTotalMembers() > 0) {
            chit.setInstallmentAmount(chit.getChitValue()
                    .divide(BigDecimal.valueOf(chit.getTotalMembers()), 2, RoundingMode.HALF_UP));
        }
        if (req.getMonthlyDueDate() != null) chit.setMonthlyDueDate(req.getMonthlyDueDate());
        if (req.getPostPayoutContributionEnabled() != null)
            chit.setPostPayoutContributionEnabled(req.getPostPayoutContributionEnabled());
        if (req.getDefaultPostPayoutContribution() != null)
            chit.setDefaultPostPayoutContribution(req.getDefaultPostPayoutContribution());

        if (isDraft) {
            if (req.getNumberOfMembers() != null) chit.setTotalMembers(req.getNumberOfMembers());
            if (req.getNumberOfMonths() != null) chit.setDurationMonths(req.getNumberOfMonths());
            if (req.getOrgHeldSpotsCount() != null) chit.setOrgHeldSpotsCount(req.getOrgHeldSpotsCount());
            if (req.getStartDate() != null) {
                chit.setStartDate(req.getStartDate());
                chit.setEndDate(req.getStartDate().plusMonths(chit.getDurationMonths()));
            }
        }

        chit.setUpdatedBy(updatedBy);
        return enrich(chitRepository.save(chit));
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
            boolean isOrg = Boolean.TRUE.equals(slot.getOrgHeld());
            ReservationStatus st = (slot.getMemberId() != null || isOrg)
                    ? ReservationStatus.RESERVED
                    : ReservationStatus.UNALLOCATED;
            return MonthReservation.builder()
                    .chit(chit)
                    .memberId(isOrg ? null : slot.getMemberId())
                    .orgHeld(isOrg)
                    .monthNumber(counter[0]++)
                    .reservationMonth(slot.getReservationMonth().withDayOfMonth(1))
                    .payoutAmount(slot.getPayoutAmount())
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

    public List<ChitResponse> listUpdatedToday() {
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();
        LocalDateTime twelveHoursAgo = LocalDateTime.now().minusHours(12);
        LocalDateTime since = twelveHoursAgo.isBefore(startOfDay) ? twelveHoursAgo : startOfDay;
        return chitRepository.findByTenantIdAndUpdatedAtBetweenAndDeletedAtIsNull(
                        TenantContext.get(), since, LocalDateTime.now().plusMinutes(1))
                .stream().map(this::enrich).toList();
    }

    private ChitResponse enrich(Chit chit) {
        ChitResponse response = chitMapper.toResponse(chit);
        response.setEnrolledCount(enrollmentRepository.countByChitIdAndActiveTrue(chit.getId()));
        response.setWinnersAssigned(winnerRepository.countByChitId(chit.getId()));
        response.setAttributes(attributeService.getAll(chit));
        return response;
    }
}

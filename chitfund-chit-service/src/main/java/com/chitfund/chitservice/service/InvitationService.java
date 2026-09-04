package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.entity.ChitInvitation;
import com.chitfund.chitservice.domain.entity.InvitationResponse;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.InvitationStatus;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.domain.enums.ResponseStatus;
import com.chitfund.chitservice.dto.request.OverrideResponseRequest;
import com.chitfund.chitservice.dto.request.RespondToInvitationRequest;
import com.chitfund.chitservice.dto.request.SendInvitationRequest;
import com.chitfund.chitservice.dto.response.ChitInvitationResponse;
import com.chitfund.chitservice.dto.response.InvitationResponseDTO;
import com.chitfund.chitservice.dto.response.MyInvitationDTO;
import com.chitfund.chitservice.dto.response.SlotInfo;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitInvitationRepository;
import com.chitfund.chitservice.repository.InvitationResponseRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class InvitationService {

    private final ChitService chitService;
    private final ChitInvitationRepository invitationRepository;
    private final InvitationResponseRepository responseRepository;
    private final ChitEnrollmentRepository enrollmentRepository;
    private final MonthReservationRepository reservationRepository;
    private final NotificationClient notificationClient;
    private final AuditClient auditClient;
    private final ObjectMapper objectMapper;

    @Transactional
    public ChitInvitationResponse sendInvitation(UUID chitId, UUID createdBy, SendInvitationRequest req) {
        Chit chit = chitService.findById(chitId);
        if (chit.getStatus() != ChitStatus.DRAFT && chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_EDITABLE,
                    "Invitations can only be sent for DRAFT or ACTIVE chits");
        }

        // Block if no spots remain — invitations would be pointless
        if (chit.getChitType() == ChitType.RESERVATION) {
            long available = reservationRepository.countByChitIdAndStatus(chitId, ReservationStatus.UNALLOCATED);
            if (available == 0) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "All slots in this chit are reserved — no available slots to offer");
            }
        } else {
            long enrolled = enrollmentRepository.countByChitIdAndActiveTrue(chitId);
            if (enrolled >= chit.getCapacity()) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "This chit is fully enrolled — no spots available to offer");
            }
        }

        ChitInvitation invitation = ChitInvitation.builder()
                .chit(chit)
                .tenantId(TenantContext.get())
                .message(req.getMessage())
                .createdBy(createdBy)
                .recipientMemberIds(new ArrayList<>(req.getMemberIds()))
                .build();
        invitation = invitationRepository.save(invitation);

        List<InvitationResponse> responses = new ArrayList<>();
        for (UUID memberId : req.getMemberIds()) {
            InvitationResponse ir = InvitationResponse.builder()
                    .invitation(invitation)
                    .memberId(memberId)
                    .build();
            responses.add(ir);
        }
        responseRepository.saveAll(responses);

        List<String> memberIdStrings = req.getMemberIds().stream()
                .map(UUID::toString).collect(Collectors.toList());
        notificationClient.notifyUsersInApp(
                memberIdStrings,
                "CHIT_INVITATION",
                "Payout Plan Invitation",
                "Admin has shared a payout plan for " + chit.getName() + ". Tap to view.",
                "/member/invitations");

        auditClient.log("INVITATION", invitation.getId().toString(), chitId.toString(),
                "INVITATION_SENT", createdBy.toString(), "ADMIN",
                null,
                Map.of("invitationId", invitation.getId().toString(),
                        "recipientCount", req.getMemberIds().size(),
                        "message", req.getMessage() != null ? req.getMessage() : ""),
                TenantContext.get());

        return toSummaryResponse(invitation, responses.size(), 0);
    }

    public List<ChitInvitationResponse> listInvitations(UUID chitId) {
        String tenantId = TenantContext.get();
        chitService.findById(chitId);
        return invitationRepository.findByChitIdAndTenantIdOrderByCreatedAtDesc(chitId, tenantId)
                .stream()
                .map(inv -> {
                    List<InvitationResponse> allResponses = responseRepository.findByInvitationId(inv.getId());
                    int recipientCount = allResponses.size(); // one response per recipient
                    int responseCount = (int) allResponses.stream()
                            .filter(r -> r.getResponseStatus() != ResponseStatus.PENDING).count();
                    return toSummaryResponse(inv, recipientCount, responseCount);
                })
                .collect(Collectors.toList());
    }

    public ChitInvitationResponse getInvitationWithResponses(UUID chitId, UUID invId) {
        ChitInvitation inv = loadInvitation(invId);
        Chit chit = inv.getChit();
        List<InvitationResponse> raw = responseRepository.findByInvitationId(invId);
        List<InvitationResponseDTO> dtos = raw.stream()
                .map(r -> enrichResponseDTO(r, chit))
                .collect(Collectors.toList());

        int respondedCount = (int) raw.stream()
                .filter(r -> r.getResponseStatus() != ResponseStatus.PENDING).count();

        return ChitInvitationResponse.builder()
                .id(inv.getId())
                .chitId(chit.getId())
                .chitName(chit.getName())
                .chitType(chit.getChitType().name())
                .winnerSelectionMode(chit.getWinnerSelectionMode().name())
                .message(inv.getMessage())
                .status(inv.getStatus())
                .createdAt(inv.getCreatedAt())
                .closedAt(inv.getClosedAt())
                .recipientCount(raw.size())
                .responseCount(respondedCount)
                .responses(dtos)
                .build();
    }

    @Transactional
    public ChitInvitationResponse closeInvitation(UUID chitId, UUID invId) {
        ChitInvitation inv = loadInvitation(invId);
        if (inv.getStatus() == InvitationStatus.CLOSED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION, "Invitation is already closed");
        }
        inv.setStatus(InvitationStatus.CLOSED);
        inv.setClosedAt(LocalDateTime.now());
        invitationRepository.save(inv);

        // Notify pending members
        List<String> pendingMemberIds = responseRepository.findByInvitationId(invId).stream()
                .filter(r -> r.getResponseStatus() == ResponseStatus.PENDING)
                .map(r -> r.getMemberId().toString())
                .collect(Collectors.toList());
        if (!pendingMemberIds.isEmpty()) {
            notificationClient.notifyUsersInApp(
                    pendingMemberIds,
                    "INVITATION_CLOSED",
                    "Invitation Closed",
                    "The invitation for " + inv.getChit().getName() + " has closed.",
                    "/member/invitations");
        }

        List<InvitationResponse> allR = responseRepository.findByInvitationId(invId);
        int respondedR = (int) allR.stream().filter(r -> r.getResponseStatus() != ResponseStatus.PENDING).count();

        auditClient.log("INVITATION", invId.toString(), inv.getChit().getId().toString(),
                "INVITATION_CLOSED", null, null,
                null,
                Map.of("invitationId", invId.toString(),
                        "recipientCount", allR.size(),
                        "respondedCount", respondedR),
                TenantContext.get());

        return toSummaryResponse(inv, allR.size(), respondedR);
    }

    @Transactional
    public InvitationResponseDTO overrideResponse(UUID invId, UUID responseId, OverrideResponseRequest req) {
        InvitationResponse r = loadResponse(responseId);
        if (req.getApprovedSpots() != null) r.setApprovedSpots(req.getApprovedSpots());
        if (req.getApprovedDrawNumbers() != null) {
            r.setApprovedDrawNumbers(toJson(req.getApprovedDrawNumbers()));
        }
        r = responseRepository.save(r);
        return enrichResponseDTO(r, r.getInvitation().getChit());
    }

    @Transactional
    public InvitationResponseDTO approveResponse(UUID chitId, UUID invId, UUID responseId, UUID approverId) {
        InvitationResponse r = loadResponse(responseId);
        Chit chit = chitService.findById(chitId);

        if (r.isApproved()) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION, "Response is already approved");
        }
        if (r.getResponseStatus() != ResponseStatus.INTERESTED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only INTERESTED responses can be approved");
        }

        if (chit.getChitType() == ChitType.RESERVATION) {
            approveReservationSlots(chit, r, approverId);
        } else {
            approveLotteryAuctionSpots(chit, r, approverId);
        }

        r.setApproved(true);
        r.setApprovedAt(LocalDateTime.now());
        r.setApprovedBy(approverId);
        r = responseRepository.save(r);

        Map<String, Object> auditAfter = new LinkedHashMap<>();
        auditAfter.put("memberId", r.getMemberId().toString());
        auditAfter.put("chitId", chitId.toString());
        auditAfter.put("source", "INVITATION");
        auditAfter.put("invitationId", invId.toString());
        auditAfter.put("invitationResponseId", responseId.toString());
        auditClient.log("ENROLLMENT", r.getMemberId().toString(), chitId.toString(),
                "ENROLLMENT_FROM_INVITATION", approverId.toString(), "ADMIN",
                null, auditAfter, TenantContext.get());

        notificationClient.notifyUsersInApp(
                List.of(r.getMemberId().toString()),
                "INVITATION_APPROVED",
                "Participation Confirmed",
                "Your participation in " + chit.getName() + " has been confirmed.",
                "/member/invitations");

        return enrichResponseDTO(r, chit);
    }

    public List<MyInvitationDTO> getMyInvitations(UUID memberId) {
        String tenantId = TenantContext.get();
        List<InvitationResponse> myResponses =
                responseRepository.findByMemberIdAndInvitation_TenantId(memberId, tenantId);

        return myResponses.stream().map(r -> {
            ChitInvitation inv = r.getInvitation();
            Chit chit = inv.getChit();

            List<SlotInfo> slots = null;
            if (chit.getChitType() == ChitType.RESERVATION) {
                slots = buildSlotGrid(chit.getId(), memberId);
            }

            return MyInvitationDTO.builder()
                    .id(inv.getId())
                    .status(inv.getStatus())
                    .message(inv.getMessage())
                    .chit(toChitSummary(chit))
                    .myResponse(enrichResponseDTO(r, chit))
                    .slots(slots)
                    .build();
        }).collect(Collectors.toList());
    }

    @Transactional
    public InvitationResponseDTO respondToInvitation(UUID invId, UUID memberId, RespondToInvitationRequest req) {
        InvitationResponse r = responseRepository.findByInvitationIdAndMemberId(invId, memberId)
                .orElseThrow(() -> new ResourceNotFoundException("InvitationResponse", invId));

        if (r.getInvitation().getStatus() == InvitationStatus.CLOSED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "This invitation has been closed — responses are no longer accepted");
        }
        if (r.isApproved()) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Your response has already been approved and cannot be changed");
        }

        r.setResponseStatus(Boolean.TRUE.equals(req.getInterested())
                ? ResponseStatus.INTERESTED : ResponseStatus.NOT_INTERESTED);
        r.setReason(req.getReason());
        r.setSpotsRequested(req.getSpotsRequested());
        r.setRequestedDrawNumbers(
                req.getRequestedDrawNumbers() != null ? toJson(req.getRequestedDrawNumbers()) : null);
        r.setRespondedAt(LocalDateTime.now());

        r = responseRepository.save(r);

        auditClient.log("INVITATION_RESPONSE", r.getId().toString(), r.getInvitation().getChit().getId().toString(),
                "INVITATION_RESPONDED", memberId.toString(), "MEMBER",
                null,
                Map.of("invitationId", invId.toString(),
                        "memberId", memberId.toString(),
                        "responseStatus", r.getResponseStatus().name()),
                TenantContext.get());

        return enrichResponseDTO(r, r.getInvitation().getChit());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void approveReservationSlots(Chit chit, InvitationResponse r, UUID approverId) {
        List<Integer> drawNumbers = r.getApprovedDrawNumbers() != null
                ? fromJson(r.getApprovedDrawNumbers())
                : fromJson(r.getRequestedDrawNumbers());

        if (drawNumbers == null || drawNumbers.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No draw numbers to assign — member has not selected any slots");
        }

        for (Integer drawNum : drawNumbers) {
            List<MonthReservation> slots = reservationRepository.findByChitIdAndMonthNumber(chit.getId(), drawNum);
            MonthReservation slot = slots.stream()
                    .filter(s -> s.getStatus() == ReservationStatus.UNALLOCATED)
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                            "Draw " + drawNum + " slot is not available (not found or already reserved)"));

            slot.setMemberId(r.getMemberId());
            slot.setStatus(ReservationStatus.RESERVED);
            slot.setUpdatedBy(approverId);
            reservationRepository.save(slot);

            if (chit.getStatus() == ChitStatus.ACTIVE) {
                chitService.syncEnrollmentForMember(chit, r.getMemberId());
            }
        }
    }

    private void approveLotteryAuctionSpots(Chit chit, InvitationResponse r, UUID approverId) {
        int spotsToApprove = r.getApprovedSpots() != null ? r.getApprovedSpots()
                : (r.getSpotsRequested() != null ? r.getSpotsRequested() : 0);

        if (spotsToApprove <= 0) return;

        long totalEnrolled = enrollmentRepository.countByChitIdAndActiveTrue(chit.getId());
        int remaining = chit.getCapacity() - (int) totalEnrolled;
        if (spotsToApprove > remaining) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Chit is full — only " + remaining + " spot" + (remaining == 1 ? "" : "s") +
                    " remaining. Reduce approved spots or reject this response.");
        }

        long currentSpots = enrollmentRepository.countByChitIdAndMemberIdAndActiveTrue(chit.getId(), r.getMemberId());
        long additional = spotsToApprove - currentSpots;

        for (long i = 0; i < additional; i++) {
            ChitEnrollment enrollment = ChitEnrollment.builder()
                    .chit(chit)
                    .memberId(r.getMemberId())
                    .build();
            enrollmentRepository.save(enrollment);
        }
    }

    @Transactional
    public InvitationResponseDTO rejectResponse(UUID invId, UUID responseId, UUID adminId, String reason) {
        InvitationResponse r = loadResponse(responseId);
        if (r.isApproved()) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot reject a response that has already been approved");
        }
        if (r.getResponseStatus() == ResponseStatus.REJECTED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION, "Response is already rejected");
        }

        r.setResponseStatus(ResponseStatus.REJECTED);
        r.setAdminRejectionReason(reason);
        r = responseRepository.save(r);

        Chit chit = r.getInvitation().getChit();
        notificationClient.notifyUsersInApp(
                List.of(r.getMemberId().toString()),
                "INVITATION_REJECTED",
                "Invitation Response Not Approved",
                "Your response for " + chit.getName() + " was not approved." +
                        (reason != null && !reason.isBlank() ? " Reason: " + reason : ""),
                "/member/invitations");

        auditClient.log("INVITATION_RESPONSE", r.getId().toString(), chit.getId().toString(),
                "INVITATION_RESPONSE_REJECTED", adminId != null ? adminId.toString() : null, "ADMIN",
                null,
                Map.of("invitationId", invId.toString(),
                        "memberId", r.getMemberId().toString(),
                        "reason", reason != null ? reason : ""),
                TenantContext.get());

        return enrichResponseDTO(r, chit);
    }

    private List<SlotInfo> buildSlotGrid(UUID chitId, UUID memberId) {
        List<MonthReservation> all = reservationRepository
                .findByChitIdOrderByReservationMonthAscMonthNumberAsc(chitId);

        return all.stream()
                .filter(s -> s.getStatus() != ReservationStatus.VOIDED)
                .map(s -> {
                    String slotStatus;
                    if (s.getStatus() == ReservationStatus.UNALLOCATED || s.getMemberId() == null) {
                        slotStatus = "AVAILABLE";
                    } else if (memberId.equals(s.getMemberId())) {
                        slotStatus = "RESERVED_BY_ME";
                    } else {
                        slotStatus = "RESERVED_BY_OTHER";
                    }
                    return SlotInfo.builder()
                            .monthNumber(s.getMonthNumber() != null ? s.getMonthNumber() : 0)
                            .reservationMonth(s.getReservationMonth())
                            .slotStatus(slotStatus)
                            .reservationId(slotStatus.equals("RESERVED_BY_ME") ? s.getId() : null)
                            .build();
                })
                .collect(Collectors.toList());
    }

    private InvitationResponseDTO enrichResponseDTO(InvitationResponse r, Chit chit) {
        UUID memberId = r.getMemberId();
        UUID chitId = chit.getId();

        int currentSpots = (int) enrollmentRepository.countByChitIdAndMemberIdAndActiveTrue(chitId, memberId);

        List<Integer> currentDrawNums = reservationRepository
                .findByChitIdAndMemberId(chitId, memberId).stream()
                .filter(s -> s.getStatus() != ReservationStatus.VOIDED)
                .map(MonthReservation::getMonthNumber)
                .collect(Collectors.toList());

        return InvitationResponseDTO.builder()
                .id(r.getId())
                .invitationId(r.getInvitation().getId())
                .memberId(memberId)
                .responseStatus(r.getResponseStatus())
                .reason(r.getReason())
                .spotsRequested(r.getSpotsRequested())
                .approvedSpots(r.getApprovedSpots())
                .requestedDrawNumbers(fromJson(r.getRequestedDrawNumbers()))
                .approvedDrawNumbers(fromJson(r.getApprovedDrawNumbers()))
                .currentEnrollmentSpots(currentSpots)
                .currentReservedDrawNumbers(currentDrawNums)
                .approved(r.isApproved())
                .approvedAt(r.getApprovedAt())
                .respondedAt(r.getRespondedAt())
                .approvedBy(r.getApprovedBy())
                .adminRejectionReason(r.getAdminRejectionReason())
                .build();
    }

    private ChitInvitationResponse toSummaryResponse(ChitInvitation inv, int recipientCount, int responseCount) {
        Chit chit = inv.getChit();
        return ChitInvitationResponse.builder()
                .id(inv.getId())
                .chitId(chit.getId())
                .chitName(chit.getName())
                .chitType(chit.getChitType().name())
                .winnerSelectionMode(chit.getWinnerSelectionMode().name())
                .message(inv.getMessage())
                .status(inv.getStatus())
                .createdAt(inv.getCreatedAt())
                .closedAt(inv.getClosedAt())
                .recipientCount(recipientCount)
                .responseCount(responseCount)
                .build();
    }

    private MyInvitationDTO.ChitSummary toChitSummary(Chit chit) {
        return MyInvitationDTO.ChitSummary.builder()
                .id(chit.getId())
                .name(chit.getName())
                .chitType(chit.getChitType().name())
                .winnerSelectionMode(chit.getWinnerSelectionMode().name())
                .installmentAmount(chit.getInstallmentAmount())
                .defaultPostPayoutContribution(chit.getDefaultPostPayoutContribution())
                .capacity(chit.getCapacity())
                .durationMonths(chit.getDurationMonths())
                .monthlyDueDate(chit.getMonthlyDueDate())
                .startDate(chit.getStartDate())
                .build();
    }

    private ChitInvitation loadInvitation(UUID invId) {
        String tenantId = TenantContext.get();
        return invitationRepository.findByIdAndTenantId(invId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("ChitInvitation", invId));
    }

    private InvitationResponse loadResponse(UUID responseId) {
        return responseRepository.findById(responseId)
                .orElseThrow(() -> new ResourceNotFoundException("InvitationResponse", responseId));
    }

    private String toJson(List<Integer> list) {
        if (list == null) return null;
        try {
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            log.warn("Failed to serialize draw numbers: {}", e.getMessage());
            return "[]";
        }
    }

    private List<Integer> fromJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, new TypeReference<List<Integer>>() {});
        } catch (Exception e) {
            log.warn("Failed to deserialize draw numbers: {}", e.getMessage());
            return List.of();
        }
    }
}

package com.chitfund.userservice.service;

import com.chitfund.userservice.client.NotificationServiceClient;
import com.chitfund.userservice.domain.entity.MemberReminder;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.SendReminderRequest;
import com.chitfund.userservice.dto.response.ReminderResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.repository.MemberReminderRepository;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReminderService {

    private final MemberReminderRepository reminderRepo;
    private final UserRepository userRepo;
    private final MemberUserLinkRepository memberUserLinkRepo;
    private final NotificationServiceClient notificationClient;
    private final ObjectMapper objectMapper;

    @Transactional
    public ReminderResponse send(SendReminderRequest req, User sender) {
        // Resolve member user account via the member_user_links table
        MemberUserLink link = memberUserLinkRepo
                .findByMemberIdAndTenantId(req.getMemberProfileId(), UUID.fromString(sender.getTenantId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Member not found"));
        User member = userRepo.findById(link.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Member user account not found"));

        BigDecimal total = req.getChits().stream()
                .map(c -> c.getInstallmentAmount() != null ? c.getInstallmentAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String chitJson;
        try {
            chitJson = objectMapper.writeValueAsString(req.getChits());
        } catch (Exception e) {
            chitJson = "[]";
        }

        MemberReminder reminder = MemberReminder.builder()
                .orgId(sender.getTenantId())
                .senderId(sender.getId())
                .senderName(sender.getFullName() != null ? sender.getFullName() : sender.getUsername())
                .memberUserId(member.getId())
                .memberProfileId(req.getMemberProfileId())
                .message(req.getMessage())
                .chitDetails(chitJson)
                .totalAmount(total)
                .repeatIntervalMinutes(req.getRepeatIntervalMinutes())
                .reminderTime(req.getReminderTime())
                .build();

        reminder = reminderRepo.save(reminder);

        // Send push notification with deep-link data
        String memberName = member.getFullName() != null ? member.getFullName() : "member";
        String pushTitle = "Payment Reminder";
        String pushBody = total.compareTo(BigDecimal.ZERO) > 0
                ? String.format("Outstanding ₹%.0f across %d chit(s). Please review.", total, req.getChits().size())
                : "You have a payment reminder from your chit fund admin.";
        if (req.getMessage() != null && !req.getMessage().isBlank()) {
            pushBody = req.getMessage();
        }

        java.util.HashMap<String, String> pushData = new java.util.HashMap<>();
        pushData.put("screen", "reminders");
        pushData.put("reminderId", reminder.getId().toString());
        if (req.getRepeatIntervalMinutes() != null) {
            pushData.put("repeatIntervalMinutes", req.getRepeatIntervalMinutes().toString());
        }
        if (req.getReminderTime() != null && !req.getReminderTime().isBlank()) {
            pushData.put("reminderTime", req.getReminderTime()); // HH:MM
        }
        notificationClient.sendPushWithData(member.getId(), pushTitle, pushBody, pushData);

        // In-app notification for web members (and as fallback for mobile)
        notificationClient.createInApp(member.getId(), pushTitle, pushBody, "REMINDER", null);

        return toResponse(reminder);
    }

    // Admin: view reminders for a member
    public Page<ReminderResponse> listForMember(String orgId, UUID memberProfileId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return reminderRepo.findByOrgIdAndMemberProfileIdOrderByCreatedAtDesc(orgId, memberProfileId, pageable)
                .map(this::toResponse);
    }

    // Admin: get single reminder
    public ReminderResponse getForAdmin(UUID reminderId, String orgId) {
        MemberReminder r = reminderRepo.findByIdAndOrgId(reminderId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Reminder not found"));
        return toResponse(r);
    }

    // Member: list their reminders
    public Page<ReminderResponse> listMine(UUID memberUserId, String filter, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return switch (filter) {
            case "unread" -> reminderRepo.findUnreadByMemberUserId(memberUserId, pageable).map(this::toResponse);
            case "archived" -> reminderRepo.findByMemberUserIdAndArchivedTrueOrderByCreatedAtDesc(memberUserId, pageable).map(this::toResponse);
            default -> reminderRepo.findByMemberUserIdAndArchivedFalseOrderByCreatedAtDesc(memberUserId, pageable).map(this::toResponse);
        };
    }

    // Member: get single (marks seen on first access via push)
    public ReminderResponse getForMember(UUID reminderId, UUID memberUserId) {
        MemberReminder r = reminderRepo.findByIdAndMemberUserId(reminderId, memberUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Reminder not found"));
        return toResponse(r);
    }

    @Transactional
    public void markSeen(UUID reminderId, UUID memberUserId) {
        reminderRepo.findByIdAndMemberUserId(reminderId, memberUserId).ifPresent(r -> {
            if (r.getSeenAt() == null) {
                r.setSeenAt(LocalDateTime.now());
                reminderRepo.save(r);
            }
        });
    }

    @Transactional
    public void markRead(UUID reminderId, UUID memberUserId) {
        reminderRepo.findByIdAndMemberUserId(reminderId, memberUserId).ifPresent(r -> {
            if (r.getSeenAt() == null) r.setSeenAt(LocalDateTime.now());
            if (r.getReadAt() == null) {
                r.setReadAt(LocalDateTime.now());
                reminderRepo.save(r);
            }
        });
    }

    @Transactional
    public ReminderResponse setPromisedDate(UUID reminderId, UUID memberUserId, LocalDate date) {
        MemberReminder r = reminderRepo.findByIdAndMemberUserId(reminderId, memberUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Reminder not found"));
        r.setPromisedDate(date);
        if (r.getReadAt() == null) r.setReadAt(LocalDateTime.now());

        // Append to promised date history
        String existing = r.getPromisedDateHistory();
        String entry = String.format("{\"date\":\"%s\",\"setAt\":\"%s\"}", date, LocalDateTime.now());
        if (existing == null || existing.isBlank() || existing.equals("null")) {
            r.setPromisedDateHistory("[" + entry + "]");
        } else {
            // Insert before the closing bracket
            r.setPromisedDateHistory(existing.substring(0, existing.lastIndexOf(']')) + "," + entry + "]");
        }

        return toResponse(reminderRepo.save(r));
    }

    @Transactional
    public void archive(UUID reminderId, UUID memberUserId) {
        reminderRepo.findByIdAndMemberUserId(reminderId, memberUserId).ifPresent(r -> {
            r.setArchived(true);
            r.setArchivedAt(LocalDateTime.now());
            reminderRepo.save(r);
        });
    }

    private ReminderResponse toResponse(MemberReminder r) {
        return ReminderResponse.builder()
                .id(r.getId())
                .senderId(r.getSenderId())
                .senderName(r.getSenderName())
                .memberUserId(r.getMemberUserId())
                .memberProfileId(r.getMemberProfileId())
                .message(r.getMessage())
                .chitDetails(r.getChitDetails())
                .promisedDateHistory(r.getPromisedDateHistory() != null ? r.getPromisedDateHistory() : "[]")
                .totalAmount(r.getTotalAmount())
                .repeatIntervalMinutes(r.getRepeatIntervalMinutes())
                .reminderTime(r.getReminderTime())
                .sentAt(r.getCreatedAt())
                .seenAt(r.getSeenAt())
                .readAt(r.getReadAt())
                .promisedDate(r.getPromisedDate())
                .archived(r.isArchived())
                .archivedAt(r.getArchivedAt())
                .build();
    }
}

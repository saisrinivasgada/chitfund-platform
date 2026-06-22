package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.domain.Notification;
import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.domain.enums.NotificationStatus;
import com.chitfund.notificationservice.dto.request.BulkNotifyRequest;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.dto.response.NotificationResponse;
import com.chitfund.notificationservice.repository.NotificationRepository;
import com.chitfund.notificationservice.sender.NotificationSender;
import com.chitfund.notificationservice.template.NotificationTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationSender sender;

    @Transactional
    public NotificationResponse send(NotifyRequest request) {
        if (request.getRecipientPhone() == null && request.getRecipientEmail() == null) {
            log.warn("Notification skipped — no contact info for recipient {}", request.getRecipientId());
            return saveAndReturn(buildSkipped(request, "No contact information available"));
        }

        NotificationChannel channel = resolveChannel(request.getPreferredChannel(),
                request.getRecipientPhone(), request.getRecipientEmail());

        String to = channel == NotificationChannel.EMAIL
                ? request.getRecipientEmail()
                : request.getRecipientPhone();

        String message = NotificationTemplate
                .forEventType(request.getEventType())
                .format(request.getTemplateParams());

        NotificationSender.SendResult result = sender.send(to, message, channel);

        Notification notification = Notification.builder()
                .recipientId(request.getRecipientId())
                .recipientPhone(request.getRecipientPhone())
                .recipientEmail(request.getRecipientEmail())
                .channel(channel)
                .eventType(request.getEventType())
                .message(message)
                .status(result.success() ? NotificationStatus.SENT : NotificationStatus.FAILED)
                .errorMessage(result.errorMessage())
                .externalId(result.externalId())
                .sentAt(result.success() ? LocalDateTime.now() : null)
                .build();

        return saveAndReturn(notification);
    }

    /**
     * Sends the same notification to multiple recipients.
     * Used for broadcast events (MONTH_SKIPPED) where all members get the same message.
     * Each send is independent — one failure doesn't block the rest.
     */
    @Transactional
    public List<NotificationResponse> sendBulk(BulkNotifyRequest request) {
        return request.getRecipients().stream().map(recipient -> {
            NotifyRequest single = new NotifyRequest();
            single.setRecipientId(recipient.getRecipientId());
            single.setRecipientPhone(recipient.getRecipientPhone());
            single.setRecipientEmail(recipient.getRecipientEmail());
            single.setEventType(request.getEventType());
            single.setPreferredChannel(request.getPreferredChannel());
            single.setTemplateParams(request.getTemplateParams());
            return send(single);
        }).toList();
    }

    @Transactional(readOnly = true)
    public Page<NotificationResponse> getHistory(java.util.UUID recipientId, Pageable pageable) {
        return notificationRepository
                .findByRecipientIdOrderByCreatedAtDesc(recipientId, pageable)
                .map(this::toResponse);
    }

    /**
     * Channel resolution priority:
     * 1. Caller's explicit preferredChannel (if provided and recipient has that contact)
     * 2. SMS if phone is available (works on every phone, no internet)
     * 3. EMAIL as fallback
     */
    private NotificationChannel resolveChannel(NotificationChannel preferred,
                                               String phone, String email) {
        if (preferred != null) {
            if (preferred == NotificationChannel.EMAIL && email != null) return NotificationChannel.EMAIL;
            if (preferred == NotificationChannel.WHATSAPP && phone != null) return NotificationChannel.WHATSAPP;
            if (preferred == NotificationChannel.SMS && phone != null) return NotificationChannel.SMS;
        }
        return phone != null ? NotificationChannel.SMS : NotificationChannel.EMAIL;
    }

    private Notification buildSkipped(NotifyRequest request, String reason) {
        return Notification.builder()
                .recipientId(request.getRecipientId())
                .recipientPhone(request.getRecipientPhone())
                .recipientEmail(request.getRecipientEmail())
                .channel(NotificationChannel.SMS)
                .eventType(request.getEventType())
                .message("")
                .status(NotificationStatus.SKIPPED)
                .errorMessage(reason)
                .build();
    }

    private NotificationResponse saveAndReturn(Notification notification) {
        notificationRepository.save(notification);
        return toResponse(notification);
    }

    private NotificationResponse toResponse(Notification n) {
        return NotificationResponse.builder()
                .id(n.getId())
                .recipientId(n.getRecipientId())
                .recipientPhone(n.getRecipientPhone())
                .recipientEmail(n.getRecipientEmail())
                .channel(n.getChannel())
                .eventType(n.getEventType())
                .message(n.getMessage())
                .status(n.getStatus())
                .errorMessage(n.getErrorMessage())
                .externalId(n.getExternalId())
                .sentAt(n.getSentAt())
                .createdAt(n.getCreatedAt())
                .build();
    }
}

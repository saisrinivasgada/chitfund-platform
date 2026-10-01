package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.domain.Notification;
import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.domain.enums.NotificationStatus;
import com.chitfund.notificationservice.dto.request.BulkNotifyRequest;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.dto.response.NotificationResponse;
import com.chitfund.notificationservice.outbox.NotificationDeliveryQueue;
import com.chitfund.notificationservice.repository.NotificationRepository;
import com.chitfund.notificationservice.template.NotificationTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationDeliveryQueue deliveryQueue;

    @Transactional
    public NotificationResponse send(String tenantId, NotifyRequest request) {
        return send(UUID.randomUUID().toString(), tenantId, request);
    }

    @Transactional
    public NotificationResponse send(String eventId, String tenantId, NotifyRequest request) {
        requireTenant(tenantId);
        if (request.getRecipientPhone() == null && request.getRecipientEmail() == null) {
            log.warn("Notification skipped — no contact info for recipient {}", request.getRecipientId());
            return saveAndReturn(buildSkipped(tenantId, request, "No contact information available"));
        }

        NotificationChannel channel = resolveChannel(request.getPreferredChannel(),
                request.getRecipientPhone(), request.getRecipientEmail());

        String to = channel == NotificationChannel.EMAIL
                ? request.getRecipientEmail()
                : request.getRecipientPhone();

        String message = NotificationTemplate
                .forEventType(request.getEventType())
                .format(request.getTemplateParams());

        Notification notification = Notification.builder()
                .tenantId(tenantId)
                .recipientId(request.getRecipientId())
                .recipientPhone(request.getRecipientPhone())
                .recipientEmail(request.getRecipientEmail())
                .channel(channel)
                .eventType(request.getEventType())
                .message(message)
                .status(NotificationStatus.PENDING)
                .build();
        notificationRepository.save(notification);
        deliveryQueue.enqueueChannel(eventId, tenantId, notification.getId(),
                request.getRecipientId(), to, message, channel);
        return toResponse(notification);
    }

    /**
     * Sends the same notification to multiple recipients.
     * Used for broadcast events (MONTH_SKIPPED) where all members get the same message.
     * Each send is independent — one failure doesn't block the rest.
     */
    @Transactional
    public List<NotificationResponse> sendBulk(String tenantId, BulkNotifyRequest request) {
        requireTenant(tenantId);
        return request.getRecipients().stream().map(recipient -> {
            NotifyRequest single = new NotifyRequest();
            single.setRecipientId(recipient.getRecipientId());
            single.setRecipientPhone(recipient.getRecipientPhone());
            single.setRecipientEmail(recipient.getRecipientEmail());
            single.setEventType(request.getEventType());
            single.setPreferredChannel(request.getPreferredChannel());
            single.setTemplateParams(request.getTemplateParams());
            return send(tenantId, single);
        }).toList();
    }

    @Transactional(readOnly = true)
    public Page<NotificationResponse> getHistory(String tenantId, java.util.UUID recipientId, Pageable pageable) {
        requireTenant(tenantId);
        return notificationRepository
                .findByTenantIdAndRecipientIdOrderByCreatedAtDesc(tenantId, recipientId, pageable)
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

    private Notification buildSkipped(String tenantId, NotifyRequest request, String reason) {
        return Notification.builder()
                .tenantId(tenantId)
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

    private void requireTenant(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("tenantId is required for notification delivery");
        }
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

package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.domain.InAppNotification;
import com.chitfund.notificationservice.dto.response.InAppNotificationResponse;
import com.chitfund.notificationservice.repository.InAppNotificationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class InAppNotificationService {

    private final InAppNotificationRepository repo;
    private final ObjectMapper objectMapper;

    /**
     * Create and persist a new in-app notification for a recipient.
     *
     * @param recipientId  UUID of the user who should see this notification
     * @param title        Short headline (e.g. "Cash Picked Up")
     * @param message      Full sentence (e.g. "₹2,000 collected from Ravi")
     * @param type         Event type string for icon mapping on the client
     * @param metadata     Key-value bag: memberId, workerId, chitId, amount, etc.
     */
    public void create(UUID recipientId, String title, String message,
                       String type, Map<String, String> metadata) {
        try {
            String metaJson = metadata != null ? objectMapper.writeValueAsString(metadata) : null;
            InAppNotification n = InAppNotification.builder()
                    .recipientId(recipientId)
                    .title(title)
                    .message(message)
                    .type(type)
                    .metadata(metaJson)
                    .build();
            repo.save(n);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize notification metadata: {}", e.getMessage());
        }
    }

    public Page<InAppNotificationResponse> getForUser(UUID recipientId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return repo.findByRecipientIdOrderByCreatedAtDesc(recipientId, pageable)
                   .map(InAppNotificationResponse::from);
    }

    public long getUnreadCount(UUID recipientId) {
        return repo.countByRecipientIdAndIsReadFalse(recipientId);
    }

    @Transactional
    public void markRead(UUID notificationId, UUID recipientId) {
        repo.findById(notificationId).ifPresent(n -> {
            if (n.getRecipientId().equals(recipientId)) {
                n.setRead(true);
                repo.save(n);
            }
        });
    }

    @Transactional
    public int markAllRead(UUID recipientId) {
        return repo.markAllReadByRecipient(recipientId);
    }
}

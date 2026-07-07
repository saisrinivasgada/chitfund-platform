package com.chitfund.notificationservice.repository;

import com.chitfund.notificationservice.domain.InAppNotification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

public interface InAppNotificationRepository extends JpaRepository<InAppNotification, UUID> {

    Page<InAppNotification> findByRecipientIdOrderByCreatedAtDesc(UUID recipientId, Pageable pageable);

    long countByRecipientIdAndIsReadFalse(UUID recipientId);

    @Modifying
    @Transactional
    @Query("UPDATE InAppNotification n SET n.isRead = true WHERE n.recipientId = :recipientId AND n.isRead = false")
    int markAllReadByRecipient(UUID recipientId);
}

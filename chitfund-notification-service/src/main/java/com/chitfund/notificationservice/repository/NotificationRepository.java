package com.chitfund.notificationservice.repository;

import com.chitfund.notificationservice.domain.Notification;
import com.chitfund.notificationservice.domain.enums.NotificationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByRecipientIdOrderByCreatedAtDesc(UUID recipientId, Pageable pageable);

    List<Notification> findByStatusOrderByCreatedAtAsc(NotificationStatus status);
}

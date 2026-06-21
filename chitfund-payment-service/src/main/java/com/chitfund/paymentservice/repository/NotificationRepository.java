package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    @Query(value = "SELECT n.* FROM notifications n " +
            "WHERE n.recipient_user_id = :userId OR n.recipient_role = :role " +
            "ORDER BY n.created_at DESC LIMIT 50", nativeQuery = true)
    List<Notification> findLatestForUser(@Param("userId") String userId, @Param("role") String role);

    @Query(value = "SELECT COUNT(n.id) FROM notifications n " +
            "LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = :userId " +
            "WHERE (n.recipient_user_id = :userId OR n.recipient_role = :role) " +
            "AND nr.user_id IS NULL", nativeQuery = true)
    long countUnread(@Param("userId") String userId, @Param("role") String role);
}

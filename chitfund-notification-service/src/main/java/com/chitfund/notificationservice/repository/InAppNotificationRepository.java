package com.chitfund.notificationservice.repository;

import com.chitfund.notificationservice.domain.InAppNotification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

public interface InAppNotificationRepository extends JpaRepository<InAppNotification, UUID> {

    @Query("SELECT n FROM InAppNotification n WHERE n.recipientId = :recipientId " +
            "AND (n.tenantId = :tenantId OR n.tenantId IS NULL) ORDER BY n.createdAt DESC")
    Page<InAppNotification> findVisibleForRecipient(@Param("tenantId") String tenantId,
                                                    @Param("recipientId") UUID recipientId,
                                                    Pageable pageable);

    @Query("SELECT COUNT(n) FROM InAppNotification n WHERE n.recipientId = :recipientId " +
            "AND (n.tenantId = :tenantId OR n.tenantId IS NULL) AND n.isRead = false")
    long countUnreadVisibleForRecipient(@Param("tenantId") String tenantId,
                                        @Param("recipientId") UUID recipientId);

    @Query("SELECT n FROM InAppNotification n WHERE n.id = :id AND n.recipientId = :recipientId " +
            "AND (n.tenantId = :tenantId OR n.tenantId IS NULL)")
    java.util.Optional<InAppNotification> findVisibleById(@Param("id") UUID id,
                                                          @Param("tenantId") String tenantId,
                                                          @Param("recipientId") UUID recipientId);

    @Modifying
    @Transactional
    @Query("UPDATE InAppNotification n SET n.isRead = true WHERE n.recipientId = :recipientId " +
            "AND (n.tenantId = :tenantId OR n.tenantId IS NULL) AND n.isRead = false")
    int markAllReadByRecipient(@Param("tenantId") String tenantId,
                               @Param("recipientId") UUID recipientId);
}

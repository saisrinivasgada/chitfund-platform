package com.chitfund.reportingservice.repository;

import com.chitfund.reportingservice.domain.EventInbox;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface EventInboxRepository extends JpaRepository<EventInbox, String> {

    @Modifying
    @Query(value = """
            INSERT IGNORE INTO event_inbox (event_id, event_type, processed_at)
            VALUES (:eventId, :eventType, :processedAt)
            """, nativeQuery = true)
    int claimIfAbsent(@Param("eventId") String eventId,
                      @Param("eventType") String eventType,
                      @Param("processedAt") LocalDateTime processedAt);
}

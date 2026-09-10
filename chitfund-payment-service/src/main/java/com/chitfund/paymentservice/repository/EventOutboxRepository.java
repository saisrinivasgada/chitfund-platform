package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.EventOutbox;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface EventOutboxRepository extends JpaRepository<EventOutbox, UUID> {

    @Query(value = """
            SELECT * FROM event_outbox
            WHERE status = 'PENDING' AND next_attempt_at <= CURRENT_TIMESTAMP(6)
            ORDER BY created_at
            LIMIT :batchSize
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<EventOutbox> claimBatch(@Param("batchSize") int batchSize);
}

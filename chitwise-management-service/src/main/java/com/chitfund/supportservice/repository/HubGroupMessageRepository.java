package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubGroupMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface HubGroupMessageRepository extends JpaRepository<HubGroupMessage, String> {

    List<HubGroupMessage> findByGroupIdOrderByCreatedAtDesc(String groupId, Pageable pageable);

    @Query("SELECT m FROM HubGroupMessage m WHERE m.groupId = :gid AND m.createdAt < :before ORDER BY m.createdAt DESC")
    List<HubGroupMessage> findBeforeCursor(@Param("gid") String groupId,
                                            @Param("before") Instant before,
                                            Pageable pageable);

    Optional<HubGroupMessage> findByGroupIdAndSenderIdAndClientMessageId(
            String groupId, String senderId, String clientMessageId);
}

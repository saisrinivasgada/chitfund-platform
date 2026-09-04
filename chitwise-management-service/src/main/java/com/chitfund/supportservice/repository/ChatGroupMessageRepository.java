package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.ChatGroupMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ChatGroupMessageRepository extends JpaRepository<ChatGroupMessage, String> {

    List<ChatGroupMessage> findByGroupIdOrderByCreatedAtDesc(String groupId, Pageable pageable);

    @Query("SELECT m FROM ChatGroupMessage m WHERE m.groupId = :groupId AND m.createdAt < :before ORDER BY m.createdAt DESC")
    List<ChatGroupMessage> findBeforeCursor(
            @Param("groupId") String groupId,
            @Param("before") Instant before,
            Pageable pageable);

    Optional<ChatGroupMessage> findByGroupIdAndSenderIdAndClientMessageId(
            String groupId, String senderId, String clientMessageId);
}

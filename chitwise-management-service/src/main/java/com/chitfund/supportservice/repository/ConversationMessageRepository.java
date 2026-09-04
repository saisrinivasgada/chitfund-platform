package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.ConversationMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ConversationMessageRepository extends JpaRepository<ConversationMessage, String> {

    Optional<ConversationMessage> findByConversationIdAndSenderIdAndClientMessageId(
            String conversationId, String senderId, String clientMessageId);

    List<ConversationMessage> findByConversationIdOrderByCreatedAtDesc(
            String conversationId, Pageable pageable);

    @Query("SELECT m FROM ConversationMessage m WHERE m.conversationId = :convId AND m.createdAt < :before ORDER BY m.createdAt DESC")
    List<ConversationMessage> findBeforeCursor(
            @Param("convId") String conversationId,
            @Param("before") Instant before,
            Pageable pageable);
}

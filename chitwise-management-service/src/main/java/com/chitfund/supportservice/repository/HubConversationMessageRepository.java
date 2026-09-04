package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubConversationMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface HubConversationMessageRepository extends JpaRepository<HubConversationMessage, String> {

    List<HubConversationMessage> findByConversationIdOrderByCreatedAtDesc(String conversationId, Pageable pageable);

    @Query("SELECT m FROM HubConversationMessage m WHERE m.conversationId = :convId AND m.createdAt < :before ORDER BY m.createdAt DESC")
    List<HubConversationMessage> findBeforeCursor(@Param("convId") String convId,
                                                   @Param("before") Instant before,
                                                   Pageable pageable);

    Optional<HubConversationMessage> findByConversationIdAndSenderIdAndClientMessageId(
            String conversationId, String senderId, String clientMessageId);
}

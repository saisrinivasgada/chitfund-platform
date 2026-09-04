package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.TicketMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;

public interface TicketMessageRepository extends JpaRepository<TicketMessage, String> {

    Page<TicketMessage> findByTicketIdOrderByCreatedAtDesc(String ticketId, Pageable pageable);

    List<TicketMessage> findByTicketIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            String ticketId, Instant before, Pageable pageable);

    @Modifying
    @Query("UPDATE TicketMessage m SET m.readByCreator = true WHERE m.ticketId = :ticketId AND m.senderType != 'ORG_ADMIN'")
    int markReadByCreator(String ticketId);

    @Modifying
    @Query("UPDATE TicketMessage m SET m.readByHandler = true WHERE m.ticketId = :ticketId AND m.senderType = 'ORG_ADMIN'")
    int markReadByHandler(String ticketId);

    long countByTicketIdAndReadByCreatorFalseAndSenderTypeNot(String ticketId, com.chitfund.supportservice.domain.enums.SenderType senderType);

    long countByTicketIdAndReadByHandlerFalse(String ticketId);
}

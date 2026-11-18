package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.TicketMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import com.chitfund.supportservice.domain.enums.SenderType;
import org.springframework.data.repository.query.Param;

public interface TicketMessageRepository extends JpaRepository<TicketMessage, String> {

    Page<TicketMessage> findByTicketIdOrderByCreatedAtDesc(String ticketId, Pageable pageable);

    List<TicketMessage> findByTicketIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            String ticketId, Instant before, Pageable pageable);

    @Modifying
    @Query("UPDATE TicketMessage m SET m.readByCreator = true WHERE m.ticketId = :ticketId AND m.senderType IN :senderTypes")
    int markReadByCreator(@Param("ticketId") String ticketId, @Param("senderTypes") Collection<SenderType> senderTypes);

    @Modifying
    @Query("UPDATE TicketMessage m SET m.readByHandler = true WHERE m.ticketId = :ticketId AND m.senderType IN :senderTypes")
    int markReadByHandler(@Param("ticketId") String ticketId, @Param("senderTypes") Collection<SenderType> senderTypes);

    long countByTicketIdAndReadByCreatorFalseAndSenderTypeIn(String ticketId, Collection<SenderType> senderTypes);

    long countByTicketIdAndReadByHandlerFalseAndSenderTypeIn(String ticketId, Collection<SenderType> senderTypes);
}

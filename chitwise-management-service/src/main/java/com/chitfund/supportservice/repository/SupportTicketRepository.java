package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketType;
import java.time.Instant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, String> {

    Page<SupportTicket> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    Page<SupportTicket> findByTenantIdAndStatusOrderByCreatedAtDesc(String tenantId, TicketStatus status, Pageable pageable);

    Page<SupportTicket> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<SupportTicket> findByStatusOrderByCreatedAtDesc(TicketStatus status, Pageable pageable);

    @Query("SELECT t FROM SupportTicket t WHERE " +
            "(:status IS NULL OR t.status = :status) AND " +
            "(:type IS NULL OR t.type = :type) AND " +
            "(:priority IS NULL OR t.priority = :priority) AND " +
            "(:from IS NULL OR t.createdAt >= :from) AND " +
            "(:toExclusive IS NULL OR t.createdAt < :toExclusive) AND " +
            "(:query IS NULL OR LOWER(t.ticketNumber) LIKE LOWER(CONCAT('%', :query, '%')) " +
            " OR LOWER(t.subject) LIKE LOWER(CONCAT('%', :query, '%')) " +
            " OR LOWER(COALESCE(t.createdByName, '')) LIKE LOWER(CONCAT('%', :query, '%')) " +
            " OR LOWER(COALESCE(t.tenantName, '')) LIKE LOWER(CONCAT('%', :query, '%'))) " +
            "ORDER BY CASE WHEN t.priority = com.chitfund.supportservice.domain.enums.TicketPriority.URGENT THEN 0 " +
            "WHEN t.priority = com.chitfund.supportservice.domain.enums.TicketPriority.HIGH THEN 1 ELSE 2 END, " +
            "t.createdAt DESC")
    Page<SupportTicket> searchForHub(@Param("status") TicketStatus status,
                                     @Param("type") TicketType type,
                                     @Param("priority") TicketPriority priority,
                                     @Param("from") Instant from,
                                     @Param("toExclusive") Instant toExclusive,
                                     @Param("query") String query,
                                     Pageable pageable);

    long countByTenantIdAndStatusIn(String tenantId, java.util.List<TicketStatus> statuses);

    Page<SupportTicket> findByTenantIdAndCreatedByOrderByCreatedAtDesc(String tenantId, String createdBy, Pageable pageable);

}

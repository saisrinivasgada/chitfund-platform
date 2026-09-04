package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.enums.TicketStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, String> {

    Page<SupportTicket> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    Page<SupportTicket> findByTenantIdAndStatusOrderByCreatedAtDesc(String tenantId, TicketStatus status, Pageable pageable);

    Page<SupportTicket> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<SupportTicket> findByStatusOrderByCreatedAtDesc(TicketStatus status, Pageable pageable);

    long countByTenantIdAndStatusIn(String tenantId, java.util.List<TicketStatus> statuses);


}

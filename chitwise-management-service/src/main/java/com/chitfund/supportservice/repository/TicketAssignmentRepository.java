package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.TicketAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TicketAssignmentRepository extends JpaRepository<TicketAssignment, String> {
    List<TicketAssignment> findByTicketIdOrderByAssignedAtDesc(String ticketId);
}

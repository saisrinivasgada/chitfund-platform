package com.chitfund.auditservice.repository;

import com.chitfund.auditservice.domain.EventInbox;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventInboxRepository extends JpaRepository<EventInbox, String> {
}

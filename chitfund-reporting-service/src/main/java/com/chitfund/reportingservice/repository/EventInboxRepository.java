package com.chitfund.reportingservice.repository;

import com.chitfund.reportingservice.domain.EventInbox;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventInboxRepository extends JpaRepository<EventInbox, String> {
}

package com.chitfund.notificationservice.repository;

import com.chitfund.notificationservice.domain.EventInbox;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventInboxRepository extends JpaRepository<EventInbox, String> {
}

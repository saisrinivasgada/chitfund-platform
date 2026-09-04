package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.ContactRequestMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ContactRequestMessageRepository extends JpaRepository<ContactRequestMessage, UUID> {
    List<ContactRequestMessage> findByContactRequestIdOrderByCreatedAtAsc(UUID contactRequestId);
}

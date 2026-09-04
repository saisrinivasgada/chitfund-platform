package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.ContactRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ContactRequestRepository extends JpaRepository<ContactRequest, UUID> {
    List<ContactRequest> findAllByOrderByCreatedAtDesc();
    long countByStatus(String status);
}

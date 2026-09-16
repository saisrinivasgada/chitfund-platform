package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.ChitfundRequestAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ChitfundRequestAuditRepository extends JpaRepository<ChitfundRequestAudit, UUID> {
    List<ChitfundRequestAudit> findAllByRequestIdOrderByCreatedAtAsc(UUID requestId);
}

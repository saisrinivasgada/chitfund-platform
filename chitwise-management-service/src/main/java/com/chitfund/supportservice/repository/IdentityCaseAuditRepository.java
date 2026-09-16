package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.IdentityCaseAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IdentityCaseAuditRepository extends JpaRepository<IdentityCaseAudit, String> {
    List<IdentityCaseAudit> findAllByIdentityCaseIdOrderByCreatedAtAsc(String identityCaseId);
}

package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.ChitInvitation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChitInvitationRepository extends JpaRepository<ChitInvitation, UUID> {

    List<ChitInvitation> findByChitIdAndTenantIdOrderByCreatedAtDesc(UUID chitId, String tenantId);

    Optional<ChitInvitation> findByIdAndTenantId(UUID id, String tenantId);
}

package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.MemberUserLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MemberUserLinkRepository extends JpaRepository<MemberUserLink, UUID> {

    List<MemberUserLink> findAllByUserId(UUID userId);

    Optional<MemberUserLink> findByUserIdAndTenantId(UUID userId, UUID tenantId);

    boolean existsByUserId(UUID userId);

    List<MemberUserLink> findAllByTenantId(UUID tenantId);

    long countByTenantId(UUID tenantId);
}

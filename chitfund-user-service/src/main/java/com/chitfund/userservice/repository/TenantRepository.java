package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    Optional<Tenant> findBySlug(String slug);

    boolean existsBySlug(String slug);

    boolean existsBySlugAndStatusNot(String slug, String status);

    List<Tenant> findAllByStatusOrderByCreatedAtDesc(String status);

    List<Tenant> findAllByStatusNotOrderByCreatedAtDesc(String status);

    List<Tenant> findAllByOrderByCreatedAtDesc();

    List<Tenant> findAllByRequestedPlanIsNotNullOrderByUpgradeRequestedAtAsc();

    List<Tenant> findAllByRenewalRequestedAtIsNotNullOrderByRenewalRequestedAtAsc();

    Optional<Tenant> findByReferralCode(String referralCode);
}

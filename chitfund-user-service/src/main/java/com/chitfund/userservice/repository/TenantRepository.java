package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Tenant t WHERE t.id = :id")
    Optional<Tenant> findByIdForUpdate(@Param("id") UUID id);

    Optional<Tenant> findBySlug(String slug);

    boolean existsBySlug(String slug);

    boolean existsBySlugAndStatusNot(String slug, String status);

    List<Tenant> findAllByStatusOrderByCreatedAtDesc(String status);

    List<Tenant> findAllByStatusNotOrderByCreatedAtDesc(String status);

    List<Tenant> findAllByOrderByCreatedAtDesc();

    List<Tenant> findAllByRequestedPlanIsNotNullOrderByUpgradeRequestedAtAsc();

    List<Tenant> findAllByRenewalRequestedAtIsNotNullOrderByRenewalRequestedAtAsc();

    Optional<Tenant> findByReferralCode(String referralCode);

    List<Tenant> findAllByCancellationRequestedAtIsNotNullAndStatusAndPlanExpiresAtBefore(
            String status, java.time.LocalDateTime now);
}

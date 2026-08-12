package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.ReferralCredit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReferralCreditRepository extends JpaRepository<ReferralCredit, UUID> {
    List<ReferralCredit> findAllByReferrerTenantId(UUID referrerTenantId);
    Optional<ReferralCredit> findByReferredTenantId(UUID referredTenantId);
    boolean existsByReferredTenantId(UUID referredTenantId);

    // Used by daily job: find PENDING credits whose eligible date has passed
    List<ReferralCredit> findAllByStatusAndCreditEligibleAtBefore(String status, LocalDateTime cutoff);

    // Super-admin: list all credits (optionally filtered by status)
    List<ReferralCredit> findAllByOrderByCreatedAtDesc();
    List<ReferralCredit> findAllByStatusOrderByCreatedAtDesc(String status);
}

package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.OfflineStaffReview;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.*;
import java.util.*;

public interface OfflineStaffReviewRepository extends JpaRepository<OfflineStaffReview, UUID> {
    Optional<OfflineStaffReview> findByTenantIdAndActorIdAndOperationId(String tenant, UUID actor, String operation);
    Optional<OfflineStaffReview> findByIdAndTenantId(UUID id, String tenant);
    Page<OfflineStaffReview> findByTenantIdAndStatus(String tenant, String status, Pageable page);
}

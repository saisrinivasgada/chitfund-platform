package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.OfflinePaymentReview;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface OfflinePaymentReviewRepository extends JpaRepository<OfflinePaymentReview, UUID> {
    Optional<OfflinePaymentReview> findByTenantIdAndOperationId(String tenantId, String operationId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM OfflinePaymentReview r WHERE r.tenantId=:tenantId AND r.operationId=:operation")
    Optional<OfflinePaymentReview> findOperationForUpdate(@Param("tenantId") String tenant, @Param("operation") String operation);
    Optional<OfflinePaymentReview> findByIdAndTenantId(UUID id, String tenantId);
    Page<OfflinePaymentReview> findByTenantIdAndStatus(String tenantId, String status, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM OfflinePaymentReview r WHERE r.id=:id AND r.tenantId=:tenantId")
    Optional<OfflinePaymentReview> lock(@Param("id") UUID id, @Param("tenantId") String tenantId);

    @Modifying
    @Query(value = "INSERT INTO offline_payment_reviews (id,tenant_id,actor_id,operation_id,payload_hash,request_json,reason,status,submitted_at,cash_request_id) "
            + "VALUES (:id,:tenant,:actor,:operation,:hash,:payload,:reason,'PENDING',:submitted,:cashRequestId) "
            + "ON DUPLICATE KEY UPDATE id=offline_payment_reviews.id", nativeQuery = true)
    int insertIfAbsent(@Param("id") String id, @Param("tenant") String tenant, @Param("actor") String actor,
            @Param("operation") String operation, @Param("hash") String hash, @Param("payload") String payload,
            @Param("reason") String reason, @Param("submitted") java.sql.Timestamp submitted, @Param("cashRequestId") String cashRequestId);
}

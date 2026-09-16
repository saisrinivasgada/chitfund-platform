package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.IdentityOperationExecution;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface IdentityOperationExecutionRepository extends JpaRepository<IdentityOperationExecution, String> {
    @Modifying
    @Query(value = "INSERT IGNORE INTO identity_operation_executions(operation_id, request_hash, status, created_at) VALUES (:id, :hash, 'STARTED', NOW(6))", nativeQuery = true)
    int insertIfAbsent(@Param("id") String id, @Param("hash") String hash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from IdentityOperationExecution e where e.operationId = :id")
    Optional<IdentityOperationExecution> findByIdForUpdate(@Param("id") String id);
}

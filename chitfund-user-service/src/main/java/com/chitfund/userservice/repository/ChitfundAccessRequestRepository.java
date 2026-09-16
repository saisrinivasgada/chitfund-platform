package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.ChitfundAccessRequest;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChitfundAccessRequestRepository extends JpaRepository<ChitfundAccessRequest, UUID> {
    Optional<ChitfundAccessRequest> findFirstByTenantIdAndMemberIdAndStatusInOrderByCreatedAtDesc(
            UUID tenantId, UUID memberId, Collection<ChitfundRequestStatus> statuses);

    List<ChitfundAccessRequest> findAllByCandidateUserIdAndStatusInOrderByCreatedAtDesc(
            UUID candidateUserId, Collection<ChitfundRequestStatus> statuses);

    List<ChitfundAccessRequest> findAllByTenantIdAndMemberIdOrderByCreatedAtDesc(UUID tenantId, UUID memberId);

    List<ChitfundAccessRequest> findAllByTenantIdAndMemberIdAndStatusInAndExpiresAtBefore(
            UUID tenantId, UUID memberId, Collection<ChitfundRequestStatus> statuses,
            java.time.LocalDateTime now);

    List<ChitfundAccessRequest> findAllByCandidateUserIdAndStatusInAndExpiresAtBefore(
            UUID candidateUserId, Collection<ChitfundRequestStatus> statuses,
            java.time.LocalDateTime now);

    Optional<ChitfundAccessRequest> findByMemberActionTokenHash(String memberActionTokenHash);

    @Modifying
    @Query("update ChitfundAccessRequest r set r.status = :expired, r.memberActionTokenHash = null " +
            "where r.tenantId = :tenantId and r.memberId = :memberId and r.status in :statuses and r.expiresAt < :now")
    int expireOpenForMember(@Param("tenantId") UUID tenantId, @Param("memberId") UUID memberId,
                            @Param("statuses") Collection<ChitfundRequestStatus> statuses,
                            @Param("expired") ChitfundRequestStatus expired,
                            @Param("now") java.time.LocalDateTime now);

    @Modifying
    @Query("update ChitfundAccessRequest r set r.status = :expired, r.memberActionTokenHash = null " +
            "where r.candidateUserId = :userId and r.status in :statuses and r.expiresAt < :now")
    int expireOpenForUser(@Param("userId") UUID userId,
                          @Param("statuses") Collection<ChitfundRequestStatus> statuses,
                          @Param("expired") ChitfundRequestStatus expired,
                          @Param("now") java.time.LocalDateTime now);

    @Modifying
    @Query("update ChitfundAccessRequest r set r.status = :expired, r.memberActionTokenHash = null " +
            "where r.id = :id and r.status in :statuses and r.expiresAt < :now")
    int expireByIdIfDue(@Param("id") UUID id,
                       @Param("statuses") Collection<ChitfundRequestStatus> statuses,
                       @Param("expired") ChitfundRequestStatus expired,
                       @Param("now") java.time.LocalDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ChitfundAccessRequest r where r.id = :id")
    Optional<ChitfundAccessRequest> findByIdForUpdate(@Param("id") UUID id);
}

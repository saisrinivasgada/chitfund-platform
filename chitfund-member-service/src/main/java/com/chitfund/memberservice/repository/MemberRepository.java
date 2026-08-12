package com.chitfund.memberservice.repository;

import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface MemberRepository extends JpaRepository<Member, UUID> {

    // Tenant-scoped lookups (primary path for all multi-tenant operations)
    boolean existsByPhoneAndPhoneCountryCodeAndTenantIdAndDeletedAtIsNull(
            String phone, String phoneCountryCode, String tenantId);

    Optional<Member> findByPhoneAndPhoneCountryCodeAndTenantIdAndDeletedAtIsNull(
            String phone, String phoneCountryCode, String tenantId);

    boolean existsByUserIdAndTenantId(UUID userId, String tenantId);

    Optional<Member> findByUserIdAndTenantId(UUID userId, String tenantId);

    // ── Super-admin usage summary ────────────────────────────────────────────────
    @Query("SELECT m.tenantId AS tenantId, COUNT(m) AS memberCount FROM Member m WHERE m.deletedAt IS NULL GROUP BY m.tenantId")
    List<Map<String, Object>> countMembersByTenant();

    // Legacy / fallback (no tenant scope — used by internal cross-tenant lookups)
    boolean existsByPhoneAndDeletedAtIsNull(String phone);

    boolean existsByUserId(UUID userId);

    Optional<Member> findByPhoneAndDeletedAtIsNull(String phone);

    Optional<Member> findByUserId(UUID userId);

    boolean existsByIdAndStatus(UUID id, MemberStatus status);

    // Tenant-scoped search
    @Query("""
            SELECT m FROM Member m
            WHERE m.tenantId = :tenantId
            AND   m.deletedAt IS NULL
            AND   (:search IS NULL
                   OR LOWER(m.fullName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR m.phone LIKE CONCAT('%', :search, '%'))
            AND   (:status IS NULL OR m.status = :status)
            ORDER BY m.fullName ASC
            """)
    Page<Member> search(@Param("tenantId") String tenantId,
                        @Param("search") String search,
                        @Param("status") MemberStatus status,
                        Pageable pageable);

    @Query("""
            SELECT m FROM Member m
            WHERE m.tenantId = :tenantId
            AND   m.deletedAt IS NOT NULL
            AND   (:search IS NULL
                   OR LOWER(m.fullName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR m.phone LIKE CONCAT('%', :search, '%'))
            ORDER BY m.deletedAt DESC
            """)
    Page<Member> searchDeleted(@Param("tenantId") String tenantId,
                               @Param("search") String search,
                               Pageable pageable);

    long countByTenantIdAndDeletedAtIsNull(String tenantId);
}

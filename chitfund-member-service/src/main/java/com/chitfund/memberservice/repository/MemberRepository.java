package com.chitfund.memberservice.repository;

import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface MemberRepository extends JpaRepository<Member, UUID> {

    boolean existsByPhoneAndDeletedAtIsNull(String phone);

    boolean existsByUserId(UUID userId);

    Optional<Member> findByPhoneAndDeletedAtIsNull(String phone);

    Optional<Member> findByUserId(UUID userId);

    boolean existsByIdAndStatus(UUID id, MemberStatus status);

    // Active members only (deletedAt IS NULL), optional name/phone search + status filter
    @Query("""
            SELECT m FROM Member m
            WHERE m.deletedAt IS NULL
            AND   (:search IS NULL
                   OR LOWER(m.fullName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR m.phone LIKE CONCAT('%', :search, '%'))
            AND   (:status IS NULL OR m.status = :status)
            ORDER BY m.fullName ASC
            """)
    Page<Member> search(@Param("search") String search,
                        @Param("status") MemberStatus status,
                        Pageable pageable);

    // Soft-deleted members only
    @Query("""
            SELECT m FROM Member m
            WHERE m.deletedAt IS NOT NULL
            AND   (:search IS NULL
                   OR LOWER(m.fullName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR m.phone LIKE CONCAT('%', :search, '%'))
            ORDER BY m.deletedAt DESC
            """)
    Page<Member> searchDeleted(@Param("search") String search, Pageable pageable);
}

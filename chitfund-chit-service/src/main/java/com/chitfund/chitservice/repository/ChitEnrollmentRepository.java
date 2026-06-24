package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChitEnrollmentRepository extends JpaRepository<ChitEnrollment, UUID> {

    List<ChitEnrollment> findByChitIdAndActiveTrue(UUID chitId);

    // Returns all spots for a member in a chit (multi-spot allowed)
    List<ChitEnrollment> findByChitIdAndMemberIdAndActiveTrue(UUID chitId, UUID memberId);

    // Still useful to check at least one active spot exists
    boolean existsByChitIdAndMemberIdAndActiveTrue(UUID chitId, UUID memberId);

    long countByChitIdAndActiveTrue(UUID chitId);

    // How many spots a specific member holds
    long countByChitIdAndMemberIdAndActiveTrue(UUID chitId, UUID memberId);

    // All member IDs (with duplicates for multi-spot) currently active in a chit
    @Query("SELECT e.memberId FROM ChitEnrollment e WHERE e.chit.id = :chitId AND e.active = true")
    List<UUID> findActiveMemberIdsByChitId(UUID chitId);

    // All distinct chit IDs a member is actively enrolled in
    @Query("SELECT DISTINCT e.chit.id FROM ChitEnrollment e WHERE e.memberId = :memberId AND e.active = true")
    List<UUID> findDistinctChitIdsByMemberId(UUID memberId);

    // ALL enrollments for a member (active AND inactive) — used by settlement service
    List<ChitEnrollment> findAllByMemberId(UUID memberId);

    // One spot at a time (first found) — used by remove endpoint
    @Query("SELECT e FROM ChitEnrollment e WHERE e.chit.id = :chitId AND e.memberId = :memberId AND e.active = true ORDER BY e.enrolledAt ASC")
    Optional<ChitEnrollment> findFirstActiveSpot(UUID chitId, UUID memberId);
}

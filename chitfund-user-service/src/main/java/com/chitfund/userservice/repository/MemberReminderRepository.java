package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.MemberReminder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface MemberReminderRepository extends JpaRepository<MemberReminder, UUID> {

    // Admin: all reminders for a member in org (never include archived)
    Page<MemberReminder> findByOrgIdAndMemberProfileIdOrderByCreatedAtDesc(
            String orgId, UUID memberProfileId, Pageable pageable);

    // Member: all (including archived)
    Page<MemberReminder> findByMemberUserIdOrderByCreatedAtDesc(UUID memberUserId, Pageable pageable);

    // Member: only non-archived
    Page<MemberReminder> findByMemberUserIdAndArchivedFalseOrderByCreatedAtDesc(UUID memberUserId, Pageable pageable);

    // Member: only archived
    Page<MemberReminder> findByMemberUserIdAndArchivedTrueOrderByCreatedAtDesc(UUID memberUserId, Pageable pageable);

    // Member: unread = not archived and readAt is null
    @Query("SELECT r FROM MemberReminder r WHERE r.memberUserId = :uid AND r.archived = false AND r.readAt IS NULL ORDER BY r.createdAt DESC")
    Page<MemberReminder> findUnreadByMemberUserId(@Param("uid") UUID memberUserId, Pageable pageable);

    Optional<MemberReminder> findByIdAndMemberUserId(UUID id, UUID memberUserId);
    Optional<MemberReminder> findByIdAndOrgId(UUID id, String orgId);
}

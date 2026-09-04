package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.ChatGroup;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatGroupRepository extends JpaRepository<ChatGroup, String> {

    List<ChatGroup> findByTenantIdOrderByLastMessageAtDesc(String tenantId, Pageable pageable);

    Optional<ChatGroup> findByIdAndTenantId(String id, String tenantId);

    /** Only returns groups the user is a member of — avoids leaking private groups. */
    @Query("SELECT g FROM ChatGroup g JOIN ChatGroupMember m ON g.id = m.groupId WHERE g.tenantId = :tenantId AND m.userId = :userId ORDER BY CASE WHEN g.lastMessageAt IS NULL THEN 1 ELSE 0 END, g.lastMessageAt DESC")
    List<ChatGroup> findByTenantIdAndMemberUserIdOrderByLastMessageAtDesc(
            @Param("tenantId") String tenantId, @Param("userId") String userId, Pageable pageable);

    @Modifying
    @Query("UPDATE ChatGroup g SET g.memberCount = g.memberCount + 1 WHERE g.id = :id")
    void incrementMemberCount(@Param("id") String id);

    @Modifying
    @Query("UPDATE ChatGroup g SET g.memberCount = GREATEST(0, g.memberCount - 1) WHERE g.id = :id")
    void decrementMemberCount(@Param("id") String id);
}

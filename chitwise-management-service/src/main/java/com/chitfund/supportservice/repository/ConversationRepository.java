package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.Conversation;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ConversationRepository extends JpaRepository<Conversation, String> {

    Optional<Conversation> findByTenantIdAndMemberId(String tenantId, String memberId);

    List<Conversation> findByTenantIdOrderByLastMessageAtDesc(String tenantId, Pageable pageable);

    @Modifying
    @Query("UPDATE Conversation c SET c.adminUnread = 0 WHERE c.id = :id")
    void clearAdminUnread(@Param("id") String id);

    @Modifying
    @Query("UPDATE Conversation c SET c.memberUnread = 0 WHERE c.id = :id")
    void clearMemberUnread(@Param("id") String id);

    @Modifying
    @Query("UPDATE Conversation c SET c.adminUnread = c.adminUnread + 1 WHERE c.id = :id")
    void incrementAdminUnread(@Param("id") String id);

    @Modifying
    @Query("UPDATE Conversation c SET c.memberUnread = c.memberUnread + 1 WHERE c.id = :id")
    void incrementMemberUnread(@Param("id") String id);

    @Query("SELECT COALESCE(SUM(c.adminUnread), 0) FROM Conversation c WHERE c.tenantId = :tenantId")
    long sumAdminUnreadForTenant(@Param("tenantId") String tenantId);

    @Query("SELECT COALESCE(c.memberUnread, 0) FROM Conversation c WHERE c.memberId = :memberId AND c.tenantId = :tenantId")
    Optional<Long> getMemberUnread(@Param("memberId") String memberId, @Param("tenantId") String tenantId);
}

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

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT c FROM Conversation c WHERE c.id=:id" + " AND c.tenantId=:tenantId")
    java.util.Optional<Conversation> findForUpdate(@org.springframework.data.repository.query.Param("id") String id, @org.springframework.data.repository.query.Param("tenantId") String tenantId);

    Optional<Conversation> findByTenantIdAndMemberId(String tenantId, String memberId);

    List<Conversation> findByTenantIdOrderByLastMessageAtDesc(String tenantId, Pageable pageable);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Conversation c SET c.lastMessageAt=:at, c.lastMessagePreview=:preview, " +
            "c.lastMessageIsAdmin=:isAdmin, c.memberUnread=c.memberUnread + CASE WHEN :isAdmin=true THEN 1 ELSE 0 END, " +
            "c.adminUnread=c.adminUnread + CASE WHEN :isAdmin=true THEN 0 ELSE 1 END WHERE c.id=:id")
    void recordMessage(@Param("id") String id, @Param("at") java.time.Instant at,
                       @Param("preview") String preview, @Param("isAdmin") boolean isAdmin);

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

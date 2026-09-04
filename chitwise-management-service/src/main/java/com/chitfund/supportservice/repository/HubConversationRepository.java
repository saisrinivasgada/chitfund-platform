package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubConversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface HubConversationRepository extends JpaRepository<HubConversation, String> {

    @Query("SELECT c FROM HubConversation c WHERE c.employee1Id = :eid OR c.employee2Id = :eid ORDER BY CASE WHEN c.lastMessageAt IS NULL THEN 1 ELSE 0 END, c.lastMessageAt DESC")
    List<HubConversation> findByEmployee(String eid);

    @Query("SELECT c FROM HubConversation c WHERE (c.employee1Id = :e1 AND c.employee2Id = :e2) OR (c.employee1Id = :e2 AND c.employee2Id = :e1)")
    Optional<HubConversation> findBetween(@Param("e1") String e1, @Param("e2") String e2);

    @Modifying
    @Query("UPDATE HubConversation c SET c.employee1Unread = c.employee1Unread + 1 WHERE c.id = :id")
    void incrementEmployee1Unread(@Param("id") String id);

    @Modifying
    @Query("UPDATE HubConversation c SET c.employee2Unread = c.employee2Unread + 1 WHERE c.id = :id")
    void incrementEmployee2Unread(@Param("id") String id);

    @Modifying
    @Query("UPDATE HubConversation c SET c.employee1Unread = 0 WHERE c.id = :id")
    void clearEmployee1Unread(@Param("id") String id);

    @Modifying
    @Query("UPDATE HubConversation c SET c.employee2Unread = 0 WHERE c.id = :id")
    void clearEmployee2Unread(@Param("id") String id);

    @Modifying
    @Query("UPDATE HubConversation c SET c.lastMessageAt = :at, c.lastMessagePreview = :preview WHERE c.id = :id")
    void updatePreview(@Param("id") String id, @Param("at") Instant at, @Param("preview") String preview);
}

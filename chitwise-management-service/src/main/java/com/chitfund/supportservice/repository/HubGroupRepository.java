package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface HubGroupRepository extends JpaRepository<HubGroup, String> {

    @Query("SELECT g FROM HubGroup g JOIN HubGroupMember m ON m.groupId = g.id WHERE m.employeeId = :eid ORDER BY CASE WHEN g.lastMessageAt IS NULL THEN 1 ELSE 0 END, g.lastMessageAt DESC")
    List<HubGroup> findByMember(@Param("eid") String employeeId);

    @Modifying
    @Query("UPDATE HubGroup g SET g.memberCount = g.memberCount + 1 WHERE g.id = :id")
    void incrementMemberCount(@Param("id") String id);

    @Modifying
    @Query("UPDATE HubGroup g SET g.memberCount = GREATEST(0, g.memberCount - 1) WHERE g.id = :id")
    void decrementMemberCount(@Param("id") String id);
}

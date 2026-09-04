package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HubGroupMemberRepository extends JpaRepository<HubGroupMember, String> {

    List<HubGroupMember> findByGroupId(String groupId);

    Optional<HubGroupMember> findByGroupIdAndEmployeeId(String groupId, String employeeId);

    boolean existsByGroupIdAndEmployeeId(String groupId, String employeeId);

    long countByGroupId(String groupId);
}

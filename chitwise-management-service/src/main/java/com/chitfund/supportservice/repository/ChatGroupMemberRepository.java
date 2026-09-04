package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.ChatGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ChatGroupMemberRepository extends JpaRepository<ChatGroupMember, String> {

    List<ChatGroupMember> findByGroupId(String groupId);

    Optional<ChatGroupMember> findByGroupIdAndUserId(String groupId, String userId);

    boolean existsByGroupIdAndUserId(String groupId, String userId);

    long countByGroupId(String groupId);
}

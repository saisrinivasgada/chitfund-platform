package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.InvitationResponse;
import com.chitfund.chitservice.domain.enums.InvitationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvitationResponseRepository extends JpaRepository<InvitationResponse, UUID> {

    List<InvitationResponse> findByInvitationId(UUID invitationId);

    Optional<InvitationResponse> findByInvitationIdAndMemberId(UUID invitationId, UUID memberId);

    List<InvitationResponse> findByMemberIdAndInvitation_StatusAndInvitation_TenantId(
            UUID memberId, InvitationStatus status, String tenantId);

    List<InvitationResponse> findByMemberIdAndInvitation_TenantId(UUID memberId, String tenantId);

    @Query("SELECT r FROM InvitationResponse r JOIN r.invitation i WHERE r.id = :id AND i.tenantId = :tenantId")
    Optional<InvitationResponse> findByIdAndTenantId(@Param("id") UUID id, @Param("tenantId") String tenantId);
}

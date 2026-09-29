package com.chitfund.memberservice.controller;

import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import com.chitfund.memberservice.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InternalMemberControllerTest {
    @Mock private MemberRepository memberRepository;
    @InjectMocks private InternalMemberController controller;

    @BeforeEach
    void configureKey() {
        ReflectionTestUtils.setField(controller, "internalKey", "test-key");
    }

    @Test
    void activateIsIdempotentForInactiveMember() {
        UUID id = UUID.randomUUID();
        String tenantId = UUID.randomUUID().toString();
        Member member = Member.builder().id(id).tenantId(tenantId).status(MemberStatus.INACTIVE).build();
        when(memberRepository.findByIdAndTenantId(id, tenantId)).thenReturn(Optional.of(member));

        var response = controller.activateMember(id, "test-key", tenantId);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(member.getStatus()).isEqualTo(MemberStatus.ACTIVE);
        verify(memberRepository).save(member);
    }

    @Test
    void settlementSyncNeverOverridesBlacklist() {
        UUID id = UUID.randomUUID();
        String tenantId = UUID.randomUUID().toString();
        Member member = Member.builder().id(id).tenantId(tenantId).status(MemberStatus.BLACKLISTED).build();
        when(memberRepository.findByIdAndTenantId(id, tenantId)).thenReturn(Optional.of(member));

        var response = controller.activateMember(id, "test-key", tenantId);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(member.getStatus()).isEqualTo(MemberStatus.BLACKLISTED);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void activationCannotCrossTenantBoundary() {
        UUID id = UUID.randomUUID();
        String requestedTenant = UUID.randomUUID().toString();
        when(memberRepository.findByIdAndTenantId(id, requestedTenant)).thenReturn(Optional.empty());

        var response = controller.activateMember(id, "test-key", requestedTenant);

        assertThat(response.getBody()).containsEntry("success", false);
        verify(memberRepository, never()).findById(id);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void validationRequiresTenantAndUsesTenantScopedLookup() {
        UUID id = UUID.randomUUID();
        String tenantId = UUID.randomUUID().toString();
        when(memberRepository.existsByIdAndTenantIdAndStatusAndDeletedAtIsNull(
                id, tenantId, MemberStatus.ACTIVE)).thenReturn(true);

        var valid = controller.validateMember(id, "test-key", tenantId);
        var missingTenant = controller.validateMember(id, "test-key", null);

        assertThat(valid.getBody()).containsEntry("active", true);
        assertThat(missingTenant.getStatusCode().value()).isEqualTo(401);
        verify(memberRepository).existsByIdAndTenantIdAndStatusAndDeletedAtIsNull(
                id, tenantId, MemberStatus.ACTIVE);
        verifyNoMoreInteractions(memberRepository);
    }

    @Test
    void batchLookupReturnsOnlyProfilesFromRequestedTenant() {
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String tenantId = UUID.randomUUID().toString();
        Member member = Member.builder().id(memberId).tenantId(tenantId).userId(userId).build();
        when(memberRepository.findAllByTenantIdAndIdInAndDeletedAtIsNull(
                tenantId, List.of(memberId))).thenReturn(List.of(member));

        var response = controller.batchGetUserIds(
                List.of(memberId.toString()), "test-key", tenantId);

        assertThat(response.getBody()).containsEntry(memberId.toString(), userId.toString());
        verify(memberRepository).findAllByTenantIdAndIdInAndDeletedAtIsNull(
                tenantId, List.of(memberId));
    }
}

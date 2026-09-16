package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.memberservice.client.AuditClient;
import com.chitfund.memberservice.client.UserServiceClient;
import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.dto.request.CreateMemberRequest;
import com.chitfund.memberservice.dto.request.UpdateMemberRequest;
import com.chitfund.memberservice.messaging.MemberEventPublisher;
import com.chitfund.memberservice.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MemberServiceIdentityOwnershipTest {
    private static final String TENANT = "10000000-0000-0000-0000-000000000001";
    @Mock MemberRepository memberRepository;
    @Mock MemberEventPublisher memberEventPublisher;
    @Mock AuditClient auditClient;
    @Mock UserServiceClient userServiceClient;
    @Mock PlanLimitChecker planLimitChecker;
    MemberService service;
    Member member;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT);
        service = new MemberService(memberRepository, memberEventPublisher, auditClient,
                userServiceClient, planLimitChecker);
        member = Member.builder().id(UUID.randomUUID()).tenantId(TENANT).fullName("Member One")
                .phone("9876543210").phoneCountryCode("+91").email("contact@example.com")
                .city("Hyderabad").hasAppAccess(true).build();
        lenient().when(memberRepository.findById(member.getId())).thenReturn(Optional.of(member));
    }

    @AfterEach
    void clearTenant() { TenantContext.clear(); }

    @Test
    void adminCannotChangePersonalFieldsAfterAppAccessActivation() {
        UpdateMemberRequest request = unchangedRequest();
        request.setPhone("9123456789");

        assertThatThrownBy(() -> service.updateMember(member.getId(), request, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("member controls");
        verify(memberRepository, never()).save(any());
    }

    @Test
    void adminCanStillMaintainOperationalNotesAfterActivation() {
        UpdateMemberRequest request = unchangedRequest();
        request.setNotes("Pays at the branch");
        when(memberRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        var response = service.updateMember(member.getId(), request, UUID.randomUUID());

        assertThat(response.getNotes()).isEqualTo("Pays at the branch");
        verify(memberRepository).save(member);
    }

    @Test
    void sparseOperationalUpdateDoesNotEraseOmittedProfileFields() {
        member.setHasAppAccess(false);
        UpdateMemberRequest request = new UpdateMemberRequest();
        request.setNotes("Updated note only");
        when(memberRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        service.updateMember(member.getId(), request, UUID.randomUUID());

        assertThat(member.getFullName()).isEqualTo("Member One");
        assertThat(member.getPhone()).isEqualTo("9876543210");
        assertThat(member.getEmail()).isEqualTo("contact@example.com");
        assertThat(member.getCity()).isEqualTo("Hyderabad");
        assertThat(member.getNotes()).isEqualTo("Updated note only");
    }

    @Test
    void explicitNullReferralClearsItButOmissionPreservesIt() {
        UUID referrer = UUID.randomUUID();
        member.setHasAppAccess(false);
        member.setReferredById(referrer);
        when(memberRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(memberRepository.findById(referrer)).thenReturn(Optional.empty());

        UpdateMemberRequest omitted = new UpdateMemberRequest();
        omitted.setNotes("unchanged referral");
        service.updateMember(member.getId(), omitted, UUID.randomUUID());
        assertThat(member.getReferredById()).isEqualTo(referrer);

        UpdateMemberRequest clear = new UpdateMemberRequest();
        clear.setReferredById(null);
        service.updateMember(member.getId(), clear, UUID.randomUUID());
        assertThat(member.getReferredById()).isNull();
    }

    @Test
    void memberCreationRejectsLegacyDirectUserLinking() {
        CreateMemberRequest request = new CreateMemberRequest();
        request.setFullName("Member Two");
        request.setPhone("9123456789");
        request.setPhoneCountryCode("+91");
        request.setEmail("member.two@example.com");
        request.setUserId(UUID.randomUUID());

        assertThatThrownBy(() -> service.createMember(request, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Direct account linking is disabled");
        verify(memberRepository, never()).save(any());
    }

    @Test
    void memberCreationReturnsTheOneTimeAppAccessLinkMaterial() {
        CreateMemberRequest request = new CreateMemberRequest();
        request.setFullName("Member Two");
        request.setPhone("9123456789");
        request.setPhoneCountryCode("+91");
        request.setEmail("member.two@example.com");
        request.setSendAppAccess(true);
        UUID requestId = UUID.randomUUID();
        when(memberRepository.save(any())).thenAnswer(call -> {
            Member saved = call.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(userServiceClient.createAppAccessRequest(eq(TENANT), any(), eq("9123456789"),
                eq("+91"), eq("member.two@example.com"), any()))
                .thenReturn(Map.of(
                        "id", requestId.toString(),
                        "status", "PENDING_MEMBER",
                        "setupToken", "setup-once",
                        "actionToken", "action-once"));

        var response = service.createMember(request, UUID.randomUUID());

        assertThat(response.getAppAccessRequestId()).isEqualTo(requestId.toString());
        assertThat(response.getAppAccessRequestStatus()).isEqualTo("PENDING_MEMBER");
        assertThat(response.getSetupToken()).isEqualTo("setup-once");
        assertThat(response.getActionToken()).isEqualTo("action-once");
    }

    private UpdateMemberRequest unchangedRequest() {
        UpdateMemberRequest request = new UpdateMemberRequest();
        request.setFullName(member.getFullName());
        request.setPhone(member.getPhone());
        request.setPhoneCountryCode(member.getPhoneCountryCode());
        request.setEmail(member.getEmail());
        request.setCity(member.getCity());
        return request;
    }
}

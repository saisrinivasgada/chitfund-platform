package com.chitfund.userservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.MemberServiceClient;
import com.chitfund.userservice.domain.entity.ChitfundAccessRequest;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.ChitfundRequestKind;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.InOrder;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChitfundRequestServiceTest {
    @Mock ChitfundAccessRequestRepository requestRepository;
    @Mock UserRepository userRepository;
    @Mock MemberUserLinkRepository memberLinkRepository;
    @Mock TenantRepository tenantRepository;
    @Mock AccountSetupTokenRepository setupTokenRepository;
    @Mock AccountEmailOtpService emailOtpService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock PasswordValidator passwordValidator;
    @Mock OtpService otpService;
    @Mock AuthService authService;
    @Mock TenantService tenantService;
    @Mock MemberServiceClient memberServiceClient;
    @Mock ChitfundRequestStateService requestStateService;
    @Mock ChitfundRequestAuditRepository requestAuditRepository;
    @Mock org.springframework.context.ApplicationEventPublisher eventPublisher;
    ChitfundRequestService service;

    @BeforeEach
    void setUp() {
        service = new ChitfundRequestService(requestRepository, userRepository, memberLinkRepository,
                tenantRepository, setupTokenRepository, emailOtpService, passwordEncoder,
                passwordValidator, otpService, authService, tenantService, memberServiceClient,
                requestStateService, requestAuditRepository, eventPublisher);
        lenient().when(requestRepository.findFirstByTenantIdAndMemberIdAndStatusInOrderByCreatedAtDesc(any(), any(), any()))
                .thenReturn(Optional.empty());
        lenient().when(requestRepository.saveAndFlush(any())).thenAnswer(call -> {
            ChitfundAccessRequest request = call.getArgument(0);
            if (request.getId() == null) request.setId(UUID.randomUUID());
            return request;
        });
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void newAccountSetupTokenAndPhoneOtpAreBoundToExactRequest() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull("9876543210", "+91"))
                .thenReturn(List.of());
        when(userRepository.save(any())).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(userId);
            return user;
        });
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        when(authService.generateSetupToken(eq(userId), any())).thenReturn("setup-token");

        var response = service.create(tenantId, memberId, "98765 43210", "+91",
                "member@example.com", UUID.randomUUID());

        assertThat(response.getRequestKind()).isEqualTo(ChitfundRequestKind.NEW_ACCOUNT);
        assertThat(response.getSetupToken()).isEqualTo("setup-token");
        verify(authService).generateSetupToken(userId, response.getId());
        verify(otpService).sendOtp("9876543210", "+91", "APP_ACCESS_SETUP", response.getId().toString());
        verifyNoInteractions(memberLinkRepository, memberServiceClient);
    }

    @Test
    void matchingPhoneCreatesApprovalRequestButNeverSilentlyLinksExistingUser() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        User existing = User.builder().id(UUID.randomUUID()).username("member")
                .phone("9876543210").phoneCountryCode("+91").role(Role.MEMBER)
                .hasAppAccess(true).mustChangePassword(false).build();
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull("9876543210", "+91"))
                .thenReturn(List.of(existing));

        var response = service.create(tenantId, memberId, "9876543210", "+91",
                "member@example.com", UUID.randomUUID());

        assertThat(response.getRequestKind()).isEqualTo(ChitfundRequestKind.LINK_EXISTING);
        assertThat(response.getStatus().name()).isEqualTo("PENDING_MEMBER");
        verifyNoInteractions(memberLinkRepository, memberServiceClient, authService, otpService);
    }

    @Test
    void phoneMismatchPersistsEscalatedStateInsteadOfRollingItBack() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ChitfundAccessRequest request = existingRequest(requestId, userId, ChitfundRequestStatus.PENDING_MEMBER);
        User user = User.builder().id(userId).role(Role.MEMBER)
                .phone("9000000000").phoneCountryCode("+91").build();
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(requestRepository.save(request)).thenReturn(request);

        var response = service.accept(requestId, userId, "123456");

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.ESCALATED);
        verify(requestRepository).save(request);
        verify(otpService, never()).verifyOtp(any(), any(), any(), any());
    }

    @Test
    void repeatedAcceptAfterVerificationIsIdempotent() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ChitfundAccessRequest request = existingRequest(requestId, userId, ChitfundRequestStatus.AWAITING_ADMIN);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));

        var response = service.accept(requestId, userId, "123456");

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.AWAITING_ADMIN);
        verify(otpService, never()).verifyOtp(any(), any(), any(), any());
        verify(requestRepository, never()).save(any());
    }

    @Test
    void confirmationChecksLocalUniqueLinkBeforeCrossServiceActivation() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());
        ChitfundAccessRequest request = existingRequest(requestId, userId, ChitfundRequestStatus.AWAITING_ADMIN);
        request.setTenantId(tenantId);
        request.setMemberId(memberId);
        User user = User.builder().id(userId).role(Role.MEMBER).build();
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);
        when(requestRepository.save(request)).thenReturn(request);

        service.confirm(requestId, UUID.randomUUID());

        InOrder order = inOrder(tenantService, memberServiceClient);
        order.verify(tenantService).addUserToTenant(userId, tenantId, Role.MEMBER, memberId);
        order.verify(memberServiceClient).activateAppAccess(tenantId, memberId, userId, requestId);
        assertThat(request.getStatus()).isEqualTo(ChitfundRequestStatus.ACTIVE);
    }

    @Test
    void databaseRaceDuringRequestCreationBecomesConflict() {
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull("9876543210", "+91"))
                .thenReturn(List.of());
        when(userRepository.save(any())).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(UUID.randomUUID());
            return user;
        });
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        doThrow(new org.springframework.dao.DataIntegrityViolationException("duplicate active slot"))
                .when(requestRepository).saveAndFlush(any());

        assertThatThrownBy(() -> service.create(UUID.randomUUID(), UUID.randomUUID(),
                "9876543210", "+91", "member@example.com", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("active Chitfund Request");
    }

    @Test
    void approvedPhoneReassignmentRevokesOldRequestBeforeCreatingNewIdentityRequest() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID oldUserId = UUID.randomUUID();
        UUID newUserId = UUID.randomUUID();
        ChitfundAccessRequest old = existingRequest(
                UUID.randomUUID(), oldUserId, ChitfundRequestStatus.PENDING_MEMBER);
        old.setTenantId(tenantId);
        old.setMemberId(memberId);
        User replacementUser = User.builder().id(newUserId).role(Role.MEMBER)
                .phone("9876543210").phoneCountryCode("+91")
                .hasAppAccess(false).mustChangePassword(true).build();
        when(requestRepository.findFirstByTenantIdAndMemberIdAndStatusInOrderByCreatedAtDesc(
                eq(tenantId), eq(memberId), any()))
                .thenReturn(Optional.of(old), Optional.empty());
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull("9876543210", "+91"))
                .thenReturn(List.of(replacementUser));
        when(userRepository.findById(newUserId)).thenReturn(Optional.of(replacementUser));
        when(authService.generateSetupToken(eq(newUserId), any())).thenReturn("new-setup-token");
        java.util.List<ChitfundAccessRequest> saved = new java.util.ArrayList<>();
        doAnswer(call -> {
            ChitfundAccessRequest request = call.getArgument(0);
            if (request.getId() == null) request.setId(UUID.randomUUID());
            saved.add(request);
            return request;
        }).when(requestRepository).saveAndFlush(any());
        when(requestRepository.findById(any())).thenAnswer(call -> saved.stream()
                .filter(request -> call.<UUID>getArgument(0).equals(request.getId()))
                .filter(request -> request != old)
                .findFirst());

        var response = service.replaceForApprovedPhoneReassignment(
                tenantId, memberId, "9876543210", "+91", "new@example.com",
                newUserId, "identity-case:1");

        assertThat(old.getStatus()).isEqualTo(ChitfundRequestStatus.REVOKED);
        assertThat(response.getRequestKind()).isEqualTo(ChitfundRequestKind.NEW_ACCOUNT);
        assertThat(response.getSetupToken()).isEqualTo("new-setup-token");
        assertThat(saved).hasSize(2);
        assertThat(saved.get(1).getCandidateUserId()).isEqualTo(newUserId);
    }

    private static ChitfundAccessRequest existingRequest(UUID requestId, UUID userId,
                                                         ChitfundRequestStatus status) {
        return ChitfundAccessRequest.builder()
                .id(requestId).tenantId(UUID.randomUUID()).memberId(UUID.randomUUID())
                .candidateUserId(userId).requestedPhone("9876543210").phoneCountryCode("+91")
                .requestKind(ChitfundRequestKind.LINK_EXISTING).status(status)
                .expiresAt(LocalDateTime.now().plusHours(1)).lastSentAt(LocalDateTime.now())
                .build();
    }
}

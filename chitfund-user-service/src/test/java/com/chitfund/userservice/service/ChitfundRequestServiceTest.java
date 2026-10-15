package com.chitfund.userservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.ChitfundAccessRequest;
import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.ChitfundRequestKind;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.SetupAccountRequest;
import com.chitfund.userservice.outbox.MemberDeactivationCommandOutbox;
import com.chitfund.userservice.outbox.SetupEmailOutbox;
import com.chitfund.userservice.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.ArrayList;
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
    @Mock EmailService emailService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock PasswordValidator passwordValidator;
    @Mock OtpService otpService;
    @Mock AuthService authService;
    @Mock TenantService tenantService;
    @Mock ChitfundRequestStateService requestStateService;
    @Mock ChitfundRequestAuditRepository requestAuditRepository;
    @Mock org.springframework.context.ApplicationEventPublisher eventPublisher;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock MemberDeactivationCommandOutbox deactivationOutbox;
    @Mock SetupEmailOutbox setupEmailOutbox;
    ChitfundRequestService service;

    @BeforeEach
    void setUp() {
        service = new ChitfundRequestService(requestRepository, userRepository, memberLinkRepository,
                tenantRepository, setupTokenRepository, emailOtpService, emailService, passwordEncoder,
                passwordValidator, otpService, authService, tenantService,
                requestStateService, requestAuditRepository, eventPublisher,
                refreshTokenRepository, deactivationOutbox, setupEmailOutbox);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "devOtpExposureEnabled", false);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "emailEnabled", false);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "frontendUrl", "https://app.thechitwise.com");
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
    void newAccountSetupEmailSentAndPhoneOtpAreBoundToExactRequest() {
        // emailEnabled=false in setUp → status UNAVAILABLE, no outbox enqueue
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
        when(otpService.isSmsProviderConfigured()).thenReturn(false);

        var response = service.create(tenantId, memberId, "98765 43210", "+91",
                "member@example.com", UUID.randomUUID());

        assertThat(response.getRequestKind()).isEqualTo(ChitfundRequestKind.NEW_ACCOUNT);
        assertThat(response.getSetupToken()).isNull();
        // Email disabled → status UNAVAILABLE, setupEmailSent=false
        assertThat(response.getSetupEmailStatus()).isEqualTo("UNAVAILABLE");
        assertThat(response.isSetupEmailSent()).isFalse();
        assertThat(response.isPhoneVerificationPending()).isFalse();
        verify(authService).generateSetupToken(userId, response.getId());
        verify(otpService).sendOtp("9876543210", "+91", "APP_ACCESS_SETUP", response.getId().toString());
        verifyNoInteractions(emailService);
        verifyNoInteractions(setupEmailOutbox);
        verifyNoInteractions(memberLinkRepository);
    }

    @Test
    void newAccountWithEmailEnabled_enqueuesToOutboxNotDirectSES() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "emailEnabled", true);
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
        when(otpService.isSmsProviderConfigured()).thenReturn(false);

        var response = service.create(tenantId, memberId, "9876543210", "+91",
                "member@example.com", UUID.randomUUID());

        assertThat(response.getSetupEmailStatus()).isEqualTo("PENDING");
        assertThat(response.isSetupEmailSent()).isFalse();
        verifyNoInteractions(emailService);
        verify(setupEmailOutbox).enqueue(eq(response.getId()), eq(userId),
                eq("member@example.com"), any(), any());
    }

    @Test
    void newAccountSetupTokenExposedWhenDevModeEnabled() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "devOtpExposureEnabled", true);
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull("9876543210", "+91"))
                .thenReturn(List.of());
        when(userRepository.save(any())).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(userId);
            return user;
        });
        when(passwordEncoder.encode(any())).thenReturn("encoded");
        when(authService.generateSetupToken(eq(userId), any())).thenReturn("setup-token");
        when(otpService.isSmsProviderConfigured()).thenReturn(true);

        var response = service.create(tenantId, memberId, "9876543210", "+91",
                "member@example.com", UUID.randomUUID());

        // In dev mode the raw token is exposed AND phone verification pending when SMS configured
        assertThat(response.getSetupToken()).isEqualTo("setup-token");
        assertThat(response.isPhoneVerificationPending()).isTrue();
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
        verifyNoInteractions(memberLinkRepository, authService, otpService);
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

        verify(tenantService).addUserToTenant(userId, tenantId, Role.MEMBER, memberId);
        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        IdentityNotificationEvent evt = (IdentityNotificationEvent) eventCaptor.getValue();
        assertThat(evt.type()).isEqualTo(IdentityNotificationEvent.Type.CHITFUND_ACCESS_ACTIVATED);
        assertThat(evt.activationTenantId()).isEqualTo(tenantId);
        assertThat(evt.activationMemberId()).isEqualTo(memberId);
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
        when(otpService.isSmsProviderConfigured()).thenReturn(false);
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
        when(otpService.isSmsProviderConfigured()).thenReturn(false);
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
        // setupToken is not exposed in production mode (devOtpExposureEnabled = false in setUp)
        assertThat(response.getSetupToken()).isNull();
        // emailEnabled=false in setUp → status UNAVAILABLE
        assertThat(response.getSetupEmailStatus()).isEqualTo("UNAVAILABLE");
        assertThat(response.isSetupEmailSent()).isFalse();
        assertThat(saved).hasSize(2);
        assertThat(saved.get(1).getCandidateUserId()).isEqualTo(newUserId);
    }

    // ─── Auto-activation ──────────────────────────────────────────────────────

    @Test
    void completingSetupAdvancesToAwaitingAdmin() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        AccountSetupToken token = AccountSetupToken.builder()
                .userId(userId).chitfundRequestId(requestId)
                .expiresAt(LocalDateTime.now().plusHours(1)).build();
        ChitfundAccessRequest request = ChitfundAccessRequest.builder()
                .id(requestId).tenantId(tenantId).memberId(memberId)
                .candidateUserId(userId).requestedPhone("9876543210").phoneCountryCode("+91")
                .requestKind(ChitfundRequestKind.NEW_ACCOUNT).status(ChitfundRequestStatus.PENDING_MEMBER)
                .expiresAt(LocalDateTime.now().plusHours(1)).lastSentAt(LocalDateTime.now())
                .build();
        User user = User.builder().id(userId).role(Role.MEMBER)
                .phone("9876543210").phoneCountryCode("+91").email("m@test.com")
                .username("mtest").hasAppAccess(false).build();

        when(setupTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(token));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(requestStateService.expireIfDue(eq(requestId), any())).thenReturn(false);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(passwordEncoder.encode(any())).thenReturn("hash");
        when(userRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(setupTokenRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(requestRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(requestRepository.findAllByCandidateUserIdAndStatusInOrderByCreatedAtDesc(eq(userId), any()))
                .thenReturn(new ArrayList<>());
        // SMS not configured — phone OTP is not required
        when(otpService.getDeliveryStatus(any(), any(), any()))
                .thenReturn(com.chitfund.userservice.domain.enums.SmsDeliveryStatus.PROVIDER_NOT_CONFIGURED);

        SetupAccountRequest input = new SetupAccountRequest();
        input.setToken("raw-token");
        input.setPhoneOtp("123456");
        input.setNewPassword("Secure@123");

        var response = service.completeSetup(input);

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.AWAITING_ADMIN);
        verify(tenantService, never()).addUserToTenant(any(), any(), any(), any());
        assertThat(user.isHasAppAccess()).isFalse();
    }

    @Test
    void acceptingExistingAccountAdvancesToAwaitingAdmin() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = ChitfundAccessRequest.builder()
                .id(requestId).tenantId(tenantId).memberId(memberId)
                .candidateUserId(userId).requestedPhone("9876543210").phoneCountryCode("+91")
                .requestKind(ChitfundRequestKind.LINK_EXISTING).status(ChitfundRequestStatus.PENDING_MEMBER)
                .expiresAt(LocalDateTime.now().plusHours(1)).lastSentAt(LocalDateTime.now())
                .build();
        User user = User.builder().id(userId).role(Role.MEMBER)
                .phone("9876543210").phoneCountryCode("+91").hasAppAccess(false).build();

        when(requestStateService.expireIfDue(eq(requestId), any())).thenReturn(false);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(requestRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        var response = service.accept(requestId, userId, "123456");

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.AWAITING_ADMIN);
        verify(tenantService, never()).addUserToTenant(any(), any(), any(), any());
        assertThat(user.isHasAppAccess()).isFalse();
    }

    // ─── Suspend ──────────────────────────────────────────────────────────────

    @Test
    void suspendDeletesTenantLinkClearsHasAppAccessRevokesTokensAndEnqueuesOutbox() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, userId, ChitfundRequestStatus.ACTIVE);
        request.setTenantId(tenantId);
        request.setMemberId(memberId);
        MemberUserLink link = MemberUserLink.builder().userId(userId).tenantId(tenantId).memberId(memberId).build();
        User user = User.builder().id(userId).role(Role.MEMBER).hasAppAccess(true).build();

        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(memberLinkRepository.findByMemberIdAndTenantId(memberId, tenantId)).thenReturn(Optional.of(link));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(memberLinkRepository.existsByUserId(userId)).thenReturn(false);
        when(userRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(requestRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        var response = service.suspend(requestId, UUID.randomUUID(), "Admin action");

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.SUSPENDED);
        verify(memberLinkRepository).delete(link);
        assertThat(user.isHasAppAccess()).isFalse();
        // Refresh tokens must be revoked for the tenant so existing access tokens become invalid
        verify(refreshTokenRepository).revokeAllActiveByUserAndTenant(user, tenantId.toString());
        // Deactivation outbox must be enqueued so member-service is notified asynchronously
        verify(deactivationOutbox).enqueue(requestId, tenantId, memberId, userId);
        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(eventCaptor.capture());
        IdentityNotificationEvent evt = (IdentityNotificationEvent) eventCaptor.getValue();
        assertThat(evt.type()).isEqualTo(IdentityNotificationEvent.Type.CHITFUND_ACCESS_SUSPENDED);
    }

    @Test
    void suspendDoesNotRevokeTokensOrEnqueueOutboxForAlreadySuspended() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, UUID.randomUUID(), ChitfundRequestStatus.SUSPENDED);
        request.setTenantId(tenantId);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));

        service.suspend(requestId, UUID.randomUUID(), null);

        verify(refreshTokenRepository, never()).revokeAllActiveByUserAndTenant(any(), any());
        verify(deactivationOutbox, never()).enqueue(any(), any(), any(), any());
    }

    @Test
    void suspendIsIdempotentForAlreadySuspendedRequest() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, UUID.randomUUID(), ChitfundRequestStatus.SUSPENDED);
        request.setTenantId(tenantId);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));

        var response = service.suspend(requestId, UUID.randomUUID(), null);

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.SUSPENDED);
        verify(memberLinkRepository, never()).delete(any());
        verify(requestRepository, never()).save(any());
    }

    @Test
    void suspendRejectsNonActiveRequest() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, UUID.randomUUID(), ChitfundRequestStatus.PENDING_MEMBER);
        request.setTenantId(tenantId);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.suspend(requestId, UUID.randomUUID(), null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ACTIVE");
    }

    // ─── Revoke-after-suspension ──────────────────────────────────────────────

    @Test
    void revokeAfterSuspensionMovesFromSuspendedToRevoked() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, UUID.randomUUID(), ChitfundRequestStatus.SUSPENDED);
        request.setTenantId(tenantId);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(requestRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        var response = service.revokeAfterSuspension(requestId, UUID.randomUUID(), "Permanent close");

        assertThat(response.getStatus()).isEqualTo(ChitfundRequestStatus.REVOKED);
    }

    @Test
    void revokeAfterSuspensionRejectsNonSuspendedRequest() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, UUID.randomUUID(), ChitfundRequestStatus.ACTIVE);
        request.setTenantId(tenantId);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.revokeAfterSuspension(requestId, UUID.randomUUID(), null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("SUSPENDED");
    }

    // ─── SMS provider behavior ────────────────────────────────────────────────

    @Test
    void completingSetupWithSmsDeliveredRequiresPhoneOtp() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        com.chitfund.userservice.domain.entity.AccountSetupToken token =
                com.chitfund.userservice.domain.entity.AccountSetupToken.builder()
                        .userId(userId).chitfundRequestId(requestId)
                        .expiresAt(LocalDateTime.now().plusHours(1)).build();
        ChitfundAccessRequest request = ChitfundAccessRequest.builder()
                .id(requestId).tenantId(tenantId).memberId(memberId)
                .candidateUserId(userId).requestedPhone("9876543210").phoneCountryCode("+91")
                .requestKind(ChitfundRequestKind.NEW_ACCOUNT).status(ChitfundRequestStatus.PENDING_MEMBER)
                .expiresAt(LocalDateTime.now().plusHours(1)).lastSentAt(LocalDateTime.now())
                .build();
        com.chitfund.userservice.domain.entity.User user =
                com.chitfund.userservice.domain.entity.User.builder()
                        .id(userId).role(Role.MEMBER)
                        .phone("9876543210").phoneCountryCode("+91")
                        .email("m@test.com").username("mtest").build();

        when(setupTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(token));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(requestStateService.expireIfDue(eq(requestId), any())).thenReturn(false);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        // SMS provider delivered — phone OTP is required
        when(otpService.getDeliveryStatus(any(), any(), any()))
                .thenReturn(com.chitfund.userservice.domain.enums.SmsDeliveryStatus.DELIVERED);

        com.chitfund.userservice.dto.request.SetupAccountRequest input =
                new com.chitfund.userservice.dto.request.SetupAccountRequest();
        input.setToken("raw-token");
        // Phone OTP missing — must throw
        input.setPhoneOtp(null);
        input.setNewPassword("Secure@123");

        assertThatThrownBy(() -> service.completeSetup(input))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class)
                .hasMessageContaining("Phone OTP");
        // OTP verification must not be called without value
        verify(otpService, never()).verifyOtp(any(), any(), any(), any());
    }

    @Test
    void publicDetailsShowsPhoneVerificationPendingFromPersistedState() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        ChitfundAccessRequest request = existingRequestFull(requestId, userId, tenantId,
                ChitfundRequestStatus.PENDING_MEMBER);
        request.setPhoneVerificationPending(true);
        com.chitfund.userservice.domain.entity.User user =
                com.chitfund.userservice.domain.entity.User.builder()
                        .id(userId).role(Role.MEMBER).build();

        when(requestRepository.findByMemberActionTokenHash(any())).thenReturn(Optional.of(request));
        when(requestStateService.expireIfDue(eq(requestId), any())).thenReturn(false);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.empty());

        var pub = service.publicDetails("raw-action-token");

        assertThat(pub.isPhoneVerificationPending()).isTrue();
    }

    @Test
    void publicDetailsPhoneVerificationNotPendingWhenAlreadyVerified() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        ChitfundAccessRequest request = existingRequestFull(requestId, userId, tenantId,
                ChitfundRequestStatus.PENDING_MEMBER);
        // phoneVerificationPending defaults to false — already cleared or never required
        com.chitfund.userservice.domain.entity.User user =
                com.chitfund.userservice.domain.entity.User.builder()
                        .id(userId).role(Role.MEMBER).build();

        when(requestRepository.findByMemberActionTokenHash(any())).thenReturn(Optional.of(request));
        when(requestStateService.expireIfDue(eq(requestId), any())).thenReturn(false);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.empty());

        var pub = service.publicDetails("raw-action-token");

        assertThat(pub.isPhoneVerificationPending()).isFalse();
    }

    // ─── Suspension token-scope isolation ────────────────────────────────────

    @Test
    void suspendOnlyRevokesTokensForTheSuspendedTenantNotAll() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, userId, ChitfundRequestStatus.ACTIVE);
        request.setTenantId(tenantId);
        request.setMemberId(memberId);
        com.chitfund.userservice.domain.entity.MemberUserLink link =
                com.chitfund.userservice.domain.entity.MemberUserLink.builder()
                        .userId(userId).tenantId(tenantId).memberId(memberId).build();
        com.chitfund.userservice.domain.entity.User user =
                com.chitfund.userservice.domain.entity.User.builder()
                        .id(userId).role(Role.MEMBER).hasAppAccess(true).build();

        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(memberLinkRepository.findByMemberIdAndTenantId(memberId, tenantId)).thenReturn(Optional.of(link));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(memberLinkRepository.existsByUserId(userId)).thenReturn(true); // still linked to other tenants
        lenient().when(userRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(requestRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        service.suspend(requestId, UUID.randomUUID(), "Test");

        // Must revoke tokens only for this tenant, not all
        verify(refreshTokenRepository).revokeAllActiveByUserAndTenant(user, tenantId.toString());
        verify(refreshTokenRepository, never()).revokeAllActiveByUser(any());
        // hasAppAccess must NOT be cleared because user still has links to other tenants
        assertThat(user.isHasAppAccess()).isTrue();
    }

    // ─── Request-create idempotency ────────────────────────────────────────────

    @Test
    void phoneNormalizationStripsSpacesBeforeMatchingAndSaving() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull("9876543210", "+91"))
                .thenReturn(List.of());
        when(userRepository.save(any())).thenAnswer(call -> {
            com.chitfund.userservice.domain.entity.User u = call.getArgument(0);
            u.setId(userId);
            return u;
        });
        when(passwordEncoder.encode(any())).thenReturn("hash");
        when(authService.generateSetupToken(any(), any())).thenReturn("token");

        // Phone entered with spaces — must be normalized to 9876543210
        var response = service.create(tenantId, memberId, "98765 43210", "+91",
                "m@example.com", UUID.randomUUID());

        assertThat(response.getRequestKind()).isEqualTo(ChitfundRequestKind.NEW_ACCOUNT);
        // Verify OTP was sent to normalized phone
        verify(otpService).sendOtp("9876543210", "+91", "APP_ACCESS_SETUP", response.getId().toString());
    }

    @Test
    void resendIsRateLimitedAfterFirstSend() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, UUID.randomUUID(), ChitfundRequestStatus.PENDING_MEMBER);
        request.setTenantId(tenantId);
        // lastSentAt just now — within the rate limit window
        request.setLastSentAt(LocalDateTime.now());
        request.setResendCount(0);
        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));

        // Expect rate-limit exception
        assertThatThrownBy(() -> service.resend(requestId, UUID.randomUUID()))
                .isInstanceOf(com.chitfund.common.exception.BusinessException.class);
        verify(requestRepository, never()).save(any());
    }

    // ─── Audit correctness ────────────────────────────────────────────────────

    @Test
    void auditEntryIsPersistedOnRequestCreate() {
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(any(), any())).thenReturn(List.of());
        when(userRepository.save(any())).thenAnswer(call -> {
            com.chitfund.userservice.domain.entity.User u = call.getArgument(0);
            u.setId(userId);
            return u;
        });
        when(passwordEncoder.encode(any())).thenReturn("hash");
        when(authService.generateSetupToken(any(), any())).thenReturn("token");

        service.create(tenantId, memberId, "9000000001", "+91", "m@example.com", UUID.randomUUID());

        verify(requestAuditRepository).save(
                argThat(a -> "REQUEST_CREATED".equals(
                        ((com.chitfund.userservice.domain.entity.ChitfundRequestAudit) a).getAction())));
    }

    @Test
    void auditEntryIsPersistedOnSuspend() {
        UUID tenantId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        TenantContext.set(tenantId.toString());

        ChitfundAccessRequest request = existingRequest(requestId, userId, ChitfundRequestStatus.ACTIVE);
        request.setTenantId(tenantId);
        request.setMemberId(memberId);
        com.chitfund.userservice.domain.entity.User user =
                com.chitfund.userservice.domain.entity.User.builder()
                        .id(userId).role(Role.MEMBER).hasAppAccess(true).build();

        when(requestRepository.findByIdForUpdate(requestId)).thenReturn(Optional.of(request));
        when(memberLinkRepository.findByMemberIdAndTenantId(memberId, tenantId)).thenReturn(Optional.empty());
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(memberLinkRepository.existsByUserId(userId)).thenReturn(false);
        when(userRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(requestRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        service.suspend(requestId, UUID.randomUUID(), "Policy violation");

        verify(requestAuditRepository).save(
                argThat(a -> "ACCESS_SUSPENDED".equals(
                        ((com.chitfund.userservice.domain.entity.ChitfundRequestAudit) a).getAction())));
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

    private static ChitfundAccessRequest existingRequestFull(UUID requestId, UUID userId, UUID tenantId,
                                                              ChitfundRequestStatus status) {
        return ChitfundAccessRequest.builder()
                .id(requestId).tenantId(tenantId).memberId(UUID.randomUUID())
                .candidateUserId(userId).requestedPhone("9876543210").phoneCountryCode("+91")
                .requestKind(ChitfundRequestKind.LINK_EXISTING).status(status)
                .expiresAt(LocalDateTime.now().plusHours(1)).lastSentAt(LocalDateTime.now())
                .build();
    }
}

package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.UpdateUserProfileRequest;
import com.chitfund.userservice.dto.response.UserResponse;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceEmailVerificationTest {

    @Mock private UserRepository userRepository;
    @Mock private UserMapper userMapper;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private TrustedDeviceRepository trustedDeviceRepository;

    private UserService service;

    @BeforeEach
    void setUp() {
        service = new UserService(userRepository, userMapper,
                refreshTokenRepository, trustedDeviceRepository);
    }

    @Test
    void changingStaffEmailRevokesTrustAndRequiresVerification() {
        UUID id = UUID.randomUUID();
        User user = User.builder()
                .id(id)
                .username("staff")
                .email("old@example.com")
                .emailVerifiedAt(LocalDateTime.now())
                .emailVerificationRequired(false)
                .role(Role.STAFF)
                .build();
        UpdateUserProfileRequest request = new UpdateUserProfileRequest();
        request.setEmail("new@example.com");
        UserResponse mapped = UserResponse.builder().id(id).email("new@example.com").build();

        when(userRepository.findById(id)).thenReturn(Optional.of(user));
        when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
        when(userRepository.save(user)).thenReturn(user);
        when(userMapper.toResponse(user)).thenReturn(mapped);

        UserResponse result = service.updateMyProfile(id, request);

        assertSame(mapped, result);
        assertEquals("new@example.com", user.getEmail());
        assertNull(user.getEmailVerifiedAt());
        assertTrue(user.isEmailVerificationRequired());
        verify(refreshTokenRepository).revokeAllActiveByUser(user);
        verify(trustedDeviceRepository).deleteByUserId(id);
    }

    @Test
    void memberCannotChangeGlobalRecoveryEmailWithoutVerificationFlow() {
        UUID id = UUID.randomUUID();
        User user = User.builder()
                .id(id)
                .username("member")
                .email("old@example.com")
                .role(Role.MEMBER)
                .build();
        UpdateUserProfileRequest request = new UpdateUserProfileRequest();
        request.setEmail("new@example.com");
        when(userRepository.findById(id)).thenReturn(Optional.of(user));

        assertThrows(BusinessException.class, () -> service.updateMyProfile(id, request));
        verify(userRepository, never()).save(any());
        verifyNoInteractions(refreshTokenRepository, trustedDeviceRepository);
    }

    @Test
    void staffListingFailsClosedWithoutTenantContext() {
        assertThrows(BusinessException.class, () -> service.listStaff(false));
        verifyNoInteractions(userRepository);
    }

    @Test
    void adminCannotReadStaffFromAnotherTenant() {
        UUID id = UUID.randomUUID();
        User otherTenantUser = User.builder()
                .id(id)
                .username("other-staff")
                .tenantId(UUID.randomUUID().toString())
                .role(Role.STAFF)
                .build();
        com.chitfund.common.context.TenantContext.set(UUID.randomUUID().toString());
        when(userRepository.findById(id)).thenReturn(Optional.of(otherTenantUser));

        try {
            assertThrows(BusinessException.class, () -> service.getUserById(id));
        } finally {
            com.chitfund.common.context.TenantContext.clear();
        }
        verify(userMapper, never()).toResponse(any());
    }
}

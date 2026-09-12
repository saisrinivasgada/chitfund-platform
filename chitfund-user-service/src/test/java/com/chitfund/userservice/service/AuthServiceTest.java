package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.LoginRequest;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock TrustedDeviceRepository trustedDeviceRepository;
    @Mock AccountSetupTokenRepository setupTokenRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtTokenProvider jwtTokenProvider;
    @Mock AuthenticationManager authenticationManager;
    @Mock UserMapper userMapper;
    @Mock TenantService tenantService;
    @Mock OtpService otpService;
    @Mock PasswordValidator passwordValidator;
    @InjectMocks AuthService authService;

    @Test
    void regularLoginRejectsLegacySuperAdminAccount() {
        User user = User.builder()
                .username("owner")
                .passwordHash("old-hash")
                .role(Role.SUPER_ADMIN)
                .build();
        LoginRequest request = new LoginRequest();
        request.setUsername("owner");
        request.setPassword("Password@1");
        when(userRepository.findByUsername("owner")).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.login(request, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ChitWise Hub");
        verify(authenticationManager, never()).authenticate(org.mockito.ArgumentMatchers.any());
    }
}

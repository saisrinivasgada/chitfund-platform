package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.RefreshToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.request.ChangePasswordRequest;
import com.chitfund.userservice.dto.request.LoginRequest;
import com.chitfund.userservice.dto.request.RefreshTokenRequest;
import com.chitfund.userservice.dto.request.RegisterRequest;
import com.chitfund.userservice.dto.response.AuthResponse;
import com.chitfund.userservice.dto.response.ResetPasswordResponse;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Core auth business logic: register, login, token refresh, logout.
 *
 * WHY @Transactional on the class?
 * All public methods participate in a transaction by default. If a method throws
 * any RuntimeException, the transaction rolls back automatically.
 * This means: if saving the user succeeds but saving the refresh token fails,
 * the whole operation rolls back — no orphaned user without a token.
 *
 * WHY AuthenticationManager.authenticate() for login instead of manual password check?
 * AuthenticationManager:
 * 1. Calls UserDetailsService.loadUserByUsername()
 * 2. Calls PasswordEncoder.matches(rawPassword, encodedPassword)
 * 3. Checks isEnabled(), isAccountNonLocked() etc.
 * 4. Throws AuthenticationException if any check fails — Spring Security handles the response
 * This is the correct, tested, battle-hardened path. Don't re-implement it manually.
 *
 * INTERVIEW: "We never store plaintext passwords. BCrypt hashes are one-way.
 * Even we (the developers) can't see users' passwords. On login, we hash what they
 * typed and compare hashes — never decrypt the stored hash."
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthenticationManager authenticationManager;
    private final UserMapper userMapper;

    @Value("${jwt.access-token-expiry-ms}")
    private long accessTokenExpiryMs;

    @Value("${jwt.refresh-token-expiry-days}")
    private int refreshTokenExpiryDays;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USERNAME_TAKEN);
        }
        // Resolve email: use provided value, otherwise null (staff accounts don't require email)
        String email = (request.getEmail() != null && !request.getEmail().isBlank())
                ? request.getEmail() : null;

        if (email != null && userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN);
        }

        // Admin omits password when creating member accounts → auto-generate a temp
        boolean isTempPassword = (request.getPassword() == null || request.getPassword().isBlank());
        String plainPassword = isTempPassword ? generateTempPassword() : request.getPassword();

        User user = User.builder()
                .username(request.getUsername())
                .email(email)
                .fullName(request.getFullName())
                .phone(request.getPhone())
                .passwordHash(passwordEncoder.encode(plainPassword))
                .role(request.getRole())
                .mustChangePassword(isTempPassword)
                .build();

        userRepository.save(user);
        return buildAuthResponse(user, isTempPassword ? plainPassword : null);
    }

    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );

        User user = (User) authentication.getPrincipal();
        user.setFailedLoginAttempts(0);
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        return buildAuthResponse(user, null);
    }

    // Admin generates a new temp password for a member who forgot theirs.
    // Returns the plaintext password — shown to admin once, never stored.
    public ResetPasswordResponse resetPassword(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND,
                        "User not found: " + userId));
        String tempPassword = generateTempPassword();
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setMustChangePassword(true);
        // Revoke all active sessions so member is forced to log in with the new temp password
        refreshTokenRepository.revokeAllActiveByUser(user);
        userRepository.save(user);
        return ResetPasswordResponse.builder()
                .userId(user.getId())
                .username(user.getUsername())
                .tempPassword(tempPassword)
                .build();
    }

    // Member changes their own password. Clears mustChangePassword flag.
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND,
                        "User not found: " + userId));
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Current password is incorrect", HttpStatus.BAD_REQUEST);
        }
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setMustChangePassword(false);
        // Rotate sessions after password change — new login required
        refreshTokenRepository.revokeAllActiveByUser(user);
        userRepository.save(user);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(request.getRefreshToken())
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID));

        if (refreshToken.isRevoked()) {
            // Token reuse detected — revoke ALL sessions for this user (token theft mitigation)
            refreshTokenRepository.revokeAllActiveByUser(refreshToken.getUser());
            throw new BusinessException(ErrorCode.TOKEN_INVALID);
        }

        if (refreshToken.isExpired()) {
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_EXPIRED);
        }

        // Revoke the used refresh token (rotation: one-time use)
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

        return buildAuthResponse(refreshToken.getUser(), null);
    }

    public void logout(String refreshTokenValue) {
        refreshTokenRepository.findByToken(refreshTokenValue)
                .ifPresent(token -> {
                    token.setRevoked(true);
                    refreshTokenRepository.save(token);
                });
    }

    private AuthResponse buildAuthResponse(User user, String tempPassword) {
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshTokenValue = jwtTokenProvider.generateRefreshTokenValue();

        RefreshToken refreshToken = RefreshToken.builder()
                .token(refreshTokenValue)
                .user(user)
                .expiresAt(LocalDateTime.now().plusDays(refreshTokenExpiryDays))
                .build();
        refreshTokenRepository.save(refreshToken);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenValue)
                .tokenType("Bearer")
                .expiresIn(accessTokenExpiryMs / 1000)
                .user(userMapper.toResponse(user))
                .tempPassword(tempPassword)
                .build();
    }

    // No ambiguous chars (0/O, 1/l/I) — readable when shown to admin
    private String generateTempPassword() {
        String chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}

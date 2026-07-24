package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.RefreshToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.ChangePasswordRequest;
import com.chitfund.userservice.dto.request.CreateMemberLoginRequest;
import com.chitfund.userservice.dto.request.LoginRequest;
import com.chitfund.userservice.dto.request.MobileLoginRequest;
import com.chitfund.userservice.dto.request.RefreshTokenRequest;
import com.chitfund.userservice.dto.request.RegisterRequest;
import com.chitfund.userservice.dto.response.AuthResponse;
import com.chitfund.userservice.dto.response.CreateMemberLoginResponse;
import com.chitfund.userservice.dto.response.MobileLookupResponse;
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
import java.util.List;
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

    public AuthResponse register(RegisterRequest request, UUID createdBy) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USERNAME_TAKEN);
        }
        // Resolve email: use provided value, otherwise null (staff accounts don't require email)
        String email = (request.getEmail() != null && !request.getEmail().isBlank())
                ? request.getEmail() : null;

        if (email != null && userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN);
        }

        // One phone number may have at most 1 MEMBER account AND at most 1 staff account.
        // MEMBER + WORKER is fine. WORKER + MANAGER is not — both are staff.
        String phone = (request.getPhone() != null && !request.getPhone().isBlank()) ? request.getPhone() : null;
        Role role = request.getRole() != null ? request.getRole() : Role.MEMBER;
        if (phone != null) {
            List<Role> sameCategory = role == Role.MEMBER
                    ? List.of(Role.MEMBER)
                    : List.of(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.AGENT);
            if (userRepository.existsByPhoneAndRoleInAndDeletedAtIsNull(phone, sameCategory)) {
                String categoryLabel = role == Role.MEMBER ? "member" : "staff (staff/manager)";
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "A " + categoryLabel + " account with this mobile number already exists",
                        org.springframework.http.HttpStatus.CONFLICT);
            }
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
                .createdBy(createdBy)
                .updatedBy(createdBy)
                .build();

        userRepository.save(user);
        return buildAuthResponse(user, isTempPassword ? plainPassword : null);
    }

    // Admin creates a login for a member. Idempotent: if the email already exists as
    // an active MEMBER account (from a previous partial attempt where register succeeded
    // but link failed), we reuse that user and issue a fresh temp password instead of
    // failing with EMAIL_TAKEN. This makes the create-login flow safe to retry.
    public CreateMemberLoginResponse createMemberLogin(CreateMemberLoginRequest request) {
        String email = (request.getEmail() != null && !request.getEmail().isBlank())
                ? request.getEmail().trim() : null;

        if (email != null) {
            User existing = userRepository
                    .findByEmailAndRoleAndDeletedAtIsNull(email, Role.MEMBER)
                    .orElse(null);
            if (existing != null) {
                String tempPassword = generateTempPassword();
                existing.setTempPasswordHash(passwordEncoder.encode(tempPassword));
                existing.setMustChangePassword(true);
                userRepository.save(existing);
                return CreateMemberLoginResponse.builder()
                        .userId(existing.getId())
                        .tempPassword(tempPassword)
                        .build();
            }
            if (userRepository.existsByEmailAndRoleNotAndDeletedAtIsNull(email, Role.MEMBER)) {
                throw new BusinessException(ErrorCode.EMAIL_TAKEN,
                        "This email is already used by a staff account");
            }
        }

        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USERNAME_TAKEN);
        }

        String tempPassword = generateTempPassword();
        String phone = (request.getPhone() != null && !request.getPhone().isBlank()) ? request.getPhone() : null;
        String countryCode = (request.getPhoneCountryCode() != null && !request.getPhoneCountryCode().isBlank())
                ? request.getPhoneCountryCode() : (phone != null ? "+91" : null);
        User user = User.builder()
                .username(request.getUsername())
                .email(email)
                .phone(phone)
                .phoneCountryCode(countryCode)
                .passwordHash(passwordEncoder.encode(tempPassword))
                .role(Role.MEMBER)
                .mustChangePassword(true)
                .build();
        userRepository.save(user);

        return CreateMemberLoginResponse.builder()
                .userId(user.getId())
                .tempPassword(tempPassword)
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        // Load user first so we can check the temp password before delegating to Spring Security.
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        boolean usedTempPassword = false;

        if (user.getTempPasswordHash() != null
                && passwordEncoder.matches(request.getPassword(), user.getTempPasswordHash())) {
            // User logged in with the admin-generated temp password.
            // Validate account state manually (Spring Security checks these in authenticate()).
            if (!user.isEnabled() || user.isLocked())
                throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
            usedTempPassword = true;
        } else {
            // Normal path — let Spring Security validate against the real password hash.
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
            );
            user = (User) authentication.getPrincipal();
        }

        user.setFailedLoginAttempts(0);
        user.setLastLoginAt(LocalDateTime.now());

        if (usedTempPassword) {
            // Temp password used → force a password change on first session.
            user.setMustChangePassword(true);
        } else {
            // Real password used → clear any admin-generated temp hash.
            // mustChangePassword is intentionally NOT cleared here — that is only done
            // in changePassword() after the user actually sets a new password.
            user.setTempPasswordHash(null);
        }

        userRepository.save(user);
        return buildAuthResponse(user, null);
    }

    // Admin generates a new temp password alongside the user's existing real password.
    // The user can still log in with the old password (no forced change) OR with the temp
    // password (forces a change on first login). Returns the plaintext temp — shown once.
    public ResetPasswordResponse resetPassword(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND,
                        "User not found: " + userId));
        String tempPassword = generateTempPassword();
        // Store the temp separately — real passwordHash is unchanged so old password still works.
        user.setTempPasswordHash(passwordEncoder.encode(tempPassword));
        user.setMustChangePassword(true);
        org.springframework.security.core.Authentication auth =
                org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User caller) {
            user.setUpdatedBy(caller.getId());
        }
        userRepository.save(user);
        return ResetPasswordResponse.builder()
                .userId(user.getId())
                .username(user.getUsername())
                .tempPassword(tempPassword)
                .build();
    }

    // Member changes their own password. Clears mustChangePassword and temp hash.
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND,
                        "User not found: " + userId));
        // Accept either the real password or the temp password as "current password".
        boolean matchesReal = passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash());
        boolean matchesTemp = user.getTempPasswordHash() != null
                && passwordEncoder.matches(request.getCurrentPassword(), user.getTempPasswordHash());
        if (!matchesReal && !matchesTemp) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Current password is incorrect", HttpStatus.BAD_REQUEST);
        }
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setTempPasswordHash(null);
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

    private List<User> findByPhone(String phone, String countryCode) {
        return userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, countryCode);
    }

    // Returns which account types are registered under this mobile number.
    // Frontend uses this to decide whether to show a role picker before the password step.
    public MobileLookupResponse lookupByMobile(String phone, String phoneCountryCode) {
        List<User> accounts = findByPhone(phone, phoneCountryCode);
        List<MobileLookupResponse.AccountOption> options = accounts.stream()
                .map(u -> MobileLookupResponse.AccountOption.builder()
                        .role(u.getRole())
                        .displayLabel(switch (u.getRole()) {
                            case MEMBER  -> "Member account";
                            case STAFF, AGENT -> "Staff account";
                            case MANAGER -> "Manager account";
                            case ADMIN   -> "Admin account";
                        })
                        .build())
                .toList();
        return MobileLookupResponse.builder()
                .singleAccount(options.size() == 1)
                .accounts(options)
                .build();
    }

    // Login with mobile number + password (+ optional role for disambiguation).
    public AuthResponse loginByMobile(MobileLoginRequest request) {
        List<User> accounts = findByPhone(request.getPhone(), request.getPhoneCountryCode());
        if (accounts.isEmpty()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND,
                    "No account found for this mobile number");
        }
        User user;
        if (accounts.size() == 1) {
            user = accounts.get(0);
        } else {
            // Multiple accounts — role is mandatory to identify which one to log in as
            if (request.getRole() == null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Multiple accounts exist for this number — please specify your role",
                        org.springframework.http.HttpStatus.CONFLICT);
            }
            user = accounts.stream()
                    .filter(u -> u.getRole() == request.getRole())
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND,
                            "No " + request.getRole() + " account found for this mobile number"));
        }

        // Authenticate password against this specific user (same logic as username login)
        boolean usedTempPassword = false;
        if (user.getTempPasswordHash() != null
                && passwordEncoder.matches(request.getPassword(), user.getTempPasswordHash())) {
            if (!user.isEnabled() || user.isLocked())
                throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
            usedTempPassword = true;
        } else {
            try {
                authenticationManager.authenticate(
                        new UsernamePasswordAuthenticationToken(user.getUsername(), request.getPassword()));
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Invalid password", org.springframework.http.HttpStatus.UNAUTHORIZED);
            }
        }

        user.setFailedLoginAttempts(0);
        user.setLastLoginAt(LocalDateTime.now());
        if (usedTempPassword) {
            user.setMustChangePassword(true);
        } else {
            user.setTempPasswordHash(null);
            user.setMustChangePassword(false);
        }
        userRepository.save(user);
        return buildAuthResponse(user, null);
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

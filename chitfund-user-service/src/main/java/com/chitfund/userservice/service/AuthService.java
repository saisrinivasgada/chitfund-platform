package com.chitfund.userservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.RefreshToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.*;
import com.chitfund.userservice.dto.response.*;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.*;
import com.chitfund.userservice.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AccountSetupTokenRepository setupTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthenticationManager authenticationManager;
    private final UserMapper userMapper;
    private final TenantService tenantService;
    private final OtpService otpService;

    @Value("${jwt.access-token-expiry-ms}")
    private long accessTokenExpiryMs;

    @Value("${jwt.refresh-token-expiry-days}")
    private int refreshTokenExpiryDays;

    // ── Org self-registration (public) ───────────────────────────────────────

    public TenantResponse registerOrg(RegisterOrgRequest req) {
        return tenantService.registerOrg(req);
    }

    public boolean slugExists(String slug) {
        return tenantService.slugExists(slug);
    }

    public boolean usernameExists(String username) {
        return userRepository.existsByUsername(username);
    }

    // ── Standard login → returns LoginResponse ───────────────────────────────
    // SUPER_ADMIN: returns full AuthResponse inside LoginResponse (no tenant pick)
    // Others: returns pre-scope token + tenant list; frontend calls select-tenant next

    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        user = authenticateUser(user, request.getPassword());
        updateLoginState(user, false);
        userRepository.save(user);

        return buildLoginResponse(user);
    }

    public LoginResponse loginByMobile(MobileLoginRequest request) {
        List<User> accounts = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(
                request.getPhone(), request.getPhoneCountryCode());
        if (accounts.isEmpty()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND,
                    "No account found for this mobile number");
        }
        User user;
        if (accounts.size() == 1) {
            user = accounts.get(0);
        } else {
            if (request.getRole() == null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Multiple accounts — please specify your role",
                        HttpStatus.CONFLICT);
            }
            user = accounts.stream()
                    .filter(u -> u.getRole() == request.getRole())
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND,
                            "No " + request.getRole() + " account for this number"));
        }

        user = authenticateUser(user, request.getPassword());
        updateLoginState(user, false);
        userRepository.save(user);

        return buildLoginResponse(user);
    }

    // ── Step 2: exchange pre-scope token → scoped AuthResponse ───────────────

    public AuthResponse selectTenant(SelectTenantRequest request) {
        if (!jwtTokenProvider.validateToken(request.getLoginToken())) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID, "Login token expired or invalid");
        }
        String scope = jwtTokenProvider.extractScope(request.getLoginToken());
        if (!"TENANT_SELECT".equals(scope)) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID, "Not a pre-scope token");
        }

        String userId = jwtTokenProvider.extractUserId(request.getLoginToken());
        User user = userRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        List<TenantInfo> tenants = jwtTokenProvider.extractTenants(request.getLoginToken());
        TenantInfo selected = tenants.stream()
                .filter(t -> t.getTenantId().equals(request.getTenantId()))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
                        "You are not a member of this organization"));

        return buildScopedAuthResponse(user, selected);
    }

    // ── Cross-subdomain transfer: generate a fresh pre-scope token ───────────
    // Called by the current subdomain; the token is passed in the redirect URL

    public PreScopeAuthResponse generateTransferToken(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        List<TenantInfo> tenants = tenantService.buildTenantInfoList(userId);
        String loginToken = jwtTokenProvider.generatePreScopeToken(user, tenants);
        return PreScopeAuthResponse.builder()
                .loginToken(loginToken)
                .tenants(tenants)
                .build();
    }

    // ── Account setup (member opens SMS link and sets password) ──────────────

    public AuthResponse setupAccount(SetupAccountRequest request) {
        String tokenHash = sha256(request.getToken());
        AccountSetupToken setupToken = setupTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID,
                        "Setup link is invalid or expired"));

        if (setupToken.isUsed()) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID, "Setup link has already been used");
        }
        if (setupToken.isExpired()) {
            throw new BusinessException(ErrorCode.TOKEN_INVALID, "Setup link has expired");
        }

        User user = userRepository.findById(setupToken.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setMustChangePassword(false);
        user.setTempPasswordHash(null);
        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName());
        }
        user.setTermsAcceptedAt(LocalDateTime.now());
        user.setTermsVersion("1.0");
        userRepository.save(user);

        setupToken.setUsedAt(LocalDateTime.now());
        setupTokenRepository.save(setupToken);

        // Issue a scoped response — auto-select their tenant (or show picker)
        return buildLoginResponse(user).getAuthResponse();
    }

    // ── Account setup token generation (called by InternalUserController) ───

    public String generateSetupToken(UUID userId) {
        String rawToken = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        String hash = sha256(rawToken);
        AccountSetupToken token = AccountSetupToken.builder()
                .userId(userId)
                .tokenHash(hash)
                .expiresAt(LocalDateTime.now().plusHours(72))
                .build();
        setupTokenRepository.save(token);
        return rawToken; // returned to caller to put in SMS URL
    }

    // ── Staff registration (admin-only) ──────────────────────────────────────

    public AuthResponse register(RegisterRequest request, UUID createdBy) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USERNAME_TAKEN);
        }
        String email = (request.getEmail() != null && !request.getEmail().isBlank())
                ? request.getEmail() : null;
        if (email != null && userRepository.existsByEmailAndDeletedAtIsNull(email)) {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN);
        }
        String phone = (request.getPhone() != null && !request.getPhone().isBlank())
                ? request.getPhone() : null;
        Role role = request.getRole() != null ? request.getRole() : Role.MEMBER;
        if (phone != null) {
            List<Role> sameCategory = role == Role.MEMBER
                    ? List.of(Role.MEMBER)
                    : List.of(Role.ADMIN, Role.MANAGER, Role.STAFF, Role.AGENT);
            if (userRepository.existsByPhoneAndRoleInAndDeletedAtIsNull(phone, sameCategory)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "A " + (role == Role.MEMBER ? "member" : "staff") + " account with this number exists",
                        HttpStatus.CONFLICT);
            }
        }

        boolean isTempPassword = (request.getPassword() == null || request.getPassword().isBlank());
        String plainPassword = isTempPassword ? generateTempPassword() : request.getPassword();

        String tenantId = TenantContext.get();

        User user = User.builder()
                .username(request.getUsername())
                .email(email)
                .fullName(request.getFullName())
                .phone(request.getPhone())
                .phoneCountryCode(request.getPhoneCountryCode())
                .passwordHash(passwordEncoder.encode(plainPassword))
                .role(request.getRole())
                .tenantId(tenantId)
                .mustChangePassword(isTempPassword)
                .createdBy(createdBy)
                .updatedBy(createdBy)
                .build();
        userRepository.save(user);

        return buildAuthResponse(user, isTempPassword ? plainPassword : null);
    }

    // ── Existing flows (unchanged) ────────────────────────────────────────────

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

    public ResetPasswordResponse resetPassword(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "User not found: " + userId));
        String tempPassword = generateTempPassword();
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

    public void changePassword(UUID userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "User not found: " + userId));
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
        refreshTokenRepository.revokeAllActiveByUser(user);
        userRepository.save(user);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(request.getRefreshToken())
                .orElseThrow(() -> new BusinessException(ErrorCode.TOKEN_INVALID));
        if (refreshToken.isRevoked()) {
            refreshTokenRepository.revokeAllActiveByUser(refreshToken.getUser());
            throw new BusinessException(ErrorCode.TOKEN_INVALID);
        }
        if (refreshToken.isExpired()) {
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_EXPIRED);
        }
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

    public MobileLookupResponse lookupByMobile(String phone, String phoneCountryCode) {
        List<User> accounts = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, phoneCountryCode);
        List<MobileLookupResponse.AccountOption> options = accounts.stream()
                .map(u -> MobileLookupResponse.AccountOption.builder()
                        .role(u.getRole())
                        .displayLabel(switch (u.getRole()) {
                            case MEMBER      -> "Member account";
                            case STAFF, AGENT -> "Staff account";
                            case MANAGER     -> "Manager account";
                            case ADMIN       -> "Admin account";
                            case SUPER_ADMIN -> "Super Admin";
                        })
                        .build())
                .toList();
        return MobileLookupResponse.builder()
                .singleAccount(options.size() == 1)
                .accounts(options)
                .build();
    }

    // ── Self-service password reset — new 4-step flow ──────────────────────────

    public com.chitfund.userservice.dto.response.ForgotPasswordLookupResponse lookupForPasswordReset(String usernameOrPhone) {
        // Try username first, then phone (any country code)
        Optional<User> userOpt = userRepository.findByUsername(usernameOrPhone.trim())
                .filter(u -> u.getDeletedAt() == null);

        if (userOpt.isEmpty()) {
            List<User> byPhone = userRepository.findByPhoneAndDeletedAtIsNull(usernameOrPhone.trim());
            if (!byPhone.isEmpty()) {
                // Prefer non-MEMBER if multiple accounts share the same phone
                userOpt = byPhone.stream().filter(u -> u.getRole() != Role.MEMBER).findFirst()
                        .or(() -> Optional.of(byPhone.get(0)));
            }
        }

        if (userOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND,
                    "No account found with that username or phone number");
        }

        User user = userOpt.get();

        if (user.getPhone() == null || user.getPhone().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No phone number on file. Contact your administrator to reset your password.");
        }

        String phone = user.getPhone().replaceAll("\\D", "");
        String masked = phone.length() >= 4
                ? "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4)
                : "****";

        return com.chitfund.userservice.dto.response.ForgotPasswordLookupResponse.builder()
                .userId(user.getId().toString())
                .maskedPhone(masked)
                .locked(user.isLocked())
                .role(user.getRole().name())
                .build();
    }

    @Transactional
    public void sendForgotPasswordOtpNew(String userId, String last4) {
        User user = userRepository.findById(java.util.UUID.fromString(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "User not found"));

        if (user.isLocked()) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED, "Account is locked");
        }
        if (user.getPhone() == null || user.getPhone().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "No phone number on file");
        }

        String phoneLast4 = user.getPhone().replaceAll("\\D", "");
        if (phoneLast4.length() >= 4) {
            phoneLast4 = phoneLast4.substring(phoneLast4.length() - 4);
        }
        if (!phoneLast4.equals(last4)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Phone digits don't match our records");
        }

        String cc = user.getPhoneCountryCode() != null ? user.getPhoneCountryCode() : "+91";
        otpService.sendOtp(user.getPhone(), cc, "FORGOT_PASSWORD", userId);
    }

    @Transactional
    public com.chitfund.userservice.dto.response.ForgotPasswordVerifyOtpResponse verifyForgotPasswordOtp(String userId, String code) {
        User user = userRepository.findById(java.util.UUID.fromString(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "User not found"));

        otpService.verifyOtp(user.getPhone(), "FORGOT_PASSWORD", code);

        String resetToken = java.util.UUID.randomUUID().toString().replace("-", "");
        user.setPasswordResetToken(resetToken);
        user.setPasswordResetTokenExpiresAt(java.time.LocalDateTime.now().plusMinutes(15));
        userRepository.save(user);

        return com.chitfund.userservice.dto.response.ForgotPasswordVerifyOtpResponse.builder()
                .resetToken(resetToken)
                .build();
    }

    @Transactional
    public void resetPasswordWithToken(String resetToken, String newPassword) {
        User user = userRepository.findByPasswordResetToken(resetToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Invalid or expired reset link. Please start over."));

        if (user.getPasswordResetTokenExpiresAt() == null
                || user.getPasswordResetTokenExpiresAt().isBefore(java.time.LocalDateTime.now())) {
            user.setPasswordResetToken(null);
            user.setPasswordResetTokenExpiresAt(null);
            userRepository.save(user);
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Reset link has expired (15 min). Please start over.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setTempPasswordHash(null);
        user.setMustChangePassword(false);
        user.setPasswordResetToken(null);
        user.setPasswordResetTokenExpiresAt(null);
        user.setFailedLoginAttempts(0);
        refreshTokenRepository.revokeAllActiveByUser(user);
        userRepository.save(user);
    }

    // ── Self-service password reset via OTP (legacy phone-only flow — kept for backward compat) ──

    public void sendForgotPasswordOtp(String phone, String countryCode) {
        String cc = (countryCode != null && !countryCode.isBlank()) ? countryCode : "+91";
        List<User> users = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, cc);
        if (users.isEmpty()) {
            // Return success even on miss to avoid user enumeration
            return;
        }
        // Send to any matching account (typically one per phone for non-members)
        User user = users.stream().filter(u -> u.getRole() != Role.MEMBER).findFirst()
                .orElse(users.get(0));
        otpService.sendOtp(phone, cc, "FORGOT_PASSWORD", user.getId().toString());
    }

    public void resetPasswordViaOtp(ForgotPasswordResetRequest req) {
        String cc = (req.getCountryCode() != null && !req.getCountryCode().isBlank()) ? req.getCountryCode() : "+91";
        // verifyOtp throws BusinessException if invalid/expired/max-attempts
        otpService.verifyOtp(req.getPhone(), "FORGOT_PASSWORD", req.getOtpCode());

        List<User> users = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(req.getPhone(), cc);
        if (users.isEmpty()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND, "No account found for this mobile number");
        }
        // Apply to all accounts on this phone (rare to have multiple, but safe)
        for (User user : users) {
            user.setPasswordHash(passwordEncoder.encode(req.getNewPassword()));
            user.setTempPasswordHash(null);
            user.setMustChangePassword(false);
            refreshTokenRepository.revokeAllActiveByUser(user);
            userRepository.save(user);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static final int MAX_FAILED_ATTEMPTS = 5;

    private User authenticateUser(User user, String password) {
        if (user.isLocked()) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED,
                    "Your account has been locked due to too many failed login attempts. Please contact your administrator.");
        }

        if (user.getTempPasswordHash() != null
                && passwordEncoder.matches(password, user.getTempPasswordHash())) {
            if (!user.isEnabled())
                throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
            user.setMustChangePassword(true);
            user.setFailedLoginAttempts(0);
            userRepository.save(user);
        } else {
            try {
                Authentication authentication = authenticationManager.authenticate(
                        new UsernamePasswordAuthenticationToken(user.getUsername(), password));
                user = (User) authentication.getPrincipal();
                user.setTempPasswordHash(null);
                user.setFailedLoginAttempts(0);
                userRepository.save(user);
            } catch (Exception e) {
                int attempts = user.getFailedLoginAttempts() + 1;
                user.setFailedLoginAttempts(attempts);
                if (attempts >= MAX_FAILED_ATTEMPTS) {
                    user.setLocked(true);
                }
                userRepository.save(user);
                if (user.isLocked()) {
                    throw new BusinessException(ErrorCode.ACCOUNT_LOCKED,
                            "Your account has been locked after " + MAX_FAILED_ATTEMPTS + " failed attempts. Contact your administrator.");
                }
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Invalid password", HttpStatus.UNAUTHORIZED);
            }
        }
        return user;
    }

    private void updateLoginState(User user, boolean usedTempPassword) {
        user.setFailedLoginAttempts(0);
        user.setLastLoginAt(LocalDateTime.now());
    }

    private LoginResponse buildLoginResponse(User user) {
        if (user.getRole() == Role.SUPER_ADMIN) {
            // Super admin: issue full token immediately, no tenant selection
            AuthResponse auth = buildSuperAdminAuthResponse(user);
            return LoginResponse.builder()
                    .requiresTenantSelection(false)
                    .authResponse(auth)
                    .build();
        }

        List<TenantInfo> tenants = tenantService.buildTenantInfoList(user.getId());
        String loginToken = jwtTokenProvider.generatePreScopeToken(user, tenants);
        return LoginResponse.builder()
                .requiresTenantSelection(true)
                .loginToken(loginToken)
                .tenants(tenants)
                .build();
    }

    private AuthResponse buildSuperAdminAuthResponse(User user) {
        String accessToken = jwtTokenProvider.generateSuperAdminToken(user);
        String refreshTokenValue = jwtTokenProvider.generateRefreshTokenValue();
        saveRefreshToken(user, refreshTokenValue);
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenValue)
                .tokenType("Bearer")
                .expiresIn(accessTokenExpiryMs / 1000)
                .user(userMapper.toResponse(user))
                .build();
    }

    private AuthResponse buildScopedAuthResponse(User user, TenantInfo tenant) {
        String accessToken = jwtTokenProvider.generateScopedToken(
                user, tenant.getTenantId(), tenant.getSlug(), tenant.getPlan(), tenant.getStatus(), tenant.getRole(), tenant.getMemberId());
        String refreshTokenValue = jwtTokenProvider.generateRefreshTokenValue();
        saveRefreshToken(user, refreshTokenValue);
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenValue)
                .tokenType("Bearer")
                .expiresIn(accessTokenExpiryMs / 1000)
                .user(userMapper.toResponse(user))
                .build();
    }

    private AuthResponse buildAuthResponse(User user, String tempPassword) {
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshTokenValue = jwtTokenProvider.generateRefreshTokenValue();
        saveRefreshToken(user, refreshTokenValue);
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshTokenValue)
                .tokenType("Bearer")
                .expiresIn(accessTokenExpiryMs / 1000)
                .user(userMapper.toResponse(user))
                .tempPassword(tempPassword)
                .build();
    }

    private void saveRefreshToken(User user, String tokenValue) {
        RefreshToken refreshToken = RefreshToken.builder()
                .token(tokenValue)
                .user(user)
                .expiresAt(LocalDateTime.now().plusDays(refreshTokenExpiryDays))
                .build();
        refreshTokenRepository.save(refreshToken);
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 failed", e);
        }
    }

    private String generateTempPassword() {
        String chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) sb.append(chars.charAt(random.nextInt(chars.length())));
        return sb.toString();
    }
}

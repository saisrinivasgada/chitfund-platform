package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.EmailResetOtp;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.EmailResetOtpRepository;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminPasswordResetService {

    private final UserRepository userRepository;
    private final EmailResetOtpRepository otpRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;
    private final PasswordValidator passwordValidator;

    private static final int OTP_EXPIRY_MINUTES = 10;
    private static final int RESET_TOKEN_EXPIRY_MINUTES = 15;
    private static final int MAX_OTP_PER_HOUR = 3;
    private static final int MAX_OTP_ATTEMPTS = 5;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /**
     * Step 1: send OTP to admin's registered email.
     * Always returns without leaking whether the email exists.
     */
    @Transactional
    public void sendOtp(String email) {
        if (email == null || email.isBlank()) return;

        userRepository.findByEmail(email.trim().toLowerCase())
                .filter(u -> u.getDeletedAt() == null)
                .filter(u -> u.getRole() == Role.ADMIN)
                .ifPresent(user -> {
                    // Rate limit: max 3 OTPs per hour per user
                    long recentCount = otpRepository.countByUserIdAndCreatedAtAfter(
                            user.getId().toString(),
                            LocalDateTime.now().minusHours(1));
                    if (recentCount >= MAX_OTP_PER_HOUR) {
                        // Silently ignore (don't leak that they've hit the rate limit via a specific error)
                        log.warn("Admin OTP rate limit hit for user {}", user.getId());
                        return;
                    }

                    String otp = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
                    EmailResetOtp record = EmailResetOtp.builder()
                            .userId(user.getId().toString())
                            .otpHash(sha256(otp))
                            .expiresAt(LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES))
                            .used(false)
                            .attempts(0)
                            .build();
                    otpRepository.save(record);
                    emailService.sendPasswordResetOtp(
                            user.getEmail(),
                            user.getFullName() != null ? user.getFullName() : user.getUsername(),
                            otp);
                });
    }

    /**
     * Step 2: verify OTP → return a short-lived resetToken.
     */
    @Transactional
    public String verifyOtp(String email, String otp) {
        if (email == null || otp == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Invalid or expired OTP", HttpStatus.BAD_REQUEST);
        }

        User user = userRepository.findByEmail(email.trim().toLowerCase())
                .filter(u -> u.getDeletedAt() == null)
                .filter(u -> u.getRole() == Role.ADMIN)
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Invalid or expired OTP", HttpStatus.BAD_REQUEST));

        EmailResetOtp record = otpRepository
                .findFirstByUserIdAndUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
                        user.getId().toString(), LocalDateTime.now())
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Invalid or expired OTP", HttpStatus.BAD_REQUEST));

        if (record.getAttempts() >= MAX_OTP_ATTEMPTS) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Too many incorrect attempts. Please request a new OTP.", HttpStatus.BAD_REQUEST);
        }

        record.setAttempts(record.getAttempts() + 1);

        if (!sha256(otp).equals(record.getOtpHash())) {
            otpRepository.save(record);
            int remaining = MAX_OTP_ATTEMPTS - record.getAttempts();
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    remaining > 0
                            ? "Incorrect OTP. " + remaining + " attempt(s) remaining."
                            : "Too many incorrect attempts. Please request a new OTP.",
                    HttpStatus.BAD_REQUEST);
        }

        record.setUsed(true);
        otpRepository.save(record);

        // Issue a short-lived reset token (reuse the existing password_reset_token column)
        String resetToken = UUID.randomUUID().toString();
        user.setPasswordResetToken(resetToken);
        user.setPasswordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(RESET_TOKEN_EXPIRY_MINUTES));
        userRepository.save(user);

        return resetToken;
    }

    /**
     * Step 3: reset password using the token from step 2.
     * Delegates to existing AuthService.resetPasswordWithToken for consistency.
     */
    @Transactional
    public void resetPassword(String resetToken, String newPassword) {
        User user = userRepository.findByPasswordResetToken(resetToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Invalid or expired reset link. Please start over.", HttpStatus.BAD_REQUEST));

        if (user.getPasswordResetTokenExpiresAt() == null
                || user.getPasswordResetTokenExpiresAt().isBefore(LocalDateTime.now())) {
            user.setPasswordResetToken(null);
            user.setPasswordResetTokenExpiresAt(null);
            userRepository.save(user);
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Reset link has expired (15 min). Please start over.", HttpStatus.BAD_REQUEST);
        }

        // Only allow ADMIN role through this flow
        if (user.getRole() != Role.ADMIN) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "This reset flow is only available for admin accounts.", HttpStatus.FORBIDDEN);
        }

        passwordValidator.validate(newPassword);
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setTempPasswordHash(null);
        user.setMustChangePassword(false);
        user.setPasswordResetToken(null);
        user.setPasswordResetTokenExpiresAt(null);
        user.setFailedLoginAttempts(0);
        refreshTokenRepository.revokeAllActiveByUser(user);
        userRepository.save(user);
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes()));
        } catch (Exception e) {
            throw new RuntimeException("Hashing failed", e);
        }
    }
}

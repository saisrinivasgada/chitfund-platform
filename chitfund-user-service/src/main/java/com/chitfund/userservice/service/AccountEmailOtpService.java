package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.AccountEmailOtp;
import com.chitfund.userservice.repository.AccountEmailOtpRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AccountEmailOtpService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_ATTEMPTS = 5;

    private final AccountEmailOtpRepository repository;
    private final EmailService emailService;

    @Transactional
    public String send(String referenceId, String email, String purpose, String displayName) {
        long recent = repository.countByUserIdAndPurposeAndCreatedAtAfter(
                referenceId, purpose, LocalDateTime.now().minusHours(1));
        if (recent >= 3) {
            throw new BusinessException(ErrorCode.OTP_RESEND_LIMIT,
                    "Too many verification emails. Please try again later", HttpStatus.TOO_MANY_REQUESTS);
        }
        String otp = String.format("%06d", RANDOM.nextInt(1_000_000));
        repository.save(AccountEmailOtp.builder()
                .userId(referenceId)
                .email(email)
                .verificationCode(otp)
                .purpose(purpose)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build());
        emailService.sendAccountVerificationOtp(email, displayName, otp);
        return otp;
    }

    /**
     * Original verify() — used by AuthService, ChitfundRequestService.
     * These callers operate inside their own @Transactional methods and accept
     * the REQUIRES_NEW semantics: the OTP is committed independently so that
     * attempt counts are preserved even if the caller's transaction rolls back.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = BusinessException.class)
    public void verify(String referenceId, String email, String purpose, String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Email OTP is required");
        }
        AccountEmailOtp record = repository
                .findFirstByUserIdAndEmailAndPurposeAndVerifiedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
                        referenceId, email, purpose, LocalDateTime.now())
                .orElseThrow(() -> new BusinessException(ErrorCode.OTP_EXPIRED, "Email OTP expired or not found"));
        if (record.getAttempts() >= MAX_ATTEMPTS) throw new BusinessException(ErrorCode.OTP_MAX_ATTEMPTS);
        record.setAttempts(record.getAttempts() + 1);
        if (!code.equals(record.getVerificationCode())) {
            repository.save(record);
            throw new BusinessException(ErrorCode.OTP_INVALID, "Incorrect email OTP");
        }
        record.setVerified(true);
        repository.save(record);
    }

    /**
     * Two-phase verify for the org-user setup flow where the OTP consumed state
     * must be atomic with all other account-setup writes.
     *
     * Phase 1 — checkAndIncrementAttempt(): runs in its own REQUIRES_NEW
     * transaction so the attempt counter is committed regardless of what the
     * caller's transaction does. Returns an OtpCheckOutcome — NEVER throws for
     * a wrong code — so the REQUIRES_NEW transaction always commits its increment
     * before the outcome is evaluated. Throwing a RuntimeException from REQUIRES_NEW
     * would roll back the inner tx and lose the increment.
     *
     * Phase 2 — markConsumed(): runs in the CALLER's transaction (REQUIRED)
     * so the verified=true flag is rolled back atomically if any subsequent
     * write (user.save, token.save, session revoke, etc.) fails.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public OtpCheckOutcome checkAndIncrementAttempt(String referenceId, String email,
                                                    String purpose, String code) {
        if (code == null || code.isBlank()) {
            return OtpCheckOutcome.invalid(OtpCheckResult.INCORRECT, "Email OTP is required");
        }
        java.util.Optional<AccountEmailOtp> found = repository
                .findFirstByUserIdAndEmailAndPurposeAndVerifiedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
                        referenceId, email, purpose, LocalDateTime.now());
        if (found.isEmpty()) {
            return OtpCheckOutcome.invalid(OtpCheckResult.EXPIRED_OR_NOT_FOUND,
                    "Email OTP expired or not found");
        }
        AccountEmailOtp record = found.get();
        if (record.getAttempts() >= MAX_ATTEMPTS) {
            return OtpCheckOutcome.invalid(OtpCheckResult.MAX_ATTEMPTS_EXCEEDED,
                    "Too many incorrect attempts. Request a new OTP.");
        }
        record.setAttempts(record.getAttempts() + 1);
        repository.save(record);
        if (!code.equals(record.getVerificationCode())) {
            return OtpCheckOutcome.invalid(OtpCheckResult.INCORRECT, "Incorrect email OTP");
        }
        return OtpCheckOutcome.correct(record.getId());
    }

    /**
     * Phase 2 of the two-phase verify: marks the OTP as consumed.
     * Runs in the CALLER's transaction (REQUIRED) so it rolls back atomically
     * with all other account-setup state changes if anything goes wrong.
     *
     * Uses a direct UPDATE rather than fetch-modify-save to avoid the REPEATABLE READ
     * isolation issue: the outer transaction's snapshot predates the REQUIRES_NEW inner
     * transaction's commit, so a findById here would return stale attempts=0 and overwrite
     * the committed attempts count on save.
     */
    @Transactional
    public void markConsumed(String otpId) {
        repository.markVerifiedById(otpId);
    }
}

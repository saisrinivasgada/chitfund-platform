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
    public void send(String referenceId, String email, String purpose, String displayName) {
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
                .verificationCode(AuthService.sha256Value(otp))
                .purpose(purpose)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build());
        emailService.sendAccountVerificationOtp(email, displayName, otp);
    }

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
        if (!AuthService.sha256Value(code).equals(record.getVerificationCode())) {
            repository.save(record);
            throw new BusinessException(ErrorCode.OTP_INVALID, "Incorrect email OTP");
        }
        record.setVerified(true);
        repository.save(record);
    }
}

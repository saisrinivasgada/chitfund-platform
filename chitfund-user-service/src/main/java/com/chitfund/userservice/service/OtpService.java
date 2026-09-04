package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.PhoneOtp;
import com.chitfund.userservice.repository.PhoneOtpRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.security.SecureRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final PhoneOtpRepository otpRepo;
    private final SmsService smsService;

    private static final int OTP_TTL_MINUTES = 30;
    private static final int MAX_ATTEMPTS = 3;

    @Value("${app.otp.max-per-phone-per-day:6}")
    private int maxPerPhonePerDay;

    @Value("${app.sms.enabled:false}")
    private boolean smsEnabled;

    @Transactional
    public void sendOtp(String phone, String countryCode, String purpose, String userId) {
        LocalDateTime startOfDay = LocalDateTime.now().toLocalDate().atStartOfDay();
        long todayCount = otpRepo.countByPhoneAndPurposeAndCreatedAtAfter(phone, purpose, startOfDay);

        if (smsEnabled && todayCount >= maxPerPhonePerDay) {
            throw new BusinessException(ErrorCode.OTP_RESEND_LIMIT,
                    "Too many OTP requests today. Please try again tomorrow or contact help@thechitwise.com.");
        }

        if (todayCount > 0) {
            otpRepo.findTopByPhoneAndPurposeOrderByCreatedAtDesc(phone, purpose).ifPresent(last -> {
                long requiredWaitSeconds = todayCount * 60L; // 1 min after 1st, 2 min after 2nd, …
                long secondsElapsed = ChronoUnit.SECONDS.between(last.getCreatedAt(), LocalDateTime.now());
                if (secondsElapsed < requiredWaitSeconds) {
                    long secondsRemaining = requiredWaitSeconds - secondsElapsed;
                    throw new BusinessException(ErrorCode.OTP_RATE_LIMITED,
                            "Please wait " + secondsRemaining + " second(s) before requesting another OTP");
                }
            });
        }

        String otp = generateOtp();
        PhoneOtp record = PhoneOtp.builder()
                .phone(phone)
                .countryCode(countryCode != null ? countryCode : "+91")
                .otpHash(otp)
                .purpose(purpose)
                .userId(userId)
                .expiresAt(LocalDateTime.now().plusMinutes(OTP_TTL_MINUTES))
                .attempts(0)
                .verified(false)
                .build();
        otpRepo.save(record);
        smsService.sendOtp(phone, record.getCountryCode(), otp);
    }

    @Transactional
    public String verifyOtp(String phone, String purpose, String code) {
        PhoneOtp record = otpRepo
                .findFirstByPhoneAndPurposeAndVerifiedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
                        phone, purpose, LocalDateTime.now())
                .orElseThrow(() -> new BusinessException(ErrorCode.OTP_EXPIRED,
                        "OTP expired or not found. Please request a new one."));

        if (record.getAttempts() >= MAX_ATTEMPTS) {
            throw new BusinessException(ErrorCode.OTP_MAX_ATTEMPTS,
                    "Too many incorrect attempts. Please request a new OTP.");
        }

        record.setAttempts(record.getAttempts() + 1);

        if (!code.equals(record.getOtpHash())) {
            otpRepo.save(record);
            int remaining = MAX_ATTEMPTS - record.getAttempts();
            throw new BusinessException(ErrorCode.OTP_INVALID,
                    "Incorrect OTP." + (remaining > 0
                            ? " " + remaining + " attempt(s) remaining."
                            : " Please request a new one."));
        }

        record.setVerified(true);
        otpRepo.save(record);
        return record.getId();
    }

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private String generateOtp() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }

}

package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PhoneOtp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface PhoneOtpRepository extends JpaRepository<PhoneOtp, String> {

    Optional<PhoneOtp> findTopByPhoneAndPurposeOrderByCreatedAtDesc(String phone, String purpose);

    Optional<PhoneOtp> findFirstByPhoneAndPurposeAndVerifiedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            String phone, String purpose, LocalDateTime now);

    long countByPhoneAndPurpose(String phone, String purpose);
}

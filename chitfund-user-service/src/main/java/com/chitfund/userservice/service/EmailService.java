package com.chitfund.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromAddress;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public void sendPasswordResetOtp(String toEmail, String adminName, String otp) {
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(fromAddress);
            msg.setTo(toEmail);
            msg.setSubject("ChitWise — Password Reset OTP");
            msg.setText("""
                    Hi %s,

                    You requested a password reset for your ChitWise admin account.

                    Your one-time password (OTP) is:

                        %s

                    This code expires in 10 minutes. Do not share it with anyone.

                    If you did not request this, please contact support@thechitwise.com immediately.

                    — The ChitWise Team
                    """.formatted(adminName != null ? adminName : "Admin", otp));
            mailSender.send(msg);
            log.info("Password reset OTP sent to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send password reset OTP to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send OTP email. Please try again.");
        }
    }
}

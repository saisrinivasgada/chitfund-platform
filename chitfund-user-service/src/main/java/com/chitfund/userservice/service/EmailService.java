package com.chitfund.userservice.service;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    @Value("${app.otp.logging-enabled:false}")
    private boolean otpLoggingEnabled;

    public void sendPasswordResetOtp(String toEmail, String adminName, String otp) {
        if (!emailEnabled) {
            if (otpLoggingEnabled) {
                log.warn("LOCAL/TEST password-reset email OTP for masked recipient {} is {}",
                        maskEmail(toEmail), otp);
            } else {
                log.info("Password-reset email OTP generated but delivery provider is disabled");
            }
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(toEmail);
            helper.setSubject("ChitWise — Password Reset OTP");
            helper.setText("""
                    Hi %s,

                    You requested a password reset for your ChitWise admin account.

                    Your one-time password (OTP) is:

                        %s

                    This code expires in 10 minutes. Do not share it with anyone.

                    If you did not request this, please contact help@thechitwise.com immediately.

                    — The ChitWise Team
                    """.formatted(adminName != null ? adminName : "Admin", otp));
            mailSender.send(message);
            log.info("Password reset OTP email sent");
        } catch (Exception e) {
            log.error("Failed to send password reset OTP email: {}", e.getClass().getSimpleName());
            throw new RuntimeException("Failed to send OTP email. Please try again.");
        }
    }

    public void sendAccountVerificationOtp(String toEmail, String memberName, String otp) {
        if (!emailEnabled) {
            if (otpLoggingEnabled) {
                log.warn("LOCAL/TEST email verification OTP for masked recipient {} is {}",
                        maskEmail(toEmail), otp);
            } else {
                log.info("Email verification OTP generated but delivery provider is disabled");
            }
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(toEmail);
            helper.setSubject("ChitWise — Verify your email");
            helper.setText("""
                    Hi %s,

                    Your ChitWise email verification code is:

                        %s

                    This code expires in 10 minutes. Do not share it with an organization administrator or anyone else.

                    If you did not request this, ignore this message and contact help@thechitwise.com.

                    — The ChitWise Team
                    """.formatted(memberName != null && !memberName.isBlank() ? memberName : "Member", otp));
            mailSender.send(message);
            log.info("Account verification email sent");
        } catch (Exception e) {
            log.error("Failed to send account verification email: {}", e.getClass().getSimpleName());
            throw new RuntimeException("Failed to send verification email. Please try again.");
        }
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].substring(0, 1) + "***@" + parts[1];
    }
}

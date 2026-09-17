package com.chitfund.userservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.*;

@Service
@Slf4j
public class EmailService {

    private final SesClient sesClient;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    @Value("${app.otp.logging-enabled:false}")
    private boolean otpLoggingEnabled;

    @Value("${cloud.aws.region.static:us-east-2}")
    private String awsRegion;

    public EmailService(@Value("${cloud.aws.region.static:us-east-2}") String region) {
        this.sesClient = SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    public void sendPasswordResetOtp(String toEmail, String adminName, String otp) {
        if (!emailEnabled) {
            if (otpLoggingEnabled) {
                log.warn("LOCAL/TEST password-reset OTP for {} is {}", maskEmail(toEmail), otp);
            } else {
                log.info("Password-reset OTP generated but email delivery is disabled");
            }
            return;
        }
        String body = """
                Hi %s,

                You requested a password reset for your ChitWise admin account.

                Your one-time password (OTP) is:

                    %s

                This code expires in 10 minutes. Do not share it with anyone.

                If you did not request this, please contact help@thechitwise.com immediately.

                — The ChitWise Team
                """.formatted(adminName != null ? adminName : "Admin", otp);

        send(toEmail, "ChitWise — Password Reset OTP", body);
    }

    public void sendAccountVerificationOtp(String toEmail, String memberName, String otp) {
        if (!emailEnabled) {
            if (otpLoggingEnabled) {
                log.warn("LOCAL/TEST verification OTP for {} is {}", maskEmail(toEmail), otp);
            } else {
                log.info("Verification OTP generated but email delivery is disabled");
            }
            return;
        }
        String body = """
                Hi %s,

                Your ChitWise email verification code is:

                    %s

                This code expires in 10 minutes. Do not share it with anyone.

                If you did not request this, ignore this message and contact help@thechitwise.com.

                — The ChitWise Team
                """.formatted(memberName != null && !memberName.isBlank() ? memberName : "Member", otp);

        send(toEmail, "ChitWise — Verify your email", body);
    }

    private void send(String toEmail, String subject, String body) {
        try {
            sesClient.sendEmail(SendEmailRequest.builder()
                    .source(fromAddress)
                    .destination(Destination.builder().toAddresses(toEmail).build())
                    .message(Message.builder()
                            .subject(Content.builder().data(subject).charset("UTF-8").build())
                            .body(Body.builder()
                                    .text(Content.builder().data(body).charset("UTF-8").build())
                                    .build())
                            .build())
                    .build());
            log.info("Email sent via SES to {}", maskEmail(toEmail));
        } catch (SesException e) {
            log.error("SES send failed to {}: {}", maskEmail(toEmail), e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to send email. Please try again.");
        }
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].substring(0, 1) + "***@" + parts[1];
    }
}

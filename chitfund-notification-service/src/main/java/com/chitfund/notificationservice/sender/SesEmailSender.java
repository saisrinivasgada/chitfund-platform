package com.chitfund.notificationservice.sender;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.*;

/**
 * Sends email via AWS SES.
 * Active when app.email.enabled=true; otherwise LoggingEmailSender handles the call.
 */
@Component
@ConditionalOnProperty(name = "app.email.enabled", havingValue = "true")
@Slf4j
public class SesEmailSender implements EmailSender {

    private final SesClient sesClient;

    @Value("${app.mail.from}")
    private String fromAddress;

    public SesEmailSender(@Value("${cloud.aws.region.static:ap-south-1}") String region) {
        this.sesClient = SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    @Override
    public void send(String toEmail, String subject, String textBody, String htmlBody) {
        try {
            sesClient.sendEmail(SendEmailRequest.builder()
                    .source(fromAddress)
                    .destination(Destination.builder().toAddresses(toEmail).build())
                    .message(Message.builder()
                            .subject(Content.builder().data(subject).charset("UTF-8").build())
                            .body(Body.builder()
                                    .text(Content.builder().data(textBody).charset("UTF-8").build())
                                    .html(Content.builder().data(htmlBody).charset("UTF-8").build())
                                    .build())
                            .build())
                    .build());
            log.info("Email sent via SES to {}", maskEmail(toEmail));
        } catch (SesException e) {
            log.error("SES send failed to {}: {}", maskEmail(toEmail), e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to send email: " + e.awsErrorDetails().errorMessage());
        }
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].charAt(0) + "***@" + parts[1];
    }
}

package com.chitfund.supportservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.*;

@Service
@Slf4j
public class EmployeeInvitationMailer {

    private final SesClient sesClient;

    @Value("${app.hub-url}")
    private String hubUrl;

    @Value("${app.mail.from:ChitWise <help@thechitwise.com>}")
    private String fromAddress;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    public EmployeeInvitationMailer(@Value("${cloud.aws.region.static:us-east-2}") String region) {
        this.sesClient = SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    public void sendInvitation(String email, String fullName, String rawToken) {
        String baseUrl = hubUrl.endsWith("/") ? hubUrl.substring(0, hubUrl.length() - 1) : hubUrl;
        String setupUrl = baseUrl + "/hub/accept-invite?token=" + rawToken;

        String body = """
                Hello %s,

                You have been invited to the ChitWise Hub. Set up your username and password here:

                %s

                This link expires in 7 days and can be used only once.

                If you did not expect this invitation, ignore this email.

                — The ChitWise Team
                """.formatted(fullName != null ? fullName : "there", setupUrl);

        if (!emailEnabled) {
            log.warn("Hub invite email disabled — accept-invite URL for {}: {}", email, setupUrl);
            return;
        }

        try {
            sesClient.sendEmail(SendEmailRequest.builder()
                    .source(fromAddress)
                    .destination(Destination.builder().toAddresses(email).build())
                    .message(Message.builder()
                            .subject(Content.builder().data("Set up your ChitWise Hub account").charset("UTF-8").build())
                            .body(Body.builder()
                                    .text(Content.builder().data(body).charset("UTF-8").build())
                                    .build())
                            .build())
                    .build());
            log.info("Hub invite email sent to {}", email);
        } catch (SesException e) {
            log.error("SES send failed for Hub invite to {}: {}", email, e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to send invitation email. Please try again.");
        }
    }
}

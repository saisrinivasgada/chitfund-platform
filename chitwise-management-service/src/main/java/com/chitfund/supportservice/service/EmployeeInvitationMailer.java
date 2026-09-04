package com.chitfund.supportservice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class EmployeeInvitationMailer {

    private final JavaMailSender mailSender;

    @Value("${app.hub-url}")
    private String hubUrl;

    @Value("${spring.mail.username}")
    private String fromAddress;

    public void sendInvitation(String email, String fullName, String rawToken) {
        String baseUrl = hubUrl.endsWith("/") ? hubUrl.substring(0, hubUrl.length() - 1) : hubUrl;
        String setupUrl = baseUrl + "/hub/accept-invite?token=" + rawToken;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(email);
        message.setSubject("Set up your ChitWise Hub account");
        message.setText("Hello " + fullName + ",\n\n"
                + "You have been invited to the ChitWise Hub. Set up your username and password here:\n\n"
                + setupUrl + "\n\n"
                + "This link expires in 7 days and can be used only once.\n\n"
                + "If you did not expect this invitation, ignore this email.");
        mailSender.send(message);
    }
}

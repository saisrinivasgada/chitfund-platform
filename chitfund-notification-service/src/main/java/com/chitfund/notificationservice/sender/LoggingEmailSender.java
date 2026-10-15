package com.chitfund.notificationservice.sender;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.email.enabled", havingValue = "false", matchIfMissing = true)
@Slf4j
public class LoggingEmailSender implements EmailSender {

    @Override
    public void send(String toEmail, String subject, String textBody, String htmlBody) {
        log.info("[EMAIL] delivery simulated for destination={} subjectLength={} bodyLength={}",
                maskEmail(toEmail), subject == null ? 0 : subject.length(),
                textBody == null ? 0 : textBody.length());
    }

    static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].charAt(0) + "***@" + parts[1];
    }
}

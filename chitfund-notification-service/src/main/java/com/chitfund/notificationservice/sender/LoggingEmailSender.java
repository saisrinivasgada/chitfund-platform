package com.chitfund.notificationservice.sender;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnMissingBean(EmailSender.class)
@Slf4j
public class LoggingEmailSender implements EmailSender {

    @Override
    public void send(String toEmail, String subject, String textBody, String htmlBody) {
        log.info("╔══════════════════════════════════════════════════");
        log.info("║ [EMAIL] DEV — not sent");
        log.info("║ To:      {}", toEmail);
        log.info("║ Subject: {}", subject);
        log.info("║ Body:    {}", textBody);
        log.info("╚══════════════════════════════════════════════════");
    }
}

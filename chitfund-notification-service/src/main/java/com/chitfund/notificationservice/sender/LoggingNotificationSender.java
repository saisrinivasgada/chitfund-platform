package com.chitfund.notificationservice.sender;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Development sender — logs messages to console instead of calling a real provider.
 * Active when notification.sender.mode=LOGGING (the default).
 *
 * To add a real SMS provider (e.g. MSG91):
 *   1. Create SmsNotificationSender implements NotificationSender
 *   2. Add @ConditionalOnProperty(name="notification.sender.mode", havingValue="SMS")
 *   3. Inject your MSG91 client and call their API in send()
 *   4. Set notification.sender.mode=SMS in application.yml (or env var)
 *   LoggingNotificationSender auto-disables — no other code changes needed.
 *
 * INTERVIEW: "ConditionalOnProperty is Spring Boot's built-in feature flag for beans.
 * It lets us swap implementations via config without touching application code."
 */
@Component
@ConditionalOnProperty(name = "notification.sender.mode", havingValue = "LOGGING", matchIfMissing = true)
@Slf4j
public class LoggingNotificationSender implements NotificationSender {

    @Override
    public SendResult send(String to, String message, NotificationChannel channel) {
        log.info("╔══════════════════════════════════════════════════");
        log.info("║ [{}] NOTIFICATION", channel);
        log.info("║ To:      {}", to);
        log.info("║ Message: {}", message);
        log.info("╚══════════════════════════════════════════════════");

        // Returns a fake external ID so the rest of the flow (DB logging) works in dev
        return SendResult.ok("MOCK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
    }
}

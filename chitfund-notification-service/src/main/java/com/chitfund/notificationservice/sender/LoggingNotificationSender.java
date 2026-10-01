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
        log.info("[{}] notification simulated for destination={} messageLength={}",
                channel, maskDestination(to), message == null ? 0 : message.length());

        // Returns a fake external ID so the rest of the flow (DB logging) works in dev
        return SendResult.ok("MOCK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
    }

    static String maskDestination(String destination) {
        if (destination == null || destination.isBlank()) return "***";
        int at = destination.indexOf('@');
        if (at > 0) {
            return destination.charAt(0) + "***" + destination.substring(at);
        }
        String lastFour = destination.length() <= 4
                ? destination : destination.substring(destination.length() - 4);
        return "***" + lastFour;
    }
}

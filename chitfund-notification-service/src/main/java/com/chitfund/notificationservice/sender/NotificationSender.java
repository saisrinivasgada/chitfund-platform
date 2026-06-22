package com.chitfund.notificationservice.sender;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;

/**
 * WHY an interface here?
 * Open/Closed Principle: swapping providers (MSG91 → Twilio → AWS SNS) means
 * writing a new implementation, not modifying existing code.
 * The service only depends on this interface — it never knows which provider is active.
 *
 * INTERVIEW: "We used the Strategy Pattern for notification providers. The interface
 * defines the contract; Spring injects the correct implementation based on config.
 * Adding WhatsApp support in the future is a new class, zero changes to existing code."
 */
public interface NotificationSender {

    /**
     * @param to      phone number (for SMS/WhatsApp) or email address
     * @param message formatted message text
     * @param channel which channel to use
     * @return provider's message ID if successful, null on failure
     */
    SendResult send(String to, String message, NotificationChannel channel);

    record SendResult(boolean success, String externalId, String errorMessage) {
        static SendResult ok(String externalId) {
            return new SendResult(true, externalId, null);
        }
        static SendResult failed(String errorMessage) {
            return new SendResult(false, null, errorMessage);
        }
    }
}

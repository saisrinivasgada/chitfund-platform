package com.chitfund.paymentservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Sends WhatsApp messages via the Meta Cloud API (WhatsApp Business Platform).
 *
 * INTERVIEW: "Why Meta Cloud API and not Twilio WhatsApp?"
 * Meta Cloud API is the official, first-party WhatsApp Business API — no per-message
 * markup from a third party. First 1,000 conversations/month are free. Twilio WhatsApp
 * is a reseller that adds a per-message fee on top of Meta's own charges.
 *
 * HOW IT WORKS:
 * 1. Admin registers a phone number in Meta Business Suite and gets a Phone Number ID.
 * 2. Meta issues a long-lived access token (System User token).
 * 3. We call POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages
 *    with the recipient's number and the message body.
 * 4. For business-initiated messages the first message MUST use a pre-approved template.
 *    Free-form replies are allowed within a 24-hour window once the member replies.
 *
 * SETUP (admin must do this in Meta Business Suite):
 *   1. Create Meta Business Account → Add WhatsApp product to your App
 *   2. Register your business phone number (the one you'll send FROM)
 *   3. Create a System User → generate a permanent token
 *   4. Create and submit a message template (e.g., "payment_reminder") for approval
 *   5. Set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN in environment
 *
 * TEMPLATE FORMAT (you must create this in Meta Business Suite):
 *   Name: payment_reminder
 *   Body: "Hi {{1}}, you have an outstanding payment of ₹{{2}} for chit fund {{3}}. Please pay at your earliest convenience."
 *   Category: UTILITY
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WhatsAppService {

    private final RestTemplate restTemplate;

    @Value("${whatsapp.phone-number-id:NOT_CONFIGURED}")
    private String phoneNumberId;

    @Value("${whatsapp.access-token:NOT_CONFIGURED}")
    private String accessToken;

    @Value("${whatsapp.enabled:false}")
    private boolean enabled;

    private static final String API_URL = "https://graph.facebook.com/v19.0/%s/messages";

    /**
     * Sends a free-form text message (only works within a 24-hour reply window).
     * Use for follow-ups after the member has already replied to us.
     */
    public boolean sendText(String toPhone, String message) {
        if (!enabled) {
            log.info("WhatsApp disabled — skipping message to {}", maskPhone(toPhone));
            return false;
        }
        if ("NOT_CONFIGURED".equals(phoneNumberId) || "NOT_CONFIGURED".equals(accessToken)) {
            log.warn("WhatsApp credentials not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.");
            return false;
        }

        String e164Phone = toE164India(toPhone);
        if (e164Phone == null) {
            log.warn("Invalid phone number format: {}", maskPhone(toPhone));
            return false;
        }

        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                "to", e164Phone,
                "type", "text",
                "text", Map.of("body", message)
        );

        return doPost(e164Phone, body);
    }

    /**
     * Sends a template message — required for business-initiated conversations.
     *
     * @param toPhone       Recipient phone number (any format — will be normalized to E.164)
     * @param templateName  Template name as registered in Meta Business Suite
     * @param components    Ordered placeholder values ({{1}}, {{2}}, etc.)
     */
    public boolean sendTemplate(String toPhone, String templateName, List<String> components) {
        if (!enabled) {
            log.info("WhatsApp disabled — skipping template '{}' to {}", templateName, maskPhone(toPhone));
            return false;
        }
        if ("NOT_CONFIGURED".equals(phoneNumberId) || "NOT_CONFIGURED".equals(accessToken)) {
            log.warn("WhatsApp credentials not configured.");
            return false;
        }

        String e164Phone = toE164India(toPhone);
        if (e164Phone == null) {
            log.warn("Invalid phone number: {}", maskPhone(toPhone));
            return false;
        }

        List<Map<String, Object>> params = components.stream()
                .map(val -> Map.of("type", (Object) "text", "text", val))
                .toList();

        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                "to", e164Phone,
                "type", "template",
                "template", Map.of(
                        "name", templateName,
                        "language", Map.of("code", "en_IN"),
                        "components", List.of(
                                Map.of("type", "body", "parameters", params)
                        )
                )
        );

        return doPost(e164Phone, body);
    }

    /**
     * Convenience: send the payment_reminder template.
     * Template: "Hi {name}, you have ₹{amount} outstanding for {chitName}. Please pay at your earliest convenience."
     */
    public boolean sendPaymentReminder(String toPhone, String memberName, String outstandingAmount, String chitName) {
        return sendTemplate(toPhone, "payment_reminder",
                List.of(memberName, outstandingAmount, chitName));
    }

    // ── Internals ──────────────────────────────────────────────────────────────

    private boolean doPost(String e164Phone, Map<String, Object> body) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(accessToken);

            ResponseEntity<Map> response = restTemplate.exchange(
                    String.format(API_URL, phoneNumberId),
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    Map.class
            );

            boolean ok = response.getStatusCode().is2xxSuccessful();
            if (ok) {
                log.info("WhatsApp message sent to {}", maskPhone(e164Phone));
            } else {
                log.warn("WhatsApp API returned {} for {}", response.getStatusCode(), maskPhone(e164Phone));
            }
            return ok;

        } catch (RestClientException e) {
            log.error("WhatsApp send failed for {}: {}", maskPhone(e164Phone), e.getMessage());
            return false;
        }
    }

    /**
     * Converts an Indian phone number to E.164 format (+91XXXXXXXXXX).
     * Handles: 9876543210 / 09876543210 / +919876543210 / 919876543210
     */
    private String toE164India(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() == 10) return "+91" + digits;
        if (digits.length() == 11 && digits.startsWith("0")) return "+91" + digits.substring(1);
        if (digits.length() == 12 && digits.startsWith("91")) return "+" + digits;
        if (digits.length() == 13 && digits.startsWith("091")) return "+" + digits.substring(1);
        // Already has + sign
        if (raw.startsWith("+") && digits.length() >= 10) return "+" + digits;
        return null;
    }

    private String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) return "****";
        return phone.substring(0, phone.length() - 4) + "****";
    }
}

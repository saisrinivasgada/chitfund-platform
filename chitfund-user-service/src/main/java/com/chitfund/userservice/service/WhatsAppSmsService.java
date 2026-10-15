package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.enums.SmsDeliveryStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Sends OTPs via WhatsApp using Meta's Cloud API directly (no BSP middleman).
 * Requires an approved authentication-category template on the WhatsApp Business account.
 */
@Service
@Slf4j
@ConditionalOnProperty(name = "app.sms.enabled", havingValue = "true")
public class WhatsAppSmsService implements SmsService {

    private static final Pattern API_VERSION = Pattern.compile("v\\d+\\.\\d+");
    private static final Pattern PHONE_NUMBER_ID = Pattern.compile("\\d+");
    private static final Pattern TEMPLATE_NAME = Pattern.compile("[a-z0-9_]+");
    private static final Pattern TEMPLATE_LANGUAGE = Pattern.compile("[a-z]{2}(?:_[A-Z]{2})?");

    private final RestTemplate restTemplate;
    private final String graphApiBaseUrl;
    private final String apiVersion;
    private final String phoneNumberId;
    private final String accessToken;
    private final String templateName;
    private final String templateLang;

    public WhatsAppSmsService(
            RestTemplate restTemplate,
            @Value("${whatsapp.graph-api-base-url:https://graph.facebook.com}") String graphApiBaseUrl,
            @Value("${whatsapp.api-version:NOT_CONFIGURED}") String apiVersion,
            @Value("${whatsapp.phone-number-id:NOT_CONFIGURED}") String phoneNumberId,
            @Value("${whatsapp.access-token:NOT_CONFIGURED}") String accessToken,
            @Value("${whatsapp.otp-template-name:otp_verification}") String templateName,
            @Value("${whatsapp.otp-template-lang:en_US}") String templateLang) {
        this.restTemplate = restTemplate;
        this.graphApiBaseUrl = validateGraphApiBaseUrl(graphApiBaseUrl);
        this.apiVersion = requireMatch(apiVersion, API_VERSION, "WHATSAPP_API_VERSION");
        this.phoneNumberId = requireMatch(
                phoneNumberId, PHONE_NUMBER_ID, "WHATSAPP_PHONE_NUMBER_ID");
        this.accessToken = requireConfigured(accessToken, "WHATSAPP_ACCESS_TOKEN");
        if (this.accessToken.length() < 20) {
            throw new IllegalStateException("WHATSAPP_ACCESS_TOKEN is too short");
        }
        this.templateName = requireMatch(
                templateName, TEMPLATE_NAME, "WHATSAPP_OTP_TEMPLATE_NAME");
        this.templateLang = requireMatch(
                templateLang, TEMPLATE_LANGUAGE, "WHATSAPP_OTP_TEMPLATE_LANG");
    }

    @Override
    public SmsDeliveryStatus sendOtp(String phone, String countryCode, String otp) {
        String to = normalizeRecipient(phone, countryCode);
        String url = "%s/%s/%s/messages".formatted(graphApiBaseUrl, apiVersion, phoneNumberId);

        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                "to", to,
                "type", "template",
                "template", Map.of(
                        "name", templateName,
                        "language", Map.of("code", templateLang),
                        "components", List.of(
                                Map.of("type", "body", "parameters",
                                        List.of(Map.of("type", "text", "text", otp)))
                        )
                ));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(accessToken);

        try {
            restTemplate.exchange(url, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
            log.info("WhatsApp OTP sent, phone ending {}", maskedSuffix(phone));
            return SmsDeliveryStatus.DELIVERED;
        } catch (HttpStatusCodeException exception) {
            log.error("WhatsApp OTP provider rejected phone ending {} with status {}",
                    maskedSuffix(phone), exception.getStatusCode().value());
            return SmsDeliveryStatus.DELIVERY_FAILED;
        } catch (RestClientException e) {
            log.error("WhatsApp OTP provider unavailable for phone ending {} ({})",
                    maskedSuffix(phone), e.getClass().getSimpleName());
            return SmsDeliveryStatus.DELIVERY_FAILED;
        }
    }

    @Override
    public boolean isConfigured() {
        return true;
    }

    private String normalizeRecipient(String phone, String countryCode) {
        String rawPhone = phone == null ? "" : phone.trim();
        String phoneDigits = rawPhone.replaceAll("\\D", "");
        String countryDigits = (countryCode == null || countryCode.isBlank() ? "91" : countryCode)
                .replaceAll("\\D", "");
        if (rawPhone.startsWith("00")) {
            phoneDigits = phoneDigits.substring(Math.min(2, phoneDigits.length()));
        } else if (!rawPhone.startsWith("+")
                && !(phoneDigits.length() > 10 && phoneDigits.startsWith(countryDigits))) {
            phoneDigits = countryDigits + phoneDigits;
        }
        if (phoneDigits.length() < 8 || phoneDigits.length() > 15) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A valid mobile number is required", HttpStatus.BAD_REQUEST);
        }
        return phoneDigits;
    }

    private static String requireConfigured(String value, String setting) {
        if (value == null || value.isBlank() || "NOT_CONFIGURED".equalsIgnoreCase(value.trim())) {
            throw new IllegalStateException(setting + " must be configured when SMS_ENABLED=true");
        }
        return value.trim();
    }

    private static String requireMatch(String value, Pattern pattern, String setting) {
        String configured = requireConfigured(value, setting);
        if (!pattern.matcher(configured).matches()) {
            throw new IllegalStateException(setting + " has an invalid format");
        }
        return configured;
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String validateGraphApiBaseUrl(String value) {
        String configured = stripTrailingSlash(requireConfigured(
                value, "WHATSAPP_GRAPH_API_BASE_URL"));
        URI uri;
        try {
            uri = URI.create(configured);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("WHATSAPP_GRAPH_API_BASE_URL is invalid");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalStateException(
                    "WHATSAPP_GRAPH_API_BASE_URL must be an HTTPS origin without credentials or query data");
        }
        return configured;
    }

    private String maskedSuffix(String phone) {
        return phone != null && phone.length() >= 4 ? phone.substring(phone.length() - 4) : "****";
    }
}

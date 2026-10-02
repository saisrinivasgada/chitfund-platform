package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Sends OTPs via WhatsApp using Meta's Cloud API directly (no BSP middleman).
 * Requires an approved authentication-category template on the WhatsApp Business account.
 */
@Service
@Slf4j
@ConditionalOnProperty(name = "app.sms.enabled", havingValue = "true")
public class WhatsAppSmsService implements SmsService {

    private final RestTemplate restTemplate;

    @Value("${whatsapp.graph-api-base-url:https://graph.facebook.com}")
    private String graphApiBaseUrl;

    @Value("${whatsapp.api-version:v19.0}")
    private String apiVersion;

    @Value("${whatsapp.phone-number-id:NOT_CONFIGURED}")
    private String phoneNumberId;

    @Value("${whatsapp.access-token:NOT_CONFIGURED}")
    private String accessToken;

    @Value("${whatsapp.otp-template-name:otp_verification}")
    private String templateName;

    @Value("${whatsapp.otp-template-lang:en_US}")
    private String templateLang;

    public WhatsAppSmsService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public void sendOtp(String phone, String countryCode, String otp) {
        String to = (countryCode != null ? countryCode.replace("+", "") : "91") + phone;
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
        } catch (RestClientException e) {
            log.error("WhatsApp OTP send failed for phone ending {}: {}", maskedSuffix(phone), e.getMessage());
            throw new BusinessException(ErrorCode.OTP_DELIVERY_FAILED,
                    ErrorCode.OTP_DELIVERY_FAILED.getDefaultMessage(), HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private String maskedSuffix(String phone) {
        return phone != null && phone.length() >= 4 ? phone.substring(phone.length() - 4) : "****";
    }
}

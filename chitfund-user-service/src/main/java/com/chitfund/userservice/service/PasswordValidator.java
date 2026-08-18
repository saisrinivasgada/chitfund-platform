package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
@Slf4j
public class PasswordValidator {

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    public void validate(String password) {
        if (password == null || password.length() < 8) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Password must contain at least one uppercase letter", HttpStatus.BAD_REQUEST);
        }
        if (!password.matches(".*[a-z].*")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Password must contain at least one lowercase letter", HttpStatus.BAD_REQUEST);
        }
        if (!password.matches(".*[0-9].*")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Password must contain at least one number", HttpStatus.BAD_REQUEST);
        }
        if (!password.matches(".*[^A-Za-z0-9].*")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Password must contain at least one special character", HttpStatus.BAD_REQUEST);
        }
        checkBreached(password);
    }

    private void checkBreached(String password) {
        try {
            String sha1 = sha1Hex(password).toUpperCase();
            String prefix = sha1.substring(0, 5);
            String suffix = sha1.substring(5);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.pwnedpasswords.com/range/" + prefix))
                    .header("Add-Padding", "true")
                    .GET()
                    .build();
            HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());

            boolean breached = res.body().lines()
                    .anyMatch(line -> line.toUpperCase().startsWith(suffix));
            if (breached) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "This password has appeared in a known data breach. Please choose a different password.",
                        HttpStatus.BAD_REQUEST);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("HIBP check unavailable — skipping breach check: {}", e.getMessage());
        }
    }

    private String sha1Hex(String input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }
}

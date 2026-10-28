package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class PasswordValidator {

    private static final Duration CHECK_TIMEOUT = Duration.ofSeconds(5);
    private final HttpClient http;
    private final URI rangeBase;
    private final Duration checkTimeout;

    @Autowired
    public PasswordValidator(@Value("${app.password.breach-check-base-url:https://api.pwnedpasswords.com/range/}") String rangeBase) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
                URI.create(rangeBase), CHECK_TIMEOUT);
    }

    PasswordValidator(HttpClient http, URI rangeBase, Duration checkTimeout) {
        if (!rangeBase.isAbsolute() || rangeBase.getHost() == null
                || !("https".equals(rangeBase.getScheme()) || "http".equals(rangeBase.getScheme()))
                || rangeBase.getUserInfo() != null || rangeBase.getQuery() != null || rangeBase.getFragment() != null
                || !rangeBase.getPath().endsWith("/")) {
            throw new IllegalArgumentException("Password breach range URL must be an absolute HTTP(S) directory URL");
        }
        if (checkTimeout.isNegative() || checkTimeout.isZero()) throw new IllegalArgumentException("Positive check timeout required");
        this.http = http;
        this.rangeBase = rangeBase;
        this.checkTimeout = checkTimeout;
    }

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
        CompletableFuture<HttpResponse<String>> pending = null;
        try {
            String sha1 = sha1Hex(password).toUpperCase();
            String prefix = sha1.substring(0, 5);
            String suffix = sha1.substring(5);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(rangeBase.resolve(prefix))
                    .timeout(checkTimeout)
                    .header("Add-Padding", "true")
                    .GET()
                    .build();
            pending = http.sendAsync(req, HttpResponse.BodyHandlers.ofString());
            // Bound full body consumption too: a provider can send headers and
            // then stall indefinitely, after the HTTP request timer has ended.
            HttpResponse<String> res = pending.get(checkTimeout.toMillis(), TimeUnit.MILLISECONDS);
            if (res.statusCode() != 200) {
                log.warn("HIBP check unavailable — skipping breach check (HTTP {})", res.statusCode());
                return;
            }

            boolean breached = res.body().lines()
                    .map(line -> line.split(":", 2))
                    .anyMatch(parts -> parts.length == 2 && parts[0].equalsIgnoreCase(suffix)
                            && parts[1].trim().matches("0*[1-9][0-9]*"));
            if (breached) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "This password has appeared in a known data breach. Please choose a different password.",
                        HttpStatus.BAD_REQUEST);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("HIBP check interrupted — skipping breach check");
        } catch (Exception e) {
            log.warn("HIBP check unavailable — skipping breach check ({})", e.getClass().getSimpleName());
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
        }
    }

    private String sha1Hex(String input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }
}

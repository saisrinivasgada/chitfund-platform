package com.chitfund.userservice.service;

import com.chitfund.userservice.dto.response.AuthResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

/** Account cookies are independent; refreshing A never replaces B's cookie. */
@Component
public class BrowserAccountSessions {
    @Value("${app.cookie.secure:true}") private boolean secure;

    public static String id(AuthResponse auth) {
        if (auth.getUser() == null || auth.getTenant() == null) return null;
        String scope = "WEB:" + auth.getUser().getId() + ":" + auth.getTenant().getTenantId() + ":" + auth.getTenant().getRole();
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(scope.getBytes(StandardCharsets.UTF_8))).substring(0, 32);
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    public void write(HttpServletResponse response, AuthResponse auth) {
        String id = id(auth);
        if (id == null || auth.getRefreshToken() == null) return;
        auth.setBrowserAccountId(id);
        write(response, id, auth.getRefreshToken(), Duration.ofDays(30));
    }

    public String read(HttpServletRequest request, String id) {
        if (!validId(id) || request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies()) {
            if (cookie.getName().equals("chitwise_account_" + id)) return cookie.getValue();
        }
        return null;
    }

    public void clear(HttpServletResponse response, String id) {
        if (validId(id)) write(response, id, "", Duration.ZERO);
    }

    private static boolean validId(String id) { return id != null && id.matches("[a-f0-9]{32}"); }

    private void write(HttpServletResponse response, String id, String token, Duration age) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("chitwise_account_" + id, token)
                .httpOnly(true).secure(secure).sameSite(secure ? "Strict" : "Lax")
                .path("/api/auth/accounts/" + id).maxAge(age).build().toString());
    }
}

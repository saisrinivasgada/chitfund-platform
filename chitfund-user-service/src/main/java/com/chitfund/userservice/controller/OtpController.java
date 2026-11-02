package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.dto.request.SendPhoneOtpRequest;
import com.chitfund.userservice.dto.request.VerifyPhoneOtpRequest;
import com.chitfund.userservice.service.OtpService;
import com.chitfund.userservice.service.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth/otp")
@RequiredArgsConstructor
public class OtpController {

    private final OtpService otpService;
    private final RateLimiterService rateLimiterService;

    @PostMapping("/send")
    public ResponseEntity<ApiResponse<Void>> sendOtp(
            @Valid @RequestBody SendPhoneOtpRequest req,
            HttpServletRequest httpRequest) {
        String ip = getClientIp(httpRequest);
        if (!rateLimiterService.tryConsumeForgot(ip)) {
            throw new BusinessException(ErrorCode.OTP_RATE_LIMITED,
                    "Too many OTP requests from this device. Please wait 15 minutes.",
                    HttpStatus.TOO_MANY_REQUESTS);
        }
        otpService.sendOtp(req.getPhone(), req.getCountryCode(), "REGISTRATION", null);
        return ResponseEntity.ok(ApiResponse.success(null, "OTP sent to " + req.getPhone()));
    }

    @PostMapping("/verify")
    public ResponseEntity<ApiResponse<Map<String, String>>> verifyOtp(@Valid @RequestBody VerifyPhoneOtpRequest req) {
        String token = otpService.verifyOtp(req.getPhone(), "REGISTRATION", req.getCode());
        return ResponseEntity.ok(ApiResponse.success(Map.of("verificationToken", token), "Phone verified successfully"));
    }

    private String getClientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim();
        return request.getRemoteAddr();
    }
}

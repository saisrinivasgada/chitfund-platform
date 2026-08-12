package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.dto.request.SendPhoneOtpRequest;
import com.chitfund.userservice.dto.request.VerifyPhoneOtpRequest;
import com.chitfund.userservice.service.OtpService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth/otp")
@RequiredArgsConstructor
public class OtpController {

    private final OtpService otpService;

    @PostMapping("/send")
    public ResponseEntity<ApiResponse<Void>> sendOtp(@Valid @RequestBody SendPhoneOtpRequest req) {
        otpService.sendOtp(req.getPhone(), req.getCountryCode(), "REGISTRATION", null);
        return ResponseEntity.ok(ApiResponse.success(null, "OTP sent to " + req.getPhone()));
    }

    @PostMapping("/verify")
    public ResponseEntity<ApiResponse<Map<String, String>>> verifyOtp(@Valid @RequestBody VerifyPhoneOtpRequest req) {
        String token = otpService.verifyOtp(req.getPhone(), "REGISTRATION", req.getCode());
        return ResponseEntity.ok(ApiResponse.success(Map.of("verificationToken", token), "Phone verified successfully"));
    }
}

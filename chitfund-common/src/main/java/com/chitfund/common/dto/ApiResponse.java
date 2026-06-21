package com.chitfund.common.dto;

import com.chitfund.common.exception.ErrorCode;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Standard API response envelope used by ALL services.
 *
 * WHY a response envelope?
 * - Clients (React frontend, mobile app) always get a predictable structure
 * - Metadata (timestamp, traceId) helps with debugging production issues
 * - success flag lets client code do: if (response.isSuccess()) { ... }
 *   without checking HTTP status codes in every component
 *
 * DESIGN PATTERN: This is the Decorator pattern on your actual data.
 * The 'data' field wraps the real payload.
 *
 * Alternative: Just return the data directly. Trade-off: no consistent
 * error format. Netflix, Stripe, Razorpay all use an envelope pattern.
 *
 * @JsonInclude(NON_NULL): Fields that are null are omitted from JSON.
 * This keeps responses clean — no "fieldErrors: null" in success responses.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private boolean success;
    private String message;
    private T data;
    private String errorCode;
    private Map<String, String> fieldErrors;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime timestamp;

    private String traceId;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public static <T> ApiResponse<T> success(T data, String message) {
        return ApiResponse.<T>builder()
                .success(true)
                .message(message)
                .data(data)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public static <T> ApiResponse<T> error(String errorCode, String message) {
        return ApiResponse.<T>builder()
                .success(false)
                .errorCode(errorCode)
                .message(message)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public static <T> ApiResponse<T> validationError(Map<String, String> fieldErrors) {
        return ApiResponse.<T>builder()
                .success(false)
                .errorCode(ErrorCode.VALIDATION_FAILED.getCode())
                .message("Request validation failed")
                .fieldErrors(fieldErrors)
                .timestamp(LocalDateTime.now())
                .build();
    }
}

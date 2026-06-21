package com.chitfund.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * Base exception for all business rule violations.
 *
 * WHY a custom exception hierarchy?
 * - Separates business errors (expected, handled) from technical errors (unexpected)
 * - GlobalExceptionHandler maps each exception type to the correct HTTP status
 * - Carries ErrorCode for client-side error handling
 *
 * DESIGN PATTERN: This is part of the Exception Hierarchy pattern.
 *   RuntimeException (unchecked)
 *     └─ BusinessException (business rule violated)
 *         └─ ResourceNotFoundException (entity not found → 404)
 *
 * WHY RuntimeException (unchecked)?
 * - Checked exceptions (must declare in method signature) clutter service interfaces
 * - Spring @Transactional only auto-rolls back for RuntimeException
 * - Modern Java best practice: use unchecked for application exceptions
 *
 * INTERVIEW: "We separate BusinessException (4xx — client's fault) from
 * technical exceptions (5xx — our fault). This makes SLO tracking cleaner:
 * 4xx errors don't count against availability, 5xx do."
 */
@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;
    private final HttpStatus httpStatus;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getDefaultMessage());
        this.errorCode = errorCode;
        this.httpStatus = HttpStatus.BAD_REQUEST;
    }

    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = HttpStatus.BAD_REQUEST;
    }

    public BusinessException(ErrorCode errorCode, String message, HttpStatus httpStatus) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }
}

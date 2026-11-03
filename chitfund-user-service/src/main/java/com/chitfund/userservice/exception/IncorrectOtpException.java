package com.chitfund.userservice.exception;

import com.chitfund.common.exception.ErrorCode;

/**
 * Thrown when the user supplies a wrong OTP code.
 *
 * This exception is intentionally NOT a subclass of BusinessException. Using a
 * typed exception lets OrgUserSetupService.complete() declare a narrow
 * noRollbackFor = IncorrectOtpException.class, so only incorrect-OTP failures
 * leave the outer transaction uncommitted rather than the broad
 * noRollbackFor = BusinessException.class which would suppress rollback for any
 * business rule violation — including failures that should roll back.
 *
 * The REQUIRES_NEW inner transaction in AccountEmailOtpService.checkAndIncrementAttempt()
 * always commits the attempt counter, regardless of what the outer transaction does.
 * This exception is the signal from that inner transaction to the outer one that
 * the OTP was wrong and no further state should be committed.
 */
public final class IncorrectOtpException extends RuntimeException {

    private final ErrorCode errorCode;

    public IncorrectOtpException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}

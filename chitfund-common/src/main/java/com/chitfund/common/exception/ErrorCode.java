package com.chitfund.common.exception;

import lombok.Getter;

/**
 * Centralized error codes for the entire platform.
 *
 * WHY enum for error codes?
 * - Compile-time safety: can't use a non-existent error code
 * - Single source of truth: all 8 services use the same codes
 * - Clients (React, mobile) can build logic around specific codes
 *   e.g. if (errorCode === "MONTH_ALREADY_RESERVED") show retry button
 *
 * REAL WORLD: Stripe has ~200 error codes. Razorpay publishes their full error
 * code list in docs. Clients write switch statements on these codes.
 *
 * WHY format "DOMAIN_NNN"?
 * - Prefix groups related errors (CHIT_001, CHIT_002...)
 * - Easy to grep logs for all chit-related errors
 * - Number allows adding new codes without breaking existing ones
 */
@Getter
public enum ErrorCode {

    // ─── General ──────────────────────────────────────────────────────────
    INTERNAL_SERVER_ERROR("GENERAL_001", "Internal server error"),
    VALIDATION_FAILED("GENERAL_002", "Request validation failed"),
    RESOURCE_NOT_FOUND("GENERAL_003", "Resource not found"),
    UNAUTHORIZED("GENERAL_004", "Authentication required"),
    FORBIDDEN("GENERAL_005", "Access denied — insufficient permissions"),
    CONCURRENT_MODIFICATION("GENERAL_006", "Resource was modified by another request — please retry"),

    // ─── Auth ─────────────────────────────────────────────────────────────
    INVALID_CREDENTIALS("AUTH_001", "Invalid username or password"),
    ACCOUNT_LOCKED("AUTH_002", "Account is locked due to too many failed attempts"),
    TOKEN_EXPIRED("AUTH_003", "Token has expired"),
    TOKEN_INVALID("AUTH_004", "Token is invalid"),
    REFRESH_TOKEN_EXPIRED("AUTH_005", "Refresh token has expired — please login again"),

    // ─── Chit ─────────────────────────────────────────────────────────────
    CHIT_NOT_FOUND("CHIT_001", "Chit not found"),
    CHIT_NOT_ACTIVE("CHIT_002", "Chit is not in ACTIVE state"),
    CHIT_NOT_EDITABLE("CHIT_003", "Chit cannot be modified in its current state"),
    CHIT_AT_CAPACITY("CHIT_004", "Chit has reached its maximum member capacity"),
    INVALID_STATUS_TRANSITION("CHIT_005", "This status transition is not allowed"),
    CHIT_END_DATE_BEFORE_START("CHIT_006", "End date must be after start date"),

    // ─── Member ───────────────────────────────────────────────────────────
    MEMBER_NOT_FOUND("MEMBER_001", "Member not found"),
    MEMBER_NOT_ENROLLED("MEMBER_002", "Member is not enrolled in this chit"),
    MEMBER_ALREADY_ENROLLED("MEMBER_003", "Member is already enrolled in this chit"),
    MEMBER_ALREADY_WON("MEMBER_004", "Member has already received a payout in this chit"),
    MEMBER_INACTIVE("MEMBER_005", "Member account is not active"),
    MEMBER_PHONE_TAKEN("MEMBER_006", "A member with this phone number already exists"),
    MEMBER_USER_ALREADY_LINKED("MEMBER_007", "This user account is already linked to another member"),

    // ─── Winner / Month ───────────────────────────────────────────────────
    MONTH_ALREADY_ASSIGNED("WINNER_001", "A winner is already assigned for this month"),
    MONTH_ALREADY_RESERVED("WINNER_002", "This month is already reserved by another member"),
    MEMBER_ALREADY_HAS_RESERVATION("WINNER_003", "Member already has an active reservation in this chit"),
    INVALID_MONTH_NUMBER("WINNER_004", "Month number is out of range for this chit"),
    UNSUPPORTED_WINNER_SELECTION_MODE("WINNER_005", "This winner selection mode is not yet implemented"),
    RESERVATION_NOT_FOUND("WINNER_006", "Month reservation not found"),

    // ─── Payment ──────────────────────────────────────────────────────────
    UNSUPPORTED_PAYMENT_MODE("PAYMENT_001", "Payment mode not supported"),
    CUSTOM_INSTALLMENT_NOT_CONFIGURED("PAYMENT_002", "Custom installment amount is not configured for this member"),
    PAYMENT_NOT_FOUND("PAYMENT_003", "Payment record not found"),
    DUPLICATE_PAYMENT("PAYMENT_004", "A payment already exists for this period"),
    MONTH_ALREADY_OPEN("PAYMENT_005", "A cycle is already open or skipped for this chit month"),
    BATCH_ALREADY_COMPLETED("PAYMENT_006", "This payment batch is already completed"),
    CYCLE_HAS_PAYMENTS("PAYMENT_007", "Cycle has payments recorded — void them before deleting"),
    CYCLE_NOT_DELETABLE("PAYMENT_008", "Only OPEN cycles can be deleted"),
    CHIT_CYCLES_EXHAUSTED("PAYMENT_009", "All real cycles for this chit have already been opened"),
    SETTLEMENT_ALREADY_EXISTS("PAYMENT_010", "An active settlement already exists for this member — complete or cancel it first"),

    // ─── Payout ───────────────────────────────────────────────────────────
    PAYOUT_NOT_FOUND("PAYOUT_001", "Payout record not found"),
    PAYOUT_ALREADY_EXISTS("PAYOUT_002", "A payout already exists for this chit month"),
    PAYOUT_NOT_PENDING("PAYOUT_003", "Only PENDING payouts can be modified"),
    PAYOUT_ALREADY_DISBURSED("PAYOUT_004", "Payout has already been disbursed"),

    // ─── User ─────────────────────────────────────────────────────────────
    USER_NOT_FOUND("USER_001", "User not found"),
    USERNAME_TAKEN("USER_002", "Username is already taken"),
    EMAIL_TAKEN("USER_003", "Email is already registered"),

    // ─── OTP ──────────────────────────────────────────────────────────────
    OTP_RATE_LIMITED("OTP_001", "Please wait before requesting another OTP"),
    OTP_EXPIRED("OTP_002", "OTP expired or not found — please request a new one"),
    OTP_INVALID("OTP_003", "Incorrect OTP"),
    OTP_MAX_ATTEMPTS("OTP_004", "Too many incorrect attempts — please request a new OTP"),

    // ─── Plan Limits ──────────────────────────────────────────────────────
    PLAN_LIMIT_EXCEEDED("PLAN_001", "Your current plan limit has been reached — upgrade to continue"),
    PLAN_EXPIRED("PLAN_002", "Your subscription has expired — please renew to continue"),

    // ─── Billing ──────────────────────────────────────────────────────────
    BILLING_PAYMENT_NOT_FOUND("BILLING_001", "Payment record not found"),
    BILLING_ALREADY_REFUNDED("BILLING_002", "This payment has already been refunded");

    private final String code;
    private final String defaultMessage;

    ErrorCode(String code, String defaultMessage) {
        this.code = code;
        this.defaultMessage = defaultMessage;
    }
}

package com.chitfund.notificationservice.domain.enums;

public enum NotificationStatus {
    PENDING, // durably queued; provider delivery has not completed yet
    SENT,    // successfully handed off to the provider
    FAILED,  // provider returned an error — logged for retry or admin review
    SKIPPED  // recipient had no phone/email for this channel — no send attempted
}

package com.chitfund.notificationservice.domain.enums;

public enum NotificationChannel {
    SMS,       // text to phone number — works on any phone, no internet needed
    WHATSAPP,  // WhatsApp message — rich media, read receipts, delivery status
    EMAIL      // email — for admins and members who provide an address
}

package com.chitfund.common.event;

import java.util.Map;

public record InAppNotificationEvent(
        String recipientId,
        String title,
        String message,
        String type,
        Map<String, String> metadata,
        String link
) {}

package com.chitfund.common.event;

import java.util.Map;

public record PushNotificationEvent(
        String tenantId,
        String userId,
        String title,
        String body,
        Map<String, String> data
) {}

package com.chitfund.common.event;

import java.util.Map;

public record PushNotificationEvent(
        String userId,
        String title,
        String body,
        Map<String, String> data
) {}

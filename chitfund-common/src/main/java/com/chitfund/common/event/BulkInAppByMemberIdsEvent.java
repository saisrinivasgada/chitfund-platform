package com.chitfund.common.event;

import java.util.List;
import java.util.Map;

public record BulkInAppByMemberIdsEvent(
        List<String> memberIds,
        String type,
        String title,
        String message,
        Map<String, String> metadata,
        String link
) {}

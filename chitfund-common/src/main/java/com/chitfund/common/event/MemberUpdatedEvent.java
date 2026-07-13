package com.chitfund.common.event;

import java.time.Instant;

public record MemberUpdatedEvent(
        String memberId,
        String fieldChanged,
        String previousReferredById,
        String newReferredById,
        String previousReferredByName,
        String newReferredByName,
        String updatedBy,
        Instant occurredAt
) {}

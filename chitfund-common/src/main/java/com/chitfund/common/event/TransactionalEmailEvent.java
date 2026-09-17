package com.chitfund.common.event;

public record TransactionalEmailEvent(
        String toEmail,
        String subject,
        String htmlBody,
        String textBody
) {}

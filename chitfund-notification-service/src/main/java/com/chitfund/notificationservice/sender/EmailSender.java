package com.chitfund.notificationservice.sender;

public interface EmailSender {
    void send(String toEmail, String subject, String textBody, String htmlBody);
}

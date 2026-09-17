package com.chitfund.userservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.*;

@Service
@Slf4j
public class EmailService {

    private final SesClient sesClient;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    @Value("${app.otp.logging-enabled:false}")
    private boolean otpLoggingEnabled;

    public EmailService(@Value("${cloud.aws.region.static:us-east-2}") String region) {
        this.sesClient = SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    // ── Password reset OTP (admin accounts) ──────────────────────────────────

    public void sendPasswordResetOtp(String toEmail, String adminName, String otp) {
        if (!emailEnabled) {
            if (otpLoggingEnabled) log.warn("LOCAL password-reset OTP for {} → {}", maskEmail(toEmail), otp);
            else log.info("Password-reset OTP generated; email delivery disabled");
            return;
        }
        String name = adminName != null && !adminName.isBlank() ? adminName : "Admin";
        String subject = "Reset your ChitWise password";
        String html = passwordResetOtpHtml(name, otp);
        String text = """
                Hi %s,

                You requested a password reset for your ChitWise admin account.

                Your OTP is: %s

                It expires in 10 minutes. Do not share it with anyone.

                If you did not request this, contact help@thechitwise.com immediately.

                — The ChitWise Team
                """.formatted(name, otp);
        send(toEmail, subject, text, html);
    }

    // ── Email verification OTP (member registration) ──────────────────────────

    public void sendAccountVerificationOtp(String toEmail, String memberName, String otp) {
        if (!emailEnabled) {
            if (otpLoggingEnabled) log.warn("LOCAL verification OTP for {} → {}", maskEmail(toEmail), otp);
            else log.info("Verification OTP generated; email delivery disabled");
            return;
        }
        String name = memberName != null && !memberName.isBlank() ? memberName : "there";
        String subject = "Verify your ChitWise account";
        String html = verificationOtpHtml(name, otp);
        String text = """
                Hi %s,

                Your ChitWise email verification code is: %s

                It expires in 10 minutes. Do not share it with anyone.

                If you did not request this, ignore this email or contact help@thechitwise.com.

                — The ChitWise Team
                """.formatted(name, otp);
        send(toEmail, subject, text, html);
    }

    // ── Internal send ─────────────────────────────────────────────────────────

    private void send(String toEmail, String subject, String textBody, String htmlBody) {
        try {
            sesClient.sendEmail(SendEmailRequest.builder()
                    .source(fromAddress)
                    .destination(Destination.builder().toAddresses(toEmail).build())
                    .message(Message.builder()
                            .subject(Content.builder().data(subject).charset("UTF-8").build())
                            .body(Body.builder()
                                    .text(Content.builder().data(textBody).charset("UTF-8").build())
                                    .html(Content.builder().data(htmlBody).charset("UTF-8").build())
                                    .build())
                            .build())
                    .build());
            log.info("Email sent via SES to {}", maskEmail(toEmail));
        } catch (SesException e) {
            log.error("SES send failed to {}: {}", maskEmail(toEmail), e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to send email. Please try again.");
        }
    }

    // ── HTML templates ────────────────────────────────────────────────────────

    private static String passwordResetOtpHtml(String name, String otp) {
        return baseTemplate(
                "#DC2626", "&#128274;", "Password Reset",
                """
                <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  We received a request to reset the password for your ChitWise admin account.
                  Use the code below to continue. It expires in <strong>10 minutes</strong>.
                </p>
                <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
                  <p style="color:#991B1B;font-size:12px;font-weight:600;letter-spacing:1px;margin:0 0 10px;text-transform:uppercase;">Your one-time password</p>
                  <span style="font-size:40px;font-weight:700;letter-spacing:14px;color:#111827;font-family:'Courier New',Courier,monospace;">%s</span>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
                  &#9888;&#65039; <strong>Never share this code</strong> with anyone, including ChitWise support.
                </p>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  If you did not request a password reset, please contact
                  <a href="mailto:help@thechitwise.com" style="color:#DC2626;text-decoration:none;">help@thechitwise.com</a> immediately.
                </p>
                """.formatted(name, otp)
        );
    }

    private static String verificationOtpHtml(String name, String otp) {
        return baseTemplate(
                "#2563EB", "&#9989;", "Verify your email",
                """
                <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Thanks for signing up with ChitWise! Use the code below to verify your email address.
                  The code is valid for <strong>10 minutes</strong>.
                </p>
                <div style="background:#EFF6FF;border:2px solid #BFDBFE;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
                  <p style="color:#1E40AF;font-size:12px;font-weight:600;letter-spacing:1px;margin:0 0 10px;text-transform:uppercase;">Verification code</p>
                  <span style="font-size:40px;font-weight:700;letter-spacing:14px;color:#111827;font-family:'Courier New',Courier,monospace;">%s</span>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  If you didn't create a ChitWise account, you can safely ignore this email or reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#2563EB;text-decoration:none;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, otp)
        );
    }

    static String baseTemplate(String accentColor, String iconHtml, String title, String bodyContent) {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <meta http-equiv="X-UA-Compatible" content="IE=edge">
                </head>
                <body style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">
                  <table width="100%%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding:40px 16px;">
                        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%%;">

                          <!-- Header -->
                          <tr>
                            <td style="background:#0F172A;border-radius:14px 14px 0 0;padding:30px 36px;text-align:center;">
                              <table width="100%%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center">
                                    <div style="display:inline-block;background:rgba(255,255,255,0.08);border-radius:50%%;width:54px;height:54px;line-height:54px;text-align:center;font-size:26px;margin-bottom:12px;">%s</div><br>
                                    <span style="color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:-0.3px;">ChitWise</span><br>
                                    <span style="color:#94A3B8;font-size:13px;margin-top:4px;display:inline-block;">%s</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <!-- Accent bar -->
                          <tr>
                            <td style="height:4px;background:%s;"></td>
                          </tr>

                          <!-- Body -->
                          <tr>
                            <td style="background:#FFFFFF;padding:36px 36px 28px;">
                              %s
                            </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                            <td style="background:#F8FAFC;border-radius:0 0 14px 14px;padding:20px 36px;text-align:center;border-top:1px solid #E2E8F0;">
                              <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:0;">
                                &copy; 2025 ChitWise &nbsp;·&nbsp;
                                <a href="mailto:help@thechitwise.com" style="color:#94A3B8;text-decoration:none;">help@thechitwise.com</a>
                                &nbsp;·&nbsp; This email was sent by ChitWise Platform
                              </p>
                            </td>
                          </tr>

                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(iconHtml, title, accentColor, bodyContent);
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].substring(0, 1) + "***@" + parts[1];
    }
}

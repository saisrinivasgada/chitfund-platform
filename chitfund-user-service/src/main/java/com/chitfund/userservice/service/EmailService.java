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

    private static final String LOGO_URL = "https://thechitwise.com/logo.png";

    // Lock icon SVG for password reset
    private static final String ICON_LOCK =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M8 11V7a4 4 0 0 1 8 0v4\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\"/>" +
        "<circle cx=\"12\" cy=\"16\" r=\"1.5\" fill=\"#0F172A\"/>" +
        "</svg>";

    // Shield-check icon SVG for verification
    private static final String ICON_SHIELD =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<path d=\"M12 3L4 7v5c0 4.418 3.582 8.334 8 9 4.418-.666 8-4.582 8-9V7l-8-4z\" " +
        "fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M9 12l2 2 4-4\" stroke=\"#0F172A\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" +
        "</svg>";

    private static String passwordResetOtpHtml(String name, String otp) {
        String body = """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  We received a request to reset the password for your ChitWise admin account.
                  Use the code below to continue — it expires in <strong>10 minutes</strong>.
                </p>
                <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
                  <p style="color:#991B1B;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 12px;text-transform:uppercase;">One-Time Password</p>
                  <span style="display:block;white-space:nowrap;font-size:36px;font-weight:800;letter-spacing:12px;color:#111827;font-family:'Courier New',Courier,monospace;">%s</span>
                  <p style="color:#B91C1C;font-size:12px;margin:12px 0 0;">Expires in 10 minutes</p>
                </div>
                <div style="background:#FFF7ED;border-left:4px solid #F97316;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 20px;">
                  <p style="color:#9A3412;font-size:13px;margin:0;line-height:1.5;">
                    <strong>Never share this code</strong> with anyone — including ChitWise support staff.
                  </p>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  If you didn't request this, please contact
                  <a href="mailto:help@thechitwise.com" style="color:#DC2626;text-decoration:none;font-weight:600;">help@thechitwise.com</a> immediately.
                </p>
                """.formatted(name, otp);
        return baseTemplate(LOGO_URL, ICON_LOCK, "Password Reset", "#DC2626", body);
    }

    private static String verificationOtpHtml(String name, String otp) {
        String body = """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Thanks for joining ChitWise! Please use the code below to verify your email address.
                  The code is valid for <strong>10 minutes</strong>.
                </p>
                <div style="background:#EFF6FF;border:2px solid #BFDBFE;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
                  <p style="color:#1E40AF;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 12px;text-transform:uppercase;">Verification Code</p>
                  <span style="display:block;white-space:nowrap;font-size:36px;font-weight:800;letter-spacing:12px;color:#111827;font-family:'Courier New',Courier,monospace;">%s</span>
                  <p style="color:#1D4ED8;font-size:12px;margin:12px 0 0;">Expires in 10 minutes</p>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  If you didn't sign up for ChitWise, you can safely ignore this email or reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#2563EB;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, otp);
        return baseTemplate(LOGO_URL, ICON_SHIELD, "Email Verification", "#2563EB", body);
    }

    static String baseTemplate(String logoUrl, String iconSvg, String title, String accentColor, String bodyContent) {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <meta http-equiv="X-UA-Compatible" content="IE=edge">
                  <title>ChitWise</title>
                </head>
                <body style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">
                  <table width="100%%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                    <tr>
                      <td align="center" style="padding:40px 16px;">
                        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;width:100%%;">

                          <!-- Header -->
                          <tr>
                            <td style="background:#0F172A;border-radius:14px 14px 0 0;padding:28px 36px;">
                              <table width="100%%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                                <tr>
                                  <td valign="middle" width="52">
                                    <img src="%s" width="48" height="48" alt="ChitWise"
                                         style="display:block;border-radius:10px;border:0;outline:none;" />
                                  </td>
                                  <td valign="middle" style="padding-left:14px;">
                                    <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.3px;display:block;">ChitWise</span>
                                    <span style="color:#94A3B8;font-size:12px;display:block;margin-top:2px;">%s</span>
                                  </td>
                                  <td align="right" valign="middle">
                                    <div style="background:rgba(255,255,255,0.1);border-radius:50%%;width:46px;height:46px;line-height:46px;text-align:center;">
                                      %s
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <!-- Accent bar -->
                          <tr><td style="height:4px;background:%s;font-size:0;line-height:0;">&nbsp;</td></tr>

                          <!-- Body -->
                          <tr>
                            <td style="background:#FFFFFF;padding:36px 36px 32px;">
                              %s
                            </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                            <td style="background:#F8FAFC;border-radius:0 0 14px 14px;padding:20px 36px;text-align:center;border-top:1px solid #E2E8F0;">
                              <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:0 0 4px;">
                                &copy; 2025 ChitWise &nbsp;&middot;&nbsp;
                                <a href="mailto:help@thechitwise.com" style="color:#94A3B8;text-decoration:none;">help@thechitwise.com</a>
                              </p>
                              <p style="color:#CBD5E1;font-size:11px;margin:0;">
                                This is an automated message — please do not reply directly to this email.
                              </p>
                            </td>
                          </tr>

                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(logoUrl, title, iconSvg, accentColor, bodyContent);
    }

    // ── Registration confirmation (built here, delivered via notification-service) ─

    private static final String ICON_CHECKMARK =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M7 12l3 3 7-7\" stroke=\"#0F172A\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" +
        "</svg>";

    public static String buildRegistrationConfirmationHtml(String adminName, String orgName, String slug, String plan) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        String portalUrl = "https://" + slug + ".thechitwise.com";
        String bodyContent = """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Thank you for registering <strong>%s</strong> on ChitWise! Your application has been received and is now under review.
                </p>
                <div style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:12px;padding:24px;margin:24px 0;">
                  <table width="100%%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:6px 0;color:#6B7280;font-size:13px;width:130px;">Organization</td>
                      <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">%s</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#6B7280;font-size:13px;">Your portal</td>
                      <td style="padding:6px 0;font-size:13px;">
                        <a href="%s" style="color:#059669;font-weight:600;text-decoration:none;">%s</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#6B7280;font-size:13px;">Plan</td>
                      <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">%s</td>
                    </tr>
                  </table>
                </div>
                <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;"><strong>What happens next?</strong></p>
                <ol style="color:#4B5563;font-size:14px;line-height:2;margin:0 0 20px;padding-left:20px;">
                  <li>Our team reviews your registration — usually within 1 business day</li>
                  <li>You'll receive an activation email to set your password</li>
                  <li>Log in and start managing your chit fund immediately</li>
                </ol>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Questions? We're here at
                  <a href="mailto:help@thechitwise.com" style="color:#059669;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, orgName, orgName, portalUrl, portalUrl, plan);
        return baseTemplate(LOGO_URL, ICON_CHECKMARK, "Registration Received", "#059669", bodyContent);
    }

    public static String buildRegistrationConfirmationText(String adminName, String orgName, String slug, String plan) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        return """
                Hi %s,

                Thank you for registering %s on ChitWise! Your application is under review.

                Organization: %s
                Your portal: https://%s.thechitwise.com
                Plan: %s

                What happens next?
                1. Our team reviews your registration (usually within 1 business day)
                2. You'll receive an activation email to set your password
                3. Log in and start managing your chit fund

                Questions? Reach us at help@thechitwise.com.

                — The ChitWise Team
                """.formatted(name, orgName, orgName, slug, plan);
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].substring(0, 1) + "***@" + parts[1];
    }
}

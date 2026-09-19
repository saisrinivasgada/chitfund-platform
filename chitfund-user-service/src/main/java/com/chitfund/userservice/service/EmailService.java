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

    public EmailService(@Value("${spring.cloud.aws.region.static:us-east-2}") String region) {
        this.sesClient = SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    // ── Password reset OTP ────────────────────────────────────────────────────

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

    // ── Email verification OTP ────────────────────────────────────────────────

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

                If you did not sign up for ChitWise, ignore this email or contact help@thechitwise.com.

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

    // ── Layout helpers ────────────────────────────────────────────────────────

    private static final String LOGO_URL = "https://thechitwise.com/logo.png";

    // Header icons (28px, white on dark)
    private static final String ICON_LOCK =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M8 11V7a4 4 0 0 1 8 0v4\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\"/>" +
        "<circle cx=\"12\" cy=\"16\" r=\"1.5\" fill=\"#0F172A\"/>" +
        "</svg>";

    private static final String ICON_SHIELD =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<path d=\"M12 3L4 7v5c0 4.418 3.582 8.334 8 9 4.418-.666 8-4.582 8-9V7l-8-4z\" " +
        "fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M9 12l2 2 4-4\" stroke=\"#0F172A\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" +
        "</svg>";

    private static final String ICON_CHECKMARK =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M7 12l3 3 7-7\" stroke=\"#0F172A\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" +
        "</svg>";

    private static final String ICON_ROCKET =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<path d=\"M12 2C12 2 7 6 7 13h10c0-7-5-11-5-11z\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M9 13v5l3 2 3-2v-5\" fill=\"white\" fill-opacity=\"0.7\"/>" +
        "<circle cx=\"12\" cy=\"10\" r=\"1.5\" fill=\"#0F172A\"/>" +
        "</svg>";

    private static final String ICON_CROSS =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M8 8l8 8M16 8l-8 8\" stroke=\"#0F172A\" stroke-width=\"2\" stroke-linecap=\"round\"/>" +
        "</svg>";

    private static final String ICON_WARNING =
        "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<path d=\"M12 3L2 21h20L12 3z\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M12 10v4\" stroke=\"#0F172A\" stroke-width=\"2\" stroke-linecap=\"round\"/>" +
        "<circle cx=\"12\" cy=\"17\" r=\"1\" fill=\"#0F172A\"/>" +
        "</svg>";

    static String baseTemplate(String logoUrl, String iconSvg, String title,
                                String accentColor, String bodyContent) {
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
                        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
                               style="max-width:600px;width:100%%;">

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
                            <td style="background:#F8FAFC;border-radius:0 0 14px 14px;padding:20px 36px;
                                       text-align:center;border-top:1px solid #E2E8F0;">
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

    /**
     * Centered status hero block: coloured icon circle + bold heading + pill badge.
     * Prepend to every email body for a clear, scannable status at a glance.
     */
    private static String statusHero(String iconBg, String iconSvg40, String heading,
                                      String badgeBg, String badgeColor, String badgeText) {
        return """
                <table width="100%%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                  <tr><td align="center" style="padding:16px 0 20px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
                      <tr>
                        <td width="72" height="72" align="center" valign="middle"
                            style="background:%s;border-radius:36px;width:72px;height:72px;">
                          %s
                        </td>
                      </tr>
                    </table>
                    <div style="color:#111827;font-size:22px;font-weight:800;margin:0 0 12px;
                                letter-spacing:-0.3px;font-family:Arial,Helvetica,sans-serif;">%s</div>
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:%s;color:%s;font-size:11px;font-weight:800;
                                   letter-spacing:2px;text-transform:uppercase;
                                   padding:5px 18px;border-radius:100px;
                                   font-family:Arial,Helvetica,sans-serif;">%s</td>
                      </tr>
                    </table>
                  </td></tr>
                </table>
                <div style="height:1px;background:#F1F5F9;margin:0 0 28px;"></div>
                """.formatted(iconBg, iconSvg40, heading, badgeBg, badgeColor, badgeText);
    }

    // ── Password reset OTP ────────────────────────────────────────────────────

    private static String passwordResetOtpHtml(String name, String otp) {
        String hero = statusHero(
            "#FEF2F2",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\" fill=\"#DC2626\"/>" +
            "<path d=\"M8 11V7a4 4 0 0 1 8 0v4\" stroke=\"#DC2626\" stroke-width=\"2\" stroke-linecap=\"round\"/>" +
            "<circle cx=\"12\" cy=\"16\" r=\"1.5\" fill=\"white\"/></svg>",
            "Password Reset",
            "#FEE2E2", "#991B1B", "! Action Required"
        );
        String body = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  We received a request to reset the password for your ChitWise admin account.
                  Use the code below — it expires in <strong>10 minutes</strong>.
                </p>
                <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:12px;padding:28px;text-align:center;margin:0 0 20px;">
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
                  If you didn't request this, contact
                  <a href="mailto:help@thechitwise.com" style="color:#DC2626;text-decoration:none;font-weight:600;">help@thechitwise.com</a> immediately.
                </p>
                """.formatted(name, otp);
        return baseTemplate(LOGO_URL, ICON_LOCK, "Password Reset", "#DC2626", body);
    }

    // ── Email verification OTP ────────────────────────────────────────────────

    private static String verificationOtpHtml(String name, String otp) {
        String hero = statusHero(
            "#EFF6FF",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<path d=\"M12 3L4 7v5c0 4.418 3.582 8.334 8 9 4.418-.666 8-4.582 8-9V7l-8-4z\" fill=\"#2563EB\"/>" +
            "<path d=\"M9 12l2 2 4-4\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
            "Email Verification",
            "#DBEAFE", "#1E40AF", "&#10003; Verify Your Email"
        );
        String body = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Thanks for joining ChitWise! Use the code below to verify your email address.
                  It's valid for <strong>10 minutes</strong>.
                </p>
                <div style="background:#EFF6FF;border:2px solid #BFDBFE;border-radius:12px;padding:28px;text-align:center;margin:0 0 20px;">
                  <p style="color:#1E40AF;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 12px;text-transform:uppercase;">Verification Code</p>
                  <span style="display:block;white-space:nowrap;font-size:36px;font-weight:800;letter-spacing:12px;color:#111827;font-family:'Courier New',Courier,monospace;">%s</span>
                  <p style="color:#1D4ED8;font-size:12px;margin:12px 0 0;">Expires in 10 minutes</p>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Didn't sign up? Ignore this email or reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#2563EB;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, otp);
        return baseTemplate(LOGO_URL, ICON_SHIELD, "Email Verification", "#2563EB", body);
    }

    // ── Registration confirmation ─────────────────────────────────────────────

    public static String buildRegistrationConfirmationHtml(String adminName, String orgName, String slug, String plan) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        String portalUrl = "https://" + slug + ".thechitwise.com";
        String hero = statusHero(
            "#EFF6FF",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"#3B82F6\"/>" +
            "<path d=\"M12 7v5l3 3\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
            "Registration Received",
            "#DBEAFE", "#1D4ED8", "&#9679; Under Review"
        );
        String bodyContent = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Thank you for registering <strong>%s</strong> on ChitWise! Your application has been received and is now under review.
                </p>
                <div style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:12px;padding:24px;margin:0 0 20px;">
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
                <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;"><strong>What happens next?</strong></p>
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

    // ── App-access approved (member) ──────────────────────────────────────────

    public static String buildApprovalHtml(String memberName, String orgName) {
        String name = memberName != null && !memberName.isBlank() ? memberName : "there";
        String hero = statusHero(
            "#F0FDF4",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"#059669\"/>" +
            "<path d=\"M7 12l3 3 7-7\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
            "Access Approved",
            "#DCFCE7", "#15803D", "&#10003; Active"
        );
        String bodyContent = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Great news! <strong>%s</strong> has approved your ChitWise app-access request.
                  You can now log in and view your chit fund details.
                </p>
                <div style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px;">
                  <p style="color:#166534;font-size:13px;font-weight:700;letter-spacing:1px;margin:0 0 8px;text-transform:uppercase;">Access Active</p>
                  <p style="color:#15803D;font-size:15px;margin:0;">Your member profile is now connected to <strong>%s</strong>.</p>
                </div>
                <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">
                  Open the ChitWise app and log in to get started.
                </p>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Questions? Reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#059669;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, orgName, orgName);
        return baseTemplate(LOGO_URL, ICON_ROCKET, "Access Approved", "#059669", bodyContent);
    }

    public static String buildApprovalText(String memberName, String orgName) {
        String name = memberName != null && !memberName.isBlank() ? memberName : "there";
        return """
                Hi %s,

                Great news! %s has approved your ChitWise app-access request.
                Your member profile is now active. Open the ChitWise app and log in to get started.

                Questions? Reach us at help@thechitwise.com.

                — The ChitWise Team
                """.formatted(name, orgName);
    }

    // ── App-access revoked (member) ───────────────────────────────────────────

    public static String buildRevocationHtml(String memberName, String orgName) {
        String name = memberName != null && !memberName.isBlank() ? memberName : "there";
        String hero = statusHero(
            "#FEF2F2",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"#DC2626\"/>" +
            "<path d=\"M8 8l8 8M16 8l-8 8\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\"/></svg>",
            "Access Cancelled",
            "#FEE2E2", "#991B1B", "&#10007; Cancelled"
        );
        String bodyContent = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  <strong>%s</strong> has cancelled your ChitWise app-access request.
                </p>
                <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:12px;padding:24px;margin:0 0 20px;">
                  <p style="color:#991B1B;font-size:13px;font-weight:700;letter-spacing:1px;margin:0 0 8px;text-transform:uppercase;">Request Cancelled</p>
                  <p style="color:#B91C1C;font-size:14px;margin:0;">Your pending app-access request for <strong>%s</strong> has been cancelled.</p>
                </div>
                <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">
                  If you believe this was a mistake, please contact your organization administrator directly.
                </p>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Need help? Reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#DC2626;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, orgName, orgName);
        return baseTemplate(LOGO_URL, ICON_CROSS, "Request Cancelled", "#DC2626", bodyContent);
    }

    public static String buildRevocationText(String memberName, String orgName) {
        String name = memberName != null && !memberName.isBlank() ? memberName : "there";
        return """
                Hi %s,

                %s has cancelled your ChitWise app-access request.

                If you believe this was a mistake, please contact your organization administrator directly.
                Need help? Reach us at help@thechitwise.com.

                — The ChitWise Team
                """.formatted(name, orgName);
    }

    // ── Org approval / rejection / suspension ─────────────────────────────────

    public static String buildApprovalEmailHtml(String adminName, String orgName, String slug,
                                                String username, String tempPassword) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        String portalUrl = "https://" + slug + ".thechitwise.com";
        String hero = statusHero(
            "#F0FDF4",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"#059669\"/>" +
            "<path d=\"M7 12l3 3 7-7\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
            "Account Approved",
            "#DCFCE7", "#15803D", "&#10003; Active"
        );
        String credentialsBlock = tempPassword != null
                ? """
                  <div style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:12px;padding:24px;margin:0 0 20px;">
                    <p style="color:#166534;font-size:12px;font-weight:700;letter-spacing:1.5px;margin:0 0 14px;text-transform:uppercase;">Your login credentials</p>
                    <table width="100%%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:5px 0;color:#6B7280;font-size:13px;width:120px;">Username</td>
                        <td style="padding:5px 0;color:#111827;font-size:14px;font-weight:700;font-family:'Courier New',monospace;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:#6B7280;font-size:13px;">Temp password</td>
                        <td style="padding:5px 0;color:#111827;font-size:14px;font-weight:700;font-family:'Courier New',monospace;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:#6B7280;font-size:13px;">Your portal</td>
                        <td style="padding:5px 0;font-size:13px;">
                          <a href="%s" style="color:#059669;font-weight:600;text-decoration:none;">%s</a>
                        </td>
                      </tr>
                    </table>
                    <p style="color:#166534;font-size:12px;margin:14px 0 0;">You will be asked to set a new password on first login.</p>
                  </div>
                  """.formatted(username, tempPassword, portalUrl, portalUrl)
                : """
                  <div style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:12px;padding:24px;margin:0 0 20px;">
                    <table width="100%%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:5px 0;color:#6B7280;font-size:13px;width:120px;">Username</td>
                        <td style="padding:5px 0;color:#111827;font-size:14px;font-weight:700;font-family:'Courier New',monospace;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:#6B7280;font-size:13px;">Your portal</td>
                        <td style="padding:5px 0;font-size:13px;">
                          <a href="%s" style="color:#059669;font-weight:600;text-decoration:none;">%s</a>
                        </td>
                      </tr>
                    </table>
                  </div>
                  """.formatted(username, portalUrl, portalUrl);
        String bodyContent = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Great news! Your <strong>%s</strong> account on ChitWise has been approved and is now active.
                </p>
                %s
                <table cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
                  <tr>
                    <td style="border-radius:8px;background:#059669;">
                      <a href="%s" style="display:inline-block;padding:13px 28px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">
                        Log in to ChitWise &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Need help getting started? Reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#059669;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, orgName, credentialsBlock, portalUrl);
        return baseTemplate(LOGO_URL, ICON_ROCKET, "Account Approved", "#059669", bodyContent);
    }

    public static String buildApprovalEmailText(String adminName, String orgName, String slug,
                                                String username, String tempPassword) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        String credentials = tempPassword != null
                ? "Username: " + username + "\nTemporary password: " + tempPassword +
                  "\n(You will be asked to change your password on first login.)"
                : "Username: " + username;
        return """
                Hi %s,

                Great news! Your %s account on ChitWise has been approved and is now active.

                %s
                Portal: https://%s.thechitwise.com

                Click the link above to log in and get started.

                Questions? Reach us at help@thechitwise.com.

                — The ChitWise Team
                """.formatted(name, orgName, credentials, slug);
    }

    public static String buildRejectionEmailHtml(String adminName, String orgName) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        String hero = statusHero(
            "#FEF2F2",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<circle cx=\"12\" cy=\"12\" r=\"10\" fill=\"#DC2626\"/>" +
            "<path d=\"M8 8l8 8M16 8l-8 8\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\"/></svg>",
            "Registration Update",
            "#FEE2E2", "#991B1B", "&#10007; Not Approved"
        );
        String bodyContent = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Thank you for your interest in ChitWise. After reviewing your registration for
                  <strong>%s</strong>, we are unable to approve it at this time.
                </p>
                <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:12px;padding:20px 24px;margin:0 0 20px;">
                  <p style="color:#991B1B;font-size:14px;margin:0;line-height:1.6;">
                    If you believe this is an error or would like to discuss further,
                    please contact our team and we'll be happy to help.
                  </p>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Write to us at
                  <a href="mailto:help@thechitwise.com" style="color:#DC2626;text-decoration:none;font-weight:600;">help@thechitwise.com</a>
                  and mention your organization name so we can look up your application.
                </p>
                """.formatted(name, orgName);
        return baseTemplate(LOGO_URL, ICON_CROSS, "Registration Update", "#DC2626", bodyContent);
    }

    public static String buildRejectionEmailText(String adminName, String orgName) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        return """
                Hi %s,

                Thank you for your interest in ChitWise. After reviewing your registration for %s, we are unable to approve it at this time.

                If you believe this is an error or would like to discuss further, please write to help@thechitwise.com and mention your organization name.

                — The ChitWise Team
                """.formatted(name, orgName);
    }

    public static String buildSuspensionEmailHtml(String adminName, String orgName) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        String hero = statusHero(
            "#FEFCE8",
            "<svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<path d=\"M12 3L2 21h20L12 3z\" fill=\"#D97706\"/>" +
            "<path d=\"M12 10v4\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\"/>" +
            "<circle cx=\"12\" cy=\"17\" r=\"1\" fill=\"white\"/></svg>",
            "Account Suspended",
            "#FEF9C3", "#854D0E", "&#9888; Suspended"
        );
        String bodyContent = hero + """
                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Your ChitWise account for <strong>%s</strong> has been temporarily suspended.
                  Access to your portal and data is restricted until the suspension is lifted.
                </p>
                <div style="background:#FFFBEB;border:2px solid #FDE68A;border-radius:12px;padding:20px 24px;margin:0 0 20px;">
                  <p style="color:#92400E;font-size:14px;margin:0;line-height:1.6;">
                    If you have questions about this suspension or need to resolve the issue,
                    please contact our support team as soon as possible.
                  </p>
                </div>
                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Reach us at
                  <a href="mailto:help@thechitwise.com" style="color:#D97706;text-decoration:none;font-weight:600;">help@thechitwise.com</a>
                  — please include your organization name in your message.
                </p>
                """.formatted(name, orgName);
        return baseTemplate(LOGO_URL, ICON_WARNING, "Account Suspended", "#D97706", bodyContent);
    }

    public static String buildSuspensionEmailText(String adminName, String orgName) {
        String name = adminName != null && !adminName.isBlank() ? adminName : "there";
        return """
                Hi %s,

                Your ChitWise account for %s has been temporarily suspended. Access to your portal is restricted until the suspension is lifted.

                If you have questions or need to resolve this, please write to help@thechitwise.com with your organization name.

                — The ChitWise Team
                """.formatted(name, orgName);
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***";
        String[] parts = email.split("@", 2);
        return parts[0].substring(0, 1) + "***@" + parts[1];
    }
}

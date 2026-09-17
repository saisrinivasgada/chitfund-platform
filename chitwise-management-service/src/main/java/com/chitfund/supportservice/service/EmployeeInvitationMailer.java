package com.chitfund.supportservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.*;

@Service
@Slf4j
public class EmployeeInvitationMailer {

    private static final String LOGO_URL     = "https://thechitwise.com/logo.png";
    private static final String HUB_LOGO_URL = "https://thechitwise.com/hub-icon.png";

    // Envelope / mail icon for hub invite
    private static final String ICON_INVITE =
        "<svg width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" " +
        "xmlns=\"http://www.w3.org/2000/svg\" style=\"display:inline-block;vertical-align:middle;\">" +
        "<path d=\"M12 14l-8-5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3l-8 5z\" fill=\"white\" fill-opacity=\"0.9\"/>" +
        "<path d=\"M4 9l8 5 8-5M4 6h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\" " +
        "stroke=\"white\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/>" +
        "</svg>";

    private final SesClient sesClient;

    @Value("${app.hub-url}")
    private String hubUrl;

    @Value("${app.mail.from:ChitWise <help@thechitwise.com>}")
    private String fromAddress;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    public EmployeeInvitationMailer(@Value("${cloud.aws.region.static:us-east-2}") String region) {
        this.sesClient = SesClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    public void sendInvitation(String email, String fullName, String rawToken) {
        String base = hubUrl.endsWith("/") ? hubUrl.substring(0, hubUrl.length() - 1) : hubUrl;
        String setupUrl = base + "/hub/accept-invite?token=" + rawToken;
        String name = fullName != null && !fullName.isBlank() ? fullName : "there";

        if (!emailEnabled) {
            log.warn("Hub invite email disabled — accept-invite URL for {}: {}", email, setupUrl);
            return;
        }

        String subject = "You're invited to ChitWise Hub";
        String text = """
                Hi %s,

                You have been invited to join ChitWise Hub as an employee.

                Set up your account here:
                %s

                This link expires in 7 days and can only be used once.

                If you weren't expecting this invitation, you can safely ignore this email.

                — The ChitWise Team
                """.formatted(name, setupUrl);

        String html = hubInviteHtml(name, setupUrl);

        try {
            sesClient.sendEmail(SendEmailRequest.builder()
                    .source(fromAddress)
                    .destination(Destination.builder().toAddresses(email).build())
                    .message(Message.builder()
                            .subject(Content.builder().data(subject).charset("UTF-8").build())
                            .body(Body.builder()
                                    .text(Content.builder().data(text).charset("UTF-8").build())
                                    .html(Content.builder().data(html).charset("UTF-8").build())
                                    .build())
                            .build())
                    .build());
            log.info("Hub invite email sent to {}", email);
        } catch (SesException e) {
            log.error("SES send failed for Hub invite to {}: {}", email, e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to send invitation email. Please try again.");
        }
    }

    private static String hubInviteHtml(String name, String setupUrl) {
        String body = """
                <!-- Hub logo -->
                <div style="text-align:center;margin-bottom:24px;">
                  <img src="%s" width="72" height="72" alt="ChitWise Hub"
                       style="display:inline-block;border-radius:16px;border:0;outline:none;" />
                </div>

                <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Welcome to the team! You've been invited to join <strong>ChitWise Hub</strong>.
                  Click the button below to set up your username and password and activate your account.
                </p>

                <!-- CTA button -->
                <table width="100%%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:28px 0;">
                  <tr>
                    <td align="center">
                      <a href="%s"
                         style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:15px 40px;border-radius:8px;letter-spacing:0.2px;">
                        Activate my account &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0 0 6px;">
                  Or copy this link into your browser:
                </p>
                <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px 14px;font-size:12px;font-family:'Courier New',Courier,monospace;color:#475569;word-break:break-all;margin:0 0 20px;">
                  %s
                </p>

                <div style="background:#F0FDF4;border-left:4px solid #22C55E;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 20px;">
                  <p style="color:#15803D;font-size:13px;margin:0;line-height:1.5;">
                    This link expires in <strong>7 days</strong> and can only be used once.
                  </p>
                </div>

                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  Weren't expecting this? Ignore this email or contact
                  <a href="mailto:help@thechitwise.com" style="color:#0F172A;text-decoration:none;font-weight:600;">help@thechitwise.com</a>.
                </p>
                """.formatted(HUB_LOGO_URL, name, setupUrl, setupUrl);

        return baseTemplate(LOGO_URL, ICON_INVITE, "Hub Invitation", "#0EA5E9", body);
    }

    static String baseTemplate(String logoUrl, String iconSvg, String title, String accentColor, String bodyContent) {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <meta http-equiv="X-UA-Compatible" content="IE=edge">
                  <title>ChitWise Hub</title>
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
                                &copy; 2025 ChitWise Hub &nbsp;&middot;&nbsp;
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
}

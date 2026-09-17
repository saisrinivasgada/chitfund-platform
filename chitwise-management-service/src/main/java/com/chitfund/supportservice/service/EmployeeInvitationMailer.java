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
        String baseUrl = hubUrl.endsWith("/") ? hubUrl.substring(0, hubUrl.length() - 1) : hubUrl;
        String setupUrl = baseUrl + "/hub/accept-invite?token=" + rawToken;
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
        String bodyContent = """
                <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
                  Hi <strong>%s</strong>,<br><br>
                  Welcome to the team! You've been invited to join <strong>ChitWise Hub</strong> as an employee.
                  Click the button below to set up your username and password and activate your account.
                </p>

                <!-- CTA button -->
                <table width="100%%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                  <tr>
                    <td align="center">
                      <a href="%s"
                         style="display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                        Activate your account &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
                  Or copy this link into your browser:
                </p>
                <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px 14px;font-size:12px;font-family:'Courier New',Courier,monospace;color:#475569;word-break:break-all;margin:0 0 20px;">
                  %s
                </p>

                <p style="color:#6B7280;font-size:13px;line-height:1.6;margin:0;">
                  &#8987; This link expires in <strong>7 days</strong> and can only be used once.
                  If you weren't expecting this invitation, you can safely ignore this email or contact
                  <a href="mailto:help@thechitwise.com" style="color:#0F172A;text-decoration:none;">help@thechitwise.com</a>.
                </p>
                """.formatted(name, setupUrl, setupUrl);

        return baseTemplate("&#127970;", "Hub Invitation", "#0EA5E9", bodyContent);
    }

    static String baseTemplate(String iconHtml, String title, String accentColor, String bodyContent) {
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
                                &copy; 2025 ChitWise Hub &nbsp;·&nbsp;
                                <a href="mailto:help@thechitwise.com" style="color:#94A3B8;text-decoration:none;">help@thechitwise.com</a>
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
}

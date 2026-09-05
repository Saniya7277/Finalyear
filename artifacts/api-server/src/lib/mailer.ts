import nodemailer from "nodemailer";
import { logger } from "./logger";

type Transporter = ReturnType<typeof nodemailer.createTransport>;

/**
 * Outbound email for teammate invitations.
 *
 * Configured entirely through SMTP environment variables so any provider works
 * (Gmail app password, Brevo, Mailgun, Postmark, a college SMTP relay...):
 *
 *   SMTP_HOST      smtp.gmail.com
 *   SMTP_PORT      587
 *   SMTP_SECURE    "true" for port 465, otherwise leave unset
 *   SMTP_USER      the account that authenticates
 *   SMTP_PASS      app password / API key
 *   MAIL_FROM      "SecureSphere <no-reply@yourdomain.com>" (defaults to SMTP_USER)
 *
 * When these are absent the invitation still gets created and its link is
 * returned to the app - only the email delivery is skipped, and the caller is
 * told so it can show "copy the link instead".
 */

export interface SendResult {
  sent: boolean;
  error?: string;
}

export interface InvitationEmailInput {
  to: string;
  inviterName: string;
  inviterEmail: string;
  invitationLink: string;
  expiresAt: Date;
}

let cachedTransporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function getTransporter(): Transporter | null {
  if (!isMailConfigured()) {
    return null;
  }
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS on 465; STARTTLS upgrade on 587.
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string,
    },
  });

  return cachedTransporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(input: InvitationEmailInput): string {
  const inviter = escapeHtml(input.inviterName);
  const inviterEmail = escapeHtml(input.inviterEmail);
  const link = escapeHtml(input.invitationLink);
  const expires = input.expiresAt.toUTCString();

  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#050B18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#0D1B2A;border:1px solid #1A3050;border-radius:16px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 4px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#00D4FF;">SecureSphere</p>
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#E8F4FD;">${inviter} invited you to collaborate</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#A8C4DC;">
            ${inviter} (${inviterEmail}) wants to share encrypted files with you on SecureSphere,
            a privacy-preserving collaboration vault. Accept the invitation to become their teammate.
          </p>
          <p style="margin:0 0 28px;">
            <a href="${link}" style="display:inline-block;padding:14px 28px;background:#00D4FF;color:#050B18;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Accept invitation</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#7A9BB5;">Or paste this link into the app:</p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;color:#00D4FF;">${link}</p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #1A3050;font-size:12px;line-height:1.6;color:#7A9BB5;">
            This invitation expires on ${expires}. It only works for ${escapeHtml(input.to)} —
            if you weren't expecting it, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(input: InvitationEmailInput): string {
  return [
    `${input.inviterName} invited you to collaborate on SecureSphere.`,
    "",
    `${input.inviterName} (${input.inviterEmail}) wants to share encrypted files with you.`,
    "",
    "Accept the invitation:",
    input.invitationLink,
    "",
    `This invitation expires on ${input.expiresAt.toUTCString()} and only works for ${input.to}.`,
    "If you weren't expecting it, you can safely ignore this email.",
  ].join("\n");
}

export async function sendInvitationEmail(
  input: InvitationEmailInput,
): Promise<SendResult> {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      sent: false,
      error:
        "Email delivery is not configured on the server (set SMTP_HOST, SMTP_USER and SMTP_PASS).",
    };
  }

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: input.to,
      subject: `${input.inviterName} invited you to SecureSphere`,
      text: buildText(input),
      html: buildHtml(input),
    });

    return { sent: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to send invitation email");
    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while sending the invitation email.",
    };
  }
}

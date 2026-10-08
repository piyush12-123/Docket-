/**
 * emailService — sends transactional emails for expiry alerts using Nodemailer.
 *
 * Requirements: 11.3
 */
import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    if (process.env.SMTP_HOST) {
      _transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Fallback log transporter for development/testing
      _transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }
  return _transporter;
}

/**
 * Send an expiry alert email for a document.
 *
 * @param {string} to - Recipient email address
 * @param {object} document - Document object
 * @param {number} daysLeft - Number of days remaining before expiry
 */
export async function sendExpiryAlert(to, document, daysLeft) {
  const transporter = getTransporter();

  const urgencyLabel =
    daysLeft <= 1 ? 'Expires Tomorrow!' : daysLeft <= 7 ? 'Expires in 7 Days!' : 'Expires in 30 Days';

  const subject = `[Docket Alert] ${urgencyLabel}: ${document.title}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; rounded: 8px; padding: 24px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Docket Expiry Reminder</h2>
      <p style="color: #475569; font-size: 16px;">
        Your document <strong>"${document.title}"</strong> is expiring soon.
      </p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 4px 0; color: #334155;"><strong>Document Type:</strong> ${document.documentType}</p>
        <p style="margin: 4px 0; color: #334155;"><strong>Issuer:</strong> ${document.issuer || 'N/A'}</p>
        <p style="margin: 4px 0; color: #dc2626; font-size: 18px;"><strong>Expiry Date:</strong> ${document.expiryDate ? new Date(document.expiryDate).toISOString().split('T')[0] : 'N/A'} (${daysLeft} days remaining)</p>
      </div>

      <p style="color: #64748b; font-size: 14px;">
        Log into your Docket vault to view or update your document information.
      </p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Docket Alerts" <alerts@docket.app>',
      to,
      subject,
      html,
    });
    return info;
  } catch (err) {
    console.error(`emailService: failed to send email to ${to}:`, err);
    throw err;
  }
}

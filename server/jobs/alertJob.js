/**
 * alertJob — daily cron job that checks document expiry dates and sends
 * proactive notifications and emails at 30-day, 7-day, and 1-day thresholds.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
import cron from 'node-cron';
import Document from '../models/Document.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import * as emailService from '../services/emailService.js';

/**
 * Execute the document expiry alert check.
 */
export async function alertJob() {
  console.log('alertJob: starting daily document expiry check...');
  const now = new Date();
  // Threshold: up to 30 days in the future
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  try {
    // Query documents in ready state with an expiryDate <= thirtyDaysFromNow (Req 11.2)
    const documents = await Document.find({
      status: 'ready',
      expiryDate: { $ne: null, $lte: thirtyDaysFromNow },
    });

    for (const doc of documents) {
      try {
        if (!doc.expiryDate) continue;

        const expiry = new Date(doc.expiryDate);
        const diffMs = expiry.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) continue; // Expired already

        // Determine applicable threshold tag (Req 11.2)
        let threshold = null;
        if (daysLeft <= 1) {
          threshold = '1day';
        } else if (daysLeft <= 7) {
          threshold = '7day';
        } else if (daysLeft <= 30) {
          threshold = '30day';
        }

        if (!threshold) continue;

        // Skip if this threshold alert has already been sent for this document (Req 11.4)
        if (doc.alertsSent && doc.alertsSent.includes(threshold)) {
          continue;
        }

        // Fetch user for email address
        const user = await User.findById(doc.userId).lean();
        if (!user) continue;

        const expiryDateStr = expiry.toISOString().split('T')[0];
        const daysText = daysLeft === 1 ? '1 day' : `${daysLeft} days`;
        const message = `Document "${doc.title}" expires in ${daysText} (${expiryDateStr}).`;

        // 1. Create in-app Notification (Req 11.2)
        await new Notification({
          userId: doc.userId,
          documentId: doc._id,
          message,
          type: 'expiry_alert',
          read: false,
        }).save();

        // 2. Send email alert (Req 11.3)
        try {
          await emailService.sendExpiryAlert(user.email, doc, daysLeft);
        } catch (emailErr) {
          console.error(`alertJob: failed to send email to ${user.email}:`, emailErr);
          // Email failure does not prevent notification or updating alertsSent
        }

        // 3. Mark threshold as sent on Document (Req 11.4)
        if (!doc.alertsSent) doc.alertsSent = [];
        doc.alertsSent.push(threshold);
        await doc.save();

        console.log(`alertJob: sent ${threshold} alert for document "${doc.title}" (${doc._id})`);
      } catch (docErr) {
        // Individual document processing failure does not stop processing other documents (Req 11.5)
        console.error(`alertJob: error processing document ${doc._id}:`, docErr);
      }
    }
  } catch (err) {
    console.error('alertJob: fatal error running expiry check:', err);
  }
}

/**
 * Register the cron job schedule (runs daily at 08:00 UTC) (Req 11.1)
 */
export function startAlertCron() {
  // Schedule daily at 08:00 UTC
  cron.schedule('0 8 * * *', alertJob, { timezone: 'UTC' });
  console.log('alertJob: cron schedule initialized (0 8 * * * UTC)');
}

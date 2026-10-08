/**
 * notificationsController — handles listing and marking notifications.
 *
 * Requirements: 12.1, 12.2, 12.3, 15.3
 */
import Notification from '../models/Notification.js';

/**
 * GET /api/notifications — list authenticated user's notifications.
 *
 * Query params:
 *   - unreadOnly: 'true' | 'false' (optional)
 */
export async function list(req, res) {
  try {
    const filter = { userId: req.userId };
    if (req.query.unreadOnly === 'true') {
      filter.read = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(notifications);
  } catch (err) {
    console.error('notifications.list error:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
}

/**
 * PATCH /api/notifications/:id/read — mark single notification as read.
 */
export async function markRead(req, res) {
  try {
    const notif = await Notification.findById(req.params.id);

    if (!notif || String(notif.userId) !== String(req.userId)) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    notif.read = true;
    await notif.save();

    return res.status(200).json(notif);
  } catch (err) {
    console.error('notifications.markRead error:', err);
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
}

/**
 * PATCH /api/notifications/mark-all-read — mark all user notifications as read.
 */
export async function markAllRead(req, res) {
  try {
    const result = await Notification.updateMany(
      { userId: req.userId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({ count: result.modifiedCount || 0 });
  } catch (err) {
    console.error('notifications.markAllRead error:', err);
    return res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
}

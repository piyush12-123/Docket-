/**
 * dashboardController — aggregated stats for the user dashboard.
 *
 * Requirements: 13.1, 13.6, 15.1
 */
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';

/**
 * GET /api/dashboard/stats — aggregate user statistics.
 */
export async function getStats(req, res) {
  try {
    const userId = req.userId;
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Parallel aggregate queries for performance
    const [
      totalCount,
      statusGroup,
      expiringCount,
      unreadNotificationCount,
      typeGroup,
      recentDocuments,
    ] = await Promise.all([
      // Total documents owned by user
      Document.countDocuments({ userId }),

      // Status breakdown
      Document.aggregate([
        { $match: { userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Documents expiring within 30 days
      Document.countDocuments({
        userId,
        status: 'ready',
        expiryDate: { $ne: null, $gte: now, $lte: thirtyDaysFromNow },
      }),

      // Unread notifications count
      Notification.countDocuments({ userId, read: false }),

      // Type breakdown
      Document.aggregate([
        { $match: { userId } },
        { $group: { _id: '$documentType', count: { $sum: 1 } } },
      ]),

      // 5 most recent documents (sorted by updatedAt desc, then createdAt desc)
      Document.find({ userId })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // Format statusCounts map
    const statusCounts = {
      ready: 0,
      processing: 0,
      failed: 0,
    };
    for (const item of statusGroup) {
      if (item._id in statusCounts) {
        statusCounts[item._id] = item.count;
      }
    }

    // Format typeCounts map
    const typeCounts = {
      id: 0,
      certificate: 0,
      contract: 0,
      invoice: 0,
      insurance: 0,
      warranty: 0,
      other: 0,
    };
    for (const item of typeGroup) {
      if (item._id && item._id in typeCounts) {
        typeCounts[item._id] = item.count;
      }
    }

    return res.status(200).json({
      totalCount,
      statusCounts,
      expiringCount,
      unreadNotificationCount,
      typeCounts,
      recentDocuments,
    });
  } catch (err) {
    console.error('dashboard.getStats error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard statistics.' });
  }
}

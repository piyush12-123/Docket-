/**
 * Notification routes — mounted at /api/notifications in server/index.js
 *
 * GET   /              — list user's notifications (auth required)
 * PATCH /mark-all-read — mark all unread as read (auth required)
 * PATCH /:id/read      — mark a single notification as read (auth required)
 *
 * Requirements: 12.1, 12.2, 12.3
 */
import { Router } from 'express';
import { list, markRead, markAllRead } from '../controllers/notificationsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// GET /api/notifications — list notifications
router.get('/', authMiddleware, list);

// PATCH /api/notifications/mark-all-read — mark all as read
// NOTE: must be declared BEFORE /:id/read
router.patch('/mark-all-read', authMiddleware, markAllRead);

// PATCH /api/notifications/:id/read — mark single notification as read
router.patch('/:id/read', authMiddleware, markRead);

export default router;

/**
 * Dashboard routes — mounted at /api/dashboard in server/index.js
 *
 * GET /stats — aggregate statistics (auth required)
 *
 * Requirements: 13.6
 */
import { Router } from 'express';
import { getStats } from '../controllers/dashboardController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/stats', authMiddleware, getStats);

export default router;

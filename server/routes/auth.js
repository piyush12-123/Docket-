/**
 * Auth routes — mounted at /api/auth in server/index.js
 *
 * POST /register — create a new user account
 * POST /login    — authenticate and receive a JWT
 * GET  /me       — return the authenticated user's profile (protected)
 *
 * Requirements: 1.1, 2.1, 2.3
 */
import { Router } from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes — require a valid Bearer JWT
router.get('/me', authMiddleware, getMe);

export default router;

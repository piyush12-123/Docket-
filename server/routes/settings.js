/**
 * Settings routes — mounted at /api/settings in server/index.js
 *
 * PATCH  /profile — update profile (name, email)
 * PATCH  /password — change password
 * DELETE /account — delete account and all data
 *
 * Requirements: 14.1, 14.2, 14.3, 14.6
 */
import { Router } from 'express';
import { updateProfile, updatePassword, deleteAccount } from '../controllers/settingsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.patch('/profile', authMiddleware, updateProfile);
router.patch('/password', authMiddleware, updatePassword);
router.delete('/account', authMiddleware, deleteAccount);

export default router;

/**
 * settingsController — profile update, password change, and account deletion.
 *
 * Requirements: 14.2, 14.3, 14.6, 15.1
 */
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';
import QueryLog from '../models/QueryLog.js';
import * as cloudinaryService from '../services/cloudinaryService.js';

/** Helper to extract public_id from Cloudinary URL */
function extractPublicId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const match = url.match(/\/v\d+\/(.+?)\.[a-zA-Z0-9]+$/);
    if (match) return match[1];
  } catch {
    // ignore
  }
  return null;
}

/**
 * PATCH /api/settings/profile — update name and email.
 */
export async function updateProfile(req, res) {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (name && typeof name === 'string' && name.trim()) {
      user.name = name.trim();
    }

    if (email && typeof email === 'string' && email.trim()) {
      const lowerEmail = email.trim().toLowerCase();
      if (lowerEmail !== user.email) {
        const existing = await User.findOne({ email: lowerEmail });
        if (existing) {
          return res.status(409).json({ error: 'Email address is already in use.' });
        }
        user.email = lowerEmail;
      }
    }

    await user.save();
    return res.status(200).json({
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('settings.updateProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
}

/**
 * PATCH /api/settings/password — update password.
 */
export async function updatePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    const salt = await bcrypt.genSalt(12);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('settings.updatePassword error:', err);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
}

/**
 * DELETE /api/settings/account — delete account and all associated user data.
 */
export async function deleteAccount(req, res) {
  try {
    const userId = req.userId;

    // Fetch user documents to clean up Cloudinary storage
    const userDocs = await Document.find({ userId }).select('fileUrl').lean();
    for (const doc of userDocs) {
      const publicId = extractPublicId(doc.fileUrl);
      if (publicId) {
        cloudinaryService.deleteFile(publicId).catch((err) => {
          console.error('Account deletion: failed Cloudinary cleanup for', publicId, err);
        });
      }
    }

    // Delete all user data across collections
    await Promise.all([
      Document.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      QueryLog.deleteMany({ userId }),
      User.deleteOne({ _id: userId }),
    ]);

    return res.status(200).json({ message: 'Account and all data deleted successfully.' });
  } catch (err) {
    console.error('settings.deleteAccount error:', err);
    return res.status(500).json({ error: 'Failed to delete account.' });
  }
}

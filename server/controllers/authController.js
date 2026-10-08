/**
 * Auth Controller — register, login, getMe
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult, body } from 'express-validator';
import User from '../models/User.js';

// ---------------------------------------------------------------------------
// Validation rule sets
// ---------------------------------------------------------------------------

export const registerValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be 100 characters or fewer'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

export const loginValidators = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('A valid email address is required'),

  body('password').notEmpty().withMessage('Password is required'),
];

// ---------------------------------------------------------------------------
// Helper — sign JWT
// ---------------------------------------------------------------------------

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

export async function register(req, res) {
  // 1. Validate inputs
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }

  const { name, password } = req.body;
  // normalizeEmail() already lowercased the email; fall back to manual lower just in case
  const email = req.body.email.toLowerCase();

  try {
    // 2. Hash password — cost factor 12 (Req 1.4)
    const passwordHash = await bcrypt.hash(password, 12);

    // 3. Persist user — pre('save') hook also lowercases email (Req 1.5)
    const user = await new User({ name: name.trim(), email, passwordHash }).save();

    // 4. Sign JWT valid for 7 days (Req 1.1)
    const token = signToken(user._id.toString());

    return res.status(201).json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    // Duplicate email — MongoDB error code 11000 (Req 1.2)
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

export async function login(req, res) {
  // Validate inputs — surface 400 for obviously malformed requests
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Generic 401 even on validation failure to avoid leaking info (Req 2.2)
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const email = req.body.email.toLowerCase().trim();
  const { password } = req.body;

  // Look up user by lowercased email (Req 2.1)
  const user = await User.findOne({ email });

  // Use a constant-time compare even when no user found to prevent timing attacks.
  // When the user doesn't exist we still run bcrypt.compare against a dummy hash
  // so the response time is consistent regardless of whether the email is registered.
  const DUMMY_HASH = '$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const hashToCompare = user ? user.passwordHash : DUMMY_HASH;

  const passwordMatches = await bcrypt.compare(password, hashToCompare);

  // Generic error — do NOT reveal whether the email or password was wrong (Req 2.2)
  if (!user || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Sign JWT valid for 7 days (Req 2.1)
  const token = signToken(user._id.toString());

  return res.status(200).json({ token, user: { name: user.name, email: user.email } });
}

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected — authMiddleware sets req.userId)
// ---------------------------------------------------------------------------

export async function getMe(req, res) {
  const user = await User.findById(req.userId).select('name email').lean();

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ name: user.name, email: user.email });
}

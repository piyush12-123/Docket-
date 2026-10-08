import jwt from 'jsonwebtoken';

/**
 * authMiddleware — verifies a Bearer JWT from the Authorization header.
 *
 * On success: attaches `req.userId` from the decoded payload and calls `next()`.
 * On any failure (missing header, malformed token, expired token, invalid signature):
 *   returns HTTP 401 JSON without calling `next()` and without revealing whether
 *   the requested resource exists (Req 15.4).
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Must be present and start with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    // Catches expired, malformed, and invalid-signature errors
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function verifyRequestToken(req) {
  if (req.user?.user_id) return req.user;
  const token = readToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const payload = verifyRequestToken(req);
  if (!payload) return res.status(401).json({ error: 'Authentication required' });
  req.user = payload;
  next();
}

function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles.flat().map(String));
  return async function roleMiddleware(req, res, next) {
    const payload = verifyRequestToken(req);
    if (!payload) return res.status(401).json({ error: 'Authentication required' });
    try {
      const result = await pool.query(
        'SELECT role, is_verified FROM users WHERE user_id=$1',
        [payload.user_id]
      );
      const account = result.rows[0];
      if (!account) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
      if (!account.is_verified) return res.status(403).json({ error: 'Hisob tasdiqlanmagan' });
      if (!allowed.has(account.role)) {
        return res.status(403).json({ error: 'Bu amal uchun ruxsat yetarli emas', required_roles: [...allowed] });
      }
      req.user = { ...payload, role: account.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}

const requireAdmin = requireRole('admin');

module.exports = { requireAuth, requireRole, requireAdmin };

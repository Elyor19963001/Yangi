const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const ALLOWED_ROLES = new Set(['user','operator','researcher','admin']);

router.get('/', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.role, u.is_verified, u.registration_date,
            d.name AS district_name
       FROM users u
       LEFT JOIN districts d ON d.district_id=u.district_id
      ORDER BY CASE u.role WHEN 'admin' THEN 1 WHEN 'operator' THEN 2 WHEN 'researcher' THEN 3 ELSE 4 END,
               u.registration_date ASC
      LIMIT 500`
  );
  res.json(result.rows);
}));

router.patch('/:userId/role', asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const newRole = String(req.body.role || '').trim();
  if (!Number.isInteger(userId) || userId <= 0 || !ALLOWED_ROLES.has(newRole)) {
    return res.status(400).json({ error: 'Foydalanuvchi yoki rol noto‘g‘ri' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query('SELECT user_id, role FROM users WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!target.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }
    const oldRole = target.rows[0].role;
    if (oldRole === 'admin' && newRole !== 'admin') {
      const admins = await client.query("SELECT COUNT(*)::int AS n FROM users WHERE role='admin'");
      if (admins.rows[0].n <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Tizimda kamida bitta administrator qolishi kerak' });
      }
    }

    const updated = await client.query(
      'UPDATE users SET role=$1, updated_at=NOW() WHERE user_id=$2 RETURNING user_id, full_name, role',
      [newRole, userId]
    );
    if (oldRole !== newRole) {
      await client.query(
        `INSERT INTO user_role_audit (user_id, old_role, new_role, changed_by, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, oldRole, newRole, req.user.user_id, String(req.body.reason || 'Admin panel orqali rol o‘zgartirildi').slice(0,300)]
      );
    }
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;

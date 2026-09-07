const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity, logActivity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

router.get('/', activity('view', 'marketplace'), asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT l.listing_id, l.seller_id, l.title, l.description, l.price, l.quantity,
            l.unit, l.image_url, l.status, l.created_at, u.full_name AS seller_name,
            u.district_id
       FROM listings l JOIN users u ON u.user_id = l.seller_id
      WHERE l.status = 'active'
      ORDER BY l.created_at DESC LIMIT 200`
  );
  res.json(result.rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, description, price, quantity, unit, image_url } = req.body;
  if (!title || price == null) return res.status(400).json({ error: 'title va price majburiy' });
  const result = await pool.query(
    `INSERT INTO listings (seller_id, title, description, price, quantity, unit, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.user_id, title, description || null, price, quantity || null, unit || null, image_url || null]
  );
  if (req.user.consent_analytics) {
    await logActivity({ userId: req.user.user_id, studyId: req.user.study_id, actionType: 'create', feature: 'listing' });
  }
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE listings SET title=COALESCE($1,title), description=COALESCE($2,description),
      price=COALESCE($3,price), quantity=COALESCE($4,quantity), unit=COALESCE($5,unit),
      image_url=COALESCE($6,image_url), updated_at=NOW()
      WHERE listing_id=$7 AND seller_id=$8 RETURNING *`,
    [req.body.title, req.body.description, req.body.price, req.body.quantity, req.body.unit, req.body.image_url, req.params.id, req.user.user_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'E’lon topilmadi' });
  res.json(result.rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE listings SET status='deleted', updated_at=NOW()
      WHERE listing_id=$1 AND seller_id=$2 RETURNING listing_id`,
    [req.params.id, req.user.user_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'E’lon topilmadi' });
  res.json({ ok: true });
}));

module.exports = router;

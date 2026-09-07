const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

router.get('/', activity('view', 'prices'), asyncHandler(async (req, res) => {
  const { district_id, product_id, market_id, date } = req.query;
  const values = [];
  const where = [];
  const add = (condition, value) => { values.push(value); where.push(condition.replace('?', `$${values.length}`)); };
  if (district_id) add('p.district_id = ?', district_id);
  if (product_id) add('p.product_id = ?', product_id);
  if (market_id) add('p.market_id = ?', market_id);
  if (date) add('p.price_date = ?', date);

  const sql = `SELECT p.price_id, pr.name AS product, m.name AS market,
                      p.district_id, p.price, p.unit, p.price_date, p.source
                 FROM prices p
                 JOIN products pr ON pr.product_id = p.product_id
                 JOIN markets m ON m.market_id = p.market_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY p.price_date DESC, pr.name, m.name LIMIT 500`;
  const result = await pool.query(sql, values);
  res.json(result.rows);
}));

router.get('/:product_id', activity('view_product', 'prices'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT p.price_id, pr.name AS product, m.name AS market, p.district_id,
            p.price, p.unit, p.price_date, p.source
       FROM prices p
       JOIN products pr ON pr.product_id = p.product_id
       JOIN markets m ON m.market_id = p.market_id
      WHERE p.product_id = $1
      ORDER BY p.price_date DESC LIMIT 200`,
    [req.params.product_id]
  );
  res.json(result.rows);
}));

module.exports = router;

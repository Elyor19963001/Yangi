const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/districts', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT district_id, name
       FROM districts
      ORDER BY district_id`
  );
  res.json(result.rows);
}));

router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    app: 'Qishloq Raqamli Platformasi',
    version: '0.2.0',
    pilot_mode: String(process.env.DEV_MODE).toLowerCase() === 'true',
  });
});

module.exports = router;

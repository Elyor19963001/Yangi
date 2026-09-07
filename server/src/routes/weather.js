const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

router.get('/:district_id', activity('view', 'weather'), asyncHandler(async (req, res) => {
  const district = await pool.query(
    'SELECT district_id, name, latitude, longitude FROM districts WHERE district_id=$1',
    [req.params.district_id]
  );
  if (!district.rowCount) return res.status(404).json({ error: 'Tuman topilmadi' });
  const d = district.rows[0];

  if (!process.env.OPENWEATHER_API_KEY || d.latitude == null || d.longitude == null) {
    return res.json({
      mode: 'demo',
      district: d.name,
      message: 'OPENWEATHER_API_KEY va tuman koordinatalari kiritilgach real 5 kunlik prognoz ishlaydi.',
      forecast: [],
    });
  }

  const response = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
    params: {
      lat: d.latitude,
      lon: d.longitude,
      appid: process.env.OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'uz',
    },
    timeout: 7000,
  });
  res.json({ mode: 'live', district: d.name, forecast: response.data.list });
}));

module.exports = router;

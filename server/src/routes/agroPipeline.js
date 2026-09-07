const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeGeometry(input) {
  if (!input || typeof input !== 'object') return null;
  const geometry = input.type === 'Feature' ? input.geometry : input;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return null;
  return geometry;
}

function isAdmin(req) {
  return Boolean(process.env.ADMIN_KEY) && req.get('x-admin-key') === process.env.ADMIN_KEY;
}

async function workerRequest(method, path, data) {
  const base = String(process.env.AGRO_WORKER_URL || '').replace(/\/$/, '');
  if (!base) {
    const error = new Error('Agro ML worker hali Railway’da ulanmagan');
    error.statusCode = 503;
    throw error;
  }
  const response = await axios({
    method,
    url: `${base}${path}`,
    data,
    headers: process.env.AGRO_WORKER_TOKEN ? { 'x-worker-token': process.env.AGRO_WORKER_TOKEN } : {},
    timeout: 180000,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    const error = new Error(response.data?.detail || response.data?.error || `Agro worker HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return response.data;
}

router.get('/health', activity('view', 'agro_ml_worker'), asyncHandler(async (_req, res) => {
  try {
    const worker = await workerRequest('get', '/health');
    res.json({ configured: true, worker });
  } catch (error) {
    res.status(error.statusCode || 502).json({ configured: Boolean(process.env.AGRO_WORKER_URL), error: error.message });
  }
}));

router.get('/readiness', activity('view', 'agro_ml_readiness'), asyncHandler(async (req, res) => {
  const districtId = int(req.query.district_id);
  const season = text(req.query.season, 20);
  if (!districtId || !season) return res.status(400).json({ error: 'district_id va season kerak' });
  try {
    res.json(await workerRequest('get', `/pipeline/readiness?district_id=${districtId}&season=${encodeURIComponent(season)}`));
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message });
  }
}));

router.post('/samples', activity('submit', 'agro_ground_truth_v2'), asyncHandler(async (req, res) => {
  const districtId = int(req.body.district_id);
  const cropName = text(req.body.crop_name, 100);
  const season = text(req.body.season || String(new Date().getFullYear()), 20);
  const geometry = normalizeGeometry(req.body.geometry_geojson || req.body.geometry);
  const observedAt = text(req.body.observed_at, 10) || null;
  const notes = text(req.body.notes, 700) || null;
  if (!districtId || !cropName || !geometry) return res.status(400).json({ error: 'district_id, crop_name va Polygon/MultiPolygon GeoJSON kerak' });
  const district = await pool.query('SELECT 1 FROM districts WHERE district_id=$1', [districtId]);
  if (!district.rows[0]) return res.status(400).json({ error: 'Tuman topilmadi' });

  const result = await pool.query(
    `INSERT INTO agro_field_samples
      (submitted_by, district_id, crop_name, season, geometry_geojson, observed_at, notes, verification_status, feature_status)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'pending','pending')
     RETURNING sample_id, district_id, crop_name, season, observed_at, verification_status, feature_status, created_at`,
    [req.user.user_id, districtId, cropName, season, JSON.stringify(geometry), observedAt, notes]
  );
  res.status(201).json({ ...result.rows[0], message: 'Dala namunasi tekshiruvga yuborildi. Modelga faqat verified namuna kiradi.' });
}));

router.get('/samples', asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin ruxsati kerak' });
  const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const districtId = int(req.query.district_id);
  const season = text(req.query.season, 20);
  const result = await pool.query(
    `SELECT s.sample_id, s.district_id, d.name AS district_name, s.crop_name, s.season,
            s.geometry_geojson, s.observed_at, s.notes, s.verification_status,
            s.feature_status, s.feature_updated_at, s.created_at
       FROM agro_field_samples s
       LEFT JOIN districts d ON d.district_id=s.district_id
      WHERE ($1::text IS NULL OR s.verification_status=$1)
        AND ($2::int IS NULL OR s.district_id=$2)
        AND ($3::text='' OR s.season=$3)
      ORDER BY s.created_at DESC
      LIMIT 1000`,
    [status, districtId, season]
  );
  res.json(result.rows);
}));

router.patch('/admin/samples/:sampleId', asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin ruxsati kerak' });
  const sampleId = int(req.params.sampleId);
  const status = ['verified', 'rejected', 'pending'].includes(req.body.verification_status) ? req.body.verification_status : null;
  const season = text(req.body.season, 20) || null;
  if (!sampleId || !status) return res.status(400).json({ error: 'sampleId va verification_status kerak' });
  const result = await pool.query(
    `UPDATE agro_field_samples
        SET verification_status=$1,
            season=COALESCE($2, season),
            feature_status=CASE WHEN $1='verified' THEN 'pending' ELSE feature_status END,
            feature_json=CASE WHEN $1='verified' THEN NULL ELSE feature_json END,
            feature_updated_at=CASE WHEN $1='verified' THEN NULL ELSE feature_updated_at END
      WHERE sample_id=$3
      RETURNING sample_id, crop_name, season, verification_status, feature_status`,
    [status, season, sampleId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Sample topilmadi' });
  res.json(result.rows[0]);
}));

router.post('/admin/extract-sample/:sampleId', asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin ruxsati kerak' });
  const sampleId = int(req.params.sampleId);
  if (!sampleId) return res.status(400).json({ error: 'Noto‘g‘ri sample id' });
  try {
    res.json(await workerRequest('post', `/pipeline/extract-sample/${sampleId}`, {}));
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message });
  }
}));

router.post('/admin/train', asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin ruxsati kerak' });
  const districtId = int(req.body.district_id);
  const season = text(req.body.season, 20);
  if (!districtId || !season) return res.status(400).json({ error: 'district_id va season kerak' });
  try {
    res.json(await workerRequest('post', '/pipeline/train', {
      district_id: districtId,
      season,
      min_samples_per_class: Number(req.body.min_samples_per_class) || 3,
    }));
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message });
  }
}));

router.get('/runs', activity('view', 'agro_model_runs'), asyncHandler(async (req, res) => {
  const districtId = int(req.query.district_id);
  const season = text(req.query.season, 20);
  const result = await pool.query(
    `SELECT run_id, district_id, season, model_name, model_version, status, metrics,
            training_samples, classes, worker_version, error_message, started_at, completed_at, created_at
       FROM agro_model_runs
      WHERE ($1::int IS NULL OR district_id=$1)
        AND ($2::text='' OR season=$2)
      ORDER BY run_id DESC LIMIT 100`,
    [districtId, season]
  );
  res.json(result.rows);
}));

module.exports = router;

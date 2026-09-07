const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

const CDSE_STAC = 'https://stac.dataspace.copernicus.eu/v1';
const ALLOWED_GEOMETRIES = new Set(['Polygon', 'MultiPolygon']);

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeGeometry(input) {
  if (!input || typeof input !== 'object') return null;
  const geometry = input.type === 'Feature' ? input.geometry : input;
  if (!geometry || !ALLOWED_GEOMETRIES.has(geometry.type) || !Array.isArray(geometry.coordinates)) return null;
  return geometry;
}

function isAdmin(req) {
  return Boolean(process.env.ADMIN_KEY) && req.get('x-admin-key') === process.env.ADMIN_KEY;
}

async function resolveDistrict(districtId) {
  const result = await pool.query(
    'SELECT district_id, name, latitude, longitude FROM districts WHERE district_id=$1',
    [districtId]
  );
  if (!result.rows[0]) return null;
  const district = result.rows[0];
  let latitude = num(district.latitude);
  let longitude = num(district.longitude);
  if (validCoord(latitude, longitude)) return { ...district, latitude, longitude };

  const baseName = String(district.name).replace(/\s+tumani$/i, '').trim();
  const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: { name: `${baseName}, Samarqand`, count: 10, language: 'uz', countryCode: 'UZ' },
    timeout: 7000,
  });
  const candidates = response.data?.results || [];
  const selected = candidates.find((item) => /samarqand|samarkand/i.test([item.admin1, item.admin2, item.admin3].filter(Boolean).join(' '))) || candidates[0];
  if (!selected) return { ...district, latitude: null, longitude: null };
  latitude = Number(selected.latitude);
  longitude = Number(selected.longitude);
  if (!validCoord(latitude, longitude)) return { ...district, latitude: null, longitude: null };
  await pool.query('UPDATE districts SET latitude=$1, longitude=$2 WHERE district_id=$3', [latitude, longitude, districtId]);
  return { ...district, latitude, longitude };
}

router.get('/status', activity('view', 'agro_intelligence'), asyncHandler(async (_req, res) => {
  const counts = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM agro_fields WHERE verification_status='published') AS published_fields,
      (SELECT COUNT(*)::int FROM agro_field_samples WHERE verification_status='verified') AS verified_samples,
      (SELECT COUNT(*)::int FROM agro_model_runs WHERE status='completed') AS completed_runs`
  );
  res.json({
    version: '0.7.0',
    published_fields: counts.rows[0].published_fields,
    verified_samples: counts.rows[0].verified_samples,
    completed_runs: counts.rows[0].completed_runs,
    sources: [
      { id: 'sentinel-2-l2a', name: 'Copernicus Sentinel-2 Level-2A', role: 'current satellite observations', live_catalog: true },
      { id: 'worldcereal', name: 'ESA WorldCereal', role: 'crop/cropland reference and processing system', official_global_year: 2021 },
    ],
    warning: 'Ekin turi faqat model natijasi yoki dalada tasdiqlangan reference ma’lumot mavjud bo‘lsa ko‘rsatiladi. Sentinel sahna metama’lumoti o‘zi ekin turini isbotlamaydi.',
  });
}));

router.get('/scenes', activity('view', 'satellite_catalog'), asyncHandler(async (req, res) => {
  const districtId = int(req.query.district_id);
  if (!districtId) return res.status(400).json({ error: 'district_id kerak' });
  const district = await resolveDistrict(districtId);
  if (!district) return res.status(404).json({ error: 'Tuman topilmadi' });
  if (!validCoord(district.latitude, district.longitude)) return res.status(422).json({ error: 'Tuman koordinatasi aniqlanmadi' });

  const days = clamp(Number(req.query.days) || 45, 7, 180);
  const cloud = clamp(Number(req.query.cloud) || 30, 0, 100);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const latPad = 0.22;
  const lonPad = 0.28;
  const bbox = [district.longitude - lonPad, district.latitude - latPad, district.longitude + lonPad, district.latitude + latPad];

  try {
    const response = await axios.post(`${CDSE_STAC}/search`, {
      collections: ['sentinel-2-l2a'],
      bbox,
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      query: { 'eo:cloud_cover': { lt: cloud } },
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      limit: 12,
      fields: { include: ['id','bbox','properties.datetime','properties.eo:cloud_cover','properties.platform','properties.constellation','properties.s2:product_uri','links'] },
    }, { timeout: 12000 });

    const features = response.data?.features || [];
    res.json({
      district: { district_id: district.district_id, name: district.name, latitude: district.latitude, longitude: district.longitude },
      search_bbox: bbox,
      approximate_aoi: true,
      note: 'Hozirgi katalog qidiruvi tuman markazi atrofidagi taxminiy bbox bo‘yicha. Rasmiy tuman chegaralari keyingi geospatial bosqichda ulanadi.',
      provider: 'Copernicus Data Space Ecosystem STAC',
      collection: 'sentinel-2-l2a',
      scenes: features.map((item) => ({
        id: item.id,
        datetime: item.properties?.datetime || null,
        cloud_cover: item.properties?.['eo:cloud_cover'] ?? null,
        platform: item.properties?.platform || item.properties?.constellation || 'Sentinel-2',
        bbox: item.bbox || null,
        product_uri: item.properties?.['s2:product_uri'] || null,
        stac_self: item.links?.find((link) => link.rel === 'self')?.href || null,
      })),
    });
  } catch (error) {
    const status = error.response?.status;
    console.warn('CDSE STAC error:', status || error.message);
    res.status(502).json({ error: 'Copernicus Sentinel katalogidan ma’lumot olib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' });
  }
}));

router.get('/fields', activity('view', 'crop_map'), asyncHandler(async (req, res) => {
  const districtId = int(req.query.district_id);
  const season = text(req.query.season || String(new Date().getFullYear()), 20);
  const crop = text(req.query.crop, 100);
  const params = [districtId, season, crop];
  const result = await pool.query(
    `SELECT f.field_id, f.district_id, d.name AS district_name, f.crop_name, f.season, f.geometry_geojson,
            f.centroid_latitude, f.centroid_longitude, f.area_ha, f.confidence, f.ndvi, f.growth_stage,
            f.harvest_start, f.harvest_end, f.source_type, f.source_ref, f.observed_at
       FROM agro_fields f
       LEFT JOIN districts d ON d.district_id=f.district_id
      WHERE f.verification_status='published'
        AND ($1::int IS NULL OR f.district_id=$1)
        AND ($2::text='' OR f.season=$2)
        AND ($3::text='' OR f.crop_name ILIKE '%' || $3 || '%')
      ORDER BY f.area_ha DESC NULLS LAST, f.field_id DESC
      LIMIT 3000`,
    params
  );
  res.json({
    type: 'FeatureCollection',
    features: result.rows.map((row) => ({
      type: 'Feature',
      id: row.field_id,
      geometry: row.geometry_geojson,
      properties: {
        district_id: row.district_id,
        district_name: row.district_name,
        crop_name: row.crop_name,
        season: row.season,
        area_ha: row.area_ha == null ? null : Number(row.area_ha),
        confidence: row.confidence == null ? null : Number(row.confidence),
        ndvi: row.ndvi == null ? null : Number(row.ndvi),
        growth_stage: row.growth_stage,
        harvest_start: row.harvest_start,
        harvest_end: row.harvest_end,
        source_type: row.source_type,
        source_ref: row.source_ref,
        observed_at: row.observed_at,
      },
    })),
  });
}));

router.get('/summary', activity('view', 'crop_summary'), asyncHandler(async (req, res) => {
  const districtId = int(req.query.district_id);
  const season = text(req.query.season || String(new Date().getFullYear()), 20);
  const result = await pool.query(
    `SELECT f.crop_name,
            COUNT(*)::int AS field_count,
            ROUND(COALESCE(SUM(f.area_ha),0)::numeric,2) AS area_ha,
            ROUND(AVG(f.confidence)::numeric,3) AS avg_confidence,
            ROUND(AVG(f.ndvi)::numeric,3) AS avg_ndvi,
            MIN(f.harvest_start) AS harvest_start,
            MAX(f.harvest_end) AS harvest_end
       FROM agro_fields f
      WHERE f.verification_status='published'
        AND ($1::int IS NULL OR f.district_id=$1)
        AND f.season=$2
      GROUP BY f.crop_name
      ORDER BY SUM(f.area_ha) DESC NULLS LAST, f.crop_name`,
    [districtId, season]
  );

  const price = await pool.query(
    `SELECT p.name AS crop_name,
            ROUND(AVG(pr.price)::numeric,0) AS avg_price,
            MAX(pr.price_date) AS price_date,
            BOOL_OR(COALESCE(pr.source,'') ILIKE '%DEMO%') AS has_demo_source
       FROM products p
       LEFT JOIN prices pr ON pr.product_id=p.product_id AND ($1::int IS NULL OR pr.district_id=$1)
      GROUP BY p.name`,
    [districtId]
  );
  const priceMap = new Map(price.rows.map((row) => [String(row.crop_name).toLocaleLowerCase('uz-UZ'), row]));

  res.json({
    season,
    district_id: districtId,
    rows: result.rows.map((row) => {
      const p = priceMap.get(String(row.crop_name).toLocaleLowerCase('uz-UZ'));
      return {
        crop_name: row.crop_name,
        field_count: row.field_count,
        area_ha: Number(row.area_ha || 0),
        avg_confidence: row.avg_confidence == null ? null : Number(row.avg_confidence),
        avg_ndvi: row.avg_ndvi == null ? null : Number(row.avg_ndvi),
        harvest_start: row.harvest_start,
        harvest_end: row.harvest_end,
        avg_market_price: p?.avg_price == null ? null : Number(p.avg_price),
        market_price_date: p?.price_date || null,
        market_price_is_demo: Boolean(p?.has_demo_source),
      };
    }),
  });
}));

router.post('/samples', activity('submit', 'agro_ground_truth'), asyncHandler(async (req, res) => {
  const districtId = int(req.body.district_id);
  const cropName = text(req.body.crop_name, 100);
  const geometry = normalizeGeometry(req.body.geometry_geojson);
  const observedAt = text(req.body.observed_at, 10) || null;
  const notes = text(req.body.notes, 700) || null;
  if (!cropName || !geometry) return res.status(400).json({ error: 'crop_name va Polygon/MultiPolygon GeoJSON kerak' });
  if (districtId) {
    const d = await pool.query('SELECT 1 FROM districts WHERE district_id=$1', [districtId]);
    if (!d.rows[0]) return res.status(400).json({ error: 'Tuman topilmadi' });
  }
  const result = await pool.query(
    `INSERT INTO agro_field_samples (submitted_by, district_id, crop_name, geometry_geojson, observed_at, notes)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     RETURNING sample_id, verification_status, created_at`,
    [req.user.user_id, districtId, cropName, JSON.stringify(geometry), observedAt, notes]
  );
  res.status(201).json({ ...result.rows[0], message: 'Reference dala namunasi tekshiruvga yuborildi.' });
}));

router.post('/admin/import-fields', asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin ruxsati kerak' });
  const rows = Array.isArray(req.body.fields) ? req.body.fields.slice(0, 5000) : [];
  if (!rows.length) return res.status(400).json({ error: 'fields massivi kerak' });
  const client = await pool.connect();
  let imported = 0;
  try {
    await client.query('BEGIN');
    for (const item of rows) {
      const geometry = normalizeGeometry(item.geometry_geojson || item.geometry);
      const cropName = text(item.crop_name, 100);
      const season = text(item.season, 20);
      if (!geometry || !cropName || !season) continue;
      const districtId = int(item.district_id);
      const confidence = num(item.confidence);
      const ndvi = num(item.ndvi);
      await client.query(
        `INSERT INTO agro_fields
          (district_id,crop_name,season,geometry_geojson,centroid_latitude,centroid_longitude,area_ha,confidence,ndvi,growth_stage,harvest_start,harvest_end,source_type,source_ref,verification_status,observed_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          districtId, cropName, season, JSON.stringify(geometry), num(item.centroid_latitude), num(item.centroid_longitude), num(item.area_ha),
          confidence == null ? null : clamp(confidence, 0, 1), ndvi == null ? null : clamp(ndvi, -1, 1), text(item.growth_stage, 60) || null,
          item.harvest_start || null, item.harvest_end || null,
          ['satellite_model','worldcereal','operator','ground_truth'].includes(item.source_type) ? item.source_type : 'satellite_model',
          text(item.source_ref, 900) || null,
          item.verification_status === 'published' ? 'published' : 'pending',
          item.observed_at || null,
        ]
      );
      imported += 1;
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, imported });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;

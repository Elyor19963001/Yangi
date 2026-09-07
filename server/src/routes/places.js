const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = {
  market: { label: 'Bozorlar', emoji: '🛒', queries: ['["amenity"="marketplace"]'] },
  restaurant: { label: 'Oshxona va restoranlar', emoji: '🍽️', queries: ['["amenity"~"restaurant|cafe|fast_food|food_court"]'] },
  cafe: { label: 'Kafe', emoji: '☕', queries: ['["amenity"="cafe"]'] },
  pharmacy: { label: 'Dorixonalar', emoji: '💊', queries: ['["amenity"="pharmacy"]'] },
  hospital: { label: 'Tibbiyot', emoji: '🏥', queries: ['["amenity"~"hospital|clinic|doctors"]'] },
  taxi: { label: 'Taksi', emoji: '🚕', queries: ['["amenity"="taxi"]'] },
  atm: { label: 'Bankomatlar', emoji: '🏧', queries: ['["amenity"="atm"]'] },
  bank: { label: 'Banklar', emoji: '🏦', queries: ['["amenity"="bank"]'] },
  fuel: { label: 'AYOQSH', emoji: '⛽', queries: ['["amenity"="fuel"]'] },
  government: { label: 'Davlat xizmatlari', emoji: '🏛️', queries: ['["office"="government"]', '["amenity"="townhall"]'] },
  agro: { label: 'Agro xizmatlar', emoji: '🌾', queries: ['["shop"~"agrarian|farm|garden_centre"]'] },
  hotel: { label: 'Mehmonxona', emoji: '🏨', queries: ['["tourism"~"hotel|guest_house|hostel"]'] },
  repair: { label: 'Ta’mirlash', emoji: '🔧', queries: ['["shop"="car_repair"]'] },
  veterinary: { label: 'Veterinariya', emoji: '🐄', queries: ['["amenity"="veterinary"]'] },
};

const cache = new Map();
const CACHE_MS = 15 * 60 * 1000;

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => v * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatAddress(tags = {}) {
  const parts = [tags['addr:street'], tags['addr:housenumber'], tags['addr:suburb'], tags['addr:city']].filter(Boolean);
  return parts.join(', ') || tags['addr:full'] || null;
}

function osmName(tags, category) {
  return tags.name || tags['name:uz'] || tags['name:ru'] || tags.operator || CATEGORIES[category]?.label || 'Nomsiz joy';
}

router.get('/categories', (_req, res) => {
  res.json(Object.entries(CATEGORIES).map(([key, value]) => ({ key, label: value.label, emoji: value.emoji })));
});

router.get('/nearby', asyncHandler(async (req, res) => {
  const lat = number(req.query.lat);
  const lon = number(req.query.lon);
  const radius = Math.min(30000, Math.max(200, number(req.query.radius) || 5000));
  const category = CATEGORIES[req.query.category] ? req.query.category : null;
  if (!validCoord(lat, lon)) return res.status(400).json({ error: 'To‘g‘ri lat/lon koordinata kerak' });

  const result = await pool.query(
    `SELECT * FROM (
       SELECT p.place_id, p.category, p.name, p.latitude, p.longitude, p.address, p.phone,
              p.opening_hours, p.description, p.source_type, p.source_ref, p.verification_status,
              d.name AS district_name,
              6371000 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(p.latitude))
              ))) AS distance_m
         FROM service_places p
         LEFT JOIN districts d ON d.district_id=p.district_id
        WHERE p.verification_status='verified'
          AND ($3::text IS NULL OR p.category=$3)
     ) x
     WHERE x.distance_m <= $4
     ORDER BY x.distance_m ASC
     LIMIT 150`,
    [lat, lon, category, radius]
  );
  res.json(result.rows);
}));

router.get('/discover', asyncHandler(async (req, res) => {
  const lat = number(req.query.lat);
  const lon = number(req.query.lon);
  const radius = Math.min(10000, Math.max(300, number(req.query.radius) || 5000));
  const category = CATEGORIES[req.query.category] ? req.query.category : 'market';
  if (!validCoord(lat, lon)) return res.status(400).json({ error: 'To‘g‘ri lat/lon koordinata kerak' });

  const roundedLat = lat.toFixed(3);
  const roundedLon = lon.toFixed(3);
  const key = `${category}:${roundedLat}:${roundedLon}:${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return res.json({ source: 'OpenStreetMap', cached: true, places: cached.places });

  const queryParts = CATEGORIES[category].queries.flatMap((filter) => [
    `node(around:${radius},${lat},${lon})${filter};`,
    `way(around:${radius},${lat},${lon})${filter};`,
    `relation(around:${radius},${lat},${lon})${filter};`,
  ]).join('\n');

  const query = `[out:json][timeout:20];(\n${queryParts}\n);out center tags;`;
  const response = await axios.post(
    'https://overpass-api.de/api/interpreter',
    new URLSearchParams({ data: query }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'QishloqRaqamliPlatformasi/0.6 (+https://phd-api-production-d2e5.up.railway.app)',
      },
      timeout: 22000,
      maxContentLength: 4 * 1024 * 1024,
    }
  );

  const places = (response.data?.elements || []).map((el) => {
    const pLat = number(el.lat ?? el.center?.lat);
    const pLon = number(el.lon ?? el.center?.lon);
    if (!validCoord(pLat, pLon)) return null;
    const tags = el.tags || {};
    return {
      osm_type: el.type,
      osm_id: el.id,
      category,
      name: osmName(tags, category),
      latitude: pLat,
      longitude: pLon,
      address: formatAddress(tags),
      phone: tags.phone || tags['contact:phone'] || null,
      opening_hours: tags.opening_hours || null,
      website: tags.website || tags['contact:website'] || null,
      distance_m: Math.round(haversine(lat, lon, pLat, pLon)),
      source_type: 'osm',
      verification_status: 'external',
    };
  }).filter(Boolean).sort((a, b) => a.distance_m - b.distance_m).slice(0, 100);

  cache.set(key, { at: Date.now(), places });
  res.json({ source: 'OpenStreetMap', cached: false, places });
}));

router.post('/suggest', asyncHandler(async (req, res) => {
  const category = CATEGORIES[req.body.category] ? req.body.category : null;
  const name = clampText(req.body.name, 180);
  const lat = number(req.body.latitude);
  const lon = number(req.body.longitude);
  const districtId = Number.isInteger(Number(req.body.district_id)) ? Number(req.body.district_id) : null;
  if (!category) return res.status(400).json({ error: 'Xizmat kategoriyasi noto‘g‘ri' });
  if (name.length < 2) return res.status(400).json({ error: 'Joy nomini kiriting' });
  if (!validCoord(lat, lon)) return res.status(400).json({ error: 'Joylashuv koordinatasi noto‘g‘ri' });

  const result = await pool.query(
    `INSERT INTO service_places
      (category, name, district_id, latitude, longitude, address, phone, opening_hours, description, source_type, submitted_by, verification_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'user',$10,'pending')
     RETURNING place_id, category, name, latitude, longitude, verification_status, created_at`,
    [
      category,
      name,
      districtId,
      lat,
      lon,
      clampText(req.body.address, 350) || null,
      clampText(req.body.phone, 60) || null,
      clampText(req.body.opening_hours, 180) || null,
      clampText(req.body.description, 700) || null,
      req.user.user_id,
    ]
  );
  res.status(201).json({ ...result.rows[0], message: 'Taklif operator tekshiruvi uchun yuborildi.' });
}));

module.exports = router;

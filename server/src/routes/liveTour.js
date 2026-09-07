const express = require('express');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const OSRM_URL = 'https://router.project-osrm.org';
const SAMARKAND = { latitude: 39.6542, longitude: 66.9597 };

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validCoord(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => v * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function normalizePoint(raw = {}, fallbackName = 'Nuqta') {
  const latitude = num(raw.latitude);
  const longitude = num(raw.longitude);
  if (!validCoord(latitude, longitude)) return null;
  return {
    latitude,
    longitude,
    name: String(raw.name || fallbackName).trim().slice(0, 120),
  };
}

function fallbackRoute(start, stops, walking) {
  const coordinates = [[start.longitude, start.latitude], ...stops.map((p) => [p.longitude, p.latitude])];
  let distance = 0;
  let previous = start;
  for (const stop of stops) {
    distance += haversine(previous.latitude, previous.longitude, stop.latitude, stop.longitude);
    previous = stop;
  }
  const speedKmh = walking ? 4.5 : 25;
  return {
    geometry: { type: 'LineString', coordinates },
    distance_m: Math.round(distance),
    duration_min: Math.max(1, Math.round((distance / 1000) / speedKmh * 60)),
    source: 'geodesic-fallback',
    profile: walking ? 'walking-estimate' : 'vehicle-estimate',
  };
}

router.get('/status', (_req, res) => {
  res.json({
    version: '1.3.0',
    live_gps: true,
    tracking_storage: 'none',
    rerouting: 'OSRM driving with geodesic fallback',
    arrival_radius_m: 80,
    deviation_threshold_m: 120,
    note: 'GPS coordinates are used for the current browser navigation session and are not stored by this endpoint.',
  });
});

router.post('/route', asyncHandler(async (req, res) => {
  const current = normalizePoint(req.body.current, 'Joriy joylashuv');
  if (!current) return res.status(400).json({ error: 'Joriy GPS koordinatasi noto‘g‘ri.' });

  if (haversine(current.latitude, current.longitude, SAMARKAND.latitude, SAMARKAND.longitude) > 60000) {
    return res.status(400).json({ error: 'Live Tour hozir Samarqand hududi uchun cheklangan.' });
  }

  const rawStops = Array.isArray(req.body.stops) ? req.body.stops.slice(0, 10) : [];
  const stops = rawStops.map((row, i) => normalizePoint(row, `${i + 1}-nuqta`)).filter(Boolean);
  if (!stops.length) return res.status(400).json({ error: 'Qolgan marshrut nuqtalari kerak.' });

  const walking = req.body.transport === 'walking';
  let route = null;

  if (!walking) {
    const points = [current, ...stops];
    const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
    try {
      const response = await axios.get(`${OSRM_URL}/route/v1/driving/${coords}`, {
        params: { overview: 'full', geometries: 'geojson', steps: false },
        timeout: 9000,
      });
      const candidate = response.data?.routes?.[0];
      if (candidate) {
        route = {
          geometry: candidate.geometry,
          distance_m: Math.round(candidate.distance),
          duration_min: Math.max(1, Math.round(candidate.duration / 60)),
          source: 'OSRM',
          profile: 'driving',
        };
      }
    } catch (error) {
      console.warn('Live tour OSRM fallback:', error.response?.status || error.message);
    }
  }

  if (!route) route = fallbackRoute(current, stops, walking);

  res.json({
    version: '1.3.0',
    current,
    next_stop: stops[0],
    route,
    privacy: { stored: false, purpose: 'current-session navigation only' },
  });
}));

module.exports = router;

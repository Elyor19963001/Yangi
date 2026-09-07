const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { activity } = require('../middleware/activity');

const router = express.Router();
router.use(requireAuth);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function weatherLabel(code) {
  const map = {
    0: 'Ochiq', 1: 'Asosan ochiq', 2: 'Qisman bulutli', 3: 'Bulutli',
    45: 'Tuman', 48: 'Qirovli tuman', 51: 'Yengil mayda yomg‘ir', 53: 'Mayda yomg‘ir', 55: 'Kuchli mayda yomg‘ir',
    61: 'Yengil yomg‘ir', 63: 'Yomg‘ir', 65: 'Kuchli yomg‘ir', 71: 'Yengil qor', 73: 'Qor', 75: 'Kuchli qor',
    80: 'Yengil jala', 81: 'Jala', 82: 'Kuchli jala', 95: 'Momaqaldiroq', 96: 'Momaqaldiroq va do‘l', 99: 'Kuchli momaqaldiroq va do‘l',
  };
  return map[code] || 'Ob-havo';
}

function agroAdvice(payload) {
  const advice = [];
  const currentWind = Number(payload.current?.wind_speed_10m || 0);
  const maxRain = Math.max(...(payload.daily?.precipitation_probability_max || [0]).map(Number));
  const maxTemp = Math.max(...(payload.daily?.temperature_2m_max || [0]).map(Number));
  const minTemp = Math.min(...(payload.daily?.temperature_2m_min || [99]).map(Number));

  if (currentWind >= 30) advice.push('Shamol kuchli: purkash va yengil konstruksiyalar bilan ishlashda ehtiyot bo‘ling.');
  else if (currentWind >= 20) advice.push('Shamol sezilarli: kimyoviy purkashdan oldin mahalliy sharoitni tekshiring.');
  if (maxRain >= 60) advice.push('Kelgusi kunlarda yomg‘ir ehtimoli yuqori: sug‘orish rejasini qayta ko‘rib chiqish mumkin.');
  if (maxTemp >= 38) advice.push('Juda issiq kun kutilmoqda: sug‘orish va issiqlik stressiga e’tibor bering.');
  if (minTemp <= 2) advice.push('Past harorat xavfi bor: sovuqqa sezgir ekinlarni himoyalash choralarini ko‘ring.');
  if (!advice.length) advice.push('Keskin agro-ob-havo signali aniqlanmadi. Mahalliy daladagi sharoitni ham inobatga oling.');
  return advice;
}

async function fetchForecast(lat, lon, label = 'Joriy joylashuv') {
  const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
      timezone: 'auto',
      forecast_days: 5,
    },
    timeout: 9000,
  });
  const data = response.data;
  const days = (data.daily?.time || []).map((date, i) => ({
    date,
    weather_code: data.daily.weather_code?.[i],
    condition: weatherLabel(data.daily.weather_code?.[i]),
    temp_max: data.daily.temperature_2m_max?.[i],
    temp_min: data.daily.temperature_2m_min?.[i],
    precipitation_probability_max: data.daily.precipitation_probability_max?.[i],
    precipitation_sum: data.daily.precipitation_sum?.[i],
    wind_speed_max: data.daily.wind_speed_10m_max?.[i],
    sunrise: data.daily.sunrise?.[i],
    sunset: data.daily.sunset?.[i],
  }));

  return {
    mode: 'live',
    provider: 'Open-Meteo',
    location: label,
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    current: {
      ...data.current,
      condition: weatherLabel(data.current?.weather_code),
    },
    daily: days,
    agro_advice: agroAdvice(data),
  };
}

async function resolveDistrictCoordinates(district) {
  if (district.latitude != null && district.longitude != null) {
    return { latitude: Number(district.latitude), longitude: Number(district.longitude) };
  }

  const baseName = String(district.name).replace(/\s+tumani$/i, '').trim();
  const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: {
      name: `${baseName}, Samarqand`,
      count: 10,
      language: 'uz',
      countryCode: 'UZ',
    },
    timeout: 7000,
  });
  const candidates = response.data?.results || [];
  const selected = candidates.find((item) => /samarqand|samarkand/i.test([item.admin1, item.admin2, item.admin3].filter(Boolean).join(' '))) || candidates[0];
  if (!selected) return null;

  const latitude = Number(selected.latitude);
  const longitude = Number(selected.longitude);
  if (!validCoord(latitude, longitude)) return null;

  await pool.query('UPDATE districts SET latitude=$1, longitude=$2 WHERE district_id=$3', [latitude, longitude, district.district_id]);
  return { latitude, longitude };
}

router.get('/coords', activity('view', 'weather'), asyncHandler(async (req, res) => {
  const lat = num(req.query.lat);
  const lon = num(req.query.lon);
  const label = String(req.query.label || 'Joriy joylashuv').slice(0, 120);
  if (!validCoord(lat, lon)) return res.status(400).json({ error: 'To‘g‘ri lat/lon koordinata kerak' });
  res.json(await fetchForecast(lat, lon, label));
}));

router.get('/:district_id', activity('view', 'weather'), asyncHandler(async (req, res) => {
  const district = await pool.query(
    'SELECT district_id, name, latitude, longitude FROM districts WHERE district_id=$1',
    [req.params.district_id]
  );
  if (!district.rowCount) return res.status(404).json({ error: 'Tuman topilmadi' });
  const d = district.rows[0];

  let coords = null;
  try {
    coords = await resolveDistrictCoordinates(d);
  } catch (error) {
    console.warn('District geocoding failed:', error.message);
  }

  if (!coords) {
    return res.json({
      mode: 'demo',
      district: d.name,
      message: 'Tuman koordinatasi aniqlanmadi. “Mening joylashuvim” orqali real ob-havoni ko‘rishingiz mumkin.',
      forecast: [],
    });
  }

  res.json({ ...(await fetchForecast(coords.latitude, coords.longitude, d.name)), district: d.name });
}));

module.exports = router;

const express = require('express');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const CENTER = { latitude: 39.6542, longitude: 66.9597 };
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 20 * 60 * 1000;
let serviceCache = null;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
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

function category(tags = {}) {
  if (['restaurant', 'cafe', 'fast_food', 'food_court'].includes(tags.amenity)) return 'restaurant';
  if (['hotel', 'guest_house', 'hostel'].includes(tags.tourism)) return 'hotel';
  if (tags.amenity === 'taxi') return 'taxi';
  return null;
}

function nameOf(tags = {}, fallback) {
  return tags['name:uz'] || tags.name || tags['name:en'] || tags['name:ru'] || tags.operator || fallback;
}

function parseServiceRows(elements = []) {
  const rows = [];
  const seen = new Set();
  for (const el of elements) {
    const tags = el.tags || {};
    const kind = category(tags);
    const latitude = num(el.lat ?? el.center?.lat);
    const longitude = num(el.lon ?? el.center?.lon);
    if (!kind || !validCoord(latitude, longitude)) continue;
    const name = nameOf(tags, kind === 'restaurant' ? 'Nomsiz ovqatlanish joyi' : kind === 'hotel' ? 'Nomsiz mehmonxona' : 'Taksi punkti');
    const key = `${kind}:${String(name).toLocaleLowerCase('uz-UZ')}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: `${el.type}/${el.id}`,
      category: kind,
      name,
      latitude,
      longitude,
      cuisine: tags.cuisine || null,
      opening_hours: tags.opening_hours || null,
      phone: tags.phone || tags['contact:phone'] || null,
      website: tags.website || tags['contact:website'] || null,
      stars: tags.stars || null,
      fee: tags.fee || null,
      charge: tags.charge || null,
      wheelchair: tags.wheelchair || null,
      source: 'OpenStreetMap',
      source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
  }
  return rows;
}

async function discoverServices() {
  if (serviceCache && Date.now() - serviceCache.at < CACHE_MS) return serviceCache.value;
  const radius = 12000;
  const query = `[out:json][timeout:18];(
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"~"restaurant|cafe|fast_food|food_court"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["tourism"~"hotel|guest_house|hostel"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="taxi"];
  );out center tags;`;
  const body = new URLSearchParams({ data: query }).toString();
  const requests = OVERPASS_URLS.map((endpoint) => axios.post(endpoint, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'QishloqRaqamliPlatformasi-TourSupport/1.2 (+https://phd-api-production-d2e5.up.railway.app)',
    },
    timeout: 8000,
    maxContentLength: 5 * 1024 * 1024,
  }).then((response) => ({ endpoint, rows: parseServiceRows(response.data?.elements || []) })));

  let value;
  try {
    const winner = await Promise.any(requests);
    value = { provider: 'OpenStreetMap/Overpass', endpoint: winner.endpoint, rows: winner.rows };
  } catch {
    value = { provider: 'unavailable', endpoint: null, rows: [] };
  }
  serviceCache = { at: Date.now(), value };
  return value;
}

function addDate(dateText, days) {
  const [y, m, d] = String(dateText).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getWeather(days, startDate) {
  const count = Math.min(5, Math.max(1, days));
  try {
    const params = {
      latitude: CENTER.latitude,
      longitude: CENTER.longitude,
      timezone: 'Asia/Tashkent',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) {
      params.start_date = startDate;
      params.end_date = addDate(startDate, count - 1);
    } else {
      params.forecast_days = count;
    }
    const response = await axios.get(OPEN_METEO_URL, { params, timeout: 9000 });
    const d = response.data?.daily || {};
    return Array.from({ length: Math.min(count, d.time?.length || 0) }, (_, index) => ({
      day_number: index + 1,
      date: d.time?.[index] || null,
      weather_code: d.weather_code?.[index] ?? null,
      temperature_max_c: d.temperature_2m_max?.[index] ?? null,
      temperature_min_c: d.temperature_2m_min?.[index] ?? null,
      precipitation_probability_max_pct: d.precipitation_probability_max?.[index] ?? null,
      wind_speed_max_kmh: d.wind_speed_10m_max?.[index] ?? null,
      source: 'Open-Meteo',
    }));
  } catch {
    return [];
  }
}

function anchorFor(day) {
  const stops = Array.isArray(day?.stops) ? day.stops : [];
  const stop = stops[Math.floor(stops.length / 2)] || stops[0];
  const latitude = num(stop?.latitude);
  const longitude = num(stop?.longitude);
  if (validCoord(latitude, longitude)) return { latitude, longitude, name: stop.name || day?.title || 'Kun markazi' };
  return { ...CENTER, name: 'Samarqand markazi' };
}

function nearby(rows, anchor, kind, limit = 3) {
  return rows
    .filter((row) => row.category === kind)
    .map((row) => ({ ...row, distance_m: Math.round(haversine(anchor.latitude, anchor.longitude, row.latitude, row.longitude)) }))
    .filter((row) => row.distance_m <= 5000)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}

function normalizeProfile(input = {}) {
  return {
    interests: Array.isArray(input.interests) ? input.interests.map((v) => cleanText(v, 30)).slice(0, 8) : [],
    wheelchair_accessible: Boolean(input.wheelchair_accessible),
    children_count: Math.min(10, Math.max(0, Math.round(num(input.children_count) || 0))),
    seniors_count: Math.min(10, Math.max(0, Math.round(num(input.seniors_count) || 0))),
    transport: ['walking','taxi','mixed'].includes(input.transport) ? input.transport : 'mixed',
  };
}

function serviceQualityScore(row, kind, profile = {}) {
  let score = 0;
  if (row.opening_hours) score += 180;
  if (row.phone) score += 70;
  if (row.website) score += 90;
  if (row.stars) score += Math.min(180, Number(row.stars) * 30 || 0);
  if (profile.wheelchair_accessible) {
    if (row.wheelchair === 'yes') score += 260;
    if (row.wheelchair === 'no') score -= 400;
  }
  if (kind === 'restaurant') {
    const cuisine = String(row.cuisine || '').toLowerCase();
    if (/uzbek|central_asian|regional|plov|osh/.test(cuisine)) score += 320;
    if (profile.interests.includes('gastronomy')) score += 80;
  }
  if (kind === 'hotel' && (profile.children_count > 0 || profile.seniors_count > 0)) {
    if (row.website || row.phone) score += 80;
  }
  return score;
}

function chooseRecommended(rows, anchor, kind, selected, profile) {
  const candidates = nearby(rows, anchor, kind, kind === 'restaurant' ? 8 : 6);
  if (!candidates.length) return null;
  const selectedItem = selected?.[kind];
  if (selectedItem?.id) {
    const exact = candidates.find((row) => row.id === selectedItem.id)
      || rows.find((row) => row.category === kind && row.id === selectedItem.id);
    if (exact) {
      const distance_m = Math.round(haversine(anchor.latitude, anchor.longitude, exact.latitude, exact.longitude));
      return { ...exact, distance_m, recommendation_reason: 'user-selected' };
    }
  }
  return candidates
    .map((row) => ({
      ...row,
      recommendation_score: serviceQualityScore(row, kind, profile) - Math.round(row.distance_m / 4),
    }))
    .sort((a, b) => b.recommendation_score - a.recommendation_score || a.distance_m - b.distance_m)
    .map((row, index) => ({
      ...row,
      recommendation_reason: index === 0 ? 'distance+metadata-fit' : null,
    }))[0];
}

function cleanSelected(input = {}) {
  const result = {};
  for (const kind of ['restaurant', 'hotel', 'taxi']) {
    const item = input?.[kind];
    if (!item || typeof item !== 'object') continue;
    result[kind] = {
      id: cleanText(item.id, 120),
      name: cleanText(item.name, 180),
      source: cleanText(item.source, 80) || 'OpenStreetMap',
    };
  }
  return result;
}

function cleanPlannedCosts(input = {}) {
  const positive = (value) => {
    const n = num(value);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 100_000_000) : 0;
  };
  return {
    food_per_person_day_uzs: positive(input.food_per_person_day_uzs),
    hotel_nightly_total_uzs: positive(input.hotel_nightly_total_uzs),
    transport_daily_total_uzs: positive(input.transport_daily_total_uzs),
  };
}

function budgetPlan(total, days, partySize, selected, planned) {
  const hasTotal = Number.isFinite(total) && total > 0;
  const nights = Math.max(0, days - 1);
  const fixed = {
    food: planned.food_per_person_day_uzs ? planned.food_per_person_day_uzs * partySize * days : null,
    lodging: planned.hotel_nightly_total_uzs ? planned.hotel_nightly_total_uzs * nights : null,
    transport: planned.transport_daily_total_uzs ? planned.transport_daily_total_uzs * days : null,
  };
  const hasPlanned = Object.values(fixed).some((value) => Number.isFinite(value));
  if (!hasTotal && !hasPlanned) return null;

  const base = {
    food: { label: 'Ovqatlanish', share: 30, selected: selected.restaurant?.name || null },
    transport: { label: 'Mahalliy transport', share: 20, selected: selected.taxi?.name || null },
    tickets: { label: 'Kirish/chipta zaxirasi', share: 20, selected: null },
    lodging: { label: 'Turar joy zaxirasi', share: 20, selected: selected.hotel?.name || null },
    reserve: { label: 'Favqulodda zaxira', share: 10, selected: null },
  };
  const committed = Object.values(fixed).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const totalValue = hasTotal ? Math.round(total) : committed;
  const remaining = Math.max(0, totalValue - committed);
  const missingKeys = Object.keys(base).filter((key) => !Number.isFinite(fixed[key]));
  const missingWeight = missingKeys.reduce((sum, key) => sum + base[key].share, 0) || 1;
  let allocated = 0;
  const allocations = Object.keys(base).map((key, index, all) => {
    let amount;
    const plannedAmount = fixed[key];
    if (Number.isFinite(plannedAmount)) {
      amount = Math.round(plannedAmount);
    } else if (index === all.length - 1) {
      amount = Math.max(0, totalValue - allocated);
    } else {
      amount = Math.round(remaining * base[key].share / missingWeight);
    }
    allocated += amount;
    return {
      key,
      label: base[key].label,
      amount_uzs: amount,
      per_day_uzs: Math.round(amount / Math.max(1, days)),
      per_person_uzs: Math.round(amount / Math.max(1, partySize)),
      selected_service: base[key].selected,
      calculation: Number.isFinite(plannedAmount) ? 'user-planned-cost' : 'remaining-budget-allocation',
    };
  });
  return {
    total_uzs: totalValue,
    entered_total_uzs: hasTotal ? Math.round(total) : null,
    planned_commitments_uzs: committed,
    remaining_after_planned_uzs: Math.max(0, totalValue - committed),
    over_budget_uzs: hasTotal ? Math.max(0, committed - totalValue) : 0,
    party_size: partySize,
    days,
    nights,
    allocations,
    planned_costs: planned,
    selected_services: selected,
    note: 'Tanlangan OSM obyektining nomi tegishli budjet bandiga biriktiriladi. Narxlar xizmat ko‘rsatuvchidan olinmagan; hisob faqat foydalanuvchi kiritgan reja narxlari va umumiy budjetga asoslanadi.',
  };
}

router.get('/support/status', (_req, res) => {
  res.json({
    version: '1.3.0',
    weather: 'Open-Meteo date-aware',
    services: 'OpenStreetMap/Overpass with graceful empty fallback',
    service_recommendation: 'distance + available metadata + traveler-profile fit; not a quality rating',
    budget: 'selected-service + user-planned-cost allocator',
  });
});

router.post('/support', asyncHandler(async (req, res) => {
  const inputDays = Array.isArray(req.body.days) ? req.body.days.slice(0, 5) : [];
  if (!inputDays.length) return res.status(400).json({ error: 'Kunlik marshrut ma’lumotlari kerak.' });
  const partySize = Math.min(20, Math.max(1, Math.round(num(req.body.party_size) || 1)));
  const budget = num(req.body.budget_uzs);
  const selected = cleanSelected(req.body.selected_services || {});
  const planned = cleanPlannedCosts(req.body.planned_costs || {});
  const profile = normalizeProfile(req.body.profile || {});
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.start_date || '')) ? String(req.body.start_date) : null;
  const [services, weather] = await Promise.all([
    discoverServices(),
    getWeather(inputDays.length, startDate),
  ]);

  const days = inputDays.map((day, index) => {
    const anchor = anchorFor(day);
    const restaurants = nearby(services.rows, anchor, 'restaurant', 4);
    const hotels = nearby(services.rows, anchor, 'hotel', 3);
    const taxiPoints = nearby(services.rows, anchor, 'taxi', 3);
    const recommendations = {
      restaurant: chooseRecommended(services.rows, anchor, 'restaurant', selected, profile),
      hotel: chooseRecommended(services.rows, anchor, 'hotel', selected, profile),
      taxi: chooseRecommended(services.rows, anchor, 'taxi', selected, profile),
    };
    return {
      day_number: index + 1,
      anchor,
      weather: weather[index] || day.weather || null,
      restaurants,
      hotels,
      taxi_points: taxiPoints,
      recommendations,
      recommendation_note: 'Avtomatik tanlov masofa, mavjud OSM metadata va sayohatchi profiliga asoslanadi; bu reyting yoki sifat kafolati emas.',
    };
  });

  res.json({
    version: '1.3.0',
    party_size: partySize,
    selected_services: selected,
    profile,
    budget: budgetPlan(budget, inputDays.length, partySize, selected, planned),
    days,
    sources: {
      weather: weather.length ? 'Open-Meteo' : 'planner-weather-or-unavailable',
      services: services.provider,
    },
    warnings: [
      services.rows.length ? null : 'Yaqin restoran, mehmonxona va taksi punktlari bo‘yicha jonli OSM xizmati hozir javob bermadi; tarixiy marshrut ishlashda davom etadi.',
      weather.length ? null : 'Qo‘shimcha ob-havo so‘rovi javob bermadi; asosiy marshrutdagi prognoz mavjud bo‘lsa o‘sha ko‘rsatiladi.',
      'Restoran, mehmonxona va taksi yozuvlari OpenStreetMap ma’lumotidir; mavjudlik, narx va ish vaqtini xizmat ko‘rsatuvchidan tasdiqlang.',
      'Avtomatik xizmat tanlovi sifat reytingi emas: masofa, OSMda mavjud metadata va sayohatchi profiliga moslik ishlatiladi.',
    ].filter(Boolean),
  });
}));

module.exports = router;

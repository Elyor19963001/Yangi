const express = require('express');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const CENTER = { latitude: 39.6542, longitude: 66.9597, name: 'Samarqand markazi' };
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OSRM_URL = 'https://router.project-osrm.org';
const CACHE_MS = 30 * 60 * 1000;
const poiCache = new Map();

const PRIORITY_PATTERNS = [
  /registan|registon/i,
  /gur.?e.?amir|go.?ri.?amir|guri.?amir|amir temur/i,
  /shah.?i.?zinda|shohi zinda/i,
  /bibi.?khan|bibi.?xon|bibixon/i,
  /ulugh.?beg|ulug.?bek|ulug.?bek.*observ/i,
  /afrasiyab|afrosiyob/i,
  /siab|siyob/i,
];

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function text(value, max = 1000) {
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

function detectLanguage(prompt) {
  if (/[а-яё]/i.test(prompt)) return 'ru';
  if (/\b(the|day|days|trip|tour|walking|family|history|food)\b/i.test(prompt)) return 'en';
  return 'uz';
}

function parseBudget(prompt) {
  const normalized = prompt.replace(/,/g, '.');
  const mln = normalized.match(/(\d+(?:\.\d+)?)\s*(?:mln|million|млн)/i);
  if (mln) return Math.round(Number(mln[1]) * 1_000_000);
  const uzs = normalized.match(/(\d[\d\s]{3,})\s*(?:so['‘’`]?m|uzs|сум)/i);
  if (uzs) return Number(uzs[1].replace(/\s/g, '')) || null;
  return null;
}

function fallbackIntent(prompt, explicitDays) {
  const p = prompt.toLocaleLowerCase('uz-UZ');
  const dayMatch = p.match(/\b([1-5])\s*(?:kun|day|days|дн(?:я|ей)?)/i);
  const days = clamp(Number(explicitDays || dayMatch?.[1] || 2), 1, 5);
  const lowWalking = /(kam yur|ko.?p yur.*xohlam|ko.?p piyoda.*emas|less walk|not much walk|меньше ход|мало ход)/i.test(p);
  const family = /(bola|bolalar|oila|family|kid|child|ребен|семь)/i.test(p);
  const pilgrimage = /(ziyorat|maqbara|masjid|mosque|mausoleum|pilgrim|зиёрат|мечет|мавзол)/i.test(p);
  const gastronomy = /(milliy taom|osh|palov|plov|food|gastronom|restaurant|restoran|еда|кухн)/i.test(p);
  const museum = /(muzey|museum|музей)/i.test(p);
  let transport = 'mixed';
  if (/(faqat piyoda|walking only|пешком)/i.test(p)) transport = 'walking';
  if (/(taksi|taxi|машин|авто)/i.test(p)) transport = 'taxi';
  let pace = 'normal';
  if (lowWalking || /(sekin|xotirjam|relax|спокой)/i.test(p)) pace = 'relaxed';
  if (/(ko.?proq joy|maksimal|active|intensive|больше мест)/i.test(p)) pace = 'active';
  const interests = ['history'];
  if (pilgrimage) interests.push('pilgrimage');
  if (gastronomy) interests.push('gastronomy');
  if (museum) interests.push('museum');
  if (family) interests.push('family');
  return {
    days,
    interests: [...new Set(interests)],
    low_walking: lowWalking,
    family,
    transport,
    pace,
    language: detectLanguage(prompt),
    budget_uzs: parseBudget(prompt),
  };
}

async function parseIntentWithOpenAI(prompt, fallback) {
  if (!process.env.OPENAI_API_KEY) return { ...fallback, engine: 'smart-rules' };
  const schema = {
    type: 'object',
    properties: {
      days: { type: 'integer', minimum: 1, maximum: 5 },
      interests: { type: 'array', items: { type: 'string', enum: ['history','pilgrimage','gastronomy','museum','family','architecture'] } },
      low_walking: { type: 'boolean' },
      family: { type: 'boolean' },
      transport: { type: 'string', enum: ['walking','taxi','mixed'] },
      pace: { type: 'string', enum: ['relaxed','normal','active'] },
      language: { type: 'string', enum: ['uz','ru','en'] },
      budget_uzs: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    },
    required: ['days','interests','low_walking','family','transport','pace','language','budget_uzs'],
    additionalProperties: false,
  };
  try {
    const response = await axios.post('https://api.openai.com/v1/responses', {
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      input: [
        {
          role: 'system',
          content: 'You extract travel-planning preferences for a Samarqand itinerary. Do not invent places. Return only the requested structured fields. Default interest is history and default trip length is 2 days when unclear.',
        },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_schema', name: 'samarkand_tour_intent', strict: true, schema } },
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 18000,
    });
    const outputText = response.data?.output_text || response.data?.output
      ?.flatMap((item) => item.content || [])
      ?.find((item) => item.type === 'output_text')?.text;
    const parsed = JSON.parse(outputText || '{}');
    return {
      ...fallback,
      ...parsed,
      days: clamp(Number(parsed.days || fallback.days), 1, 5),
      interests: Array.isArray(parsed.interests) && parsed.interests.length ? parsed.interests : fallback.interests,
      engine: 'openai',
      model: response.data?.model || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    };
  } catch (error) {
    console.warn('OpenAI tour intent fallback:', error.response?.status || error.message);
    return { ...fallback, engine: 'smart-rules-fallback' };
  }
}

function osmName(tags = {}) {
  return tags['name:uz'] || tags.name || tags['name:en'] || tags['name:ru'] || null;
}

function categoryFor(tags = {}) {
  if (tags.amenity === 'marketplace') return 'market';
  if (tags.tourism === 'museum') return 'museum';
  if (tags.amenity === 'place_of_worship') return 'pilgrimage';
  if (tags.historic) return 'historic';
  if (tags.tourism === 'attraction') return 'attraction';
  return 'heritage';
}

function poiScore(poi, intent) {
  let score = 0;
  if (poi.wikidata || poi.wikipedia) score += 10;
  if (poi.category === 'historic') score += 10;
  if (poi.category === 'museum') score += intent.interests.includes('museum') ? 13 : 7;
  if (poi.category === 'pilgrimage') score += intent.interests.includes('pilgrimage') ? 16 : 5;
  if (poi.category === 'attraction') score += 6;
  if (PRIORITY_PATTERNS.some((rx) => rx.test(poi.name))) score += 28;
  if (intent.family && poi.category === 'museum') score += 4;
  return score;
}

async function discoverHeritagePois() {
  const key = 'samarkand-heritage-v1';
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
  const radius = 16000;
  const query = `[out:json][timeout:24];(
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["historic"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["tourism"~"attraction|museum"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="place_of_worship"]["historic"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="marketplace"]["name"];
  );out center tags;`;
  const response = await axios.post(
    OVERPASS_URL,
    new URLSearchParams({ data: query }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'QishloqRaqamliPlatformasi-TourPlanner/1.0 (+https://phd-api-production-d2e5.up.railway.app)',
      },
      timeout: 26000,
      maxContentLength: 6 * 1024 * 1024,
    }
  );
  const dedupe = new Map();
  for (const el of response.data?.elements || []) {
    const tags = el.tags || {};
    const name = osmName(tags);
    const latitude = number(el.lat ?? el.center?.lat);
    const longitude = number(el.lon ?? el.center?.lon);
    if (!name || !validCoord(latitude, longitude)) continue;
    const normalized = name.toLocaleLowerCase('uz-UZ').replace(/\s+/g, ' ').trim();
    const row = {
      id: `${el.type}/${el.id}`,
      osm_type: el.type,
      osm_id: el.id,
      name,
      latitude,
      longitude,
      category: categoryFor(tags),
      historic: tags.historic || null,
      tourism: tags.tourism || null,
      religion: tags.religion || null,
      opening_hours: tags.opening_hours || null,
      website: tags.website || tags['contact:website'] || null,
      wikipedia: tags.wikipedia || null,
      wikidata: tags.wikidata || null,
      source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source: 'OpenStreetMap',
    };
    const existing = dedupe.get(normalized);
    if (!existing || Number(Boolean(row.wikidata)) + Number(Boolean(row.wikipedia)) > Number(Boolean(existing.wikidata)) + Number(Boolean(existing.wikipedia))) {
      dedupe.set(normalized, row);
    }
  }
  const rows = [...dedupe.values()];
  poiCache.set(key, { at: Date.now(), rows });
  return rows;
}

function nearestOrder(rows, start) {
  const remaining = [...rows];
  const ordered = [];
  let current = start;
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((row, index) => {
      const d = haversine(current.latitude, current.longitude, row.latitude, row.longitude);
      if (d < bestDistance) { bestDistance = d; bestIndex = index; }
    });
    const next = remaining.splice(bestIndex, 1)[0];
    ordered.push(next);
    current = next;
  }
  return ordered;
}

function selectPois(pois, intent, start) {
  const perDay = intent.pace === 'relaxed' || intent.low_walking ? 4 : intent.pace === 'active' ? 6 : 5;
  const target = clamp(intent.days * perDay, intent.days * 3, 26);
  const scored = pois
    .map((poi) => ({ ...poi, score: poiScore(poi, intent), distance_from_start_m: Math.round(haversine(start.latitude, start.longitude, poi.latitude, poi.longitude)) }))
    .filter((poi) => poi.distance_from_start_m <= 22000)
    .sort((a, b) => b.score - a.score || a.distance_from_start_m - b.distance_from_start_m);
  const selected = [];
  const seen = new Set();
  for (const poi of scored) {
    const key = poi.name.toLocaleLowerCase('uz-UZ').replace(/[^a-zа-я0-9ʻ‘’]/gi, '');
    if (!key || seen.has(key)) continue;
    selected.push(poi);
    seen.add(key);
    if (selected.length >= target) break;
  }
  return nearestOrder(selected, start);
}

function splitDays(ordered, days) {
  const groups = Array.from({ length: days }, () => []);
  ordered.forEach((poi, index) => {
    const day = Math.min(days - 1, Math.floor(index * days / Math.max(1, ordered.length)));
    groups[day].push(poi);
  });
  return groups;
}

async function routeDriving(start, stops) {
  const points = [start, ...stops];
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  try {
    const response = await axios.get(`${OSRM_URL}/route/v1/driving/${coords}`, {
      params: { overview: 'full', geometries: 'geojson', steps: false },
      timeout: 14000,
    });
    const route = response.data?.routes?.[0];
    if (!route) return null;
    return {
      geometry: route.geometry,
      distance_m: Math.round(route.distance),
      duration_min: Math.round(route.duration / 60),
      source: 'OSRM',
      profile: 'driving',
    };
  } catch (error) {
    console.warn('OSRM route fallback:', error.response?.status || error.message);
    return null;
  }
}

function routeFallback(start, stops, walking) {
  const coords = [[start.longitude, start.latitude], ...stops.map((p) => [p.longitude, p.latitude])];
  let distance = 0;
  let prev = start;
  for (const stop of stops) {
    distance += haversine(prev.latitude, prev.longitude, stop.latitude, stop.longitude);
    prev = stop;
  }
  const speedKmh = walking ? 4.5 : 25;
  return {
    geometry: { type: 'LineString', coordinates: coords },
    distance_m: Math.round(distance),
    duration_min: Math.round((distance / 1000) / speedKmh * 60),
    source: 'geodesic-fallback',
    profile: walking ? 'walking-estimate' : 'vehicle-estimate',
  };
}

function visitMinutes(poi, intent) {
  if (poi.category === 'museum') return intent.pace === 'relaxed' ? 90 : 75;
  if (PRIORITY_PATTERNS.some((rx) => rx.test(poi.name))) return intent.pace === 'active' ? 60 : 80;
  return intent.pace === 'relaxed' ? 65 : 50;
}

function daySchedule(dayStops, route, intent, dayIndex) {
  let cursor = 9 * 60;
  const rows = dayStops.map((poi, index) => {
    if (index > 0) cursor += Math.max(8, Math.round((route?.duration_min || 45) / Math.max(1, dayStops.length)));
    if (index === Math.ceil(dayStops.length / 2) && intent.interests.includes('gastronomy')) cursor += 60;
    const visit = visitMinutes(poi, intent);
    const startMinutes = cursor;
    cursor += visit;
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { ...poi, order: index + 1, visit_minutes: visit, time_start: fmt(startMinutes), time_end: fmt(cursor) };
  });
  return {
    day: dayIndex + 1,
    title: `${dayIndex + 1}-kun`,
    stops: rows,
    route,
    distance_km: Number(((route?.distance_m || 0) / 1000).toFixed(1)),
    transfer_minutes: route?.duration_min || 0,
    meal_break: intent.interests.includes('gastronomy') ? 'Kun o‘rtasida milliy taomlar uchun 60 daqiqalik tanaffus rejalashtirilgan.' : null,
  };
}

function localizedSummary(intent, count) {
  if (intent.language === 'ru') return `${intent.days}-дневный маршрут по Самарканду: ${count} достопримечательностей. Маршрут оптимизирован по расстоянию и вашим предпочтениям.`;
  if (intent.language === 'en') return `${intent.days}-day Samarkand itinerary with ${count} heritage stops, optimized for distance and your preferences.`;
  return `Samarqand bo‘yicha ${intent.days} kunlik marshrut: ${count} ta tarixiy/turistik nuqta masofa va istaklaringiz bo‘yicha tartiblandi.`;
}

router.get('/status', (_req, res) => {
  res.json({
    version: '1.0.0',
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    openai_model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5.6-luna') : null,
    poi_source: 'OpenStreetMap / Overpass',
    routing_source: 'OSRM driving + geodesic fallback',
    note: 'Ish vaqti, chipta narxi va kirish qoidalari OSMda to‘liq bo‘lmasligi mumkin; safardan oldin rasmiy manbadan tekshirish kerak.',
  });
});

router.post('/plan', asyncHandler(async (req, res) => {
  const prompt = text(req.body.prompt, 1500);
  if (prompt.length < 4) return res.status(400).json({ error: 'Sayohat istagingizni yozing.' });
  const fallback = fallbackIntent(prompt, req.body.days);
  const intent = await parseIntentWithOpenAI(prompt, fallback);
  const startLat = number(req.body.start_latitude);
  const startLon = number(req.body.start_longitude);
  const start = validCoord(startLat, startLon)
    ? { latitude: startLat, longitude: startLon, name: text(req.body.start_name, 120) || 'Boshlanish nuqtasi' }
    : CENTER;

  let pois;
  try {
    pois = await discoverHeritagePois();
  } catch (error) {
    console.error('Tour POI discovery failed:', error.response?.status || error.message);
    return res.status(502).json({ error: 'Samarqand tarixiy joylarini OpenStreetMap katalogidan olishda xatolik. Qayta urinib ko‘ring.' });
  }
  const ordered = selectPois(pois, intent, start);
  if (ordered.length < intent.days * 2) return res.status(422).json({ error: 'Marshrut uchun yetarli xarita obyektlari topilmadi.' });
  const groups = splitDays(ordered, intent.days);
  const days = [];
  for (let i = 0; i < groups.length; i += 1) {
    const stops = nearestOrder(groups[i], start);
    let route = null;
    if (intent.transport !== 'walking') route = await routeDriving(start, stops);
    if (!route) route = routeFallback(start, stops, intent.transport === 'walking');
    days.push(daySchedule(stops, route, intent, i));
  }

  const totalStops = days.reduce((sum, day) => sum + day.stops.length, 0);
  res.json({
    version: '1.0.0',
    prompt,
    intent,
    start,
    summary: localizedSummary(intent, totalStops),
    days,
    sources: {
      places: 'OpenStreetMap contributors via Overpass API',
      routing: [...new Set(days.map((d) => d.route?.source).filter(Boolean))],
      ai: intent.engine === 'openai' ? `OpenAI ${intent.model || ''}`.trim() : 'Local multilingual preference parser',
    },
    warnings: [
      'Marshrut tavsiya xarakterida. Ish vaqti, chipta narxi, vaqtinchalik yopilish va kirish qoidalarini rasmiy manbalardan tekshiring.',
      intent.transport === 'walking' ? 'Piyoda rejimida yo‘l chizig‘i geodezik taxmin; piyodalar yo‘laklari bo‘yicha professional routing keyingi bosqichda ulanadi.' : null,
    ].filter(Boolean),
  });
}));

module.exports = router;

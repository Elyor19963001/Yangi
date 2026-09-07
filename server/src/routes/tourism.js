const express = require('express');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const CENTER = { latitude: 39.6542, longitude: 66.9597, name: 'Samarqand markazi' };
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OSRM_URL = 'https://router.project-osrm.org';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 30 * 60 * 1000;
const poiCache = new Map();

const CURATED_POIS = [
  { id:'wikidata/Q1373583', name:'Registon maydoni', latitude:39.654722, longitude:66.975556, category:'historic', weather_resilience:0, wikidata:'Q1373583', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q1373583' },
  { id:'wikidata/Q1256223', name:'Go‘ri Amir maqbarasi', latitude:39.648333, longitude:66.968889, category:'historic', weather_resilience:2, wikidata:'Q1256223', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q1256223' },
  { id:'wikidata/Q679218', name:'Bibixonim masjidi', latitude:39.660556, longitude:66.979722, category:'pilgrimage', weather_resilience:1, wikidata:'Q679218', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q679218' },
  { id:'wikidata/Q671935', name:'Shohi Zinda majmuasi', latitude:39.662620, longitude:66.987878, category:'pilgrimage', weather_resilience:1, wikidata:'Q671935', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q671935' },
  { id:'unesco/ulugh-beg-observatory', name:'Ulug‘bek rasadxonasi', latitude:39.674722, longitude:67.005556, category:'historic', weather_resilience:1, wikidata:null, source:'UNESCO', source_url:'https://www.unesco.org/en/astronomy-and-world-heritage/ulugh-beg-observatory' },
  { id:'wikidata/Q4306302', name:'Afrosiyob muzeyi', latitude:39.669339, longitude:66.993350, category:'museum', weather_resilience:3, wikidata:'Q4306302', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q4306302' },
  { id:'wikidata/Q13534449', name:'Siyob bozori', latitude:39.661893, longitude:66.979915, category:'market', weather_resilience:0, wikidata:'Q13534449', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q13534449' },
  { id:'wikidata/Q4273779', name:'Ruhobod maqbarasi', latitude:39.650861, longitude:66.968208, category:'historic', weather_resilience:2, wikidata:'Q4273779', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q4273779' },
  { id:'wikidata/Q13201584', name:'Hazrati Xizr masjidi', latitude:39.663453, longitude:66.983256, category:'pilgrimage', weather_resilience:1, wikidata:'Q13201584', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q13201584' },
];

const PRIORITY_PATTERNS = [
  /registan|registon/i,
  /gur.?e.?amir|go.?ri.?amir|guri.?amir|amir temur/i,
  /shah.?i.?zinda|shohi zinda/i,
  /bibi.?khan|bibi.?xon|bibixon/i,
  /ulugh.?beg|ulug.?bek|ulug.?bek.*observ/i,
  /afrasiyab|afrosiyob/i,
  /siab|siyob/i,
  /ruhabad|ruhobod/i,
  /hazrat.?khizr|hazrati.?xizr/i,
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
        { role: 'system', content: 'You extract travel-planning preferences for a Samarqand itinerary. Do not invent places. Return only the requested structured fields. Default interest is history and default trip length is 2 days when unclear.' },
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

function resilienceFor(tags = {}, category) {
  if (category === 'museum' || tags.indoor === 'yes') return 3;
  if (tags.building && category !== 'market') return 2;
  if (category === 'pilgrimage') return 1;
  return 0;
}

function normalizePoiKey(name) {
  return String(name || '').toLocaleLowerCase('uz-UZ').replace(/[ʻʼ’`´]/g, "'").replace(/[^a-zа-я0-9']/gi, '');
}

function poiScore(poi, intent) {
  let score = 0;
  if (poi.wikidata || poi.wikipedia) score += 10;
  if (poi.category === 'historic') score += 10;
  if (poi.category === 'museum') score += intent.interests.includes('museum') ? 13 : 7;
  if (poi.category === 'pilgrimage') score += intent.interests.includes('pilgrimage') ? 16 : 5;
  if (poi.category === 'attraction') score += 6;
  if (poi.category === 'market' && intent.interests.includes('gastronomy')) score += 12;
  if (PRIORITY_PATTERNS.some((rx) => rx.test(poi.name))) score += 28;
  if (intent.family && poi.category === 'museum') score += 4;
  return score;
}

function parseOverpassElements(elements = []) {
  const rows = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = osmName(tags);
    const latitude = number(el.lat ?? el.center?.lat);
    const longitude = number(el.lon ?? el.center?.lon);
    if (!name || !validCoord(latitude, longitude)) continue;
    const category = categoryFor(tags);
    rows.push({
      id: `${el.type}/${el.id}`,
      osm_type: el.type,
      osm_id: el.id,
      name,
      latitude,
      longitude,
      category,
      weather_resilience: resilienceFor(tags, category),
      historic: tags.historic || null,
      tourism: tags.tourism || null,
      religion: tags.religion || null,
      opening_hours: tags.opening_hours || null,
      website: tags.website || tags['contact:website'] || null,
      wikipedia: tags.wikipedia || null,
      wikidata: tags.wikidata || null,
      source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source: 'OpenStreetMap',
    });
  }
  return rows;
}

function mergeWithCurated(external = []) {
  const merged = new Map(CURATED_POIS.map((poi) => [normalizePoiKey(poi.name), { ...poi, curated: true }]));
  for (const poi of external) {
    const key = normalizePoiKey(poi.name);
    if (!key) continue;
    if (!merged.has(key)) merged.set(key, poi);
  }
  return [...merged.values()];
}

async function discoverHeritagePois() {
  const key = 'samarkand-heritage-v4';
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;
  const radius = 16000;
  const query = `[out:json][timeout:18];(
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["historic"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["tourism"~"attraction|museum"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="place_of_worship"]["historic"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="marketplace"]["name"];
  );out center tags;`;
  const requestBody = new URLSearchParams({ data: query }).toString();
  const requests = OVERPASS_URLS.map((endpoint) => axios.post(endpoint, requestBody, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'QishloqRaqamliPlatformasi-TourPlanner/1.2 (+https://phd-api-production-d2e5.up.railway.app)',
    },
    timeout: 9000,
    maxContentLength: 6 * 1024 * 1024,
  }).then((response) => ({ endpoint, rows: parseOverpassElements(response.data?.elements || []) })));

  let result;
  try {
    const winner = await Promise.any(requests);
    result = {
      provider: 'osm+curated',
      external_provider: winner.endpoint,
      external_count: winner.rows.length,
      rows: mergeWithCurated(winner.rows),
    };
  } catch {
    console.warn('Overpass unavailable; curated fallback active');
    result = {
      provider: 'curated-fallback',
      external_provider: null,
      external_count: 0,
      rows: mergeWithCurated([]),
    };
  }
  poiCache.set(key, { at: Date.now(), result });
  return result;
}

function dateStringTashkent() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDate(dateText, days) {
  const [y, m, d] = String(dateText).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function normalizeTripStart(raw) {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '')) ? String(raw) : dateStringTashkent();
  const today = dateStringTashkent();
  const diff = dayDiff(today, value);
  if (!Number.isFinite(diff) || diff < 0 || diff > 14) return { date: value, forecastable: false, warning: 'Ob-havo asosida moslashtirish uchun sana bugundan 14 kun ichida bo‘lishi kerak.' };
  return { date: value, forecastable: true, warning: null };
}

function weatherRisk(row = {}) {
  const code = Number(row.weather_code);
  const rain = Number(row.precipitation_probability_max_pct || 0);
  const max = Number(row.temperature_max_c);
  const min = Number(row.temperature_min_c);
  const wind = Number(row.wind_speed_max_kmh || 0);
  if (code >= 95) return { type: 'storm', severity: 5, label: 'Momaqaldiroq', advice: 'Yopiq obyektlarni ustuvor qiling va tashqi nuqtalarni qisqartiring.' };
  if ((code >= 51 && code <= 82) || rain >= 60) return { type: 'rain', severity: 4, label: 'Yomg‘ir xavfi', advice: 'Muzey va yopiqroq obyektlar oldinga surildi.' };
  if (wind >= 40) return { type: 'wind', severity: 3, label: 'Kuchli shamol', advice: 'Ochiq maydonlarda vaqt qisqartirildi.' };
  if (max >= 34) return { type: 'hot', severity: 3, label: 'Issiq', advice: 'Ochiq obyektlar ertaroq vaqtga surildi.' };
  if (min <= 2) return { type: 'cold', severity: 2, label: 'Sovuq', advice: 'Yopiqroq obyektlar ustuvorlashtirildi.' };
  return { type: 'normal', severity: 0, label: 'Qulay', advice: 'Standart masofa optimizatsiyasi ishlatildi.' };
}

async function getTripWeather(startMeta, days) {
  if (!startMeta.forecastable) return { rows: [], source: 'unavailable', warning: startMeta.warning };
  try {
    const endDate = addDate(startMeta.date, days - 1);
    const response = await axios.get(OPEN_METEO_URL, {
      params: {
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        timezone: 'Asia/Tashkent',
        start_date: startMeta.date,
        end_date: endDate,
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      },
      timeout: 9000,
    });
    const d = response.data?.daily || {};
    const rows = Array.from({ length: Math.min(days, d.time?.length || 0) }, (_, index) => {
      const row = {
        day_number: index + 1,
        date: d.time?.[index] || addDate(startMeta.date, index),
        weather_code: d.weather_code?.[index] ?? null,
        temperature_max_c: d.temperature_2m_max?.[index] ?? null,
        temperature_min_c: d.temperature_2m_min?.[index] ?? null,
        precipitation_probability_max_pct: d.precipitation_probability_max?.[index] ?? null,
        wind_speed_max_kmh: d.wind_speed_10m_max?.[index] ?? null,
        source: 'Open-Meteo',
      };
      return { ...row, risk: weatherRisk(row) };
    });
    return { rows, source: rows.length ? 'Open-Meteo' : 'unavailable', warning: rows.length ? null : 'Tanlangan sanalar uchun prognoz topilmadi.' };
  } catch (error) {
    console.warn('Tour weather unavailable:', error.response?.status || error.message);
    return { rows: [], source: 'unavailable', warning: 'Ob-havo xizmati hozir javob bermadi; marshrut ob-havosiz tuzildi.' };
  }
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
    .map((poi) => ({
      ...poi,
      score: poiScore(poi, intent),
      distance_from_center_m: Math.round(haversine(CENTER.latitude, CENTER.longitude, poi.latitude, poi.longitude)),
      distance_from_start_m: Math.round(haversine(start.latitude, start.longitude, poi.latitude, poi.longitude)),
    }))
    .filter((poi) => poi.distance_from_center_m <= 22000)
    .sort((a, b) => b.score - a.score || a.distance_from_start_m - b.distance_from_start_m);
  const selected = [];
  const seen = new Set();
  for (const poi of scored) {
    const key = normalizePoiKey(poi.name);
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

function rebalanceForWeather(groups, weatherRows, enabled) {
  const result = groups.map((group) => [...group]);
  if (!enabled || !weatherRows.length || result.length < 2) return result;
  const risky = weatherRows
    .map((weather, index) => ({ index, severity: weather.risk?.severity || 0 }))
    .filter((row) => row.severity >= 3)
    .sort((a, b) => b.severity - a.severity);
  for (const target of risky) {
    const targetGroup = result[target.index] || [];
    if (!targetGroup.length) continue;
    let weakestIndex = 0;
    targetGroup.forEach((poi, index) => {
      if ((poi.weather_resilience || 0) < (targetGroup[weakestIndex]?.weather_resilience || 0)) weakestIndex = index;
    });
    let donor = null;
    result.forEach((group, groupIndex) => {
      if (groupIndex === target.index) return;
      group.forEach((poi, poiIndex) => {
        const score = Number(poi.weather_resilience || 0);
        if (!donor || score > donor.score) donor = { groupIndex, poiIndex, score };
      });
    });
    const weakest = Number(targetGroup[weakestIndex]?.weather_resilience || 0);
    if (donor && donor.score - weakest >= 2) {
      const incoming = result[donor.groupIndex][donor.poiIndex];
      const outgoing = result[target.index][weakestIndex];
      result[target.index][weakestIndex] = incoming;
      result[donor.groupIndex][donor.poiIndex] = outgoing;
    }
  }
  return result;
}

function weatherAwareOrder(rows, start, weather, enabled) {
  const base = nearestOrder(rows, start);
  if (!enabled || !weather?.risk || weather.risk.type === 'normal') return base;
  const type = weather.risk.type;
  return base
    .map((poi, index) => ({ poi, index }))
    .sort((a, b) => {
      const ar = Number(a.poi.weather_resilience || 0);
      const br = Number(b.poi.weather_resilience || 0);
      if (type === 'hot') return ar - br || a.index - b.index;
      return br - ar || a.index - b.index;
    })
    .map((row) => row.poi);
}

async function routeDriving(start, stops) {
  const points = [start, ...stops];
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  try {
    const response = await axios.get(`${OSRM_URL}/route/v1/driving/${coords}`, {
      params: { overview: 'full', geometries: 'geojson', steps: false },
      timeout: 10000,
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

function visitMinutes(poi, intent, weather, adaptive) {
  let minutes = poi.category === 'museum' ? (intent.pace === 'relaxed' ? 90 : 75)
    : PRIORITY_PATTERNS.some((rx) => rx.test(poi.name)) ? (intent.pace === 'active' ? 60 : 80)
      : intent.pace === 'relaxed' ? 65 : 50;
  if (adaptive && weather?.risk?.severity >= 3) {
    if ((poi.weather_resilience || 0) >= 2) minutes += 10;
    else minutes = Math.max(35, minutes - 15);
  }
  return minutes;
}

function daySchedule(dayStops, route, intent, dayIndex, weather, adaptive) {
  const risk = weather?.risk || { type: 'normal', advice: null };
  let cursor = risk.type === 'hot' && adaptive ? 8 * 60 : risk.severity >= 3 && adaptive ? 9 * 60 + 30 : 9 * 60;
  const rows = dayStops.map((poi, index) => {
    if (index > 0) cursor += Math.max(8, Math.round((route?.duration_min || 45) / Math.max(1, dayStops.length)));
    if (index === Math.ceil(dayStops.length / 2) && intent.interests.includes('gastronomy')) cursor += risk.type === 'hot' && adaptive ? 90 : 60;
    const visit = visitMinutes(poi, intent, weather, adaptive);
    const startMinutes = cursor;
    cursor += visit;
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { ...poi, order: index + 1, visit_minutes: visit, time_start: fmt(startMinutes), time_end: fmt(cursor) };
  });
  return {
    day: dayIndex + 1,
    date: weather?.date || null,
    title: `${dayIndex + 1}-kun`,
    stops: rows,
    route,
    weather: weather || null,
    weather_adapted: Boolean(adaptive && risk.severity > 0),
    adaptation_note: adaptive && risk.severity > 0 ? risk.advice : null,
    distance_km: Number(((route?.distance_m || 0) / 1000).toFixed(1)),
    transfer_minutes: route?.duration_min || 0,
    meal_break: intent.interests.includes('gastronomy') ? (risk.type === 'hot' && adaptive ? 'Issiq vaqt oralig‘ida 90 daqiqalik tushlik va dam olish tanaffusi rejalashtirildi.' : 'Kun o‘rtasida milliy taomlar uchun 60 daqiqalik tanaffus rejalashtirilgan.') : null,
  };
}

function localizedSummary(intent, count, adaptedDays) {
  if (intent.language === 'ru') return `${intent.days}-дневный маршрут по Самарканду: ${count} достопримечательностей.${adaptedDays ? ` ${adaptedDays} дн. скорректировано по погоде.` : ''}`;
  if (intent.language === 'en') return `${intent.days}-day Samarkand itinerary with ${count} heritage stops.${adaptedDays ? ` ${adaptedDays} day(s) weather-adapted.` : ''}`;
  return `Samarqand bo‘yicha ${intent.days} kunlik marshrut: ${count} ta tarixiy/turistik nuqta.${adaptedDays ? ` ${adaptedDays} kun ob-havoga moslashtirildi.` : ''}`;
}

router.get('/status', (_req, res) => {
  res.json({
    version: '1.2.0',
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    openai_model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5.6-luna') : null,
    poi_source: 'Verified curated Samarkand anchors + OpenStreetMap/Overpass enrichment',
    routing_source: 'OSRM driving + geodesic fallback',
    weather_source: 'Open-Meteo',
    weather_adaptive_routing: true,
    forecast_window_days: 14,
    curated_poi_count: CURATED_POIS.length,
    note: 'Ob-havo moslashuvi tavsiyaviy. Ish vaqti, chipta narxi, vaqtinchalik yopilish va kirish qoidalarini rasmiy manbadan tekshirish kerak.',
  });
});

router.post('/plan', asyncHandler(async (req, res) => {
  const prompt = text(req.body.prompt, 1500);
  if (prompt.length < 4) return res.status(400).json({ error: 'Sayohat istagingizni yozing.' });
  const fallback = fallbackIntent(prompt, req.body.days);
  const intent = await parseIntentWithOpenAI(prompt, fallback);
  const startLat = number(req.body.start_latitude);
  const startLon = number(req.body.start_longitude);
  const requestedStart = validCoord(startLat, startLon)
    ? { latitude: startLat, longitude: startLon, name: text(req.body.start_name, 120) || 'Boshlanish nuqtasi' }
    : null;
  const startOutsideSamarkand = requestedStart
    ? haversine(requestedStart.latitude, requestedStart.longitude, CENTER.latitude, CENTER.longitude) > 30000
    : false;
  const start = requestedStart && !startOutsideSamarkand ? requestedStart : CENTER;
  const tripStart = normalizeTripStart(req.body.start_date);
  const weatherAdaptive = req.body.weather_adaptive !== false;

  const [discovered, weatherBundle] = await Promise.all([
    discoverHeritagePois(),
    getTripWeather(tripStart, intent.days),
  ]);
  const ordered = selectPois(discovered.rows, intent, start);
  if (ordered.length < intent.days * 2) return res.status(422).json({ error: 'Marshrut uchun yetarli xarita obyektlari topilmadi.' });
  const rawGroups = splitDays(ordered, intent.days);
  const groups = rebalanceForWeather(rawGroups, weatherBundle.rows, weatherAdaptive);
  const days = [];
  for (let i = 0; i < groups.length; i += 1) {
    const weather = weatherBundle.rows[i] || null;
    const stops = weatherAwareOrder(groups[i], start, weather, weatherAdaptive);
    let route = null;
    if (intent.transport !== 'walking') route = await routeDriving(start, stops);
    if (!route) route = routeFallback(start, stops, intent.transport === 'walking');
    days.push(daySchedule(stops, route, intent, i, weather, weatherAdaptive));
  }

  const totalStops = days.reduce((sum, day) => sum + day.stops.length, 0);
  const adaptedDays = days.filter((day) => day.weather_adapted).length;
  res.json({
    version: '1.2.0',
    prompt,
    intent,
    start,
    trip_start_date: tripStart.date,
    weather_adaptive: weatherAdaptive,
    summary: localizedSummary(intent, totalStops, adaptedDays),
    days,
    sources: {
      places: discovered.provider === 'curated-fallback' ? 'Verified curated Samarkand reference catalog' : 'Curated Samarkand references + OpenStreetMap contributors via Overpass API',
      places_provider: discovered.provider,
      external_poi_count: discovered.external_count,
      routing: [...new Set(days.map((d) => d.route?.source).filter(Boolean))],
      weather: weatherBundle.source,
      ai: intent.engine === 'openai' ? `OpenAI ${intent.model || ''}`.trim() : 'Local multilingual preference parser',
    },
    warnings: [
      startOutsideSamarkand ? 'Sizning geolokatsiyangiz Samarqand markazidan 30 km dan uzoq bo‘lgani uchun tur Samarqand markazidan boshlandi.' : null,
      weatherBundle.warning,
      discovered.provider === 'curated-fallback' ? 'OpenStreetMap real-vaqt katalogi sekin javob berdi; marshrut tasdiqlangan tayanch obyektlar katalogidan tuzildi.' : null,
      weatherAdaptive && weatherBundle.rows.length ? 'Yomg‘ir, kuchli shamol, keskin issiq yoki sovuq aniqlansa, obyektlarning kunlar va kun ichidagi tartibi avtomatik qayta optimallashtiriladi.' : null,
      'Marshrut tavsiya xarakterida. Ish vaqti, chipta narxi, vaqtinchalik yopilish va kirish qoidalarini rasmiy manbalardan tekshiring.',
      intent.transport === 'walking' ? 'Piyoda rejimida yo‘l chizig‘i geodezik taxmin; piyodalar yo‘laklari bo‘yicha professional routing keyingi bosqichda ulanadi.' : null,
    ].filter(Boolean),
  });
}));

async function runStartupSmoke() {
  try {
    const intent = fallbackIntent('Samarqand tarixiy qadamjolari bo‘yicha 2 kun, ko‘p yurmay, milliy taomlar bilan', 2);
    const discovered = await discoverHeritagePois();
    const selected = selectPois(discovered.rows, intent, CENTER).slice(0, 4);
    const route = selected.length ? (await routeDriving(CENTER, selected) || routeFallback(CENTER, selected, false)) : null;
    const names = selected.map((p) => p.name).join(' | ');
    console.log(`[tour-smoke] v=1.2 provider=${discovered.provider} pois=${discovered.rows.length} external=${discovered.external_count} sample=${names || 'none'} route=${route?.source || 'none'} geometry=${route?.geometry?.type || 'none'}`);
  } catch (error) {
    console.warn(`[tour-smoke] failed=${error.response?.status || error.message}`);
  }
}

if (process.env.TOUR_STARTUP_SMOKE !== 'false') {
  const timer = setTimeout(runStartupSmoke, 2500);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = router;

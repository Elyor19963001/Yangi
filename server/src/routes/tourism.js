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

const OFFICIAL_POI_CATALOG = [
  {
    id: 'registan',
    match: /registan|registon/i,
    canonical_name: 'Registon ansambli',
    authority: 'Registon Ansambli direksiyasi',
    source_url: 'https://registon.uz/uz/media-center-uz/mass-media-uz/item/252-registon-qaysi-kun-bepul',
    ticket_url: 'https://tickets.registon.uz/',
    checked_on: '2026-09-18',
    hours: {
      type: 'seasonal',
      season: { from: '02-20', to: '11-20', open: '07:00', close: '24:00' },
      off_season: { open: '08:00', close: '20:00' },
      note: 'Direksiya sahifasida dam olish kunlarisiz ishlashi ko‘rsatilgan.',
    },
    tariff: {
      currency: 'UZS',
      rows: [
        { audience: 'O‘zbekiston fuqarosi', adult: 15000, child: null, note: 'Kirish bileti' },
        { audience: 'Xorijiy mehmon', adult: 100000, child: null, note: 'Kirish bileti' },
        { audience: 'Maktab o‘quvchisi', adult: null, child: 10000, note: 'O‘zbekiston maktab o‘quvchilari uchun' },
      ],
      note: 'Narxlar Registon direksiyasining 2025-yil 2-oktabrdagi rasmiy sahifasida e’lon qilingan; xarid oldidan onlayn chipta portalida qayta tekshiring.',
    },
  },
  {
    id: 'gur-amir',
    match: /go.?ri.?amir|gur.?e.?amir|guri.?amir|amir temur maqbarasi/i,
    canonical_name: 'Amir Temur maqbarasi (Go‘ri Amir)',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://samarkandmuseum.uz/uz/muzei-dlya-menyu/mavzolei-amira-temura',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '18:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist. Mahalliy tarifda 20-fevral–20-noyabr mavsum, qolgan davr mavsumdan tashqari.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
  {
    id: 'bibi-khanum',
    match: /bibi.?khan|bibi.?xon|bibixonim/i,
    canonical_name: 'Bibixonim masjidi',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://samarkandmuseum.uz/uz/muzei-dlya-menyu/mecet-bibi-xanym',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '18:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
  {
    id: 'ulugbek-observatory',
    match: /ulugh.?beg.*observ|ulug.?bek.*rasad|mirzo ulug.?bek/i,
    canonical_name: 'Mirzo Ulug‘bek rasadxonasi muzey majmuasi',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://www.samarkandmuseum.uz/muzei-dlya-menyu/memorialnyi-muzei-i-observatoriya-mirzo-ulugbeka',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '17:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
  {
    id: 'afrosiyob-museum',
    match: /afrasiyab|afrosiyob/i,
    canonical_name: 'Samarqand tarixi Afrosiyob muzeyi',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://samarkandmuseum.uz/en/muzei-dlya-menyu/museum-of-the-history-of-samarkand-and-the-city-of-afrosiab',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '18:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
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

function promptCount(prompt, pattern) {
  const match = String(prompt || '').match(pattern);
  return match ? clamp(Number(match[1]) || 0, 0, 10) : 0;
}

function profileTime(prompt, kind) {
  const p = String(prompt || '');
  const patterns = kind === 'start'
    ? [/kunni\s*([01]?\d|2[0-3]):([0-5]\d)\s*da\s*boshlash/i, /(?:start|begin|boshlash)\D{0,12}([01]?\d|2[0-3]):([0-5]\d)/i]
    : [/kunni\s*([01]?\d|2[0-3]):([0-5]\d)\s*gacha\s*yakunlash/i, /(?:end|finish|yakun)\D{0,12}([01]?\d|2[0-3]):([0-5]\d)/i];
  for (const rx of patterns) {
    const match = p.match(rx);
    if (match) return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
  }
  return null;
}

function profileCountry(prompt) {
  const match = String(prompt || '').match(/kelish mamlakati:\s*([^;\n.]{2,60})/i);
  return match ? text(match[1], 60) : null;
}

function normalizeIntentProfile(raw = {}) {
  const children = clamp(Number(raw.children_count || 0), 0, 10);
  const seniors = clamp(Number(raw.seniors_count || 0), 0, 10);
  const wheelchair = Boolean(raw.wheelchair_accessible);
  const lowWalking = Boolean(raw.low_walking || wheelchair || seniors > 0);
  let pace = ['relaxed','normal','active'].includes(raw.pace) ? raw.pace : 'normal';
  if ((wheelchair || seniors > 0) && pace === 'active') pace = 'normal';
  return {
    ...raw,
    children_count: children,
    seniors_count: seniors,
    wheelchair_accessible: wheelchair,
    own_vehicle: Boolean(raw.own_vehicle),
    low_walking: lowWalking,
    family: Boolean(raw.family || children > 0),
    pace,
    preferred_start_time: /^\d{2}:\d{2}$/.test(String(raw.preferred_start_time || '')) ? raw.preferred_start_time : null,
    preferred_end_time: /^\d{2}:\d{2}$/.test(String(raw.preferred_end_time || '')) ? raw.preferred_end_time : null,
    origin_country: raw.origin_country ? text(raw.origin_country, 60) : null,
  };
}

function mergeExplicitProfile(intent, raw = {}) {
  const allowedInterests = new Set(['history','pilgrimage','gastronomy','museum','family','architecture']);
  const interests = Array.isArray(raw.interests)
    ? raw.interests.map((v) => text(v, 30)).filter((v) => allowedInterests.has(v)).slice(0, 6)
    : [];
  const merged = { ...intent };
  if (interests.length) merged.interests = [...new Set(interests)];
  if (['relaxed','normal','active'].includes(raw.pace)) merged.pace = raw.pace;
  if (['walking','taxi','mixed'].includes(raw.transport)) merged.transport = raw.transport;
  if (typeof raw.low_walking === 'boolean') merged.low_walking = raw.low_walking;
  if (typeof raw.wheelchair_accessible === 'boolean') merged.wheelchair_accessible = raw.wheelchair_accessible;
  if (typeof raw.own_vehicle === 'boolean') merged.own_vehicle = raw.own_vehicle;
  if (raw.children_count !== undefined) merged.children_count = clamp(Number(raw.children_count) || 0, 0, 10);
  if (raw.seniors_count !== undefined) merged.seniors_count = clamp(Number(raw.seniors_count) || 0, 0, 10);
  if (/^\d{2}:\d{2}$/.test(String(raw.preferred_start_time || ''))) merged.preferred_start_time = String(raw.preferred_start_time);
  if (/^\d{2}:\d{2}$/.test(String(raw.preferred_end_time || ''))) merged.preferred_end_time = String(raw.preferred_end_time);
  if (raw.origin_country) merged.origin_country = text(raw.origin_country, 60);
  const budget = number(raw.budget_uzs);
  if (budget !== null && budget >= 0) merged.budget_uzs = Math.round(budget);
  return merged;
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
  const childrenCount = promptCount(prompt, /(\d+)\s*(?:bola|bolalar|child(?:ren)?|реб(?:енок|енка|ёнок|ёнка|детей))/i);
  const seniorsCount = promptCount(prompt, /(\d+)\s*(?:kishi\s*)?65\+\s*(?:yoshda|yosh|age)?/i);
  const wheelchairAccessible = /(nogironlar aravachasi|wheelchair|инвалидн.*коляск)/i.test(p);
  const ownVehicle = /(shaxsiy avtomobil|o.?z avtomobil|own car|private car|своя машин|личн.*авто)/i.test(p);
  let transport = 'mixed';
  if (/(faqat piyoda|walking only|пешком)/i.test(p)) transport = 'walking';
  if (/(taksi|taxi|машин|авто)/i.test(p) && !ownVehicle) transport = 'taxi';
  if (ownVehicle) transport = 'mixed';
  let pace = 'normal';
  if (lowWalking || seniorsCount > 0 || wheelchairAccessible || /(sekin|xotirjam|relax|спокой)/i.test(p)) pace = 'relaxed';
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
    children_count: childrenCount,
    seniors_count: seniorsCount,
    wheelchair_accessible: wheelchairAccessible,
    own_vehicle: ownVehicle,
    preferred_start_time: profileTime(prompt, 'start'),
    preferred_end_time: profileTime(prompt, 'end'),
    origin_country: profileCountry(prompt),
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
      children_count: { type: 'integer', minimum: 0, maximum: 10 },
      seniors_count: { type: 'integer', minimum: 0, maximum: 10 },
      wheelchair_accessible: { type: 'boolean' },
      own_vehicle: { type: 'boolean' },
      preferred_start_time: { anyOf: [{ type: 'string', maxLength: 5 }, { type: 'null' }] },
      preferred_end_time: { anyOf: [{ type: 'string', maxLength: 5 }, { type: 'null' }] },
      origin_country: { anyOf: [{ type: 'string', maxLength: 60 }, { type: 'null' }] },
    },
    required: ['days','interests','low_walking','family','transport','pace','language','budget_uzs','children_count','seniors_count','wheelchair_accessible','own_vehicle','preferred_start_time','preferred_end_time','origin_country'],
    additionalProperties: false,
  };
  try {
    const response = await axios.post('https://api.openai.com/v1/responses', {
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      input: [
        { role: 'system', content: 'You extract travel-planning preferences for a Samarqand itinerary. Do not invent places. Return only the requested structured fields. Preserve explicit traveler-profile facts such as children, seniors, mobility needs, vehicle availability, origin country, and preferred daily start/end times. Default interest is history and default trip length is 2 days when unclear.' },
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
      children_count: Math.max(Number(parsed.children_count || 0), Number(fallback.children_count || 0)),
      seniors_count: Math.max(Number(parsed.seniors_count || 0), Number(fallback.seniors_count || 0)),
      wheelchair_accessible: Boolean(parsed.wheelchair_accessible || fallback.wheelchair_accessible),
      own_vehicle: Boolean(parsed.own_vehicle || fallback.own_vehicle),
      preferred_start_time: parsed.preferred_start_time || fallback.preferred_start_time || null,
      preferred_end_time: parsed.preferred_end_time || fallback.preferred_end_time || null,
      origin_country: parsed.origin_country || fallback.origin_country || null,
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
  if (Number(intent.children_count || 0) > 0 && poi.category === 'museum') score += 3;
  if (Number(intent.seniors_count || 0) > 0 && ['historic','pilgrimage','museum'].includes(poi.category)) score += 2;
  if (intent.wheelchair_accessible && Number(poi.weather_resilience || 0) >= 2) score += 2;
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
      fee: tags.fee || null,
      charge: tags.charge || tags.admission || tags['entrance:fee'] || null,
      website: tags.website || tags['contact:website'] || null,
      phone: tags.phone || tags['contact:phone'] || null,
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
    if (!merged.has(key)) {
      merged.set(key, poi);
      continue;
    }
    const base = merged.get(key);
    merged.set(key, {
      ...poi,
      ...base,
      opening_hours: poi.opening_hours || base.opening_hours || null,
      fee: poi.fee || base.fee || null,
      charge: poi.charge || base.charge || null,
      website: poi.website || base.website || null,
      phone: poi.phone || base.phone || null,
      osm_source_url: poi.source_url || null,
      osm_id: poi.osm_id || null,
      osm_type: poi.osm_type || null,
    });
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

function clockMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function availableDayMinutes(intent) {
  const start = clockMinutes(intent.preferred_start_time);
  const end = clockMinutes(intent.preferred_end_time);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function selectPois(pois, intent, start) {
  let perDay = intent.pace === 'relaxed' || intent.low_walking ? 4 : intent.pace === 'active' ? 6 : 5;
  if (intent.wheelchair_accessible || Number(intent.seniors_count || 0) > 0) perDay = Math.min(perDay, 4);
  const windowMinutes = availableDayMinutes(intent);
  if (windowMinutes !== null && windowMinutes <= 360) perDay = Math.min(perDay, 3);
  else if (windowMinutes !== null && windowMinutes <= 480) perDay = Math.min(perDay, 4);
  const target = clamp(intent.days * perDay, intent.days * 2, 26);
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

function pathDistanceM(start, stops) {
  let total = 0;
  let previous = start;
  for (const stop of stops) {
    total += haversine(previous.latitude, previous.longitude, stop.latitude, stop.longitude);
    previous = stop;
  }
  return total;
}

function twoOptOpenPath(start, rows, maxPasses = 6) {
  if (!Array.isArray(rows) || rows.length < 3) return [...rows];
  let best = nearestOrder(rows, start);
  let bestDistance = pathDistanceM(start, best);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const candidateDistance = pathDistanceM(start, candidate);
        if (candidateDistance + 25 < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

function optimizeDayOrder(rows, start, weather, adaptive) {
  const baseline = nearestOrder(rows, start);
  const before = pathDistanceM(start, baseline);
  const riskSeverity = Number(weather?.risk?.severity || 0);
  const optimized = adaptive && riskSeverity >= 3
    ? weatherAwareOrder(rows, start, weather, true)
    : twoOptOpenPath(start, rows);
  const after = pathDistanceM(start, optimized);
  return {
    stops: optimized,
    meta: {
      method: adaptive && riskSeverity >= 3 ? 'weather-priority' : 'nearest-neighbor+2-opt',
      origin: start.name || 'Boshlanish nuqtasi',
      before_distance_m: Math.round(before),
      after_distance_m: Math.round(after),
      saved_distance_m: Math.max(0, Math.round(before - after)),
    },
  };
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

function officialPoiRecord(poi = {}) {
  const name = String(poi.name || '');
  return OFFICIAL_POI_CATALOG.find((row) => row.match.test(name)) || null;
}

function inMuseumSeason(dateText) {
  const md = String(dateText || '').slice(5);
  return /^\d{2}-\d{2}$/.test(md) && md >= '02-20' && md < '11-20';
}

function officialHoursWindow(record, dateText) {
  if (!record?.hours) return null;
  if (record.hours.type === 'daily') {
    return { open: record.hours.open, close: record.hours.close, label: `${record.hours.open}–${record.hours.close}` };
  }
  if (record.hours.type === 'seasonal') {
    const md = String(dateText || '').slice(5);
    const seasonal = /^\d{2}-\d{2}$/.test(md) && md >= record.hours.season.from && md < record.hours.season.to;
    const hours = seasonal ? record.hours.season : record.hours.off_season;
    return { open: hours.open, close: hours.close, label: `${hours.open}–${hours.close}` };
  }
  return null;
}

function evaluateOfficialHours(record, dateText, timeText) {
  const window = officialHoursWindow(record, dateText);
  const visit = minutesOfClock(timeText);
  if (!window || visit === null) return { status: 'unknown', label: window?.label || 'Ish vaqti noma’lum', source: record?.authority || null };
  const start = minutesOfClock(window.open);
  const end = minutesOfClock(window.close);
  if (start === null || end === null) return { status: 'unknown', label: window.label, source: record.authority };
  const normalizedEnd = end === 24 * 60 ? 24 * 60 : end;
  const isOpen = visit >= start && visit < normalizedEnd;
  return {
    status: isOpen ? 'open' : 'closed',
    label: `${isOpen ? 'Ochiq' : 'Yopiq'} · ${window.label}`,
    source: record.authority,
  };
}

function officialTariff(record, dateText) {
  if (!record?.tariff) return null;
  const season = inMuseumSeason(dateText);
  const rows = record.tariff.rows.map((row) => {
    const amount = Number.isFinite(row.fixed) ? row.fixed : season ? row.season : row.off_season;
    return {
      audience: row.audience,
      amount_uzs: Number.isFinite(amount) ? amount : null,
      note: row.note || null,
    };
  });
  return {
    status: 'official-published',
    currency: record.tariff.currency || 'UZS',
    rows,
    season: record.tariff.seasonal_local ? (season ? 'mavsum' : 'mavsumdan tashqari') : null,
    note: record.tariff.note || null,
    free_note: record.tariff.free_note || null,
    authority: record.authority,
    source_url: record.source_url,
    ticket_url: record.ticket_url || null,
    checked_on: record.checked_on,
  };
}

const OSM_DAY_CODES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function minutesOfClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return hour * 60 + minute;
}

function daySelectorMatches(selector, dayCode) {
  const clean = String(selector || '').trim();
  if (!clean) return true;
  const tokens = clean.split(',').map((x) => x.trim()).filter(Boolean);
  for (const token of tokens) {
    if (/^(Mo|Tu|We|Th|Fr|Sa|Su)$/.test(token) && token === dayCode) return true;
    const range = token.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    if (range) {
      const start = OSM_DAY_CODES.indexOf(range[1]);
      const end = OSM_DAY_CODES.indexOf(range[2]);
      const current = OSM_DAY_CODES.indexOf(dayCode);
      if (start <= end ? current >= start && current <= end : current >= start || current <= end) return true;
    }
  }
  return false;
}

function evaluateSimpleOpeningHours(openingHours, dateText, timeText) {
  const raw = text(openingHours, 300);
  if (!raw) return { status: 'unknown', label: 'Ish vaqti noma’lum', source: null };
  if (raw === '24/7') return { status: 'open', label: 'Ochiq · 24/7', source: 'OpenStreetMap opening_hours' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || '')) || !/^\d{2}:\d{2}$/.test(String(timeText || ''))) {
    return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };
  }
  if (/[+"']|PH|SH|sunrise|sunset|week|easter|month|year/i.test(raw)) {
    return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };
  }
  const date = new Date(`${dateText}T12:00:00Z`);
  const dayCode = OSM_DAY_CODES[date.getUTCDay()];
  const visit = minutesOfClock(timeText);
  if (visit === null) return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };

  let matchedDayRule = false;
  let explicitClosed = false;
  for (const segmentRaw of raw.split(';')) {
    const segment = segmentRaw.trim();
    if (!segment) continue;
    const match = segment.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+)?(.+)$/);
    if (!match) continue;
    const selector = (match[1] || '').trim();
    const body = (match[2] || '').trim();
    if (!daySelectorMatches(selector, dayCode)) continue;
    matchedDayRule = true;
    if (/\boff\b|\bclosed\b/i.test(body)) {
      explicitClosed = true;
      continue;
    }
    const ranges = [...body.matchAll(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g)];
    for (const range of ranges) {
      const start = minutesOfClock(range[1]);
      const end = minutesOfClock(range[2]);
      if (start === null || end === null) continue;
      const open = end >= start ? visit >= start && visit < end : visit >= start || visit < end;
      if (open) return { status: 'open', label: `Ochiq · ${range[1]}–${range[2]}`, source: 'OpenStreetMap opening_hours' };
    }
  }
  if (matchedDayRule || explicitClosed) return { status: 'closed', label: 'Yopiq bo‘lishi mumkin', source: 'OpenStreetMap opening_hours' };
  return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };
}

function tashkentNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const getPart = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    time: `${getPart('hour')}:${getPart('minute')}`,
  };
}

function ticketInfo(poi = {}) {
  const fee = String(poi.fee || '').toLowerCase();
  const charge = text(poi.charge, 120);
  if (charge) return { status: 'known', label: charge, source: 'OpenStreetMap fee/charge tag' };
  if (fee === 'no') return { status: 'free', label: 'Bepul deb ko‘rsatilgan', source: 'OpenStreetMap fee tag' };
  if (fee === 'yes') return { status: 'paid-unknown', label: 'Pullik · narx ko‘rsatilmagan', source: 'OpenStreetMap fee tag' };
  return { status: 'unknown', label: 'Chipta narxi ma’lum emas', source: null };
}

function enrichOperationalStatus(poi, visitDate, visitTime) {
  const official = officialPoiRecord(poi);
  const nowParts = tashkentNowParts();
  if (official) {
    return {
      ...poi,
      operational: {
        planned: evaluateOfficialHours(official, visitDate, visitTime),
        now: evaluateOfficialHours(official, nowParts.date, nowParts.time),
        ticket: officialTariff(official, visitDate),
        website: official.source_url || poi.website || null,
        phone: poi.phone || null,
        official: {
          id: official.id,
          canonical_name: official.canonical_name,
          authority: official.authority,
          source_url: official.source_url,
          ticket_url: official.ticket_url || null,
          checked_on: official.checked_on,
          hours_note: official.hours?.note || null,
        },
        data_note: 'Rasmiy tashkilot sahifasidagi ish vaqti va tarif katalogi ustuvor ishlatildi. Narx va rejim o‘zgarishi mumkin; xarid/tashrif oldidan manbani tekshiring.',
      },
    };
  }
  const planned = evaluateSimpleOpeningHours(poi.opening_hours, visitDate, visitTime);
  const now = evaluateSimpleOpeningHours(poi.opening_hours, nowParts.date, nowParts.time);
  return {
    ...poi,
    operational: {
      planned,
      now,
      ticket: ticketInfo(poi),
      website: poi.website || null,
      phone: poi.phone || null,
      official: null,
      data_note: 'Ish vaqti va to‘lov OpenStreetMap metadata asosida. Rasmiy manbada tekshirish tavsiya etiladi.',
    },
  };
}

function visitMinutes(poi, intent, weather, adaptive) {
  let minutes = poi.category === 'museum' ? (intent.pace === 'relaxed' ? 90 : 75)
    : PRIORITY_PATTERNS.some((rx) => rx.test(poi.name)) ? (intent.pace === 'active' ? 60 : 80)
      : intent.pace === 'relaxed' ? 65 : 50;
  if (Number(intent.children_count || 0) > 0 && minutes > 75) minutes = 75;
  if (intent.wheelchair_accessible) minutes += 10;
  if (adaptive && weather?.risk?.severity >= 3) {
    if ((poi.weather_resilience || 0) >= 2) minutes += 10;
    else minutes = Math.max(35, minutes - 15);
  }
  return minutes;
}

function daySchedule(dayStops, route, intent, dayIndex, weather, adaptive, visitDate = null) {
  const risk = weather?.risk || { type: 'normal', advice: null };
  const requestedStart = clockMinutes(intent.preferred_start_time);
  const requestedEnd = clockMinutes(intent.preferred_end_time);
  let cursor = requestedStart ?? (risk.type === 'hot' && adaptive ? 8 * 60 : risk.severity >= 3 && adaptive ? 9 * 60 + 30 : 9 * 60);
  const mobilityBuffer = (intent.low_walking || intent.wheelchair_accessible || Number(intent.seniors_count || 0) > 0) ? 5 : 0;
  const rows = dayStops.map((poi, index) => {
    if (index > 0) cursor += Math.max(8, Math.round((route?.duration_min || 45) / Math.max(1, dayStops.length))) + mobilityBuffer;
    if (index === Math.ceil(dayStops.length / 2) && intent.interests.includes('gastronomy')) cursor += risk.type === 'hot' && adaptive ? 90 : 60;
    const visit = visitMinutes(poi, intent, weather, adaptive);
    const startMinutes = cursor;
    cursor += visit;
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const startText = fmt(startMinutes);
    const endText = fmt(cursor);
    const dated = visitDate || weather?.date || null;
    const enriched = enrichOperationalStatus(poi, dated, startText);
    return { ...enriched, order: index + 1, visit_minutes: visit, time_start: startText, time_end: endText };
  });
  return {
    day: dayIndex + 1,
    date: visitDate || weather?.date || null,
    title: `${dayIndex + 1}-kun`,
    stops: rows,
    route,
    weather: weather || null,
    weather_adapted: Boolean(adaptive && risk.severity > 0),
    adaptation_note: adaptive && risk.severity > 0 ? risk.advice : null,
    distance_km: Number(((route?.distance_m || 0) / 1000).toFixed(1)),
    transfer_minutes: route?.duration_min || 0,
    preferred_window: {
      start: intent.preferred_start_time || null,
      end: intent.preferred_end_time || null,
      overrun_minutes: requestedEnd !== null ? Math.max(0, cursor - requestedEnd) : 0,
    },
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
    version: '1.6.0',
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    openai_model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5.6-luna') : null,
    poi_source: 'Verified curated Samarkand anchors + OpenStreetMap/Overpass enrichment',
    routing_source: 'Fixed-origin route ordering + OSRM driving + geodesic fallback',
    route_optimization: 'Nearest-neighbor + 2-opt when weather is normal; weather-priority ordering in severe weather',
    weather_source: 'Open-Meteo',
    operational_metadata: 'Official Registan and Samarkand Museum-Reserve catalog where verified; OpenStreetMap fallback elsewhere',
    weather_adaptive_routing: true,
    forecast_window_days: 14,
    curated_poi_count: CURATED_POIS.length,
    official_catalog_count: OFFICIAL_POI_CATALOG.length,
    official_catalog_checked_on: '2026-09-18',
    note: 'Registon va ayrim Samarqand davlat muzey-qo‘riqxonasi obyektlari uchun rasmiy sahifalarda e’lon qilingan ish vaqti/tariflar katalogi ishlatiladi; qolgan joylarda OSM fallback. Narxlar o‘zgarishi mumkin, xarid oldidan manbani tekshiring.',
  });
});

router.post('/plan', asyncHandler(async (req, res) => {
  const prompt = text(req.body.prompt, 1500);
  if (prompt.length < 4) return res.status(400).json({ error: 'Sayohat istagingizni yozing.' });
  const fallback = fallbackIntent(prompt, req.body.days);
  const parsedIntent = await parseIntentWithOpenAI(prompt, fallback);
  const explicitIntent = mergeExplicitProfile(parsedIntent, req.body.profile || {});
  const intent = normalizeIntentProfile(explicitIntent);
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
    const optimized = optimizeDayOrder(groups[i], start, weather, weatherAdaptive);
    const stops = optimized.stops;
    let route = null;
    if (intent.transport !== 'walking') route = await routeDriving(start, stops);
    if (!route) route = routeFallback(start, stops, intent.transport === 'walking');
    const visitDate = weather?.date || addDate(tripStart.date, i);
    const scheduled = daySchedule(stops, route, intent, i, weather, weatherAdaptive, visitDate);
    scheduled.optimization = optimized.meta;
    days.push(scheduled);
  }

  const totalStops = days.reduce((sum, day) => sum + day.stops.length, 0);
  const adaptedDays = days.filter((day) => day.weather_adapted).length;
  const knownClosedVisits = days.flatMap((day) => day.stops || []).filter((stop) => stop.operational?.planned?.status === 'closed');
  const pricedStops = days.flatMap((day) => day.stops || []).filter((stop) => stop.operational?.ticket?.status !== 'unknown');
  res.json({
    version: '1.6.0',
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
      optimization: [...new Set(days.map((d) => d.optimization?.method).filter(Boolean))],
      weather: weatherBundle.source,
      operational: 'Official Registan/Samarkand Museum-Reserve catalog + OpenStreetMap fallback',
      ai: intent.engine === 'openai' ? `OpenAI ${intent.model || ''}`.trim() : 'Local multilingual preference parser',
    },
    warnings: [
      startOutsideSamarkand ? 'Sizning geolokatsiyangiz Samarqand markazidan 30 km dan uzoq bo‘lgani uchun tur Samarqand markazidan boshlandi.' : null,
      weatherBundle.warning,
      discovered.provider === 'curated-fallback' ? 'OpenStreetMap real-vaqt katalogi sekin javob berdi; marshrut tasdiqlangan tayanch obyektlar katalogidan tuzildi.' : null,
      weatherAdaptive && weatherBundle.rows.length ? 'Yomg‘ir, kuchli shamol, keskin issiq yoki sovuq aniqlansa, obyektlarning kunlar va kun ichidagi tartibi avtomatik qayta optimallashtiriladi.' : null,
      intent.wheelchair_accessible ? 'Accessibility talabi hisobga olindi, ammo obyektlarning pandus, lift va kirish sharoiti bo‘yicha ma’lumot to‘liq emas; tashrifdan oldin rasmiy manbadan tasdiqlang.' : null,
      days.some((day) => Number(day.preferred_window?.overrun_minutes || 0) > 0) ? 'Tanlangan kun yakuni vaqtiga sig‘magan kun bor; tashrif sonini kamaytirish yoki yakun vaqtini uzaytirish tavsiya etiladi.' : null,
      knownClosedVisits.length ? `${knownClosedVisits.length} ta tashrifda OSM opening_hours bo‘yicha yopiq bo‘lish ehtimoli aniqlandi; tashrif vaqtini o‘zgartirish yoki rasmiy manbani tekshiring.` : null,
      pricedStops.length ? null : 'Tanlangan obyektlarda rasmiy yoki ishonchli chipta tarifi topilmadi; tizim narxni taxmin qilmadi.',
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
    console.log(`[tour-smoke] v=1.6 provider=${discovered.provider} pois=${discovered.rows.length} external=${discovered.external_count} sample=${names || 'none'} route=${route?.source || 'none'} geometry=${route?.geometry?.type || 'none'}`);
  } catch (error) {
    console.warn(`[tour-smoke] failed=${error.response?.status || error.message}`);
  }
}

if (process.env.TOUR_STARTUP_SMOKE !== 'false') {
  const timer = setTimeout(runStartupSmoke, 2500);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = router;

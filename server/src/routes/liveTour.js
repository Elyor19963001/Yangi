const express = require('express');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const OSRM_DRIVING_URL = 'https://router.project-osrm.org';
const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot';
const SAMARKAND = { latitude: 39.6542, longitude: 66.9597 };

const NAV_TTS_CACHE_MAX = 120;
const navTtsCache = new Map();
const navTtsInFlight = new Map();
const navTtsRate = new Map();

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeText(value, max = 120) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
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
    name: safeText(raw.name || fallbackName, 120),
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
    steps: [],
    turn_by_turn: false,
  };
}

function normalizeOsrmSteps(route, stops) {
  const rows = [];
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  legs.forEach((leg, legIndex) => {
    const destination = stops[legIndex]?.name || `${legIndex + 1}-manzil`;
    const steps = Array.isArray(leg?.steps) ? leg.steps : [];
    steps.forEach((step, stepIndex) => {
      const loc = step?.maneuver?.location;
      const longitude = num(loc?.[0]);
      const latitude = num(loc?.[1]);
      if (!validCoord(latitude, longitude)) return;
      rows.push({
        id: `${legIndex}:${stepIndex}:${step?.maneuver?.type || 'continue'}`,
        leg_index: legIndex,
        step_index: stepIndex,
        type: safeText(step?.maneuver?.type || 'continue', 40),
        modifier: safeText(step?.maneuver?.modifier || '', 40) || null,
        name: safeText(step?.name || '', 100) || null,
        distance_m: Math.round(Number(step?.distance) || 0),
        duration_s: Math.round(Number(step?.duration) || 0),
        bearing_before: num(step?.maneuver?.bearing_before),
        bearing_after: num(step?.maneuver?.bearing_after),
        maneuver: { latitude, longitude },
        destination,
      });
    });
  });
  return rows;
}

function navVoiceConfig(lang) {
  const configs = {
    uz: {
      voice: process.env.TOUR_TTS_VOICE_UZ || 'cedar',
      instructions: 'Speak in clear natural Uzbek as a calm professional GPS navigator. Keep phrases concise, confident and easy to understand while walking or driving.',
    },
    en: {
      voice: process.env.TOUR_TTS_VOICE_EN || 'marin',
      instructions: 'Speak in natural English as a calm professional GPS navigator. Keep phrases concise, confident and easy to understand while walking or driving.',
    },
    ru: {
      voice: process.env.TOUR_TTS_VOICE_RU || 'cedar',
      instructions: 'Speak in natural Russian as a calm professional GPS navigator. Keep phrases concise, confident and easy to understand while walking or driving.',
    },
  };
  return configs[lang] || null;
}

function distancePhrase(lang, rawDistance) {
  const distance = clamp(Math.round(Number(rawDistance) || 0), 0, 200000);
  if (distance >= 1000) {
    const km = Math.max(1, Math.round(distance / 100) / 10);
    if (lang === 'ru') return `${String(km).replace('.', ',')} километра`;
    if (lang === 'en') return `${km} kilometers`;
    return `${km} kilometr`;
  }
  const rounded = distance >= 300 ? Math.round(distance / 50) * 50 : distance >= 100 ? Math.round(distance / 25) * 25 : Math.max(10, Math.round(distance / 10) * 10);
  if (lang === 'ru') return `${rounded} метров`;
  if (lang === 'en') return `${rounded} meters`;
  return `${rounded} metr`;
}

function directionPhrase(lang, modifier) {
  const key = String(modifier || 'straight').toLowerCase();
  const uz = {
    'straight': 'to‘g‘ri davom eting',
    'slight right': 'biroz o‘ngga buriling',
    'right': 'o‘ngga buriling',
    'sharp right': 'keskin o‘ngga buriling',
    'uturn': 'ortga qayriling',
    'sharp left': 'keskin chapga buriling',
    'left': 'chapga buriling',
    'slight left': 'biroz chapga buriling',
  };
  const en = {
    'straight': 'continue straight',
    'slight right': 'bear slightly right',
    'right': 'turn right',
    'sharp right': 'turn sharply right',
    'uturn': 'make a U-turn',
    'sharp left': 'turn sharply left',
    'left': 'turn left',
    'slight left': 'bear slightly left',
  };
  const ru = {
    'straight': 'продолжайте прямо',
    'slight right': 'возьмите немного вправо',
    'right': 'поверните направо',
    'sharp right': 'резко поверните направо',
    'uturn': 'развернитесь',
    'sharp left': 'резко поверните налево',
    'left': 'поверните налево',
    'slight left': 'возьмите немного влево',
  };
  return (lang === 'ru' ? ru : lang === 'en' ? en : uz)[key] || (lang === 'ru' ? ru.straight : lang === 'en' ? en.straight : uz.straight);
}

function navigationPhrase(payload = {}) {
  const lang = ['uz','en','ru'].includes(payload.lang) ? payload.lang : 'uz';
  const event = safeText(payload.event, 30);
  const distance = distancePhrase(lang, payload.distance_m);
  const direction = directionPhrase(lang, payload.modifier);
  const stop = safeText(payload.stop_name, 90);
  const street = safeText(payload.street, 80);
  const streetSuffix = street
    ? (lang === 'ru' ? ` на ${street}` : lang === 'en' ? ` onto ${street}` : ` — ${street}`)
    : '';

  if (lang === 'en') {
    if (event === 'start') return stop ? `Navigation started. Head toward ${stop}.` : 'Navigation started.';
    if (event === 'turn') return `In ${distance}, ${direction}${streetSuffix}.`;
    if (event === 'continue') return `Continue for ${distance}.`;
    if (event === 'arrive') return stop ? `You have arrived at ${stop}.` : 'You have arrived.';
    if (event === 'offroute') return 'You are off the route. Recalculating.';
    if (event === 'reroute') return 'Route updated.';
    if (event === 'next_stop') return stop ? `Next stop: ${stop}.` : 'Continue to the next stop.';
  }
  if (lang === 'ru') {
    if (event === 'start') return stop ? `Навигация началась. Двигайтесь к ${stop}.` : 'Навигация началась.';
    if (event === 'turn') return `Через ${distance} ${direction}${streetSuffix}.`;
    if (event === 'continue') return `Продолжайте движение ${distance}.`;
    if (event === 'arrive') return stop ? `Вы прибыли: ${stop}.` : 'Вы прибыли в пункт назначения.';
    if (event === 'offroute') return 'Вы отклонились от маршрута. Перестраиваю маршрут.';
    if (event === 'reroute') return 'Маршрут обновлён.';
    if (event === 'next_stop') return stop ? `Следующая точка: ${stop}.` : 'Продолжайте к следующей точке.';
  }
  if (event === 'start') return stop ? `Navigatsiya boshlandi. ${stop} tomon yo‘lga chiqing.` : 'Navigatsiya boshlandi.';
  if (event === 'turn') return `${distance}dan keyin ${direction}${streetSuffix}.`;
  if (event === 'continue') return `${distance} davom eting.`;
  if (event === 'arrive') return stop ? `${stop} manziliga yetib keldingiz.` : 'Manzilga yetib keldingiz.';
  if (event === 'offroute') return 'Marshrutdan chetlandingiz. Yangi yo‘l hisoblanmoqda.';
  if (event === 'reroute') return 'Marshrut yangilandi.';
  if (event === 'next_stop') return stop ? `Keyingi manzil: ${stop}.` : 'Keyingi manzil tomon davom eting.';
  return '';
}

function limitedNavVoiceRequest(req) {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = navTtsRate.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count += 1;
  navTtsRate.set(ip, entry);
  return entry.count > 45;
}

function rememberNavTts(key, buffer) {
  if (navTtsCache.size >= NAV_TTS_CACHE_MAX) {
    const oldest = navTtsCache.keys().next().value;
    if (oldest) navTtsCache.delete(oldest);
  }
  navTtsCache.set(key, buffer);
}

async function generateNavMp3(lang, phrase) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Professional navigator ovozi hali sozlanmagan.');
    error.statusCode = 503;
    throw error;
  }
  const cfg = navVoiceConfig(lang);
  if (!cfg) {
    const error = new Error('Navigator tili qo‘llanmaydi.');
    error.statusCode = 400;
    throw error;
  }
  const model = process.env.TOUR_TTS_MODEL || 'gpt-4o-mini-tts';
  const response = await axios.post('https://api.openai.com/v1/audio/speech', {
    model,
    voice: cfg.voice,
    input: phrase,
    instructions: cfg.instructions,
    response_format: 'mp3',
    speed: 1.0,
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: 5 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

router.get('/status', (_req, res) => {
  res.json({
    version: '2.0.0',
    live_gps: true,
    tracking_storage: 'none',
    rerouting: 'OSRM driving/foot routing with geodesic fallback',
    turn_by_turn: true,
    voice_navigation: true,
    voice_languages: ['uz','en','ru'],
    professional_voice_configured: Boolean(process.env.OPENAI_API_KEY),
    guidance_modes: ['full','essential','mute'],
    auto_audio_guide_trigger: true,
    arrival_radius_m: 80,
    deviation_threshold_m: 120,
    note: 'GPS coordinates are used for the current browser navigation session and are not stored by this endpoint. Turn-by-turn depends on routing-provider step data; fallback routes may provide destination guidance without street-level turns.',
  });
});

router.post('/voice', asyncHandler(async (req, res) => {
  if (limitedNavVoiceRequest(req)) return res.status(429).json({ error: 'Navigator audio so‘rovlari juda ko‘p.' });
  const lang = ['uz','en','ru'].includes(String(req.body.lang)) ? String(req.body.lang) : 'uz';
  const allowedEvents = ['start','turn','continue','arrive','offroute','reroute','next_stop'];
  const event = allowedEvents.includes(String(req.body.event)) ? String(req.body.event) : '';
  if (!event) return res.status(400).json({ error: 'Navigator hodisasi noto‘g‘ri.' });

  const payload = {
    lang,
    event,
    distance_m: clamp(Number(req.body.distance_m) || 0, 0, 200000),
    modifier: safeText(req.body.modifier, 40),
    street: safeText(req.body.street, 80),
    stop_name: safeText(req.body.stop_name, 90),
  };
  const phrase = navigationPhrase(payload);
  if (!phrase) return res.status(400).json({ error: 'Navigator iborasi yaratilmagan.' });

  if (String(req.query.format || '') === 'json') {
    return res.json({ phrase, professional_audio: Boolean(process.env.OPENAI_API_KEY) });
  }

  const cfg = navVoiceConfig(lang);
  const model = process.env.TOUR_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = cfg?.voice || 'cedar';
  const cacheKey = `${lang}:${model}:${voice}:${phrase}`;
  let audio = navTtsCache.get(cacheKey);
  if (!audio) {
    let pending = navTtsInFlight.get(cacheKey);
    if (!pending) {
      pending = generateNavMp3(lang, phrase)
        .then((buffer) => {
          rememberNavTts(cacheKey, buffer);
          return buffer;
        })
        .finally(() => navTtsInFlight.delete(cacheKey));
      navTtsInFlight.set(cacheKey, pending);
    }
    try {
      audio = await pending;
    } catch (error) {
      const status = Number(error.statusCode || error.response?.status || 502);
      return res.status(status >= 400 && status < 600 ? status : 502).json({ error: error.message || 'Navigator audio yaratilmadi.', phrase });
    }
  }

  res.set({
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.length),
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Navigation-Language': lang,
    'X-Navigation-Event': event,
    'X-Audio-Engine': 'OpenAI',
    'X-Audio-Model': model,
    'X-Audio-Voice': voice,
  });
  res.send(audio);
}));

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
  const points = [current, ...stops];
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const backend = walking ? OSRM_FOOT_URL : OSRM_DRIVING_URL;
  const profile = walking ? 'foot' : 'driving';
  let route = null;

  try {
    const response = await axios.get(`${backend}/route/v1/${profile}/${coords}`, {
      params: { overview: 'full', geometries: 'geojson', steps: true, alternatives: false },
      timeout: walking ? 12_000 : 9_000,
    });
    const candidate = response.data?.routes?.[0];
    if (candidate) {
      const steps = normalizeOsrmSteps(candidate, stops);
      route = {
        geometry: candidate.geometry,
        distance_m: Math.round(candidate.distance),
        duration_min: Math.max(1, Math.round(candidate.duration / 60)),
        source: walking ? 'OSRM-foot / OpenStreetMap.de' : 'OSRM',
        profile,
        steps,
        turn_by_turn: steps.length > 0,
      };
    }
  } catch (error) {
    console.warn('Live tour OSRM fallback:', profile, error.response?.status || error.message);
  }

  if (!route) route = fallbackRoute(current, stops, walking);

  res.json({
    version: '2.0.0',
    current,
    next_stop: stops[0],
    route,
    voice_navigation: {
      languages: ['uz','en','ru'],
      professional_audio: Boolean(process.env.OPENAI_API_KEY),
      guidance_modes: ['full','essential','mute'],
    },
    privacy: { stored: false, purpose: 'current-session navigation only' },
  });
}));

module.exports = router;

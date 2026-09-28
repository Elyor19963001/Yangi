require('dotenv').config();
const http = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { pool } = require('./config/db');

const auth = require('./routes/auth');
const prices = require('./routes/prices');
const listings = require('./routes/listings');
const weather = require('./routes/weather');
const programs = require('./routes/programs');
const profile = require('./routes/profile');
const research = require('./routes/research');
const meta = require('./routes/meta');
const survey = require('./routes/survey');
const chat = require('./routes/chat');
const places = require('./routes/places');
const agro = require('./routes/agro');
const agroPipeline = require('./routes/agroPipeline');
const adminUsers = require('./routes/adminUsers');
const tourism = require('./routes/tourism');
const tourSupport = require('./routes/tourSupport');
const liveTour = require('./routes/liveTour');
const pilotReadiness = require('./routes/pilotReadiness');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://tile.openstreetmap.org',
        'https://*.tile.openstreetmap.org',
        'https://server.arcgisonline.com',
        'https://services.arcgisonline.com',
        'https://*.arcgisonline.com',
        'https://tiles.openfreemap.org',
        'https://commons.wikimedia.org',
        'https://upload.wikimedia.org',
        'https://thumb.wikimedia.org',
      ],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://tiles.openfreemap.org', 'https://server.arcgisonline.com'],
      workerSrc: ["'self'", 'blob:'],
      fontSrc: ["'self'", 'data:', 'https://tiles.openfreemap.org'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", 'https://sketchfab.com'],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

function originAllowed(origin) {
  return !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (originAllowed(origin)) return callback(null, true);
    return callback(new Error('CORS origin ruxsat etilmagan'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 240 }));

// Only these published heritage scans may be streamed; no caller supplied URL.
const heritageFiles = Object.freeze({
  registan: {
    standard: 'https://zenodo.org/records/21490200/files/af54f5280eb249beb6501eab4769c351_normalized-0.500.glb?download=1',
    original: 'https://zenodo.org/records/21490200/files/af54f5280eb249beb6501eab4769c351_normalized.glb?download=1',
  },
  'gur-amir': {
    standard: 'https://zenodo.org/records/21570554/files/fd795227e0bc4f61bc1e4e453d29a74b_normalized-0.500.glb?download=1',
    original: 'https://zenodo.org/records/21570554/files/fd795227e0bc4f61bc1e4e453d29a74b_normalized.glb?download=1',
  },
  'bibi-khanum': {
    standard: 'https://zenodo.org/records/21529722/files/dc8ec865fd0d480c8ae06196fd18d296_normalized-0.500.glb?download=1',
    original: 'https://zenodo.org/records/21529722/files/dc8ec865fd0d480c8ae06196fd18d296_normalized.glb?download=1',
  },
});

app.get('/heritage/:id.glb', (req, res) => {
  const source = heritageFiles[req.params.id]?.[req.query.quality === 'original' ? 'original' : 'standard'];
  if (!source) return res.status(404).end();
  res.set('Content-Type', 'model/gltf-binary');
  res.set('Cache-Control', 'public, max-age=86400');
  function stream(url, redirects = 0) {
    if (redirects > 4 || !['zenodo.org', 'www.zenodo.org'].includes(new URL(url).hostname)) {
      return res.status(502).end();
    }
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    const request = https.get(url, {
      timeout: 20000, agent,
      headers: { 'User-Agent': 'curl/8.5.0', Accept: 'model/gltf-binary, */*' },
    }, (upstream) => {
      if ([301, 302, 303, 307, 308].includes(upstream.statusCode) && upstream.headers.location) {
        upstream.resume();
        return stream(new URL(upstream.headers.location, url).href, redirects + 1);
      }
      if (upstream.statusCode !== 200) {
        console.warn('Heritage scan HTTP status:', upstream.statusCode);
        upstream.resume();
        return res.status(502).end();
      }
      if (upstream.headers['content-length']) res.set('Content-Length', upstream.headers['content-length']);
      upstream.pipe(res);
      res.on('close', () => upstream.destroy());
    });
    request.on('timeout', () => request.destroy(new Error('Heritage model timeout')));
    request.on('error', (error) => {
      console.warn('Heritage scan unavailable:', error.message);
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
  }
  stream(source);
});

const publicDir = path.join(__dirname, '..', 'public');
app.get('/heritage-three.bundle.js', (_req, res) => {
  res.sendFile(path.join(publicDir, 'heritage-three.bundle.js.gz'), {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'public, max-age=86400' },
  });
});
app.use((req, res, next) => {
  if (
    req.path === '/tour.html'
    || req.path === '/map.html'
    || req.path === '/map.js'
    || /^\/tour(?:-|\.).*\.(?:css|js)$/.test(req.path)
    || req.path === '/map-style-switcher.css'
    || req.path === '/map-style-switcher.js'
    || req.path === '/map-3d.js'
  ) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(express.static(publicDir));
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist'), {
  maxAge: '30d',
  immutable: true,
}));
app.use('/vendor/maplibre', express.static(path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist'), {
  maxAge: '30d',
  immutable: true,
}));
app.use('/vendor/three/draco', express.static(path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf'), {
  maxAge: '30d', immutable: true,
}));
app.use('/vendor/maplibre-leaflet', express.static(path.join(__dirname, '..', 'node_modules', '@maplibre', 'maplibre-gl-leaflet', 'dist'), {
  maxAge: '30d',
  immutable: true,
}));

app.get('/health', (_req, res) => res.json({ ok: true, version: '1.8.1' }));
app.use('/api/auth', auth);
app.use('/api/pilot', pilotReadiness);
app.use('/api/prices', prices);
app.use('/api/listings', listings);
app.use('/api/weather', weather);
app.use('/api/programs', programs);
app.use('/api/user/profile', profile);
app.use('/api/admin/users', adminUsers);
app.use('/api/research', research);
app.use('/api/meta', meta);
app.use('/api/survey', survey);
app.use('/api/chat', chat);
app.use('/api/places', places);
app.use('/api/agro', agro);
app.use('/api/agro/pipeline', agroPipeline);
app.use('/api/tourism', tourism);
app.use('/api/tourism', tourSupport);
app.use('/api/tourism/live', liveTour);

app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (originAllowed(origin)) return callback(null, true);
      return callback(new Error('Socket CORS origin ruxsat etilmagan'));
    },
    credentials: true,
  },
});
app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  socket.on('chat:join', async (rawSpaceId, ack = () => {}) => {
    try {
      const spaceId = Number(rawSpaceId);
      if (!Number.isInteger(spaceId) || spaceId <= 0) return ack({ ok: false, error: 'Noto‘g‘ri chat id' });
      const result = await pool.query(
        `SELECT s.visibility, (m.user_id IS NOT NULL) AS is_member
           FROM chat_spaces s
           LEFT JOIN chat_members m ON m.space_id=s.space_id AND m.user_id=$2
          WHERE s.space_id=$1`,
        [spaceId, socket.user.user_id]
      );
      const access = result.rows[0];
      if (!access || (access.visibility === 'private' && !access.is_member)) {
        return ack({ ok: false, error: 'Chatga kirish ruxsati yo‘q' });
      }
      socket.join(`space:${spaceId}`);
      ack({ ok: true });
    } catch (error) {
      console.error(error);
      ack({ ok: false, error: 'Socket xatosi' });
    }
  });

  socket.on('chat:leave', (rawSpaceId) => {
    const spaceId = Number(rawSpaceId);
    if (Number.isInteger(spaceId) && spaceId > 0) socket.leave(`space:${spaceId}`);
  });

  socket.on('chat:typing', (payload = {}) => {
    const spaceId = Number(payload.space_id);
    const room = `space:${spaceId}`;
    if (!Number.isInteger(spaceId) || !socket.rooms.has(room)) return;
    socket.to(room).emit('chat:typing', {
      space_id: spaceId,
      user_id: socket.user.user_id,
      active: Boolean(payload.active),
    });
  });
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`API + chat + maps + agro ML + Live GPS AI tourism + MapLibre 3D buildings + Playmobile-ready OTP + Research Pilot Architecture + split PII Vault TLS controls v1.8.1 on Node 22 listening on http://localhost:${port}`));

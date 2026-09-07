require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const auth = require('./routes/auth');
const prices = require('./routes/prices');
const listings = require('./routes/listings');
const weather = require('./routes/weather');
const programs = require('./routes/programs');
const profile = require('./routes/profile');
const research = require('./routes/research');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin ruxsat etilmagan'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 180 }));

app.get('/health', (_req, res) => res.json({ ok: true, version: '0.1.0' }));
app.use('/api/auth', auth);
app.use('/api/prices', prices);
app.use('/api/listings', listings);
app.use('/api/weather', weather);
app.use('/api/programs', programs);
app.use('/api/user/profile', profile);
app.use('/api/research', research);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));

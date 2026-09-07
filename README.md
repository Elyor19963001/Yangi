# Qishloq Raqamli Platformasi — PhD Research MVP

PhD dissertatsiyasining III bob, 3.2-rejasi uchun ishlab chiqilayotgan qishloq uy xo‘jaliklari raqamli platformasi. Loyiha GitHub orqali versiyalanadi va Railway’da joylashtirish uchun tayyorlangan.

## Hozirgi bosqich
Backend MVP v0.1:
- telefon + OTP registratsiya;
- research consent va `study_id`;
- bozor narxlari API;
- marketplace CRUD;
- tuman bo‘yicha ob-havo API;
- davlat dasturlari katalogi;
- consent-aware research event logging;
- admin metrics va CSV export;
- PostgreSQL schema va migration;
- Railway healthcheck va pre-deploy migration.

## Texnologiya
- Node.js 20+
- Express
- PostgreSQL
- JWT
- OpenWeatherMap API
- Railway Railpack

## Railway deployment
Backend service uchun Root Directory: `/server`

Kerakli environment variables:
- `DATABASE_URL` — Railway PostgreSQL service’dan reference variable
- `JWT_SECRET` — uzun random secret
- `ADMIN_KEY` — research admin/export endpointlari uchun secret
- `DEV_MODE=false` — production/pilot uchun
- `SEED_DEMO=false` — productionda demo ma’lumotlarni kiritmaslik uchun
- `OPENWEATHER_API_KEY` — real ob-havo uchun
- `CLIENT_ORIGIN` — frontend public domain

`server/railway.json` quyidagilarni avtomatlashtiradi:
- `npm run db:migrate` pre-deploy command;
- `npm start` start command;
- `/health` healthcheck;
- failed deployment uchun restart policy.

## Lokal ishga tushirish
```bash
cd server
cp .env.example .env
npm install
npm run db:migrate
npm start
```

Health endpoint:
```text
GET /health
```

## Ilmiy dizayn bo‘yicha muhim qoida
Platformadagi analytics faqat research consent mavjud bo‘lgan foydalanuvchilar uchun yoziladi. Telefon raqami research event payloadlarida saqlanmaydi; empirik tahlil uchun pseudonymous `study_id` ishlatiladi.

## Keyingi sprint
1. Railway PostgreSQL + backend production deploy
2. Samarqandning real 14 tumanini seed qilish
3. Expo/React Native frontendni GitHubga qo‘shish
4. Admin research dashboard
5. Baseline/midline/endline survey linkage
6. Stata/R uchun tayyor export formatlari

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clampText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeAmount(raw, hasMing) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return hasMing ? n * 1000 : n;
}

async function extractPriceSignal(message, space) {
  const text = String(message || '').trim();
  if (!text) return null;
  const products = await pool.query('SELECT product_id, name FROM products ORDER BY length(name) DESC');
  const lower = text.toLocaleLowerCase('uz-UZ');
  const product = products.rows.find((row) => lower.includes(String(row.name).toLocaleLowerCase('uz-UZ')));
  if (!product) return null;

  const pricePattern = /(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(ming)?(?:\s*(?:so['’`]?m|sum|uzs))?(?:\s*[-–—]\s*(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(ming)?)?(?:\s*(?:so['’`]?m|sum|uzs))?(?:\s*\/?\s*(kg|dona|tonna|litr))?/i;
  const match = text.match(pricePattern);
  if (!match) return null;
  const min = normalizeAmount(match[1], Boolean(match[2]));
  const max = match[3] ? normalizeAmount(match[3], Boolean(match[4])) : min;
  if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max <= 0) return null;

  const marketMatch = text.match(/([A-Za-zÀ-žʻʼ‘’`'\-\s]{2,60})\s+bozor(?:i|ida|da|dan)?/i);
  const unit = match[5] || (/(kg|kilogram)/i.test(text) ? 'kg' : null);
  const currencyMentioned = /so['’`]?m|sum|uzs|ming/i.test(text);
  let confidence = 0.62;
  if (unit) confidence += 0.08;
  if (marketMatch) confidence += 0.10;
  if (currencyMentioned) confidence += 0.10;
  if (space.district_id) confidence += 0.05;
  confidence = Math.min(0.95, confidence);

  return {
    product_id: product.product_id,
    product_text: product.name,
    price_min: Math.min(min, max),
    price_max: Math.max(min, max),
    unit: unit || 'kg',
    market_text: marketMatch ? marketMatch[1].trim().slice(-80) + ' bozori' : null,
    district_id: space.district_id || null,
    confidence,
  };
}

async function accessForUser(userId, spaceId) {
  const result = await pool.query(
    `SELECT s.*, m.role AS my_role, (m.user_id IS NOT NULL) AS is_member
       FROM chat_spaces s
       LEFT JOIN chat_members m ON m.space_id=s.space_id AND m.user_id=$2
      WHERE s.space_id=$1`,
    [spaceId, userId]
  );
  return result.rows[0] || null;
}

async function messageById(messageId) {
  const result = await pool.query(
    `SELECT m.message_id, m.space_id, m.sender_id, m.body, m.reply_to_message_id, m.created_at, m.edited_at,
            COALESCE(NULLIF(u.full_name,''), 'Foydalanuvchi') AS sender_name,
            rm.body AS reply_body,
            COALESCE(NULLIF(ru.full_name,''), 'Foydalanuvchi') AS reply_sender_name,
            ps.signal_id, ps.product_text, ps.price_min, ps.price_max, ps.unit, ps.market_text, ps.confidence, ps.status AS signal_status
       FROM chat_messages m
       JOIN users u ON u.user_id=m.sender_id
       LEFT JOIN chat_messages rm ON rm.message_id=m.reply_to_message_id AND rm.deleted_at IS NULL
       LEFT JOIN users ru ON ru.user_id=rm.sender_id
       LEFT JOIN chat_price_signals ps ON ps.message_id=m.message_id
      WHERE m.message_id=$1 AND m.deleted_at IS NULL`,
    [messageId]
  );
  return result.rows[0] || null;
}

router.get('/spaces', asyncHandler(async (req, res) => {
  const type = ['group', 'channel'].includes(req.query.type) ? req.query.type : null;
  const mine = req.query.mine === '1';
  const search = clampText(req.query.search, 80);
  const districtId = int(req.query.district_id);
  const result = await pool.query(
    `SELECT s.space_id, s.space_type, s.visibility, s.name, s.description, s.avatar_emoji,
            s.district_id, s.created_by, s.created_at,
            m.role AS my_role, (m.user_id IS NOT NULL) AS is_member,
            (SELECT COUNT(*)::int FROM chat_members cm WHERE cm.space_id=s.space_id) AS member_count,
            (SELECT body FROM chat_messages msg WHERE msg.space_id=s.space_id AND msg.deleted_at IS NULL ORDER BY msg.message_id DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM chat_messages msg WHERE msg.space_id=s.space_id AND msg.deleted_at IS NULL ORDER BY msg.message_id DESC LIMIT 1) AS last_message_at
       FROM chat_spaces s
       LEFT JOIN chat_members m ON m.space_id=s.space_id AND m.user_id=$1
      WHERE (s.visibility='public' OR m.user_id IS NOT NULL)
        AND ($2::text IS NULL OR s.space_type=$2)
        AND ($3::boolean=FALSE OR m.user_id IS NOT NULL)
        AND ($4::text='' OR s.name ILIKE '%' || $4 || '%' OR COALESCE(s.description,'') ILIKE '%' || $4 || '%')
        AND ($5::int IS NULL OR s.district_id=$5 OR s.district_id IS NULL)
      ORDER BY COALESCE((SELECT MAX(msg.message_id) FROM chat_messages msg WHERE msg.space_id=s.space_id),0) DESC, s.created_at DESC
      LIMIT 200`,
    [req.user.user_id, type, mine, search, districtId]
  );
  res.json(result.rows);
}));

router.post('/spaces', asyncHandler(async (req, res) => {
  const name = clampText(req.body.name, 100);
  const description = clampText(req.body.description, 500) || null;
  const spaceType = ['group', 'channel'].includes(req.body.space_type) ? req.body.space_type : null;
  const visibility = ['public', 'private'].includes(req.body.visibility) ? req.body.visibility : 'public';
  const districtId = int(req.body.district_id);
  const avatarEmoji = clampText(req.body.avatar_emoji, 16) || (spaceType === 'channel' ? '📢' : '💬');
  if (!spaceType) return res.status(400).json({ error: 'space_type group yoki channel bo‘lishi kerak' });
  if (name.length < 2) return res.status(400).json({ error: 'Nom kamida 2 ta belgidan iborat bo‘lsin' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inviteCode = crypto.randomBytes(18).toString('base64url');
    const created = await client.query(
      `INSERT INTO chat_spaces (space_type, visibility, name, description, avatar_emoji, district_id, created_by, invite_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [spaceType, visibility, name, description, avatarEmoji, districtId, req.user.user_id, inviteCode]
    );
    const space = created.rows[0];
    await client.query(`INSERT INTO chat_members (space_id, user_id, role) VALUES ($1,$2,'owner')`, [space.space_id, req.user.user_id]);
    await client.query('COMMIT');
    res.status(201).json({ ...space, my_role: 'owner', is_member: true, member_count: 1 });
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}));

router.get('/spaces/:spaceId', asyncHandler(async (req, res) => {
  const spaceId = int(req.params.spaceId);
  if (!spaceId) return res.status(400).json({ error: 'Noto‘g‘ri space id' });
  const access = await accessForUser(req.user.user_id, spaceId);
  if (!access || (access.visibility === 'private' && !access.is_member)) return res.status(404).json({ error: 'Guruh yoki kanal topilmadi' });
  const members = await pool.query('SELECT COUNT(*)::int AS n FROM chat_members WHERE space_id=$1', [spaceId]);
  res.json({ ...access, member_count: members.rows[0].n, invite_code: ['owner','admin'].includes(access.my_role) ? access.invite_code : null });
}));

router.post('/spaces/:spaceId/join', asyncHandler(async (req, res) => {
  const spaceId = int(req.params.spaceId);
  const access = await accessForUser(req.user.user_id, spaceId);
  if (!access) return res.status(404).json({ error: 'Guruh yoki kanal topilmadi' });
  if (access.visibility !== 'public' && !access.is_member) return res.status(403).json({ error: 'Xususiy guruhga taklif havolasi orqali kiring' });
  await pool.query(`INSERT INTO chat_members (space_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [spaceId, req.user.user_id]);
  res.json({ ok: true });
}));

router.post('/join-by-invite', asyncHandler(async (req, res) => {
  const code = clampText(req.body.invite_code, 64);
  if (!code) return res.status(400).json({ error: 'Taklif kodi kerak' });
  const found = await pool.query('SELECT space_id FROM chat_spaces WHERE invite_code=$1', [code]);
  if (!found.rows[0]) return res.status(404).json({ error: 'Taklif topilmadi' });
  await pool.query(`INSERT INTO chat_members (space_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [found.rows[0].space_id, req.user.user_id]);
  res.json({ ok: true, space_id: found.rows[0].space_id });
}));

router.delete('/spaces/:spaceId/leave', asyncHandler(async (req, res) => {
  const spaceId = int(req.params.spaceId);
  const membership = await pool.query('SELECT role FROM chat_members WHERE space_id=$1 AND user_id=$2', [spaceId, req.user.user_id]);
  if (!membership.rows[0]) return res.json({ ok: true });
  if (membership.rows[0].role === 'owner') return res.status(400).json({ error: 'Egasi guruhni tark etishdan oldin egalikni topshirishi kerak' });
  await pool.query('DELETE FROM chat_members WHERE space_id=$1 AND user_id=$2', [spaceId, req.user.user_id]);
  res.json({ ok: true });
}));

router.get('/spaces/:spaceId/messages', asyncHandler(async (req, res) => {
  const spaceId = int(req.params.spaceId);
  const before = int(req.query.before);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const access = await accessForUser(req.user.user_id, spaceId);
  if (!access || (access.visibility === 'private' && !access.is_member)) return res.status(404).json({ error: 'Chat topilmadi' });
  const result = await pool.query(
    `SELECT m.message_id, m.space_id, m.sender_id, m.body, m.reply_to_message_id, m.created_at, m.edited_at,
            COALESCE(NULLIF(u.full_name,''), 'Foydalanuvchi') AS sender_name,
            rm.body AS reply_body,
            COALESCE(NULLIF(ru.full_name,''), 'Foydalanuvchi') AS reply_sender_name,
            ps.signal_id, ps.product_text, ps.price_min, ps.price_max, ps.unit, ps.market_text, ps.confidence, ps.status AS signal_status
       FROM chat_messages m
       JOIN users u ON u.user_id=m.sender_id
       LEFT JOIN chat_messages rm ON rm.message_id=m.reply_to_message_id AND rm.deleted_at IS NULL
       LEFT JOIN users ru ON ru.user_id=rm.sender_id
       LEFT JOIN chat_price_signals ps ON ps.message_id=m.message_id
      WHERE m.space_id=$1 AND m.deleted_at IS NULL AND ($2::bigint IS NULL OR m.message_id < $2)
      ORDER BY m.message_id DESC LIMIT $3`,
    [spaceId, before, limit]
  );
  res.json(result.rows.reverse());
}));

router.post('/spaces/:spaceId/messages', asyncHandler(async (req, res) => {
  const spaceId = int(req.params.spaceId);
  const body = clampText(req.body.body, 4000);
  const replyTo = int(req.body.reply_to_message_id);
  if (!body) return res.status(400).json({ error: 'Xabar matni bo‘sh bo‘lmasin' });
  const access = await accessForUser(req.user.user_id, spaceId);
  if (!access || !access.is_member) return res.status(403).json({ error: 'Xabar yozish uchun guruh yoki kanalga qo‘shiling' });
  if (access.space_type === 'channel' && !['owner','admin'].includes(access.my_role)) return res.status(403).json({ error: 'Kanallarda faqat administratorlar xabar joylashtiradi' });
  if (replyTo) {
    const validReply = await pool.query('SELECT 1 FROM chat_messages WHERE message_id=$1 AND space_id=$2 AND deleted_at IS NULL', [replyTo, spaceId]);
    if (!validReply.rows[0]) return res.status(400).json({ error: 'Javob berilayotgan xabar topilmadi' });
  }

  const client = await pool.connect();
  let messageId;
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`INSERT INTO chat_messages (space_id, sender_id, body, reply_to_message_id) VALUES ($1,$2,$3,$4) RETURNING message_id`, [spaceId, req.user.user_id, body, replyTo]);
    messageId = inserted.rows[0].message_id;
    const signal = await extractPriceSignal(body, access);
    if (signal) {
      await client.query(
        `INSERT INTO chat_price_signals (message_id, space_id, product_id, product_text, price_min, price_max, unit, market_text, district_id, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [messageId, spaceId, signal.product_id, signal.product_text, signal.price_min, signal.price_max, signal.unit, signal.market_text, signal.district_id, signal.confidence]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }

  const payload = await messageById(messageId);
  const io = req.app.get('io'); if (io) io.to(`space:${spaceId}`).emit('chat:message', payload);
  res.status(201).json(payload);
}));

router.patch('/messages/:messageId', asyncHandler(async (req, res) => {
  const messageId = int(req.params.messageId);
  const body = clampText(req.body.body, 4000);
  if (!messageId) return res.status(400).json({ error: 'Noto‘g‘ri xabar id' });
  if (!body) return res.status(400).json({ error: 'Xabar matni bo‘sh bo‘lmasin' });
  const found = await pool.query('SELECT message_id, space_id, sender_id FROM chat_messages WHERE message_id=$1 AND deleted_at IS NULL', [messageId]);
  const message = found.rows[0];
  if (!message) return res.status(404).json({ error: 'Xabar topilmadi' });
  if (String(message.sender_id) !== String(req.user.user_id)) return res.status(403).json({ error: 'Faqat o‘zingiz yozgan xabarni tahrirlashingiz mumkin' });
  const access = await accessForUser(req.user.user_id, message.space_id);
  if (!access?.is_member) return res.status(403).json({ error: 'Chatga kirish ruxsati yo‘q' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE chat_messages SET body=$1, edited_at=NOW() WHERE message_id=$2', [body, messageId]);
    await client.query('DELETE FROM chat_price_signals WHERE message_id=$1', [messageId]);
    const signal = await extractPriceSignal(body, access);
    if (signal) {
      await client.query(
        `INSERT INTO chat_price_signals (message_id, space_id, product_id, product_text, price_min, price_max, unit, market_text, district_id, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [messageId, message.space_id, signal.product_id, signal.product_text, signal.price_min, signal.price_max, signal.unit, signal.market_text, signal.district_id, signal.confidence]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }

  const payload = await messageById(messageId);
  const io = req.app.get('io'); if (io) io.to(`space:${message.space_id}`).emit('chat:message-edited', payload);
  res.json(payload);
}));

router.delete('/messages/:messageId', asyncHandler(async (req, res) => {
  const messageId = int(req.params.messageId);
  if (!messageId) return res.status(400).json({ error: 'Noto‘g‘ri xabar id' });
  const found = await pool.query('SELECT message_id, space_id, sender_id FROM chat_messages WHERE message_id=$1 AND deleted_at IS NULL', [messageId]);
  const message = found.rows[0];
  if (!message) return res.status(404).json({ error: 'Xabar topilmadi' });
  const access = await accessForUser(req.user.user_id, message.space_id);
  const canDelete = String(message.sender_id) === String(req.user.user_id) || ['owner','admin'].includes(access?.my_role);
  if (!canDelete) return res.status(403).json({ error: 'Bu xabarni o‘chirish ruxsati yo‘q' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM chat_price_signals WHERE message_id=$1', [messageId]);
    await client.query('UPDATE chat_messages SET deleted_at=NOW() WHERE message_id=$1', [messageId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
  const payload = { ok: true, message_id: messageId, space_id: message.space_id };
  const io = req.app.get('io'); if (io) io.to(`space:${message.space_id}`).emit('chat:message-deleted', payload);
  res.json(payload);
}));

router.get('/price-signals', asyncHandler(async (req, res) => {
  const status = ['unverified','verified','rejected'].includes(req.query.status) ? req.query.status : null;
  const result = await pool.query(
    `SELECT ps.signal_id, ps.message_id, ps.space_id, s.name AS space_name, s.space_type,
            ps.product_text, ps.price_min, ps.price_max, ps.unit, ps.market_text, ps.confidence, ps.status, ps.extracted_at,
            d.name AS district_name
       FROM chat_price_signals ps
       JOIN chat_spaces s ON s.space_id=ps.space_id
       LEFT JOIN chat_members cm ON cm.space_id=s.space_id AND cm.user_id=$1
       LEFT JOIN districts d ON d.district_id=ps.district_id
      WHERE (s.visibility='public' OR cm.user_id IS NOT NULL)
        AND ($2::text IS NULL OR ps.status=$2)
      ORDER BY ps.extracted_at DESC LIMIT 200`,
    [req.user.user_id, status]
  );
  res.json(result.rows);
}));

module.exports = router;

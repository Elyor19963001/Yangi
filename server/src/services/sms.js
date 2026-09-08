const axios = require('axios');
const crypto = require('crypto');

const PLAYMOBILE_DEFAULT_URL = 'https://send.smsxabar.uz/broker-api/send';

function devMode() {
  return String(process.env.DEV_MODE || '').toLowerCase() === 'true';
}

function smsProvider() {
  return String(process.env.SMS_PROVIDER || 'playmobile').trim().toLowerCase();
}

function playmobileConfig() {
  return {
    url: String(process.env.PLAYMOBILE_API_URL || PLAYMOBILE_DEFAULT_URL).trim(),
    username: String(process.env.PLAYMOBILE_USERNAME || '').trim(),
    password: String(process.env.PLAYMOBILE_PASSWORD || ''),
    originator: String(process.env.PLAYMOBILE_ORIGINATOR || '').trim(),
  };
}

function smsReadiness() {
  const provider = smsProvider();
  if (devMode()) {
    return {
      mode: 'dev',
      provider,
      configured: true,
      status_callback_configured: Boolean(process.env.PLAYMOBILE_STATUS_SECRET),
    };
  }

  if (provider !== 'playmobile') {
    return {
      mode: 'sms',
      provider,
      configured: false,
      status_callback_configured: false,
      reason: 'unsupported_provider',
    };
  }

  const config = playmobileConfig();
  return {
    mode: 'sms',
    provider,
    configured: Boolean(config.url && config.username && config.password && config.originator),
    status_callback_configured: Boolean(process.env.PLAYMOBILE_STATUS_SECRET),
  };
}

function buildMessageId() {
  const stamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return `qrp-${stamp}-${random}`.slice(0, 40);
}

function normalizeRecipient(phone) {
  const normalized = String(phone || '').replace(/\D/g, '');
  if (!/^998\d{9}$/.test(normalized)) throw new Error('Playmobile recipient formati noto‘g‘ri');
  return normalized;
}

async function sendOtpSms(phone, otp, messageId = buildMessageId()) {
  if (devMode()) {
    return { provider: 'dev', messageId, accepted: true, mode: 'dev' };
  }

  const provider = smsProvider();
  if (provider !== 'playmobile') {
    const error = new Error('SMS provider qo‘llab-quvvatlanmaydi');
    error.code = 'SMS_PROVIDER_UNSUPPORTED';
    throw error;
  }

  const config = playmobileConfig();
  if (!config.url || !config.username || !config.password || !config.originator) {
    const error = new Error('Playmobile konfiguratsiyasi to‘liq emas');
    error.code = 'SMS_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  if (config.originator.length > 11) {
    const error = new Error('PLAYMOBILE_ORIGINATOR 11 belgidan oshmasligi kerak');
    error.code = 'SMS_ORIGINATOR_INVALID';
    throw error;
  }

  const recipient = normalizeRecipient(phone);
  const text = `Qishloq Raqamli Platformasi. Tasdiqlash kodi: ${otp}. Kod 10 daqiqa amal qiladi.`;

  try {
    const response = await axios.post(
      config.url,
      {
        messages: [
          {
            recipient,
            'message-id': messageId,
            sms: {
              originator: config.originator,
              content: { text },
            },
          },
        ],
      },
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        timeout: 12_000,
        validateStatus: (status) => status >= 200 && status < 300,
      }
    );

    return {
      provider: 'playmobile',
      messageId,
      accepted: true,
      mode: 'sms',
      providerResponse: typeof response.data === 'string' ? response.data.slice(0, 160) : null,
    };
  } catch (cause) {
    const error = new Error('SMS yuborishda Playmobile xatosi');
    error.code = 'SMS_SEND_FAILED';
    error.httpStatus = cause.response?.status || null;
    error.providerErrorCode = cause.response?.data?.error_code || null;
    error.providerDescription = cause.response?.data?.error_description || null;
    throw error;
  }
}

function statusSecretMatches(req) {
  const expected = String(process.env.PLAYMOBILE_STATUS_SECRET || '');
  if (!expected) return false;
  const supplied = String(req.get('x-sms-status-token') || req.query.token || '');
  if (!supplied || supplied.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = {
  buildMessageId,
  devMode,
  sendOtpSms,
  smsReadiness,
  statusSecretMatches,
};

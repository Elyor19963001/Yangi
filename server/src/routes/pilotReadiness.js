const express = require('express');
const { smsReadiness, devMode } = require('../services/sms');

const router = express.Router();

function flag(name, expected) {
  const value = String(process.env[name] || '').toLowerCase();
  return value === String(expected).toLowerCase();
}

router.get('/readiness', (_req, res) => {
  const sms = smsReadiness();
  const checks = {
    node_env_production: flag('NODE_ENV', 'production'),
    database_configured: Boolean(process.env.DATABASE_URL),
    jwt_configured: Boolean(process.env.JWT_SECRET),
    dev_mode_disabled: !devMode(),
    demo_seed_disabled: !flag('SEED_DEMO', 'true'),
    sms_provider_configured: Boolean(sms.configured) && sms.mode === 'sms',
    sms_status_callback_configured: Boolean(sms.status_callback_configured),
  };

  const requiredForCitizenPilot = [
    'node_env_production',
    'database_configured',
    'jwt_configured',
    'dev_mode_disabled',
    'demo_seed_disabled',
    'sms_provider_configured',
    'sms_status_callback_configured',
  ];

  const failed = requiredForCitizenPilot.filter((key) => !checks[key]);
  res.json({
    ok: true,
    version: '1.6.1',
    pilot_ready: failed.length === 0,
    otp_mode: sms.mode,
    sms_provider: sms.provider,
    checks,
    failed_checks: failed,
    note: failed.length
      ? 'Real respondent pilotini boshlashdan oldin failed_checks bandlarini yopish kerak.'
      : 'Texnik pilot readiness tekshiruvlari o‘tdi. Dala acceptance testi va institutsional talablar alohida tekshiriladi.',
  });
});

module.exports = router;

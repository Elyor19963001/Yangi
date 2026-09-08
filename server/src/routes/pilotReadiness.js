const express = require('express');
const { smsReadiness, devMode } = require('../services/sms');
const {
  legacyPiiCount,
  piiConnectionOk,
  piiReadiness,
} = require('../services/identityVault');

const router = express.Router();

function flag(name, expected) {
  const value = String(process.env[name] || '').toLowerCase();
  return value === String(expected).toLowerCase();
}

router.get('/readiness', async (req, res, next) => {
  try {
    const sms = smsReadiness();
    const pii = piiReadiness();
    const [piiConnection, legacyCount] = await Promise.all([
      piiConnectionOk(),
      legacyPiiCount(),
    ]);

    const checks = {
      node_env_production: flag('NODE_ENV', 'production'),
      database_configured: Boolean(process.env.DATABASE_URL),
      jwt_configured: Boolean(process.env.JWT_SECRET),
      dev_mode_disabled: !devMode(),
      demo_seed_disabled: !flag('SEED_DEMO', 'true'),
      sms_provider_configured: Boolean(sms.configured) && sms.mode === 'sms',
      sms_status_callback_configured: Boolean(sms.status_callback_configured),
      pii_vault_external: Boolean(pii.external),
      pii_vault_connection_ok: Boolean(piiConnection),
      pii_residency_declared_uz: Boolean(pii.residency_declared_uz),
      legacy_research_db_pii_scrubbed: legacyCount === 0,
    };

    const requiredForCitizenPilot = [
      'node_env_production',
      'database_configured',
      'jwt_configured',
      'dev_mode_disabled',
      'demo_seed_disabled',
      'sms_provider_configured',
      'sms_status_callback_configured',
      'pii_vault_external',
      'pii_vault_connection_ok',
      'pii_residency_declared_uz',
      'legacy_research_db_pii_scrubbed',
    ];

    const failed = requiredForCitizenPilot.filter((key) => !checks[key]);
    res.json({
      ok: true,
      version: '1.8.0',
      pilot_ready: failed.length === 0,
      otp_mode: sms.mode,
      sms_provider: sms.provider,
      pii: {
        mode: pii.mode,
        residency_declared: pii.residency_declared,
        region_label: pii.region_label,
        legacy_pii_records_in_research_db: legacyCount,
        note: 'PII_DATA_RESIDENCY va PII_VAULT_REGION operator tomonidan deklaratsiya qilinadi; hosting joylashuvini ilova mustaqil tasdiqlamaydi.',
      },
      checks,
      failed_checks: failed,
      note: failed.length
        ? 'Real respondent pilotini boshlashdan oldin failed_checks bandlarini yopish kerak.'
        : 'Texnik pilot readiness tekshiruvlari o‘tdi. Dala acceptance testi, huquqiy va institutsional talablar alohida tekshiriladi.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const { pool } = require('../config/db');

function recordOrigin() {
  const dev = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  const seeded = String(process.env.SEED_DEMO || '').toLowerCase() === 'true';
  return dev || seeded ? 'demo' : 'pilot';
}

async function logActivity({ userId, studyId, actionType, feature, metadata = {} }) {
  if (!userId) return;
  await pool.query(
    `INSERT INTO user_activity (user_id, study_id, action_type, feature, metadata, record_origin)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [userId, studyId || null, actionType, feature || null, JSON.stringify(metadata), recordOrigin()]
  );
}

function activity(actionType, feature) {
  return async function activityMiddleware(req, _res, next) {
    try {
      if (req.user?.user_id && req.user?.consent_analytics) {
        await logActivity({
          userId: req.user.user_id,
          studyId: req.user.study_id,
          actionType,
          feature,
          metadata: { method: req.method, path: req.path },
        });
      }
    } catch (err) {
      console.error('activity log error:', err.message);
    }
    next();
  };
}

module.exports = { activity, logActivity, recordOrigin };

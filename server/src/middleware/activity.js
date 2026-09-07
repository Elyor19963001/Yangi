const { pool } = require('../config/db');

async function logActivity({ userId, studyId, actionType, feature, metadata = {} }) {
  if (!userId) return;
  await pool.query(
    `INSERT INTO user_activity (user_id, study_id, action_type, feature, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId, studyId || null, actionType, feature || null, JSON.stringify(metadata)]
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

module.exports = { activity, logActivity };

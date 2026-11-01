const { neon } = require('@neondatabase/serverless');

/**
 * Checks if a string contains email patterns or obvious PII.
 */
function containsPersonalInfo(str) {
  if (typeof str !== 'string') return false;
  // Standard email regex
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(str)) {
    return true;
  }
  return false;
}

/**
 * Sanitizes and enforces anonymous public handle format (e.g. HANDLE#TAG).
 */
function sanitizeHandle(rawHandle) {
  if (!rawHandle || typeof rawHandle !== 'string') return 'ANON#0000';
  const trimmed = rawHandle.trim();
  if (containsPersonalInfo(trimmed)) {
    return 'ANON#0000';
  }
  // Keep only alphanumeric characters, #, hyphens, and underscores up to 32 chars
  const sanitized = trimmed.replace(/[^\w#\-]/g, '').slice(0, 32);
  return sanitized || 'ANON#0000';
}

/**
 * Sanitizes general string fields (e.g. song title, stake, voice part).
 */
function sanitizeText(raw, maxLen = 120) {
  if (!raw || typeof raw !== 'string') return '';
  if (containsPersonalInfo(raw)) return '';
  return raw.trim().replace(/[<>]/g, '').slice(0, maxLen);
}

/**
 * Ensures table and indexes exist in Neon Postgres.
 */
let schemaEnsured = false;
async function ensureSchema(sql) {
  if (schemaEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id SERIAL PRIMARY KEY,
      session_id TEXT UNIQUE,
      handle TEXT NOT NULL,
      stake TEXT,
      voice_part TEXT NOT NULL,
      song_title TEXT,
      duration_minutes NUMERIC NOT NULL DEFAULT 0,
      sheet_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_practice_sessions_sheet_hash ON practice_sessions(sheet_hash);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_practice_sessions_stake ON practice_sessions(stake);
  `;
  schemaEnsured = true;
}

module.exports = async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  const sessions = Array.isArray(body)
    ? body
    : (body && Array.isArray(body.sessions))
      ? body.sessions
      : [];

  if (sessions.length === 0) {
    return res.status(200).json({ success: true, inserted: 0, message: 'No sessions to sync' });
  }

  // Enforce zero-leak strict privacy: reject payloads that explicitly carry personal names or emails
  const disallowedKeys = ['email', 'fullname', 'full_name', 'name', 'phone', 'phonenumber', 'address', 'realname'];
  for (const item of sessions) {
    for (const key of Object.keys(item)) {
      if (disallowedKeys.includes(key.toLowerCase()) && item[key]) {
        return res.status(400).json({
          error: 'Privacy violation: Personal names, full names, or emails are strictly prohibited.'
        });
      }
    }
    if (containsPersonalInfo(item.handle) || containsPersonalInfo(item.song_title) || containsPersonalInfo(item.songTitle)) {
      return res.status(400).json({
        error: 'Privacy violation: Email address detected in session payload.'
      });
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_URL environment variable is not configured'
    });
  }

  try {
    const sql = neon(databaseUrl);
    await ensureSchema(sql);

    let insertedCount = 0;
    for (const raw of sessions) {
      const sessionId = sanitizeText(raw.session_id || raw.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, 64);
      const handle = sanitizeHandle(raw.handle);
      const stake = sanitizeText(raw.stake || 'Unassigned Stake', 100);
      const voicePart = sanitizeText(raw.voice_part || raw.voice || raw.part || 'Tenor', 40);
      const songTitle = sanitizeText(raw.song_title || raw.songTitle || 'General Practice', 150);
      const durationMinutes = Math.max(0.5, Math.min(720, Number(raw.duration_minutes || raw.durationMinutes || raw.duration || 5)));
      const sheetHash = sanitizeText(raw.sheet_hash || raw.sheetHash || 'default', 64);
      const createdAt = raw.created_at || raw.timestamp || new Date().toISOString();

      await sql`
        INSERT INTO practice_sessions (
          session_id,
          handle,
          stake,
          voice_part,
          song_title,
          duration_minutes,
          sheet_hash,
          created_at
        ) VALUES (
          ${sessionId},
          ${handle},
          ${stake},
          ${voicePart},
          ${songTitle},
          ${durationMinutes},
          ${sheetHash},
          ${createdAt}
        )
        ON CONFLICT (session_id) DO NOTHING;
      `;
      insertedCount++;
    }

    return res.status(200).json({
      success: true,
      inserted: insertedCount
    });
  } catch (err) {
    console.error('[Neon Sync] Error executing insert:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync practice sessions to database',
      details: err.message
    });
  }
};

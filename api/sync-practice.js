import { neon } from '@neondatabase/serverless';

let schemaEnsured = false;
async function ensureSchema(sql) {
  if (schemaEnsured) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id SERIAL PRIMARY KEY,
        handle TEXT NOT NULL,
        stake TEXT,
        voice_part TEXT,
        song_title TEXT,
        duration_minutes NUMERIC DEFAULT 0,
        sheet_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_practice_sessions_sheet_stake ON practice_sessions(sheet_hash, stake);
    `;
    schemaEnsured = true;
  } catch (e) {
    console.warn('Could not auto-create schema:', e.message);
  }
}

export default async function handler(req, res) {
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

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured' });
  }

  const sql = neon(dbUrl);
  await ensureSchema(sql);

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const sessions = Array.isArray(body)
    ? body
    : (body && Array.isArray(body.sessions))
      ? body.sessions
      : null;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({ error: 'No sessions provided' });
  }

  try {
    for (const s of sessions) {
      const rawDur = s.duration_minutes !== undefined ? s.duration_minutes : (s.durationMinutes !== undefined ? s.durationMinutes : (s.duration || s.minutes || 5));
      const cleanDuration = Math.max(1, Math.round(parseFloat(rawDur) || 0));
      await sql`
        INSERT INTO practice_sessions (
          handle, stake, voice_part, song_title, duration_minutes, sheet_hash, created_at
        ) VALUES (
          ${s.handle || 'ANON#0000'}, 
          ${s.stake || 'Unassigned Stake'}, 
          ${s.voice_part || s.voice || 'Tenor'}, 
          ${s.song_title || s.songTitle || 'General Practice'}, 
          ${cleanDuration}, 
          ${s.sheet_hash || s.sheetHash || 'default'}, 
          ${s.created_at || s.timestamp || new Date().toISOString()}
        )
      `;
    }
    return res.status(200).json({ success: true, count: sessions.length });
  } catch (err) {
    console.error('Failed to sync practice logs:', err);
    return res.status(500).json({ error: 'Database insertion failed', details: err.message });
  }
}

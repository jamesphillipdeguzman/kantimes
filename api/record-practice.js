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
        created_at TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'Asia/Manila')
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_practice_sessions_sheet_stake ON practice_sessions(sheet_hash, stake);
    `;
    schemaEnsured = true;
  } catch (e) {
    console.warn('[record-practice.js] Could not auto-create schema:', e.message);
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

  // Support both single session payload and batch { sessions: [...] }
  const sessions = Array.isArray(body)
    ? body
    : (body && Array.isArray(body.sessions))
      ? body.sessions
      : [body];

  try {
    let insertedCount = 0;
    for (const item of sessions) {
      if (!item) continue;
      const {
        handle = 'ANON#0000',
        stake = 'Iloilo Philippines Stake',
        voice_part = 'Tenor',
        voice,
        part,
        song_title,
        songTitle,
        song,
        duration_minutes,
        duration,
        minutes,
        sheet_hash,
        sheetHash
      } = item;

      const durationValue = duration_minutes !== undefined ? duration_minutes : (duration !== undefined ? duration : minutes);
      const cleanDuration = Math.round(parseFloat(durationValue) || 0);
      if (cleanDuration <= 0) {
        continue;
      }

      const cleanHandle = String(handle).trim().toUpperCase();
      const cleanStake = stake || 'Iloilo Philippines Stake';
      const cleanVoicePart = voice_part || voice || part || 'Tenor';
      const cleanSongTitle = song_title || songTitle || song || 'General Practice';
      const cleanSheetHash = sheet_hash || sheetHash || 'sh_wn0peb';

      await sql`
        INSERT INTO practice_sessions (
          handle,
          stake,
          voice_part,
          song_title,
          duration_minutes,
          sheet_hash
        ) VALUES (
          ${cleanHandle},
          ${cleanStake},
          ${cleanVoicePart},
          ${cleanSongTitle},
          ${cleanDuration},
          ${cleanSheetHash}
        )
      `;
      insertedCount++;
    }

    if (insertedCount === 0 && sessions.length > 0) {
      return res.status(400).json({ error: 'Duration must be greater than 0' });
    }

    return res.status(200).json({ success: true, count: insertedCount });
  } catch (err) {
    console.error('Failed to record practice session:', err);
    return res.status(500).json({ error: 'Failed to record practice session', details: err.message });
  }
}


import { neon } from '@neondatabase/serverless';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let schemaEnsured = false;
async function ensureSchema(sql) {
  if (schemaEnsured) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    console.warn('[sync-practice.js] Could not auto-create schema:', e.message);
  }
}

function normalizeTimestamp(raw) {
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

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
    } catch {
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
    const syncedSessions = [];
    for (const s of sessions) {
      if (!s) continue;
      const rawDur = s.duration_minutes !== undefined ? s.duration_minutes : (s.durationMinutes !== undefined ? s.durationMinutes : (s.duration || s.minutes || 0));
      const cleanDuration = Math.round(parseFloat(rawDur) || 0);
      if (cleanDuration <= 0) continue;

      const cleanHandle = String(s.handle || 'ANON#0000').trim().toUpperCase();
      const cleanStake = String(s.stake || 'Unassigned Stake').trim();
      const cleanVoice = String(s.voice_part || s.voice || s.part || 'Tenor').trim();
      const cleanSong = String(s.song_title || s.songTitle || s.song || 'General Practice').trim();
      const cleanSheet = String(s.sheet_hash || s.sheetHash || 'default').trim();
      const cleanCreatedAt = normalizeTimestamp(s.created_at || s.timestamp);
      const cleanId = (typeof s.id === 'string' && UUID_REGEX.test(s.id.trim())) ? s.id.trim() : null;

      let rows = [];
      if (cleanId) {
        rows = await sql`
          INSERT INTO practice_sessions (
            id, handle, stake, voice_part, song_title, duration_minutes, sheet_hash, created_at
          ) VALUES (
            ${cleanId}::uuid,
            ${cleanHandle},
            ${cleanStake},
            ${cleanVoice},
            ${cleanSong},
            ${cleanDuration},
            ${cleanSheet},
            ${cleanCreatedAt}::timestamptz
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING
            id::text AS id,
            UPPER(TRIM(handle)) AS handle,
            stake,
            song_title,
            voice_part,
            duration_minutes::int AS duration_minutes,
            sheet_hash,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        `;
      } else {
        rows = await sql`
          INSERT INTO practice_sessions (
            handle, stake, voice_part, song_title, duration_minutes, sheet_hash, created_at
          ) VALUES (
            ${cleanHandle},
            ${cleanStake},
            ${cleanVoice},
            ${cleanSong},
            ${cleanDuration},
            ${cleanSheet},
            ${cleanCreatedAt}::timestamptz
          )
          RETURNING
            id::text AS id,
            UPPER(TRIM(handle)) AS handle,
            stake,
            song_title,
            voice_part,
            duration_minutes::int AS duration_minutes,
            sheet_hash,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        `;
      }
      if (rows.length > 0) syncedSessions.push(rows[0]);
    }
    return res.status(200).json({ success: true, count: syncedSessions.length, sessions: syncedSessions });
  } catch (err) {
    console.error('Failed to sync practice logs:', err);
    return res.status(500).json({ error: 'Database insertion failed', details: err.message });
  }
}

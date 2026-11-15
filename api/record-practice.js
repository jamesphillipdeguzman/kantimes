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
    await sql`
      CREATE INDEX IF NOT EXISTS idx_practice_sessions_handle ON practice_sessions(UPPER(TRIM(handle)));
    `;
    schemaEnsured = true;
  } catch (e) {
    console.warn('[record-practice.js] Could not auto-create schema:', e.message);
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
      : [body];

  try {
    const insertedSessions = [];
    let processedCount = 0;

    for (const item of sessions) {
      if (!item) continue;
      const {
        id,
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
        sheetHash,
        created_at,
        timestamp
      } = item;

      const durationValue = duration_minutes !== undefined ? duration_minutes : (duration !== undefined ? duration : minutes);
      const cleanDuration = Math.round(parseFloat(durationValue) || 0);
      if (cleanDuration <= 0) {
        continue;
      }

      const cleanHandle = String(handle).trim().toUpperCase();
      if (!cleanHandle) continue;

      const cleanStake = String(stake || 'Iloilo Philippines Stake').trim();
      const cleanVoicePart = String(voice_part || voice || part || 'Tenor').trim();
      const cleanSongTitle = String(song_title || songTitle || song || 'General Practice').trim();
      const cleanSheetHash = String(sheet_hash || sheetHash || 'sh_wn0peb').trim();
      const cleanCreatedAt = normalizeTimestamp(created_at || timestamp);
      const cleanId = (typeof id === 'string' && UUID_REGEX.test(id.trim())) ? id.trim() : null;

      let rows = [];
      if (cleanId) {
        rows = await sql`
          INSERT INTO practice_sessions (
            id, handle, stake, voice_part, song_title, duration_minutes, sheet_hash, created_at
          ) VALUES (
            ${cleanId}::uuid,
            ${cleanHandle},
            ${cleanStake},
            ${cleanVoicePart},
            ${cleanSongTitle},
            ${cleanDuration},
            ${cleanSheetHash},
            ${cleanCreatedAt}::timestamptz
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING
            id::text AS id,
            UPPER(TRIM(handle)) AS handle,
            stake,
            song_title AS title,
            song_title,
            voice_part AS voice,
            voice_part,
            duration_minutes::int AS duration,
            duration_minutes::int AS duration_minutes,
            sheet_hash,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        `;
        if (rows.length === 0) {
          // Already exists — fetch existing row so caller gets confirmed server record idempotently
          rows = await sql`
            SELECT
              id::text AS id,
              UPPER(TRIM(handle)) AS handle,
              stake,
              song_title AS title,
              song_title,
              voice_part AS voice,
              voice_part,
              duration_minutes::int AS duration,
              duration_minutes::int AS duration_minutes,
              sheet_hash,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
            FROM practice_sessions
            WHERE id = ${cleanId}::uuid
            LIMIT 1
          `;
        }
      } else {
        rows = await sql`
          INSERT INTO practice_sessions (
            handle, stake, voice_part, song_title, duration_minutes, sheet_hash, created_at
          ) VALUES (
            ${cleanHandle},
            ${cleanStake},
            ${cleanVoicePart},
            ${cleanSongTitle},
            ${cleanDuration},
            ${cleanSheetHash},
            ${cleanCreatedAt}::timestamptz
          )
          RETURNING
            id::text AS id,
            UPPER(TRIM(handle)) AS handle,
            stake,
            song_title AS title,
            song_title,
            voice_part AS voice,
            voice_part,
            duration_minutes::int AS duration,
            duration_minutes::int AS duration_minutes,
            sheet_hash,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        `;
      }

      if (rows.length > 0) {
        insertedSessions.push(rows[0]);
      }
      processedCount++;
    }

    if (processedCount === 0 && sessions.length > 0) {
      return res.status(400).json({ error: 'Duration must be greater than 0' });
    }

    return res.status(200).json({
      success: true,
      count: insertedSessions.length,
      session: insertedSessions[0] || null,
      sessions: insertedSessions
    });
  } catch (err) {
    console.error('Failed to record practice session:', err);
    return res.status(500).json({ error: 'Failed to record practice session', details: err.message });
  }
}

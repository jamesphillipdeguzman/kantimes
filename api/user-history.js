import { neon } from '@neondatabase/serverless';

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
    schemaEnsured = true;
  } catch (e) {
    console.warn('[user-history.js] Could not auto-create schema:', e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { handle } = req.query || {};
  if (!handle || typeof handle !== 'string' || !handle.trim()) {
    return res.status(400).json({ error: 'Missing handle parameter' });
  }

  const cleanHandle = handle.trim().toUpperCase();

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured', sessions: [] });
  }

  try {
    const sql = neon(dbUrl);
    await ensureSchema(sql);

    let userProfile = null;
    try {
      const handleRows = await sql`
        SELECT
          UPPER(TRIM(handle)) AS handle,
          primary_voice,
          stake,
          avatar_id,
          sheet_url,
          sheet_id,
          to_char(last_active AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_active
        FROM user_handles
        WHERE UPPER(TRIM(handle)) = ${cleanHandle}
        ORDER BY last_active DESC NULLS LAST
        LIMIT 1
      `;
      if (handleRows && handleRows.length > 0) {
        userProfile = handleRows[0];
      }
    } catch (e) {
      console.warn('[user-history.js] Could not query user_handles:', e.message);
    }

    const sessions = await sql`
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
      WHERE UPPER(TRIM(handle)) = ${cleanHandle}
      ORDER BY created_at DESC
      LIMIT 200
    `;

    const totalMinutes = (sessions || []).reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
    const totalSessions = (sessions || []).length;
    const exists = Boolean(userProfile || totalSessions > 0);

    return res.status(200).json({
      handle: userProfile?.handle || cleanHandle,
      sessions: sessions || [],
      profile: userProfile,
      stats: {
        totalMinutes,
        totalSessions
      },
      serverTime: new Date().toISOString(),
      exists
    });
  } catch (err) {
    console.error('Failed to query user history:', err);
    return res.status(500).json({ error: 'Failed to fetch user history', details: err.message, sessions: [] });
  }
}

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
    schemaEnsured = true;
  } catch (e) {
    console.warn('Could not auto-create schema:', e.message);
  }
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { handle, sheet_hash } = req.query || {};

  if (!handle || typeof handle !== 'string' || !handle.trim()) {
    return res.status(400).json({ error: 'Missing handle parameter' });
  }

  const cleanHandle = handle.trim();
  const cleanSheetHash = (sheet_hash || 'default').trim();

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured', sessions: [] });
  }

  try {
    const sql = neon(dbUrl);
    await ensureSchema(sql);

    // Query recent practice sessions for this handle
    const sessions = await sql`
      SELECT 
        id,
        handle,
        stake,
        voice_part,
        song_title,
        duration_minutes,
        sheet_hash,
        created_at
      FROM practice_sessions
      WHERE handle = ${cleanHandle}
        AND (sheet_hash = ${cleanSheetHash} OR ${cleanSheetHash} = 'default')
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return res.status(200).json({ sessions });
  } catch (err) {
    console.error('Failed to query user history:', err);
    return res.status(500).json({ error: 'Failed to fetch user history', details: err.message });
  }
}

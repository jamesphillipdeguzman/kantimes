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

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured', sectionTotals: [], topRoster: [] });
  }

  const sql = neon(dbUrl);
  await ensureSchema(sql);

  const { sheet_hash, stake } = req.query || {};
  const sheetHash = (sheet_hash || 'default').trim();
  const filterStake = (stake && stake !== 'ALL' && stake.trim() !== '') ? stake.trim() : null;

  try {
    let sectionTotals;
    let topRoster;

    if (filterStake) {
      sectionTotals = await sql`
        SELECT voice_part, SUM(duration_minutes)::int AS total_minutes, COUNT(DISTINCT handle)::int AS active_singers
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash} AND stake = ${filterStake}
        GROUP BY voice_part
      `;

      topRoster = await sql`
        SELECT handle, voice_part, stake, SUM(duration_minutes)::int AS total_minutes
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash} AND stake = ${filterStake}
        GROUP BY handle, voice_part, stake
        ORDER BY total_minutes DESC
        LIMIT 50
      `;
    } else {
      sectionTotals = await sql`
        SELECT voice_part, SUM(duration_minutes)::int AS total_minutes, COUNT(DISTINCT handle)::int AS active_singers
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash}
        GROUP BY voice_part
      `;

      topRoster = await sql`
        SELECT handle, voice_part, stake, SUM(duration_minutes)::int AS total_minutes
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash}
        GROUP BY handle, voice_part, stake
        ORDER BY total_minutes DESC
        LIMIT 50
      `;
    }

    return res.status(200).json({ sectionTotals, topRoster });
  } catch (err) {
    console.error('Failed to query standings:', err);
    return res.status(500).json({ error: 'Failed to retrieve standings', details: err.message });
  }
}

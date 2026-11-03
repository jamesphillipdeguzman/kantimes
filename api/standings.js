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
    console.warn('[standings.js] Could not auto-create schema:', e.message);
  }
}

export default async function handler(req, res) {
  // CORS configuration
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

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured', sectionTotals: [], topRoster: [] });
  }

  const sql = neon(dbUrl);
  await ensureSchema(sql);

  const { sheet_hash, stake, scope } = req.query || {};
  const rawSheet = (sheet_hash || '').trim();
  const rawStake = (stake || '').trim();
  const rawScope = (scope || 'stake').trim().toLowerCase();

  const isAllStakes = rawScope === 'all' || rawStake.toUpperCase() === 'ALL' || !rawStake;
  const filterStake = isAllStakes ? null : rawStake;

  // Repertoire sheet matching:
  // Default/general repertoire includes 'default', 'sh_wn0peb', empty string, or NULL.
  // Never perform strict equality that drops valid records across default/custom sheet hashes.
  const isDefaultOrEmptySheet = !rawSheet || rawSheet === 'default' || rawSheet === 'sh_wn0peb' || rawSheet === 'all';

  try {
    let sectionTotals;
    let topRoster;

    if (filterStake) {
      // Stake-scoped query with flexible, case-insensitive stake matching and relaxed sheet_hash matching
      sectionTotals = await sql`
        SELECT 
          INITCAP(TRIM(voice_part)) AS voice_part, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes, 
          COUNT(DISTINCT UPPER(TRIM(handle)))::int AS active_singers
        FROM practice_sessions
        WHERE (${isDefaultOrEmptySheet} = true OR sheet_hash = ${rawSheet} OR sheet_hash = 'default' OR sheet_hash = 'sh_wn0peb' OR sheet_hash IS NULL OR sheet_hash = '')
          AND (
            LOWER(TRIM(COALESCE(stake, ''))) = LOWER(TRIM(${filterStake}))
            OR LOWER(TRIM(COALESCE(stake, ''))) LIKE LOWER(CONCAT('%', TRIM(${filterStake}), '%'))
            OR LOWER(TRIM(${filterStake})) LIKE LOWER(CONCAT('%', TRIM(COALESCE(stake, '')), '%'))
            OR LOWER(TRIM(COALESCE(stake, ''))) IN ('default stake', 'unassigned stake', '')
          )
        GROUP BY INITCAP(TRIM(voice_part))
      `;

      topRoster = await sql`
        SELECT 
          UPPER(TRIM(handle)) AS handle, 
          INITCAP(TRIM(voice_part)) AS voice_part, 
          COALESCE(stake, 'Independent') AS stake, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes
        FROM practice_sessions
        WHERE (${isDefaultOrEmptySheet} = true OR sheet_hash = ${rawSheet} OR sheet_hash = 'default' OR sheet_hash = 'sh_wn0peb' OR sheet_hash IS NULL OR sheet_hash = '')
          AND (
            LOWER(TRIM(COALESCE(stake, ''))) = LOWER(TRIM(${filterStake}))
            OR LOWER(TRIM(COALESCE(stake, ''))) LIKE LOWER(CONCAT('%', TRIM(${filterStake}), '%'))
            OR LOWER(TRIM(${filterStake})) LIKE LOWER(CONCAT('%', TRIM(COALESCE(stake, '')), '%'))
            OR LOWER(TRIM(COALESCE(stake, ''))) IN ('default stake', 'unassigned stake', '')
          )
        GROUP BY UPPER(TRIM(handle)), INITCAP(TRIM(voice_part)), stake
        ORDER BY total_minutes DESC
        LIMIT 50
      `;
    } else {
      // All Stakes scope query: includes all stakes
      sectionTotals = await sql`
        SELECT 
          INITCAP(TRIM(voice_part)) AS voice_part, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes, 
          COUNT(DISTINCT UPPER(TRIM(handle)))::int AS active_singers
        FROM practice_sessions
        WHERE (${isDefaultOrEmptySheet} = true OR sheet_hash = ${rawSheet} OR sheet_hash = 'default' OR sheet_hash = 'sh_wn0peb' OR sheet_hash IS NULL OR sheet_hash = '')
        GROUP BY INITCAP(TRIM(voice_part))
      `;

      topRoster = await sql`
        SELECT 
          UPPER(TRIM(handle)) AS handle, 
          INITCAP(TRIM(voice_part)) AS voice_part, 
          COALESCE(stake, 'Independent') AS stake, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes
        FROM practice_sessions
        WHERE (${isDefaultOrEmptySheet} = true OR sheet_hash = ${rawSheet} OR sheet_hash = 'default' OR sheet_hash = 'sh_wn0peb' OR sheet_hash IS NULL OR sheet_hash = '')
        GROUP BY UPPER(TRIM(handle)), INITCAP(TRIM(voice_part)), stake
        ORDER BY total_minutes DESC
        LIMIT 50
      `;
    }

    console.log('[DEBUG standings.js]', { query: req.query, totals: sectionTotals, roster: topRoster });

    return res.status(200).json({
      sectionTotals: sectionTotals || [],
      topRoster: topRoster || []
    });
  } catch (err) {
    console.error('Failed to query standings:', err);
    return res.status(500).json({ error: 'Failed to retrieve standings', details: err.message });
  }
}

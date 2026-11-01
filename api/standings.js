import { neon } from '@neondatabase/serverless';

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

  const { sheet_hash, stake, scope } = req.query || {};
  const sheetHash = (sheet_hash || '').trim();
  const filterStake = (stake && stake !== 'ALL' && stake.trim() !== '' && scope !== 'all') ? stake.trim() : null;

  try {
    let sectionTotals;
    let topRoster;

    if (filterStake) {
      // Case-insensitive, trimmed stake comparison
      sectionTotals = await sql`
        SELECT 
          voice_part, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes, 
          COUNT(DISTINCT handle)::int AS active_singers
        FROM practice_sessions
        WHERE (${sheetHash} = '' OR sheet_hash = ${sheetHash} OR sheet_hash = 'default')
          AND LOWER(TRIM(stake)) = LOWER(TRIM(${filterStake}))
        GROUP BY voice_part
      `;

      topRoster = await sql`
        SELECT 
          handle, 
          voice_part, 
          stake, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes
        FROM practice_sessions
        WHERE (${sheetHash} = '' OR sheet_hash = ${sheetHash} OR sheet_hash = 'default')
          AND LOWER(TRIM(stake)) = LOWER(TRIM(${filterStake}))
        GROUP BY handle, voice_part, stake
        ORDER BY total_minutes DESC
        LIMIT 50
      `;
    } else {
      // All Stakes scope
      sectionTotals = await sql`
        SELECT 
          voice_part, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes, 
          COUNT(DISTINCT handle)::int AS active_singers
        FROM practice_sessions
        WHERE (${sheetHash} = '' OR sheet_hash = ${sheetHash} OR sheet_hash = 'default')
        GROUP BY voice_part
      `;

      topRoster = await sql`
        SELECT 
          handle, 
          voice_part, 
          stake, 
          COALESCE(SUM(duration_minutes), 0)::int AS total_minutes
        FROM practice_sessions
        WHERE (${sheetHash} = '' OR sheet_hash = ${sheetHash} OR sheet_hash = 'default')
        GROUP BY handle, voice_part, stake
        ORDER BY total_minutes DESC
        LIMIT 50
      `;
    }

    return res.status(200).json({
      sectionTotals: sectionTotals || [],
      topRoster: topRoster || []
    });
  } catch (err) {
    console.error('Failed to query standings:', err);
    return res.status(500).json({ error: 'Failed to retrieve standings', details: err.message });
  }
}
const { neon } = require('@neondatabase/serverless');

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
  schemaEnsured = true;
}

const DEFAULT_SECTIONS = ['Soprano', 'Alto', 'Tenor', 'Bass', 'Primary'];

module.exports = async function handler(req, res) {
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

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_URL environment variable is not configured',
      standings: []
    });
  }

  const { sheet_hash, stake } = req.query;
  const sheetHash = (sheet_hash || 'default').trim();
  const filterStake = (stake && stake !== 'ALL' && stake.trim() !== '') ? stake.trim() : null;

  try {
    const sql = neon(databaseUrl);
    await ensureSchema(sql);

    // 1. Aggregation Query: voice totals and active singer count
    let sectionRows = [];
    if (filterStake) {
      sectionRows = await sql`
        SELECT 
          voice_part,
          COALESCE(SUM(duration_minutes), 0) as total_minutes,
          COUNT(DISTINCT handle) as active_singers
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash} AND stake = ${filterStake}
        GROUP BY voice_part;
      `;
    } else {
      sectionRows = await sql`
        SELECT 
          voice_part,
          COALESCE(SUM(duration_minutes), 0) as total_minutes,
          COUNT(DISTINCT handle) as active_singers
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash}
        GROUP BY voice_part;
      `;
    }

    // 2. Fetch top anonymous handles grouped by voice part
    let singerRows = [];
    if (filterStake) {
      singerRows = await sql`
        SELECT 
          voice_part,
          handle,
          stake,
          COALESCE(SUM(duration_minutes), 0) as minutes
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash} AND stake = ${filterStake}
        GROUP BY voice_part, handle, stake
        ORDER BY minutes DESC
        LIMIT 200;
      `;
    } else {
      singerRows = await sql`
        SELECT 
          voice_part,
          handle,
          stake,
          COALESCE(SUM(duration_minutes), 0) as minutes
        FROM practice_sessions
        WHERE sheet_hash = ${sheetHash}
        GROUP BY voice_part, handle, stake
        ORDER BY minutes DESC
        LIMIT 200;
      `;
    }

    // Map section results
    const sectionMap = {};
    DEFAULT_SECTIONS.forEach(name => {
      sectionMap[name] = {
        name,
        minutes: 0,
        hours: '0.0',
        singerCount: 0,
        roster: []
      };
    });

    sectionRows.forEach(row => {
      const rawPart = row.voice_part || 'Tenor';
      let matched = DEFAULT_SECTIONS.find(s => s.toLowerCase() === rawPart.toLowerCase());
      if (!matched) {
        if (/soprano/i.test(rawPart)) matched = 'Soprano';
        else if (/alto/i.test(rawPart)) matched = 'Alto';
        else if (/tenor/i.test(rawPart)) matched = 'Tenor';
        else if (/bass/i.test(rawPart)) matched = 'Bass';
        else if (/primary/i.test(rawPart)) matched = 'Primary';
        else matched = rawPart;
      }

      if (!sectionMap[matched]) {
        sectionMap[matched] = {
          name: matched,
          minutes: 0,
          hours: '0.0',
          singerCount: 0,
          roster: []
        };
      }

      const mins = Number(row.total_minutes) || 0;
      sectionMap[matched].minutes += mins;
      sectionMap[matched].hours = (sectionMap[matched].minutes / 60).toFixed(1);
      sectionMap[matched].singerCount += Number(row.active_singers) || 0;
    });

    // Populate roster of top anonymous handles
    singerRows.forEach(row => {
      const rawPart = row.voice_part || 'Tenor';
      let matched = DEFAULT_SECTIONS.find(s => s.toLowerCase() === rawPart.toLowerCase()) || rawPart;
      if (sectionMap[matched]) {
        sectionMap[matched].roster.push({
          handle: row.handle,
          stake: row.stake || 'Independent',
          minutes: Number(row.minutes) || 0
        });
      }
    });

    // Sort standings descending by minutes
    const standings = Object.values(sectionMap).sort((a, b) => b.minutes - a.minutes);

    return res.status(200).json({
      success: true,
      sheet_hash: sheetHash,
      stake: filterStake,
      standings
    });
  } catch (err) {
    console.error('[Neon Standings] Error executing query:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch standings from database',
      details: err.message
    });
  }
};

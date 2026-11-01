import { neon } from '@neondatabase/serverless';

let schemaEnsured = false;
async function ensureSchema(sql) {
  if (schemaEnsured) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_handles (
        handle TEXT PRIMARY KEY,
        primary_voice TEXT,
        stake TEXT,
        avatar_id TEXT,
        last_active TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    schemaEnsured = true;
  } catch (e) {
    console.warn('Could not auto-create user_handles schema:', e.message);
  }
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const handle = req.query?.handle;
    if (!handle || typeof handle !== 'string' || !handle.trim()) {
      return res.status(400).json({ error: 'Handle parameter is required' });
    }
    const cleanHandle = handle.trim();
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
      return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured' });
    }
    try {
      const sql = neon(dbUrl);
      await ensureSchema(sql);
      const rows = await sql`
        SELECT handle, primary_voice, stake, avatar_id, last_active
        FROM user_handles
        WHERE UPPER(handle) = UPPER(${cleanHandle})
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return res.status(200).json({ exists: true, profile: rows[0], ...rows[0] });
      }
      return res.status(200).json({ exists: false, profile: null });
    } catch (err) {
      console.error('Failed to query handle:', err);
      return res.status(500).json({ error: 'Failed to query handle', details: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const { handle, old_handle, primary_voice, stake, avatar_id } = body || {};

  if (!handle || typeof handle !== 'string' || !handle.trim()) {
    return res.status(400).json({ error: 'Handle is required' });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured' });
  }

  const cleanHandle = handle.trim();
  const cleanOldHandle = (typeof old_handle === 'string' && old_handle.trim()) ? old_handle.trim() : null;
  const cleanVoice = (primary_voice || 'Accompanist').trim();
  const cleanStake = (stake || 'Default Stake').trim();
  const cleanAvatar = (avatar_id || 'default').trim();

  try {
    const sql = neon(dbUrl);
    await ensureSchema(sql);

    if (cleanOldHandle && cleanOldHandle !== cleanHandle) {
      // 1. Update the primary key in user_handles
      const updateResult = await sql`
        UPDATE user_handles 
        SET handle = ${cleanHandle}, 
            primary_voice = ${cleanVoice}, 
            stake = ${cleanStake}, 
            avatar_id = ${cleanAvatar}, 
            last_active = NOW()
        WHERE handle = ${cleanOldHandle}
        RETURNING handle
      `;

      // If no row was updated (e.g. initial offline setup), insert or update new handle
      if (!updateResult || updateResult.length === 0) {
        await sql`
          INSERT INTO user_handles (handle, primary_voice, stake, avatar_id, last_active)
          VALUES (${cleanHandle}, ${cleanVoice}, ${cleanStake}, ${cleanAvatar}, NOW())
          ON CONFLICT (handle) 
          DO UPDATE SET 
            primary_voice = EXCLUDED.primary_voice,
            stake = EXCLUDED.stake,
            avatar_id = EXCLUDED.avatar_id,
            last_active = NOW()
        `;
      }

      // 2. Cascade the handle update to past practice sessions
      try {
        await sql`
          UPDATE practice_sessions 
          SET handle = ${cleanHandle} 
          WHERE handle = ${cleanOldHandle}
        `;
      } catch (cascadeErr) {
        console.warn('Practice sessions cascade notice:', cascadeErr.message);
      }

      return res.status(200).json({ success: true, handle: cleanHandle, old_handle: cleanOldHandle });
    } else {
      // Standard Upsert
      await sql`
        INSERT INTO user_handles (handle, primary_voice, stake, avatar_id, last_active)
        VALUES (${cleanHandle}, ${cleanVoice}, ${cleanStake}, ${cleanAvatar}, NOW())
        ON CONFLICT (handle) 
        DO UPDATE SET 
          primary_voice = EXCLUDED.primary_voice,
          stake = EXCLUDED.stake,
          avatar_id = EXCLUDED.avatar_id,
          last_active = NOW()
      `;
      return res.status(200).json({ success: true, handle: cleanHandle });
    }
  } catch (err) {
    console.error('Handle registration error:', err);
    return res.status(500).json({ error: 'Failed to register handle', details: err.message });
  }
}


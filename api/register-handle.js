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
        sheet_url TEXT,
        sheet_id TEXT,
        last_active TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE user_handles ADD COLUMN IF NOT EXISTS sheet_url TEXT;`;
    await sql`ALTER TABLE user_handles ADD COLUMN IF NOT EXISTS sheet_id TEXT;`;
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
    const { handle, tag } = req.query || {};
    const queryHandle = (typeof handle === 'string') ? handle.trim() : '';
    const cleanTag = (typeof tag === 'string') ? tag.trim().replace(/^#/, '') : '';

    if (!queryHandle && !cleanTag) {
      return res.status(400).json({ error: 'Handle or tag parameter is required' });
    }
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
      return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured' });
    }
    try {
      const sql = neon(dbUrl);
      await ensureSchema(sql);

      let rows = [];
      if (queryHandle && cleanTag) {
        rows = await sql`
          SELECT handle, primary_voice, stake, avatar_id, sheet_url, sheet_id, last_active
          FROM user_handles
          WHERE LOWER(TRIM(handle)) = LOWER(TRIM(${queryHandle}))
             OR handle LIKE ${'%' + cleanTag}
          ORDER BY last_active DESC
          LIMIT 1
        `;
      } else if (queryHandle) {
        rows = await sql`
          SELECT handle, primary_voice, stake, avatar_id, sheet_url, sheet_id, last_active
          FROM user_handles
          WHERE LOWER(TRIM(handle)) = LOWER(TRIM(${queryHandle}))
          ORDER BY last_active DESC
          LIMIT 1
        `;
      } else {
        rows = await sql`
          SELECT handle, primary_voice, stake, avatar_id, sheet_url, sheet_id, last_active
          FROM user_handles
          WHERE handle LIKE ${'%' + cleanTag}
          ORDER BY last_active DESC
          LIMIT 1
        `;
      }

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

  const { handle, old_handle, primary_voice, stake, avatar_id, sheet_url, sheet_id } = body || {};

  if (!handle || typeof handle !== 'string' || !handle.trim()) {
    return res.status(400).json({ error: 'Handle is required' });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return res.status(503).json({ error: 'DATABASE_URL or POSTGRES_URL not configured' });
  }

  const cleanHandle = handle.trim();
  const cleanOldHandle = (typeof old_handle === 'string' && old_handle.trim()) ? old_handle.trim() : null;
  const cleanVoice = (primary_voice || 'Tenor').trim();
  const cleanStake = (stake || 'Default Stake').trim();
  const cleanAvatar = (avatar_id || 'default').trim();
  const cleanSheetUrl = (typeof sheet_url === 'string' && sheet_url.trim()) ? sheet_url.trim() : null;
  const cleanSheetId = (typeof sheet_id === 'string' && sheet_id.trim()) ? sheet_id.trim() : null;

  try {
    const sql = neon(dbUrl);
    await ensureSchema(sql);

    if (cleanOldHandle && cleanOldHandle !== cleanHandle) {
      // 1. Update the primary key in user_handles with COALESCE for sheet_url/sheet_id
      const updateResult = await sql`
        UPDATE user_handles 
        SET handle = ${cleanHandle}, 
            primary_voice = ${cleanVoice}, 
            stake = ${cleanStake}, 
            avatar_id = ${cleanAvatar}, 
            sheet_url = COALESCE(${cleanSheetUrl}, sheet_url),
            sheet_id = COALESCE(${cleanSheetId}, sheet_id),
            last_active = NOW()
        WHERE handle = ${cleanOldHandle}
        RETURNING handle
      `;

      // If no row was updated (e.g. initial offline setup), insert or update new handle
      if (!updateResult || updateResult.length === 0) {
        await sql`
          INSERT INTO user_handles (handle, primary_voice, stake, avatar_id, sheet_url, sheet_id, last_active)
          VALUES (${cleanHandle}, ${cleanVoice}, ${cleanStake}, ${cleanAvatar}, ${cleanSheetUrl}, ${cleanSheetId}, NOW())
          ON CONFLICT (handle) 
          DO UPDATE SET 
            primary_voice = EXCLUDED.primary_voice,
            stake = EXCLUDED.stake,
            avatar_id = EXCLUDED.avatar_id,
            sheet_url = COALESCE(EXCLUDED.sheet_url, user_handles.sheet_url),
            sheet_id = COALESCE(EXCLUDED.sheet_id, user_handles.sheet_id),
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
      // Standard Upsert with COALESCE for sheet_url/sheet_id
      await sql`
        INSERT INTO user_handles (handle, primary_voice, stake, avatar_id, sheet_url, sheet_id, last_active)
        VALUES (${cleanHandle}, ${cleanVoice}, ${cleanStake}, ${cleanAvatar}, ${cleanSheetUrl}, ${cleanSheetId}, NOW())
        ON CONFLICT (handle) 
        DO UPDATE SET 
          primary_voice = EXCLUDED.primary_voice,
          stake = EXCLUDED.stake,
          avatar_id = EXCLUDED.avatar_id,
          sheet_url = COALESCE(EXCLUDED.sheet_url, user_handles.sheet_url),
          sheet_id = COALESCE(EXCLUDED.sheet_id, user_handles.sheet_id),
          last_active = NOW()
      `;
      return res.status(200).json({ success: true, handle: cleanHandle });
    }
  } catch (err) {
    console.error('Handle registration error:', err);
    return res.status(500).json({ error: 'Failed to register handle', details: err.message });
  }
}

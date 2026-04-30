import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('fc26companion.db');

// Columnas nuevas para migración automática
const PLAYER_MIGRATIONS = [
  "ADD COLUMN club TEXT DEFAULT ''",
  "ADD COLUMN league TEXT DEFAULT ''",
  "ADD COLUMN nationality TEXT DEFAULT ''",
  "ADD COLUMN faceUrl TEXT DEFAULT ''",
  "ADD COLUMN pace INTEGER DEFAULT 0",
  "ADD COLUMN shooting INTEGER DEFAULT 0",
  "ADD COLUMN passing INTEGER DEFAULT 0",
  "ADD COLUMN dribbling INTEGER DEFAULT 0",
  "ADD COLUMN defending INTEGER DEFAULT 0",
  "ADD COLUMN physic INTEGER DEFAULT 0",
  "ADD COLUMN positions TEXT DEFAULT ''",
];

export const initDB = () => {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER DEFAULT 25,
        overall INTEGER DEFAULT 70,
        potential INTEGER DEFAULT 70,
        position TEXT DEFAULT 'CM',
        marketValue REAL DEFAULT 0,
        status TEXT DEFAULT 'wishlist',
        club TEXT DEFAULT '',
        league TEXT DEFAULT '',
        nationality TEXT DEFAULT '',
        faceUrl TEXT DEFAULT '',
        pace INTEGER DEFAULT 0,
        shooting INTEGER DEFAULT 0,
        passing INTEGER DEFAULT 0,
        dribbling INTEGER DEFAULT 0,
        defending INTEGER DEFAULT 0,
        physic INTEGER DEFAULT 0,
        positions TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS lineups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teamId INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Titular',
        formation TEXT DEFAULT '4-3-3',
        squad TEXT DEFAULT '{}',
        bench TEXT DEFAULT '{}',
        reserves TEXT DEFAULT '{}',
        FOREIGN KEY (teamId) REFERENCES teams(id)
      );

      CREATE TABLE IF NOT EXISTS roster (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teamId INTEGER NOT NULL,
        playerName TEXT NOT NULL,
        playerData TEXT NOT NULL,
        addedAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (teamId) REFERENCES teams(id)
      );

      CREATE TABLE IF NOT EXISTS shortlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerName TEXT NOT NULL,
        playerData TEXT NOT NULL,
        status TEXT DEFAULT 'objetivo',
        note TEXT DEFAULT '',
        addedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ovr_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerName TEXT NOT NULL,
        season TEXT NOT NULL,
        overall INTEGER NOT NULL,
        recordedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
      CREATE INDEX IF NOT EXISTS idx_players_overall  ON players(overall DESC);
      CREATE INDEX IF NOT EXISTS idx_players_pos_ovr  ON players(position, overall DESC);
      CREATE INDEX IF NOT EXISTS idx_players_name     ON players(name);
    `);

    PLAYER_MIGRATIONS.forEach((col) => {
      try { db.execSync(`ALTER TABLE players ${col}`); } catch { /* ya existe */ }
    });
  } catch (error) {
    console.error('initDB:', error);
  }
};

// ─────────────────────────────────────────────────────────────
// PLAYERS
// ─────────────────────────────────────────────────────────────

const PLAYERS_URL = process.env.EXPO_PUBLIC_PLAYERS_URL ||
  'https://raw.githubusercontent.com/Caperp22/fc26-companion/master/players.json';

export const updateSquadsFromCloud = async (onProgress, forceUpdate = false) => {
  if (!PLAYERS_URL || PLAYERS_URL.includes('TU_USUARIO')) {
    return { ok: false, error: 'URL no configurada. Edita .env con tu URL de GitHub.' };
  }

  // ── Caché: saltar descarga si la BD se actualizó hace menos de 7 días ──
  if (!forceUpdate) {
    try {
      const meta = db.getFirstSync("SELECT value FROM app_meta WHERE key = 'players_last_updated'");
      if (meta?.value) {
        const daysSince = (Date.now() - new Date(meta.value).getTime()) / 86_400_000;
        if (daysSince < 7) {
          const count = getPlayerCount();
          const label = daysSince < 1 ? 'hoy'
            : daysSince < 2 ? 'hace 1 día'
            : `hace ${Math.floor(daysSince)} días`;
          onProgress?.(`BD actualizada ${label}`);
          return { ok: true, count, cached: true, label };
        }
      }
    } catch { /* meta table may not exist yet */ }
  }

  try {
    onProgress?.('Conectando con GitHub...');
    const response = await fetch(PLAYERS_URL);
    if (!response.ok) {
      return { ok: false, error: `Error HTTP ${response.status}.` };
    }

    onProgress?.('Descargando datos...');
    const players = await response.json();

    if (!Array.isArray(players) || players.length === 0) {
      return { ok: false, error: 'El archivo JSON está vacío o tiene formato incorrecto.' };
    }

    onProgress?.(`Importando ${players.length.toLocaleString()} jugadores...`);
    db.runSync('DELETE FROM players');

    const BATCH = 500;
    for (let i = 0; i < players.length; i += BATCH) {
      const chunk = players.slice(i, i + BATCH);
      db.withTransactionSync(() => {
        chunk.forEach((p) => {
          db.runSync(
            `INSERT INTO players
               (name, age, overall, potential, position, marketValue, status,
                club, league, nationality, faceUrl,
                pace, shooting, passing, dribbling, defending, physic, positions)
             VALUES (?, ?, ?, ?, ?, ?, 'wishlist', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              p.name, p.age || 25, p.overall || 70, p.potential || 70,
              p.position || 'CM', p.marketValue || 0,
              p.club || '', p.league || '', p.nationality || '', p.faceUrl || '',
              p.pace || 0, p.shooting || 0, p.passing || 0,
              p.dribbling || 0, p.defending || 0, p.physic || 0,
              p.positions || p.position || '',
            ]
          );
        });
      });
    }

    db.runSync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('players_last_updated', ?)",
      [new Date().toISOString()]
    );

    return { ok: true, count: players.length };
  } catch (error) {
    console.error('updateSquadsFromCloud:', error);
    return { ok: false, error: error.message };
  }
};

export const getPlayerCount = () => {
  try {
    return db.getFirstSync('SELECT COUNT(*) as total FROM players')?.total ?? 0;
  } catch { return 0; }
};

export const searchPlayersWithFilters = ({
  searchTerm, position, minOverall = 0, minPotential = 0,
  club, league, nationality,
}) => {
  try {
    const buildBase = (words, logic = 'AND') => {
      let q = 'SELECT * FROM players WHERE 1=1';
      const p = [];
      if (words.length > 0) {
        const clauses = words.map(() => 'name LIKE ?').join(` ${logic} `);
        q += ` AND (${clauses})`;
        words.forEach(w => p.push(`%${w}%`));
      }
      if (position) {
        q += ` AND (position = ? OR (',' || positions || ',' LIKE '%,' || ? || ',%'))`;
        p.push(position, position);
      }
      if (minOverall > 0)   { q += ' AND overall >= ?';   p.push(minOverall); }
      if (minPotential > 0) { q += ' AND potential >= ?';  p.push(minPotential); }
      if (club?.trim())     { q += ' AND club LIKE ?';     p.push(`%${club.trim()}%`); }
      if (league?.trim())   { q += ' AND league LIKE ?';   p.push(`%${league.trim()}%`); }
      if (nationality?.trim()) { q += ' AND nationality LIKE ?'; p.push(`%${nationality.trim()}%`); }
      q += ' ORDER BY overall DESC LIMIT 100';
      return { q, p };
    };

    const words = (searchTerm?.trim() ?? '').split(/\s+/).filter(Boolean);
    const { q, p } = buildBase(words, 'AND');
    const results = db.getAllSync(q, p);

    // Búsqueda fuzzy: si pocos resultados con AND, intentar OR entre palabras
    if (words.length > 1 && results.length < 5) {
      const { q: qOr, p: pOr } = buildBase(words, 'OR');
      const extra = db.getAllSync(qOr, pOr);
      const seen = new Set(results.map(r => r.id));
      extra.forEach(r => { if (!seen.has(r.id)) results.push(r); });
    }

    return results.slice(0, 100);
  } catch (error) {
    console.error('searchPlayersWithFilters:', error);
    return [];
  }
};

export const addCustomPlayer = (player) => {
  try {
    db.runSync(
      `INSERT INTO players
         (name, age, overall, potential, position, marketValue, status,
          club, league, nationality, faceUrl,
          pace, shooting, passing, dribbling, defending, physic, positions)
       VALUES (?, ?, ?, ?, ?, ?, 'wishlist', ?, ?, ?, '', 0, 0, 0, 0, 0, 0, ?)`,
      [
        player.name, player.age || 25, player.overall || 70,
        player.potential || player.overall || 70,
        player.position || 'CM', player.marketValue || 0,
        player.club || '', player.league || '', player.nationality || '',
        player.position || 'CM',
      ]
    );
    return { ok: true };
  } catch (error) {
    console.error('addCustomPlayer:', error);
    return { ok: false, error: error.message };
  }
};

export const getDistinctClubs = () => {
  try {
    return db.getAllSync(`
      SELECT club, COUNT(*) as playerCount
      FROM players
      WHERE TRIM(club) != ''
      GROUP BY club
      ORDER BY club ASC
    `);
  } catch { return []; }
};

export const getDistinctNationalities = () => {
  try {
    return db.getAllSync(`
      SELECT nationality, COUNT(*) as playerCount
      FROM players
      WHERE TRIM(nationality) != ''
      GROUP BY nationality
      ORDER BY nationality ASC
    `);
  } catch { return []; }
};

export const getTopPlayersByPosition = (position, limit = 3) => {
  try {
    return db.getAllSync(
      `SELECT * FROM players
       WHERE position = ? OR (',' || positions || ',' LIKE '%,' || ? || ',%')
       ORDER BY overall DESC LIMIT ?`,
      [position, position, limit]
    );
  } catch { return []; }
};

export const getAffordablePlayersByPosition = (position, maxBudget, limit = 3) => {
  try {
    return db.getAllSync(
      `SELECT * FROM players
       WHERE (position = ? OR (',' || positions || ',' LIKE '%,' || ? || ',%'))
         AND marketValue <= ?
       ORDER BY overall DESC LIMIT ?`,
      [position, position, maxBudget, limit]
    );
  } catch { return []; }
};

export const getFreeAgentCandidates = (position, limit = 3) => {
  try {
    return db.getAllSync(
      `SELECT * FROM players
       WHERE (position = ? OR (',' || positions || ',' LIKE '%,' || ? || ',%'))
         AND (marketValue = 0 OR marketValue <= 500000)
       ORDER BY overall DESC LIMIT ?`,
      [position, position, limit]
    );
  } catch { return []; }
};

export const getPlayersByFilter = ({ club, nationality, limit = 200 }) => {
  try {
    let query = 'SELECT * FROM players WHERE 1=1';
    const params = [];
    if (club?.trim())        { query += ' AND club = ?';        params.push(club.trim()); }
    if (nationality?.trim()) { query += ' AND nationality = ?'; params.push(nationality.trim()); }
    query += ` ORDER BY overall DESC LIMIT ${limit}`;
    return db.getAllSync(query, params);
  } catch { return []; }
};

// ─────────────────────────────────────────────────────────────
// TEAMS
// ─────────────────────────────────────────────────────────────

export const getTeams = () => {
  try {
    return db.getAllSync(`
      SELECT t.id, t.name, t.createdAt, COUNT(l.id) as lineupCount
      FROM teams t
      LEFT JOIN lineups l ON l.teamId = t.id
      GROUP BY t.id
      ORDER BY t.createdAt DESC
    `);
  } catch { return []; }
};

export const createTeam = (name) => {
  try {
    db.runSync('INSERT INTO teams (name) VALUES (?)', [name.trim()]);
    const row = db.getFirstSync('SELECT last_insert_rowid() as id');
    return { ok: true, id: row.id };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const renameTeam = (id, name) => {
  try {
    db.runSync('UPDATE teams SET name = ? WHERE id = ?', [name.trim(), id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const deleteTeam = (id) => {
  try {
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM lineups WHERE teamId = ?', [id]);
      db.runSync('DELETE FROM teams WHERE id = ?', [id]);
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// ─────────────────────────────────────────────────────────────
// LINEUPS
// ─────────────────────────────────────────────────────────────

export const getLineupsByTeam = (teamId) => {
  try {
    return db.getAllSync(
      'SELECT * FROM lineups WHERE teamId = ? ORDER BY id ASC',
      [teamId]
    );
  } catch { return []; }
};

export const saveLineup = ({ teamId, lineupId, name, formation, squad, bench, reserves }) => {
  try {
    const s = JSON.stringify(squad);
    const b = JSON.stringify(bench);
    const r = JSON.stringify(reserves);

    if (lineupId) {
      db.runSync(
        'UPDATE lineups SET name=?, formation=?, squad=?, bench=?, reserves=? WHERE id=?',
        [name, formation, s, b, r, lineupId]
      );
      return { ok: true, id: lineupId };
    }

    const count = db.getFirstSync(
      'SELECT COUNT(*) as c FROM lineups WHERE teamId = ?', [teamId]
    )?.c ?? 0;
    if (count >= 3) return { ok: false, error: 'Máximo 3 alineaciones por equipo.' };

    db.runSync(
      'INSERT INTO lineups (teamId, name, formation, squad, bench, reserves) VALUES (?,?,?,?,?,?)',
      [teamId, name, formation, s, b, r]
    );
    const row = db.getFirstSync('SELECT last_insert_rowid() as id');
    return { ok: true, id: row.id };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const deleteLineup = (id) => {
  try {
    db.runSync('DELETE FROM lineups WHERE id = ?', [id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// ─────────────────────────────────────────────────────────────
// ROSTER (plantilla por equipo)
// ─────────────────────────────────────────────────────────────

export const getRoster = (teamId) => {
  try {
    return db.getAllSync('SELECT * FROM roster WHERE teamId = ? ORDER BY addedAt ASC', [teamId]);
  } catch { return []; }
};

export const addToRoster = (teamId, player) => {
  try {
    const existing = db.getFirstSync(
      'SELECT id FROM roster WHERE teamId = ? AND playerName = ?',
      [teamId, player.name]
    );
    if (existing) return { ok: false, error: 'Ya está en la plantilla' };
    db.runSync(
      'INSERT INTO roster (teamId, playerName, playerData) VALUES (?, ?, ?)',
      [teamId, player.name, JSON.stringify(player)]
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

export const removeFromRoster = (id) => {
  try { db.runSync('DELETE FROM roster WHERE id = ?', [id]); } catch {}
};

// ─────────────────────────────────────────────────────────────
// SHORTLIST
// ─────────────────────────────────────────────────────────────

export const getShortlist = () => {
  try {
    return db.getAllSync('SELECT * FROM shortlist ORDER BY addedAt DESC');
  } catch { return []; }
};

export const isInShortlist = (playerName) => {
  try {
    return !!db.getFirstSync('SELECT id FROM shortlist WHERE playerName = ?', [playerName]);
  } catch { return false; }
};

export const addToShortlist = (player) => {
  try {
    const existing = db.getFirstSync('SELECT id FROM shortlist WHERE playerName = ?', [player.name]);
    if (existing) return { ok: false, error: 'Ya está en objetivos.' };
    db.runSync(
      'INSERT INTO shortlist (playerName, playerData) VALUES (?, ?)',
      [player.name, JSON.stringify(player)]
    );
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const removeFromShortlist = (id) => {
  try {
    db.runSync('DELETE FROM shortlist WHERE id = ?', [id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const updateShortlistStatus = (id, status) => {
  try {
    db.runSync('UPDATE shortlist SET status = ? WHERE id = ?', [status, id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const updateShortlistNote = (id, note) => {
  try {
    db.runSync('UPDATE shortlist SET note = ? WHERE id = ?', [note, id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// ─────────────────────────────────────────────────────────────
// OVR HISTORY
// ─────────────────────────────────────────────────────────────

export const getOVRHistory = (playerName) => {
  try {
    return db.getAllSync(
      'SELECT * FROM ovr_history WHERE playerName = ? ORDER BY recordedAt ASC',
      [playerName]
    );
  } catch { return []; }
};

export const addOVRSnapshot = (playerName, overall, season) => {
  try {
    db.runSync(
      'INSERT INTO ovr_history (playerName, overall, season) VALUES (?, ?, ?)',
      [playerName, overall, season]
    );
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

export const deleteOVRSnapshot = (id) => {
  try {
    db.runSync('DELETE FROM ovr_history WHERE id = ?', [id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

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

const PLAYERS_URL = process.env.EXPO_PUBLIC_PLAYERS_URL || '';

export const updateSquadsFromCloud = async (onProgress) => {
  if (!PLAYERS_URL || PLAYERS_URL.includes('TU_USUARIO')) {
    return { ok: false, error: 'URL no configurada. Edita .env con tu URL de GitHub.' };
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
    let query = 'SELECT * FROM players WHERE 1=1';
    const params = [];

    if (searchTerm?.trim()) {
      query += ' AND name LIKE ?';
      params.push(`%${searchTerm.trim()}%`);
    }

    if (position) {
      // Busca en la posición principal Y en todas las posiciones alternativas
      query += ` AND (position = ? OR (',' || positions || ',' LIKE '%,' || ? || ',%'))`;
      params.push(position, position);
    }

    if (minOverall > 0) { query += ' AND overall >= ?'; params.push(minOverall); }
    if (minPotential > 0) { query += ' AND potential >= ?'; params.push(minPotential); }
    if (club?.trim()) { query += ' AND club LIKE ?'; params.push(`%${club.trim()}%`); }
    if (league?.trim()) { query += ' AND league LIKE ?'; params.push(`%${league.trim()}%`); }
    if (nationality?.trim()) { query += ' AND nationality LIKE ?'; params.push(`%${nationality.trim()}%`); }

    query += ' ORDER BY overall DESC LIMIT 100';
    return db.getAllSync(query, params);
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

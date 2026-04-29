import * as SQLite from 'expo-sqlite';

// Abrimos (o creamos) la base de datos local
export const db = SQLite.openDatabaseSync('fc26companion.db');

export const initDB = () => {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        overall INTEGER,
        potential INTEGER,
        position TEXT,
        marketValue REAL,
        status TEXT DEFAULT 'wishlist'
      );
    `);
    console.log('✅ Base de datos inicializada correctamente 🏟️');
  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
  }
};

const PLAYERS_URL = process.env.EXPO_PUBLIC_PLAYERS_URL || '';

// Descarga el players.json desde GitHub y sincroniza la base de datos local
export const updateSquadsFromCloud = async (onProgress) => {
  if (!PLAYERS_URL || PLAYERS_URL.includes('TU_USUARIO')) {
    return { ok: false, error: 'URL no configurada. Edita .env con tu URL de GitHub.' };
  }

  try {
    onProgress?.('Conectando con GitHub...');
    const response = await fetch(PLAYERS_URL);

    if (!response.ok) {
      return { ok: false, error: `Error HTTP ${response.status}. Verifica la URL en .env.` };
    }

    onProgress?.('Descargando datos de jugadores...');
    const players = await response.json();

    if (!Array.isArray(players) || players.length === 0) {
      return { ok: false, error: 'El archivo JSON está vacío o tiene formato incorrecto.' };
    }

    onProgress?.(`Importando ${players.length.toLocaleString()} jugadores...`);
    db.runSync('DELETE FROM players');

    // Inserción en lotes de 500 para mejor rendimiento
    const BATCH = 500;
    for (let i = 0; i < players.length; i += BATCH) {
      const chunk = players.slice(i, i + BATCH);
      db.withTransactionSync(() => {
        chunk.forEach((p) => {
          db.runSync(
            `INSERT INTO players (name, age, overall, potential, position, marketValue, status)
             VALUES (?, ?, ?, ?, ?, ?, 'wishlist')`,
            [p.name, p.age || 25, p.overall || 70, p.potential || 70, p.position || 'CM', p.marketValue || 0]
          );
        });
      });
    }

    return { ok: true, count: players.length };
  } catch (error) {
    console.error('❌ updateSquadsFromCloud:', error);
    return { ok: false, error: error.message };
  }
};

// Devuelve cuántos jugadores hay en la base de datos local
export const getPlayerCount = () => {
  try {
    const row = db.getFirstSync('SELECT COUNT(*) as total FROM players');
    return row?.total ?? 0;
  } catch {
    return 0;
  }
};

// Función para buscar jugadores en la red de ojeadores
export const searchPlayersByName = (searchTerm) => {
  try {
    // Buscamos cualquier jugador cuyo nombre contenga el texto ingresado
    const results = db.getAllSync(
      `SELECT * FROM players WHERE name LIKE ? ORDER BY overall DESC LIMIT 50`,
      [`%${searchTerm}%`]
    );
    return results;
  } catch (error) {
    console.error('❌ Error al buscar jugadores:', error);
    return [];
  }
};

// Función para buscar con filtros avanzados (posición, GRL mínimo, potencial mínimo)
export const searchPlayersWithFilters = ({ searchTerm, position, minOverall, minPotential }) => {
  try {
    let query = 'SELECT * FROM players WHERE 1=1';
    const params = [];

    if (searchTerm && searchTerm.trim().length > 0) {
      query += ' AND name LIKE ?';
      params.push(`%${searchTerm.trim()}%`);
    }

    if (position) {
      query += ' AND position = ?';
      params.push(position);
    }

    if (minOverall != null && minOverall > 0) {
      query += ' AND overall >= ?';
      params.push(minOverall);
    }

    if (minPotential != null && minPotential > 0) {
      query += ' AND potential >= ?';
      params.push(minPotential);
    }

    query += ' ORDER BY overall DESC LIMIT 100';

    return db.getAllSync(query, params);
  } catch (error) {
    console.error('❌ Error al buscar con filtros:', error);
    return [];
  }
};
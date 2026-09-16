import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDatabase(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      name TEXT,
      best INTEGER NOT NULL DEFAULT -1,
      best_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS players_best ON players(best DESC, best_at, tag);
    CREATE INDEX IF NOT EXISTS players_expiry ON players(expires_at);
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      seed INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','finished','abandoned')),
      result TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, state);
    CREATE INDEX IF NOT EXISTS runs_expiry ON runs(expires_at);
    CREATE TABLE IF NOT EXISTS freestyle_scores (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      best INTEGER NOT NULL CHECK(best >= 0),
      best_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS freestyle_scores_best ON freestyle_scores(best DESC, best_at, player_id);
    CREATE TABLE IF NOT EXISTS freestyle_runs (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      seed INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','finished','abandoned')),
      result TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS freestyle_runs_player ON freestyle_runs(player_id, state);
    CREATE INDEX IF NOT EXISTS freestyle_runs_expiry ON freestyle_runs(expires_at);
  `);
  return db;
}
export function prune(db, now) {
  // Both sessions and names expire at a fixed date; revisiting never extends retention.
  db.prepare('DELETE FROM players WHERE expires_at <= ?').run(now);
  db.prepare("DELETE FROM runs WHERE expires_at < ? AND state <> 'finished'").run(now - 86400000);
  db.prepare("DELETE FROM freestyle_runs WHERE expires_at < ? AND state <> 'finished'").run(now - 86400000);
}
export function playerView(db, player, now) {
  if (!player?.name) return null;
  const rank = player.best < 0 ? null : 1 + db.prepare('SELECT count(*) AS n FROM players WHERE best > ? AND expires_at > ?').get(player.best, now).n;
  return { name: player.name, best: Math.max(0, player.best), rank, tag: player.tag };
}
export function leaderboard(db, id, now) {
  const rows = db.prepare('SELECT name, best, tag, id FROM players WHERE best >= 0 AND name IS NOT NULL AND expires_at > ? ORDER BY best DESC, best_at ASC, tag ASC LIMIT 10').all(now);
  const ranks = new Map();
  const entries = rows.map((row, i) => {
    if (!ranks.has(row.best)) ranks.set(row.best, i + 1);
    return { rank: ranks.get(row.best), name: row.name, score: row.best, tag: row.tag, isMe: row.id === id };
  });
  const mine = id ? db.prepare('SELECT * FROM players WHERE id = ? AND expires_at > ?').get(id, now) : null;
  const meView = playerView(db, mine, now);
  return {
    entries,
    me: meView && mine.best >= 0 ? { rank: meView.rank, name: meView.name, score: mine.best, tag: meView.tag } : null,
    record: entries[0]?.score ?? 0,
    totalPlayers: db.prepare('SELECT count(*) AS n FROM players WHERE best >= 0 AND name IS NOT NULL AND expires_at > ?').get(now).n
  };
}


export function freestylePlayerView(db, player, now) {
  if (!player?.name) return null;
  const score = db.prepare('SELECT best FROM freestyle_scores WHERE player_id = ?').get(player.id);
  if (!score) return null;
  const rank = 1 + db.prepare(`
    SELECT count(*) AS n FROM freestyle_scores s JOIN players p ON p.id = s.player_id
    WHERE s.best > ? AND p.name IS NOT NULL AND p.expires_at > ?
  `).get(score.best, now).n;
  return { name: player.name, best: score.best, rank, tag: player.tag };
}
export function freestyleLeaderboard(db, id, now) {
  const rows = db.prepare(`
    SELECT p.name, s.best, p.tag, p.id FROM freestyle_scores s JOIN players p ON p.id = s.player_id
    WHERE p.name IS NOT NULL AND p.expires_at > ?
    ORDER BY s.best DESC, s.best_at ASC, p.tag ASC LIMIT 10
  `).all(now);
  const ranks = new Map();
  const entries = rows.map((row, i) => {
    if (!ranks.has(row.best)) ranks.set(row.best, i + 1);
    return { rank: ranks.get(row.best), name: row.name, score: row.best, tag: row.tag, isMe: row.id === id };
  });
  const player = id ? db.prepare('SELECT * FROM players WHERE id = ? AND expires_at > ?').get(id, now) : null;
  const mine = freestylePlayerView(db, player, now);
  return {
    entries,
    me: mine ? { rank: mine.rank, name: mine.name, score: mine.best, tag: mine.tag } : null,
    record: entries[0]?.score ?? 0,
    totalPlayers: db.prepare(`
      SELECT count(*) AS n FROM freestyle_scores s JOIN players p ON p.id = s.player_id
      WHERE p.name IS NOT NULL AND p.expires_at > ?
    `).get(now).n
  };
}
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { z } from 'zod';

const DB_DIR = path.join(process.cwd(), 'data/db');
const DB_PATH = path.join(DB_DIR, 'sessions.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const SessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  description: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  isAutoCompleted: z.number(),
  jiraTicket: z.string().nullable(),
});

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        description TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        completedAt TEXT,
        isAutoCompleted INTEGER DEFAULT 0,
        jiraTicket TEXT
      )
    `);
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS google_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `);
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS event_projects (
        eventName TEXT PRIMARY KEY,
        projectId TEXT
      )
    `);
  }

  return dbInstance;
}

export function getEventProject(eventName: string): string | null | undefined {
  const db = getDb();
  const stmt = db.prepare('SELECT projectId FROM event_projects WHERE eventName = ?');
  const row = stmt.get(eventName) as { projectId: string | null } | undefined;

  return row ? row.projectId : undefined;
}

export function setEventProject(eventName: string, projectId: string | null) {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO event_projects (eventName, projectId) VALUES (?, ?)');
  stmt.run(eventName, projectId);
}

export function storeToken(token: object) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO google_tokens (token, createdAt) VALUES (?, ?)');
  stmt.run(JSON.stringify(token), new Date().toISOString());
}

export function getLatestToken() {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM google_tokens ORDER BY createdAt DESC LIMIT 1');
  const row = stmt.get() as { token: string } | undefined;
  return row ? JSON.parse(row.token) : null;
}

export function logSessionStart(
  id: string,
  projectId: string,
  description: string,
  startedAt: string,
  jiraTicket?: string,
) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO sessions (id, projectId, description, startedAt, isAutoCompleted, jiraTicket) VALUES (?, ?, ?, ?, ?, ?)',
  );

  stmt.run(id, projectId, description, startedAt, 0, jiraTicket);
}

export function completeLatestSession(completedAt: string, isAutoCompleted = false) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE sessions
    SET completedAt = ?, isAutoCompleted = ?
    WHERE id = (
      SELECT id FROM sessions WHERE completedAt IS NULL ORDER BY startedAt DESC LIMIT 1
    )
  `);

  stmt.run(completedAt, isAutoCompleted ? 1 : 0);
}

export function getLatestSession() {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM sessions ORDER BY startedAt DESC LIMIT 1
  `);

  return SessionSchema.parse(stmt.get());
}

export function deleteOldSessions(days: number) {
  const db = getDb();
  const date = new Date();
  date.setDate(date.getDate() - days);
  const stmt = db.prepare('DELETE FROM sessions WHERE startedAt < ?');
  stmt.run(date.toISOString());
}

import { DatabaseSync } from 'node:sqlite';

export type SqliteDatabase = DatabaseSync;

export function openDatabase(databasePath: string): SqliteDatabase {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return database;
}

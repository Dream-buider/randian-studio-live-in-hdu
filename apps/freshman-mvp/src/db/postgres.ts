import { Pool } from 'pg';

export type PostgresPool = Pool;

export function createPostgresPool(connectionString: string): PostgresPool {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('PostgreSQL connection string must use postgres:// or postgresql://');
  }
  return new Pool({ connectionString, max: 10 });
}

export interface PostgresQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
}

export interface PostgresClient {
  query(text: string, values?: readonly unknown[]): Promise<PostgresQueryResult>;
  release(): void;
}

export interface PostgresPool {
  query(text: string, values?: readonly unknown[]): Promise<PostgresQueryResult>;
  connect(): Promise<PostgresClient>;
  end(): Promise<void>;
}

type PgModule = { Pool: new (options: { connectionString: string; max: number }) => PostgresPool };

export async function createPostgresPool(connectionString: string): Promise<PostgresPool> {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('PostgreSQL connection string must use postgres:// or postgresql://');
  }
  try {
    const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
      moduleName: string,
    ) => Promise<PgModule>;
    const { Pool } = await dynamicImport('pg');
    return new Pool({ connectionString, max: 10 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PostgreSQL requires the optional pg package: ${detail}`);
  }
}

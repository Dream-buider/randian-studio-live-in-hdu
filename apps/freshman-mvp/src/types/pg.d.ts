declare module 'pg' {
  export interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
    rows: Row[];
    rowCount: number | null;
  }

  export interface PoolClient {
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;
    release(): void;
  }

  export interface PoolConfig {
    connectionString: string;
    max?: number;
  }

  export class Pool {
    constructor(config: PoolConfig);
    connect(): Promise<PoolClient>;
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }
}

import { Pool, PoolClient, QueryResultRow } from 'pg';

/** Truy vấn dùng chung cho Pool và cho client trong transaction. */
export interface Queryable {
  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export class Database implements Queryable {
  constructor(public readonly pool: Pool) {}

  query<R extends QueryResultRow = any>(text: string, params?: unknown[]) {
    return this.pool.query<R>(text, params);
  }

  async one<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<R | undefined> {
    const { rows } = await this.pool.query<R>(text, params);
    return rows[0];
  }

  /** Chạy fn trong một transaction; tự rollback khi có lỗi. */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

export const DATABASE = Symbol('DATABASE');

import pg from "pg";

export type SqlQuery = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export type SqlClient = {
  query: SqlQuery;
  release?: () => void;
};

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) pool = new pg.Pool({ connectionString: url, max: 4 });
  return pool;
}

/** SET LOCAL equivalent: set_config(..., true) lasts for this transaction only, then the connection returns to the pool without the user id. */
export async function runAsUser<T>(client: SqlClient, userId: string, fn: (query: SqlQuery) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("missing_user");
  let started = false;
  try {
    await client.query("begin");
    started = true;
    await client.query("select set_config('fujara.user_id', $1, true)", [userId]);
    const role = process.env.FUJARA_DB_APP_ROLE?.trim();
    if (role) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role)) throw new Error("unsafe_app_role");
      await client.query(`set local role ${role}`);
    }
    const value = await fn(client.query.bind(client));
    await client.query("commit");
    return value;
  } catch (error) {
    if (started) {
      try {
        await client.query("rollback");
      } catch {
        // The connection must not return to the pool still inside a transaction.
      }
    }
    throw error;
  }
}

export async function withUser<T>(userId: string, fn: (query: SqlQuery) => Promise<T>): Promise<T> {
  const active = getPool();
  if (!active) throw new Error("no_database");
  const client = await active.connect();
  try {
    return await runAsUser(client, userId, fn);
  } finally {
    client.release();
  }
}

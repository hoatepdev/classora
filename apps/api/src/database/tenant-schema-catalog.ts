import type { Pool } from 'pg';

export type TenantSchemaCatalog = {
  tables: string[];
  columns: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  triggers: string[];
  rules: string[];
  policies: string[];
  rowLevelSecurity: Array<Record<string, unknown>>;
};

type Queryable = Pick<Pool, 'query'>;
const excluded = `AND c.relname NOT IN ('_prisma_migrations', '_classora_tenant_migrations')`;
const normalize = (value: string | null) => value?.replace(/\s+/g, ' ').trim() || null;
const sortRows = <T>(rows: T[], key: (row: T) => string) =>
  [...rows].sort((left, right) => key(left).localeCompare(key(right)));

export async function captureTenantSchemaCatalog(pool: Queryable): Promise<TenantSchemaCatalog> {
  const [tables, columns, constraints, indexes, triggers, rules, policies, rls] =
    await Promise.all([
      pool.query<{ name: string }>(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ${excluded}`),
      pool.query(`
        SELECT c.relname AS "table", a.attnum::integer AS ordinal, a.attname AS name,
          format_type(a.atttypid, a.atttypmod) AS type, a.atttypmod::integer AS typmod,
          NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid, true) AS "default"
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ${excluded}
        ORDER BY c.relname, a.attnum
      `),
      pool.query(`
        SELECT table_class.relname AS "table", constraint_row.conname AS name,
          CASE constraint_row.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
            WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUSION' END AS type,
          COALESCE((SELECT array_agg(attribute.attname ORDER BY key.ordinality)
            FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum), ARRAY[]::text[]) AS columns,
          referenced_class.relname AS "referencedTable",
          COALESCE((SELECT array_agg(attribute.attname ORDER BY key.ordinality)
            FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.confrelid AND attribute.attnum = key.attnum), ARRAY[]::text[]) AS "referencedColumns",
          pg_get_constraintdef(constraint_row.oid, true) AS definition
        FROM pg_constraint constraint_row JOIN pg_class table_class ON table_class.oid = constraint_row.conrelid
        JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
        LEFT JOIN pg_class referenced_class ON referenced_class.oid = constraint_row.confrelid
        WHERE table_namespace.nspname = 'public' AND constraint_row.contype IN ('p', 'u', 'f', 'c', 'x')
          AND table_class.relname NOT IN ('_prisma_migrations', '_classora_tenant_migrations')
      `),
      pool.query(`
        SELECT table_class.relname AS "table", index_class.relname AS name,
          index_row.indisunique AS unique, index_row.indisprimary AS primary, index_row.indisexclusion AS exclusion,
          COALESCE((SELECT array_agg(pg_get_indexdef(index_row.indexrelid, key.ordinality::integer, true) ORDER BY key.ordinality)
            FROM generate_series(1, index_row.indnatts) AS key(ordinality)), ARRAY[]::text[]) AS columns,
          pg_get_expr(index_row.indpred, index_row.indrelid, true) AS predicate
        FROM pg_index index_row JOIN pg_class table_class ON table_class.oid = index_row.indrelid
        JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
        JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
        WHERE table_namespace.nspname = 'public' AND table_class.relname NOT IN ('_prisma_migrations', '_classora_tenant_migrations')
      `),
      pool.query<{ name: string }>(`SELECT c.relname || ':' || t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal ${excluded}`),
      pool.query<{ name: string }>(`SELECT schemaname || ':' || tablename || ':' || rulename AS name FROM pg_rules WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', '_classora_tenant_migrations')`),
      pool.query<{ name: string }>(`SELECT schemaname || ':' || tablename || ':' || policyname AS name FROM pg_policies WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', '_classora_tenant_migrations')`),
      pool.query(`SELECT c.relname AS "table", c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ${excluded}`),
    ]);

  return {
    tables: tables.rows.map(({ name }) => name).sort(),
    columns: sortRows(columns.rows.map((row) => ({ ...row, default: normalize(row.default) })), (row) => `${row.table}:${row.ordinal}`),
    constraints: sortRows(constraints.rows.map((row) => ({ ...row, definition: normalize(row.definition) })), (row) => `${row.table}:${row.name}`),
    indexes: sortRows(indexes.rows.map((row) => ({ ...row, predicate: normalize(row.predicate) })), (row) => `${row.table}:${row.name}`),
    triggers: triggers.rows.map(({ name }) => name).sort(),
    rules: rules.rows.map(({ name }) => name).sort(),
    policies: policies.rows.map(({ name }) => name).sort(),
    rowLevelSecurity: sortRows(rls.rows, (row) => row.table),
  };
}

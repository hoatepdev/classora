CREATE DATABASE control_db;
CREATE DATABASE classora_tenant_demo;

\connect control_db

CREATE TABLE tenants (
  id char(26) PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  domain text UNIQUE,
  db_name text NOT NULL UNIQUE,
  schema_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, name, slug, db_name)
VALUES ('01JHZX3V8Q9K5M2N7R4T6W1Y0A', 'Demo', 'demo', 'classora_tenant_demo');

\getenv control_db_name CONTROL_DB_NAME
SELECT format('CREATE DATABASE %I', :'control_db_name')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'control_db_name') \gexec

CREATE DATABASE classora_tenant_demo;

#!/bin/bash
# Runs once, when the Postgres data volume is first created.
# Medusa and the Payload CMS (inside the storefront) each get their own database.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-'EOSQL'
	SELECT 'CREATE DATABASE ecommerce_medusa' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecommerce_medusa')\gexec
	SELECT 'CREATE DATABASE ecommerce_cms' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecommerce_cms')\gexec
EOSQL

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationModulePath = fileURLToPath(import.meta.url);

export async function runMigrations({ database, retries = 10 } = {}) {
  const { default: pool, createPool, runMigrations: applyMigrations, waitForDatabase } = await import('./db.js');
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && (!process.env.MIGRATION_DB_USER || !process.env.MIGRATION_DB_PASSWORD)) {
    throw new Error('En produccion defina MIGRATION_DB_USER y MIGRATION_DB_PASSWORD para ejecutar migraciones.');
  }

  const ownsPool = !database;
  const migrationDatabase = database || (process.env.MIGRATION_DB_USER
    ? createPool({
      user: process.env.MIGRATION_DB_USER,
      password: process.env.MIGRATION_DB_PASSWORD
    })
    : pool);

  try {
    await waitForDatabase(migrationDatabase, retries);
    await applyMigrations({ database: migrationDatabase });
    console.log('Migraciones completadas.');
  } finally {
    if (ownsPool && migrationDatabase !== pool) {
      await migrationDatabase.end();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === migrationModulePath) {
  runMigrations().catch((error) => {
    console.error(`Fallo al aplicar migraciones: ${error.message}`);
    process.exitCode = 1;
  });
}
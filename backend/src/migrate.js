import 'dotenv/config';
import { createPool, runMigrations } from './db.js';

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!process.env.MIGRATION_DB_USER || !process.env.MIGRATION_DB_PASSWORD)) {
  throw new Error('En produccion defina MIGRATION_DB_USER y MIGRATION_DB_PASSWORD para ejecutar migraciones.');
}

const database = createPool({
  user: process.env.MIGRATION_DB_USER || process.env.DB_USER,
  password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD
});

try {
  await runMigrations({ database });
  console.log('Migraciones completadas.');
} catch (error) {
  console.error(`Fallo al aplicar migraciones: ${error.message}`);
  process.exitCode = 1;
} finally {
  await database.end();
}
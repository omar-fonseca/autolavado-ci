import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDirectory = path.join(__dirname, '../migrations');

export function createPool(config = {}) {
  return mysql.createPool({
    host: config.host ?? process.env.DB_HOST,
    port: Number(config.port ?? process.env.DB_PORT ?? 3306),
    user: config.user ?? process.env.DB_USER,
    password: config.password ?? process.env.DB_PASSWORD,
    database: config.database ?? process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    maxIdle: Number(process.env.DB_POOL_MAX_IDLE || 5),
    idleTimeout: 60000,
    connectTimeout: 5000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });
}

const pool = createPool();

export async function runMigrations({ database = pool, migrationsDirectory = defaultMigrationsDirectory } = {}) {
  const connection = await database.getConnection();
  const lockName = 'autolavado_ci_schema_migrations';
  let lockAcquired = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) {
      throw new Error('No fue posible obtener el bloqueo para migraciones dentro de 30 segundos.');
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(file))
      .sort();

    for (const file of files) {
      const [applied] = await connection.execute(
        'SELECT version FROM schema_migrations WHERE version = ?',
        [file]
      );
      if (applied.length > 0) {
        continue;
      }

      const migration = await readFile(path.join(migrationsDirectory, file), 'utf8');
      let alreadyPresent = false;
      if (file === '002_enforce_positive_price.sql') {
        const [constraints] = await connection.execute(
          `SELECT CONSTRAINT_NAME
           FROM information_schema.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA = DATABASE()
             AND TABLE_NAME = 'lavados'
             AND CONSTRAINT_NAME = 'chk_lavados_precio_positive'`
        );
        alreadyPresent = constraints.length > 0;
      } else if (file === '003_index_lavados_created.sql') {
        const [indexes] = await connection.execute(
          `SELECT INDEX_NAME
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'lavados'
             AND INDEX_NAME = 'idx_lavados_creado_id'`
        );
        alreadyPresent = indexes.length > 0;
      }

      if (!alreadyPresent) {
        await connection.query(migration);
      }
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      console.log(`Migracion aplicada: ${file}`);
    }
  } finally {
    if (lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    }
    connection.release();
  }
}

async function waitForDatabase(database, retries) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await database.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      console.error(`MySQL no disponible (intento ${attempt}/${retries}): ${error.message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error(`No fue posible conectar con MySQL: ${lastError?.message || 'sin detalles'}`);
}

export async function initDB(retries = 10, database = pool) {
  await waitForDatabase(database, retries);
  await database.query('SELECT 1 FROM lavados LIMIT 0');
  console.log('Base de datos disponible y esquema listo');
}

export default pool;
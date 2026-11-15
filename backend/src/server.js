import 'dotenv/config';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { MemoryStore, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pool, { createPool, initDB } from './db.js';
import { MemoryLavadosDatabase } from './memory-db.js';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPort = Number(process.env.PORT || 3000);
const maxMySQLInt = 2147483647;
const vehicleTypes = ['MOTO', 'CARRO', 'CAMIONETA'];
const services = ['BASICO', 'GENERAL', 'PREMIUM'];
const shifts = ['MANANA', 'TARDE'];
const states = ['EN_PROCESO', 'TERMINADO'];
const editableFields = new Set([
  'cliente', 'placa', 'tipo_vehiculo', 'servicio', 'turno', 'estado', 'precio'
]);
const prices = {
  MOTO: { BASICO: 12000, GENERAL: 18000, PREMIUM: 25000 },
  CARRO: { BASICO: 22000, GENERAL: 32000, PREMIUM: 45000 },
  CAMIONETA: { BASICO: 28000, GENERAL: 40000, PREMIUM: 55000 }
};

function isMySQLReachable(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(800);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function selectLocalDatabase(database) {
  const configuredHost = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  if (await isMySQLReachable(configuredHost, port)) {
    return { database, migrationHost: undefined, ownsDatabase: false };
  }

  if (configuredHost !== '127.0.0.1' && configuredHost !== 'localhost'
    && await isMySQLReachable('127.0.0.1', port)) {
    return {
      database: createPool({ host: '127.0.0.1' }),
      migrationHost: '127.0.0.1',
      ownsDatabase: true
    };
  }

  const url = defaultPort === 3000 ? 'http://localhost:3000' : `http://localhost:${defaultPort}`;
  console.warn(`Modo desarrollo sin MySQL local: usando base de datos en memoria en ${url}`);
  return {
    database: new MemoryLavadosDatabase(),
    migrationHost: undefined,
    ownsDatabase: false
  };
}

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= maxMySQLInt ? id : null;
}

function parsePageOptions(query) {
  const pageText = query.page ?? '1';
  const limitText = query.limit ?? '50';
  if (!/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(limitText)) {
    return { error: 'page y limit deben ser enteros positivos.' };
  }

  const page = Number(pageText);
  const limit = Number(limitText);
  if (!Number.isSafeInteger(page) || page > 1000000 || !Number.isSafeInteger(limit) || limit > 100) {
    return { error: 'page no puede superar 1000000 y limit no puede superar 100.' };
  }
  return { page, limit, offset: (page - 1) * limit };
}

function normalizeLavado(payload, { partial = false, allowDefaultPrice = true } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' };
  }

  const unknownFields = Object.keys(payload).filter((field) => !editableFields.has(field));
  if (unknownFields.length > 0) {
    return { error: `Campos no permitidos: ${unknownFields.join(', ')}.` };
  }
  if (partial && Object.keys(payload).length === 0) {
    return { error: 'Debe enviar al menos un campo para actualizar.' };
  }

  const cliente = typeof payload.cliente === 'string' ? payload.cliente.trim() : '';
  const placa = typeof payload.placa === 'string' ? payload.placa.trim().toUpperCase() : '';
  const tipoVehiculo = payload.tipo_vehiculo;
  const servicio = payload.servicio;
  const turno = payload.turno;
  const estado = payload.estado === undefined && allowDefaultPrice ? 'EN_PROCESO' : payload.estado;
  const precio = payload.precio === undefined && allowDefaultPrice
    ? prices[tipoVehiculo]?.[servicio]
    : payload.precio;

  if (!cliente || cliente.length > 80) {
    return { error: 'cliente es obligatorio y debe tener hasta 80 caracteres.' };
  }
  if (!placa || placa.length > 15) {
    return { error: 'placa es obligatoria y debe tener hasta 15 caracteres.' };
  }
  if (!vehicleTypes.includes(tipoVehiculo)) {
    return { error: 'tipo_vehiculo debe ser MOTO, CARRO o CAMIONETA.' };
  }
  if (!services.includes(servicio)) {
    return { error: 'servicio debe ser BASICO, GENERAL o PREMIUM.' };
  }
  if (!shifts.includes(turno)) {
    return { error: 'turno debe ser MANANA o TARDE.' };
  }
  if (!states.includes(estado)) {
    return { error: 'estado debe ser EN_PROCESO o TERMINADO.' };
  }
  if (!Number.isInteger(precio) || precio <= 0 || precio > maxMySQLInt) {
    return { error: `precio debe ser un entero entre 1 y ${maxMySQLInt} COP.` };
  }

  return {
    value: {
      cliente,
      placa,
      tipo_vehiculo: tipoVehiculo,
      servicio,
      turno,
      estado,
      precio
    }
  };
}

function writeKeyMatches(providedKey, configuredKey) {
  if (typeof providedKey !== 'string') {
    return false;
  }
  const provided = Buffer.from(providedKey);
  const configured = Buffer.from(configuredKey);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

function serverError(response, error, requestId) {
  console.error(JSON.stringify({
    level: 'error',
    requestId,
    message: error.message,
    code: error.code
  }));
  return response.status(500).json({ error: 'Error interno del servidor.', requestId });
}

function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  if (!process.env.API_WRITE_KEY || Buffer.byteLength(process.env.API_WRITE_KEY) < 32) {
    throw new Error('En produccion API_WRITE_KEY es obligatorio y debe tener al menos 32 bytes.');
  }
  if (!process.env.CORS_ORIGINS?.trim()) {
    throw new Error('En produccion CORS_ORIGINS debe declarar los origenes permitidos.');
  }
  if (!process.env.DB_USER || process.env.DB_USER.toLowerCase() === 'root') {
    throw new Error('En produccion DB_USER debe ser una cuenta de aplicacion con permisos minimos, no root.');
  }
}

export function createApp(database = pool) {
  const app = express();
  const apiWriteKey = process.env.API_WRITE_KEY;
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const rateLimitStore = new MemoryStore();
  const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.WRITE_RATE_LIMIT || 60),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: rateLimitStore,
    handler: (_request, response) => response.status(429).json({ error: 'Demasiadas operaciones. Intente de nuevo mas tarde.' })
  });
  const requireWriteKey = (request, response, next) => {
    const configuredKey = process.env.API_WRITE_KEY || apiWriteKey;
    if (!configuredKey && process.env.NODE_ENV !== 'production') {
      return next();
    }
    if (!configuredKey || !writeKeyMatches(request.get('x-api-key'), configuredKey)) {
      return response.status(401).json({ error: 'Credencial de escritura no valida.' });
    }
    return next();
  };

  app.disable('x-powered-by');
  app.locals.shutdown = () => rateLimitStore.shutdown();
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(null, allowedOrigins.includes(origin));
    },
    allowedHeaders: ['Content-Type', 'X-API-Key'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }));
  app.use((request, response, next) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '../../frontend')));

  app.get('/api/health', async (_request, response) => {
    try {
      await database.query('SELECT 1');
      return response.status(200).json({ ok: true, db: 'connected' });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Health check de MySQL fallido', code: error.code }));
      return response.status(503).json({ ok: false, db: 'disconnected' });
    }
  });

  app.get('/api/dashboard', async (request, response) => {
    try {
      const [rows] = await database.query(`
        SELECT
          COUNT(*) AS total_lavados,
          COALESCE(SUM(tipo_vehiculo = 'MOTO'), 0) AS total_motos,
          COALESCE(SUM(tipo_vehiculo = 'CARRO'), 0) AS total_carros,
          COALESCE(SUM(tipo_vehiculo = 'CAMIONETA'), 0) AS total_camionetas,
          COALESCE(SUM(turno = 'MANANA'), 0) AS turno_manana,
          COALESCE(SUM(turno = 'TARDE'), 0) AS turno_tarde,
          COALESCE(SUM(estado = 'EN_PROCESO'), 0) AS en_proceso,
          COALESCE(SUM(estado = 'TERMINADO'), 0) AS terminados,
          COALESCE(SUM(precio), 0) AS ingresos_totales
        FROM lavados
      `);
      const dashboard = Object.fromEntries(
        Object.entries(rows[0]).map(([key, value]) => [key, Number(value)])
      );
      return response.json(dashboard);
    } catch (error) {
      return serverError(response, error, request.requestId);
    }
  });

  app.get('/api/lavados', async (request, response) => {
    const pagination = parsePageOptions(request.query);
    if (pagination.error) {
      return response.status(400).json({ error: pagination.error });
    }

    try {
      const [[countRow]] = await database.query('SELECT COUNT(*) AS total FROM lavados');
      const total = Number(countRow.total);
      const totalPages = Math.ceil(total / pagination.limit);
      const [rows] = await database.execute(
        'SELECT * FROM lavados ORDER BY creado_en DESC, id DESC LIMIT ? OFFSET ?',
        [pagination.limit, pagination.offset]
      );
      response.set({
        'X-Total-Count': String(total),
        'X-Page': String(pagination.page),
        'X-Page-Size': String(pagination.limit),
        'X-Total-Pages': String(totalPages)
      });
      return response.json(rows);
    } catch (error) {
      return serverError(response, error, request.requestId);
    }
  });

  app.post('/api/lavados', mutationLimiter, requireWriteKey, async (request, response) => {
    const normalized = normalizeLavado(request.body);
    if (normalized.error) {
      return response.status(400).json({ error: normalized.error });
    }

    try {
      const lavado = normalized.value;
      const [result] = await database.execute(
        `INSERT INTO lavados (cliente, placa, tipo_vehiculo, servicio, turno, estado, precio)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lavado.cliente, lavado.placa, lavado.tipo_vehiculo, lavado.servicio, lavado.turno, lavado.estado, lavado.precio]
      );
      const [rows] = await database.execute('SELECT * FROM lavados WHERE id = ?', [result.insertId]);
      return response.status(201).json(rows[0]);
    } catch (error) {
      return serverError(response, error, request.requestId);
    }
  });

  app.put('/api/lavados/:id', mutationLimiter, requireWriteKey, async (request, response) => {
    const id = parseId(request.params.id);
    if (!id) {
      return response.status(400).json({ error: 'El id debe ser un entero positivo dentro del rango de MySQL.' });
    }
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length === 0) {
      return response.status(400).json({ error: 'Debe enviar al menos un campo para actualizar.' });
    }
    const unknownField = Object.keys(request.body).find((field) => !editableFields.has(field));
    if (unknownField) {
      return response.status(400).json({ error: `Campo no permitido: ${unknownField}.` });
    }

    let connection;
    try {
      connection = await database.getConnection();
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT * FROM lavados WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) {
        await connection.rollback();
        return response.status(404).json({ error: 'Lavado no encontrado.' });
      }

      const currentLavado = Object.fromEntries(
        [...editableFields].map((field) => [
          field,
          Object.hasOwn(request.body, field) ? request.body[field] : rows[0][field]
        ])
      );
      const normalized = normalizeLavado(currentLavado, { allowDefaultPrice: false });
      if (normalized.error) {
        await connection.rollback();
        return response.status(400).json({ error: normalized.error });
      }
      const lavado = normalized.value;
      await connection.execute(
        `UPDATE lavados
         SET cliente = ?, placa = ?, tipo_vehiculo = ?, servicio = ?, turno = ?, estado = ?, precio = ?
         WHERE id = ?`,
        [lavado.cliente, lavado.placa, lavado.tipo_vehiculo, lavado.servicio, lavado.turno, lavado.estado, lavado.precio, id]
      );
      const [updatedRows] = await connection.execute('SELECT * FROM lavados WHERE id = ?', [id]);
      await connection.commit();
      return response.json(updatedRows[0]);
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }
      return serverError(response, error, request.requestId);
    } finally {
      connection?.release();
    }
  });

  app.delete('/api/lavados/:id', mutationLimiter, requireWriteKey, async (request, response) => {
    const id = parseId(request.params.id);
    if (!id) {
      return response.status(400).json({ error: 'El id debe ser un entero positivo dentro del rango de MySQL.' });
    }

    try {
      const [result] = await database.execute('DELETE FROM lavados WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return response.status(404).json({ error: 'Lavado no encontrado.' });
      }
      return response.json({ ok: true, eliminado: true, id });
    } catch (error) {
      return serverError(response, error, request.requestId);
    }
  });

  app.post('/api/verify', mutationLimiter, requireWriteKey, async (request, response) => {
    let connection;
    try {
      connection = await database.getConnection();
      await connection.beginTransaction();
      const [insertResult] = await connection.execute(
        `INSERT INTO lavados (cliente, placa, tipo_vehiculo, servicio, turno, estado, precio)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['Cliente CI', 'TEST-999', 'CARRO', 'GENERAL', 'MANANA', 'EN_PROCESO', 32000]
      );
      const [rows] = await connection.execute(
        'SELECT placa, precio FROM lavados WHERE id = ?',
        [insertResult.insertId]
      );
      const obtenido = rows[0]
        ? { placa: rows[0].placa, precio: Number(rows[0].precio) }
        : { placa: null, precio: null };
      await connection.rollback();

      const esperado = { placa: 'TEST-999', precio: 32000 };
      if (obtenido.placa !== esperado.placa || obtenido.precio !== esperado.precio) {
        return response.status(500).json({ ok: false, estado: 'OPERACION_FALLIDA', esperado, obtenido });
      }
      return response.status(200).json({ ok: true, estado: 'OPERACION_EXITOSA', esperado, obtenido });
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }
      return serverError(response, error, request.requestId);
    } finally {
      connection?.release();
    }
  });

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Endpoint no encontrado.' });
  });

  app.use((error, request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'El cuerpo JSON no es valido.' });
    }
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ error: 'El cuerpo excede el limite permitido.' });
    }
    return serverError(response, error, request.requestId);
  });

  return app;
}

export const app = createApp();

export async function startServer({ port = defaultPort, database = pool, initialize = database === pool } = {}) {
  validateProductionConfig();
  let selectedDatabase = database;
  let migrationHost;
  let ownsDatabase = false;
  const useMemoryDatabase = initialize
    && database === pool
    && process.env.NODE_ENV !== 'production';

  if (useMemoryDatabase) {
    ({ database: selectedDatabase, migrationHost, ownsDatabase } = await selectLocalDatabase(database));
  }

  if (initialize && !(selectedDatabase instanceof MemoryLavadosDatabase)) {
    if (process.env.AUTO_MIGRATE !== 'false') {
      await runMigrations(migrationHost ? { host: migrationHost } : undefined);
    }
    await initDB(10, selectedDatabase);
  }

  const serverApp = selectedDatabase === pool ? app : createApp(selectedDatabase);
  const server = serverApp.listen(port, () => {
    console.log(`Backend escuchando en el puerto ${server.address().port}`);
  });
  server.once('close', () => serverApp.locals.shutdown());
  server.database = selectedDatabase;
  server.ownsDatabase = ownsDatabase;
  return server;
}

export async function stopServer(server, database = server?.database || pool) {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  if (typeof database.end === 'function' && (database === pool || server?.ownsDatabase)) {
    await database.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let server;
  try {
    server = await startServer();
  } catch (error) {
    console.error('No fue posible iniciar el backend:', error.message);
    process.exitCode = 1;
  }

  if (server) {
    const shutdown = async () => {
      try {
        await stopServer(server);
      } catch (error) {
        console.error('Error durante el cierre:', error.message);
        process.exitCode = 1;
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}
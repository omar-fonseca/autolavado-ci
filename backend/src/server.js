import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { initDB } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPort = Number(process.env.PORT || 3000);
const vehicleTypes = ['MOTO', 'CARRO', 'CAMIONETA'];
const services = ['BASICO', 'GENERAL', 'PREMIUM'];
const shifts = ['MANANA', 'TARDE'];
const states = ['EN_PROCESO', 'TERMINADO'];
const prices = {
  MOTO: { BASICO: 12000, GENERAL: 18000, PREMIUM: 25000 },
  CARRO: { BASICO: 22000, GENERAL: 32000, PREMIUM: 45000 },
  CAMIONETA: { BASICO: 28000, GENERAL: 40000, PREMIUM: 55000 }
};

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeLavado(payload, { allowDefaultPrice = true } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' };
  }

  const cliente = typeof payload.cliente === 'string' ? payload.cliente.trim() : '';
  const placa = typeof payload.placa === 'string' ? payload.placa.trim().toUpperCase() : '';
  const tipoVehiculo = payload.tipo_vehiculo;
  const servicio = payload.servicio;
  const turno = payload.turno;
  const estado = payload.estado || 'EN_PROCESO';
  const precio = payload.precio === undefined && allowDefaultPrice
    ? prices[tipoVehiculo]?.[servicio]
    : Number(payload.precio);

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
  if (!Number.isInteger(precio) || precio <= 0) {
    return { error: 'precio debe ser un entero positivo en COP.' };
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

function sendServerError(response, error) {
  console.error(error);
  return response.status(500).json({ error: 'Error interno del servidor.' });
}

export function createApp(database = pool) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../frontend')));

  app.get('/api/health', async (_request, response) => {
  try {
    await database.query('SELECT 1');
    return response.status(200).json({ ok: true, db: 'connected' });
  } catch (error) {
    console.error('Health check de MySQL fallido:', error.message);
    return response.status(503).json({ ok: false, db: 'disconnected' });
  }
});

  app.get('/api/dashboard', async (_request, response) => {
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
    const metrics = rows[0];
    const dashboard = Object.fromEntries(
      Object.entries(metrics).map(([key, value]) => [key, Number(value)])
    );
    return response.json(dashboard);
  } catch (error) {
    return sendServerError(response, error);
  }
});

  app.get('/api/lavados', async (_request, response) => {
  try {
    const [rows] = await database.query('SELECT * FROM lavados ORDER BY creado_en DESC, id DESC');
    return response.json(rows);
  } catch (error) {
    return sendServerError(response, error);
  }
});

  app.post('/api/lavados', async (request, response) => {
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
    return sendServerError(response, error);
  }
});

  app.put('/api/lavados/:id', async (request, response) => {
  const id = parseId(request.params.id);
  if (!id) {
    return response.status(400).json({ error: 'El id debe ser un entero positivo.' });
  }

  try {
    const [rows] = await database.execute('SELECT * FROM lavados WHERE id = ?', [id]);
    if (rows.length === 0) {
      return response.status(404).json({ error: 'Lavado no encontrado.' });
    }

    const normalized = normalizeLavado({ ...rows[0], ...request.body }, { allowDefaultPrice: false });
    if (normalized.error) {
      return response.status(400).json({ error: normalized.error });
    }

    const lavado = normalized.value;
    await database.execute(
      `UPDATE lavados
       SET cliente = ?, placa = ?, tipo_vehiculo = ?, servicio = ?, turno = ?, estado = ?, precio = ?
       WHERE id = ?`,
      [lavado.cliente, lavado.placa, lavado.tipo_vehiculo, lavado.servicio, lavado.turno, lavado.estado, lavado.precio, id]
    );
    const [updatedRows] = await database.execute('SELECT * FROM lavados WHERE id = ?', [id]);
    return response.json(updatedRows[0]);
  } catch (error) {
    return sendServerError(response, error);
  }
});

  app.delete('/api/lavados/:id', async (request, response) => {
  const id = parseId(request.params.id);
  if (!id) {
    return response.status(400).json({ error: 'El id debe ser un entero positivo.' });
  }

  try {
    const [result] = await database.execute('DELETE FROM lavados WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return response.status(404).json({ error: 'Lavado no encontrado.' });
    }
    return response.json({ ok: true, eliminado: true, id });
  } catch (error) {
    return sendServerError(response, error);
  }
});

  app.post('/api/verify', async (_request, response) => {
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
    const verified = obtenido.placa === esperado.placa && obtenido.precio === esperado.precio;
    if (!verified) {
      return response.status(500).json({ ok: false, estado: 'OPERACION_FALLIDA', esperado, obtenido });
    }
    return response.status(200).json({
      ok: true,
      estado: 'OPERACION_EXITOSA',
      esperado,
      obtenido
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('No se pudo revertir la verificacion:', rollbackError.message);
      }
    }
    return sendServerError(response, error);
  } finally {
    connection?.release();
  }
});

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Endpoint no encontrado.' });
  });

  return app;
}

export const app = createApp();

export async function startServer({ port = defaultPort, database = pool, initialize = database === pool } = {}) {
  if (initialize) {
    await initDB(10, database);
  }

  const serverApp = database === pool ? app : createApp(database);
  const server = serverApp.listen(port, () => {
    console.log(`Backend escuchando en el puerto ${server.address().port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => {
    console.error('No fue posible iniciar el backend:', error);
    process.exitCode = 1;
  });
}
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import net from 'node:net';
import test, { after, before, describe } from 'node:test';
import { promisify } from 'node:util';
import pool, { createPool, runMigrations } from '../src/db.js';
import { MemoryLavadosDatabase } from '../src/memory-db.js';
import { startServer } from '../src/server.js';

function probeMySQL() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 3306 });
    const finish = (available) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(800);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function request(path, options) {
  const headers = { ...options?.headers, connection: 'close' };
  if (process.env.API_WRITE_KEY) {
    headers['x-api-key'] = process.env.API_WRITE_KEY;
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await response.json();
  return { response, body };
}

const createdIds = [];
const execFileAsync = promisify(execFile);
let database;
let mysqlTestPool;
let migrationPool;
let server;
let baseUrl;
let initialDashboard;
let realMySQL = false;
let motoId;
let carroId;

function qualityTest(name, callback) {
  test(name, { concurrency: false }, callback);
}

describe('AutoLavado CI API quality', { concurrency: false }, () => {
before(async () => {
  realMySQL = await probeMySQL();
  if (realMySQL) {
    migrationPool = createPool({
      host: '127.0.0.1',
      port: 3306,
      user: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'root',
      password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD || 'rootpassword',
      database: process.env.DB_NAME || 'autolavado_db',
    });
    await runMigrations({ database: migrationPool });
    mysqlTestPool = createPool({
      host: '127.0.0.1',
      port: 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpassword',
      database: process.env.DB_NAME || 'autolavado_db'
    });
    database = mysqlTestPool;
    console.log('[ISO/IEC 29119] Motor: MySQL real en localhost:3306');
  } else {
    database = new MemoryLavadosDatabase();
    console.log('[ISO/IEC 29119] Motor: adaptador transaccional en memoria (MySQL no disponible)');
  }

  const listeningServer = await startServer({ port: 0, database, initialize: false });
  server = listeningServer;
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  const dashboard = await request('/api/dashboard');
  assert.equal(dashboard.response.status, 200);
  initialDashboard = dashboard.body;
});

after(async () => {
  if (database && createdIds.length > 0) {
    await Promise.all(createdIds.map((id) => database.execute('DELETE FROM lavados WHERE id = ?', [id])));
  }
  if (server) {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    await closed;
  }
  if (realMySQL) {
    await mysqlTestPool.end();
    await migrationPool.end();
  }
  await pool.end();
});

qualityTest('CP-01 (Salud): API y base de datos responden conectadas', async () => {
  console.log('[ISO/IEC 29119] CP-01: GET /api/health -> 200 y db connected');
  const { response, body } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, db: 'connected' });
});

qualityTest('CP-02 (Reglas): rechaza placa ausente, tipo invalido y precio negativo', async () => {
  console.log('[ISO/IEC 29119] CP-02: datos invalidos -> 400 Bad Request');
  const valid = {
    cliente: 'Prueba QA',
    placa: 'QA-INVALID',
    tipo_vehiculo: 'MOTO',
    servicio: 'BASICO',
    turno: 'MANANA',
    precio: 12000
  };
  const invalidRecords = [
    { ...valid, placa: '' },
    { ...valid, tipo_vehiculo: 'AVION' },
    { ...valid, precio: -1 },
    { ...valid, precio: true },
    { ...valid, precio: '12000' },
    { ...valid, precio: 2147483648 },
    { ...valid, estado: '' },
    { ...valid, unknown: 'no permitido' }
  ];

  for (const record of invalidRecords) {
    const { response, body } = await request('/api/lavados', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record)
    });
    assert.equal(response.status, 400);
    assert.equal(typeof body.error, 'string');
  }
});

qualityTest('CP-03 (Creacion): crea MOTO y CARRO y normaliza placas', async () => {
  console.log('[ISO/IEC 29119] CP-03: POST /api/lavados -> 201 y placa en mayusculas');
  const records = [
    {
      cliente: 'QA Moto', placa: 'qa-moto-01', tipo_vehiculo: 'MOTO',
      servicio: 'BASICO', turno: 'MANANA', precio: 12000
    },
    {
      cliente: 'QA Carro', placa: 'qa-carro-01', tipo_vehiculo: 'CARRO',
      servicio: 'BASICO', turno: 'MANANA', precio: 22000
    }
  ];

  for (const record of records) {
    const { response, body } = await request('/api/lavados', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record)
    });
    assert.equal(response.status, 201);
    assert.equal(body.placa, record.placa.toUpperCase());
    assert.equal(body.estado, 'EN_PROCESO');
    createdIds.push(body.id);
    if (record.tipo_vehiculo === 'MOTO') {
      motoId = body.id;
    } else {
      carroId = body.id;
    }
  }
});

qualityTest('CP-04 (Lectura): lista los registros recien creados', async () => {
  console.log('[ISO/IEC 29119] CP-04: GET /api/lavados -> contiene los nuevos registros');
  const { response, body } = await request('/api/lavados?page=1&limit=100');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(response.headers.get('x-page'), '1');
  assert.equal(response.headers.get('x-page-size'), '100');
  assert.ok(body.some((row) => row.id === motoId));
  assert.ok(body.some((row) => row.id === carroId));
});

qualityTest('CP-05 (Actualizacion): cambia estado y precio', async () => {
  console.log('[ISO/IEC 29119] CP-05: PUT /api/lavados/:id -> estado y precio actualizados');
  const { response, body } = await request(`/api/lavados/${motoId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ estado: 'TERMINADO', precio: 15000 })
  });
  assert.equal(response.status, 200);
  assert.equal(body.estado, 'TERMINADO');
  assert.equal(Number(body.precio), 15000);
});

qualityTest('CP-06 (Metricas): dashboard calcula conteos e ingresos exactos', async () => {
  console.log('[ISO/IEC 29119] CP-06: GET /api/dashboard -> metricas exactas sobre la linea base');
  const { response, body } = await request('/api/dashboard');
  assert.equal(response.status, 200);
  assert.equal(body.total_lavados, initialDashboard.total_lavados + 2);
  assert.equal(body.total_motos, initialDashboard.total_motos + 1);
  assert.equal(body.total_carros, initialDashboard.total_carros + 1);
  assert.equal(body.turno_manana, initialDashboard.turno_manana + 2);
  assert.equal(body.terminados, initialDashboard.terminados + 1);
  assert.equal(body.ingresos_totales, initialDashboard.ingresos_totales + 37000);
});

qualityTest('CP-07 (Eliminacion): elimina una vez y luego responde 404', async () => {
  console.log('[ISO/IEC 29119] CP-07: DELETE /api/lavados/:id -> 200 y repeticion -> 404');
  const first = await request(`/api/lavados/${motoId}`, { method: 'DELETE' });
  assert.equal(first.response.status, 200);
  const second = await request(`/api/lavados/${motoId}`, { method: 'DELETE' });
  assert.equal(second.response.status, 404);
});

qualityTest('CP-08 (CI/CD): verifica el registro temporal sin cambiar el dashboard', async () => {
  console.log('[ISO/IEC 29119] CP-08: POST /api/verify -> operacion exitosa sin ensuciar metricas');
  const beforeVerify = await request('/api/dashboard');
  const { response, body } = await request('/api/verify', { method: 'POST' });
  const afterVerify = await request('/api/dashboard');

  assert.equal(response.status, 200);
  assert.equal(body.estado, 'OPERACION_EXITOSA');
  assert.equal(body.esperado.placa, 'TEST-999');
  assert.equal(body.obtenido.precio, 32000);
  assert.deepEqual(afterVerify.body, beforeVerify.body);

  const { stdout } = await execFileAsync(process.execPath, ['tests/verify-ci.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(new URL(baseUrl).port) }
  });
  assert.match(stdout, /Verificacion E2E CI\/CD/);
  assert.match(stdout, /PASS/);
});

qualityTest('CP-09 (Actualizacion): rechaza IDs, campos y valores invalidos sin mutar datos', async () => {
  const invalidCases = [
    ['/api/lavados/1e2', { estado: 'TERMINADO' }, 400],
    ['/api/lavados/2147483648', { estado: 'TERMINADO' }, 400],
    [`/api/lavados/${carroId}`, {}, 400],
    [`/api/lavados/${carroId}`, { estado: '' }, 400],
    [`/api/lavados/${carroId}`, { precio: '32000' }, 400],
    [`/api/lavados/${carroId}`, { extra: 'no permitido' }, 400],
    ['/api/lavados/2147483647', { estado: 'TERMINADO' }, 404]
  ];

  for (const [path, body, expectedStatus] of invalidCases) {
    const { response } = await request(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, expectedStatus, `${path} debe responder ${expectedStatus}`);
  }
});

qualityTest('CP-10 (Paginacion): limita resultados y valida parametros', async () => {
  const firstPage = await request('/api/lavados?page=1&limit=1');
  assert.equal(firstPage.response.status, 200);
  assert.equal(firstPage.body.length, 1);
  assert.equal(firstPage.response.headers.get('x-page-size'), '1');
  assert.ok(Number(firstPage.response.headers.get('x-total-count')) >= 1);

  const invalidPage = await request('/api/lavados?page=0&limit=101');
  assert.equal(invalidPage.response.status, 400);
});

qualityTest('CP-11 (Errores HTTP): responde JSON para cuerpo invalido y demasiado grande', async () => {
  const malformed = await request('/api/lavados', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{invalid'
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(typeof malformed.body.error, 'string');

  const oversized = await request('/api/lavados', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(33 * 1024) })
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(typeof oversized.body.error, 'string');
});

qualityTest('CP-12 (Seguridad): protege escrituras con clave y agrega cabeceras seguras', async () => {
  const previousKey = process.env.API_WRITE_KEY;
  const testKey = 'quality-test-key-with-at-least-32-bytes';
  process.env.API_WRITE_KEY = testKey;

  try {
    const payload = {
      cliente: 'QA Secure', placa: 'SECURE-01', tipo_vehiculo: 'MOTO',
      servicio: 'BASICO', turno: 'TARDE', precio: 12000
    };
    const denied = await fetch(`${baseUrl}/api/lavados`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify(payload)
    });
    assert.equal(denied.status, 401);

    const accepted = await fetch(`${baseUrl}/api/lavados`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': testKey, connection: 'close' },
      body: JSON.stringify(payload)
    });
    assert.equal(accepted.status, 201);
    assert.ok(accepted.headers.get('x-request-id'));
    assert.equal(accepted.headers.get('x-content-type-options'), 'nosniff');
    const created = await accepted.json();
    createdIds.push(created.id);
  } finally {
    if (previousKey === undefined) {
      delete process.env.API_WRITE_KEY;
    } else {
      process.env.API_WRITE_KEY = previousKey;
    }
  }
});

qualityTest('CP-13 (Resiliencia): representa fallos de MySQL con estados y requestId', async () => {
  database.failHealth = true;
  const health = await request('/api/health');
  assert.equal(health.response.status, 503);
  assert.deepEqual(health.body, { ok: false, db: 'disconnected' });
  database.failHealth = false;

  database.failDashboard = true;
  const dashboard = await request('/api/dashboard');
  assert.equal(dashboard.response.status, 500);
  assert.equal(typeof dashboard.body.error, 'string');
  assert.ok(dashboard.body.requestId);
  assert.equal(dashboard.response.headers.get('x-request-id'), dashboard.body.requestId);
  database.failDashboard = false;
});

qualityTest('CP-14 (Proteccion): limita escrituras y devuelve 429 al exceder el umbral', async () => {
  const responses = await Promise.all(Array.from({ length: 65 }, () => request('/api/lavados', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  })));
  assert.ok(responses.some(({ response }) => response.status === 429));
});
});
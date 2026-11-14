import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import net from 'node:net';
import test, { after, before } from 'node:test';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import { initDB } from '../src/db.js';
import { startServer } from '../src/server.js';

class MemoryLavadosDatabase {
  rows = [];
  nextId = 1;

  async query(sql) {
    const statement = sql.trim().toLowerCase();
    if (statement === 'select 1') {
      return [[{ 1: 1 }], []];
    }
    if (statement.includes('count(*)') && statement.includes('from lavados')) {
      const metrics = {
        total_lavados: this.rows.length,
        total_motos: this.rows.filter((row) => row.tipo_vehiculo === 'MOTO').length,
        total_carros: this.rows.filter((row) => row.tipo_vehiculo === 'CARRO').length,
        total_camionetas: this.rows.filter((row) => row.tipo_vehiculo === 'CAMIONETA').length,
        turno_manana: this.rows.filter((row) => row.turno === 'MANANA').length,
        turno_tarde: this.rows.filter((row) => row.turno === 'TARDE').length,
        en_proceso: this.rows.filter((row) => row.estado === 'EN_PROCESO').length,
        terminados: this.rows.filter((row) => row.estado === 'TERMINADO').length,
        ingresos_totales: this.rows.reduce((total, row) => total + row.precio, 0)
      };
      return [[metrics], []];
    }
    if (statement.startsWith('select * from lavados')) {
      const rows = [...this.rows].sort((a, b) => b.creado_en - a.creado_en || b.id - a.id);
      return [rows, []];
    }
    throw new Error(`Consulta no implementada por el adaptador de prueba: ${sql}`);
  }

  async execute(sql, parameters = []) {
    const statement = sql.trim().toLowerCase();

    if (statement.startsWith('insert into lavados')) {
      const [cliente, placa, tipo_vehiculo, servicio, turno, estado, precio] = parameters;
      const row = {
        id: this.nextId++,
        cliente,
        placa,
        tipo_vehiculo,
        servicio,
        turno,
        estado,
        precio,
        creado_en: new Date()
      };
      this.rows.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }

    if (statement.startsWith('select placa, precio from lavados where id = ?')) {
      const row = this.rows.find((item) => item.id === Number(parameters[0]));
      return [row ? [{ placa: row.placa, precio: row.precio }] : [], []];
    }

    if (statement.startsWith('select * from lavados where id = ?')) {
      const row = this.rows.find((item) => item.id === Number(parameters[0]));
      return [row ? [{ ...row }] : [], []];
    }

    if (statement.startsWith('update lavados')) {
      const [cliente, placa, tipo_vehiculo, servicio, turno, estado, precio, id] = parameters;
      const row = this.rows.find((item) => item.id === Number(id));
      if (!row) {
        return [{ affectedRows: 0 }, []];
      }
      Object.assign(row, { cliente, placa, tipo_vehiculo, servicio, turno, estado, precio });
      return [{ affectedRows: 1 }, []];
    }

    if (statement.startsWith('delete from lavados where id = ?')) {
      const id = Number(parameters[0]);
      const index = this.rows.findIndex((item) => item.id === id);
      if (index < 0) {
        return [{ affectedRows: 0 }, []];
      }
      this.rows.splice(index, 1);
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`Operacion no implementada por el adaptador de prueba: ${sql}`);
  }

  async getConnection() {
    const database = this;
    let snapshot;

    return {
      async beginTransaction() {
        snapshot = database.rows.map((row) => ({ ...row }));
      },
      execute: (sql, parameters) => database.execute(sql, parameters),
      async rollback() {
        if (snapshot) {
          database.rows = snapshot;
          snapshot = undefined;
        }
      },
      async commit() {
        snapshot = undefined;
      },
      release() {}
    };
  }
}

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
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

const createdIds = [];
const execFileAsync = promisify(execFile);
let database;
let mysqlTestPool;
let server;
let baseUrl;
let initialDashboard;
let realMySQL = false;
let motoId;
let carroId;

before(async () => {
  realMySQL = await probeMySQL();
  if (realMySQL) {
    mysqlTestPool = mysql.createPool({
      host: '127.0.0.1',
      port: 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpassword',
      database: process.env.DB_NAME || 'autolavado_db',
      waitForConnections: true,
      connectionLimit: 4
    });
    database = mysqlTestPool;
    await initDB(10, database);
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
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  if (realMySQL) {
    await mysqlTestPool.end();
  }
});

test('CP-01 (Salud): API y base de datos responden conectadas', async () => {
  console.log('[ISO/IEC 29119] CP-01: GET /api/health -> 200 y db connected');
  const { response, body } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, db: 'connected' });
});

test('CP-02 (Reglas): rechaza placa ausente, tipo invalido y precio negativo', async () => {
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
    { ...valid, precio: -1 }
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

test('CP-03 (Creacion): crea MOTO y CARRO y normaliza placas', async () => {
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

test('CP-04 (Lectura): lista los registros recien creados', async () => {
  console.log('[ISO/IEC 29119] CP-04: GET /api/lavados -> contiene los nuevos registros');
  const { response, body } = await request('/api/lavados');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((row) => row.id === motoId));
  assert.ok(body.some((row) => row.id === carroId));
});

test('CP-05 (Actualizacion): cambia estado y precio', async () => {
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

test('CP-06 (Metricas): dashboard calcula conteos e ingresos exactos', async () => {
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

test('CP-07 (Eliminacion): elimina una vez y luego responde 404', async () => {
  console.log('[ISO/IEC 29119] CP-07: DELETE /api/lavados/:id -> 200 y repeticion -> 404');
  const first = await request(`/api/lavados/${motoId}`, { method: 'DELETE' });
  assert.equal(first.response.status, 200);
  const second = await request(`/api/lavados/${motoId}`, { method: 'DELETE' });
  assert.equal(second.response.status, 404);
});

test('CP-08 (CI/CD): verifica el registro temporal sin cambiar el dashboard', async () => {
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
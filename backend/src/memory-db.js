export class MemoryLavadosDatabase {
  rows = [];
  nextId = 1;
  failHealth = false;
  failDashboard = false;

  async query(sql) {
    const statement = sql.trim().toLowerCase();
    if (statement === 'select 1') {
      if (this.failHealth) {
        throw new Error('simulated database outage');
      }
      return [[{ 1: 1 }], []];
    }
    if (this.failDashboard && statement.includes('count(*)') && statement.includes('from lavados')) {
      throw new Error('simulated dashboard database failure');
    }
    if (statement === 'select count(*) as total from lavados') {
      return [[{ total: this.rows.length }], []];
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
    throw new Error(`Consulta no implementada por el adaptador de memoria: ${sql}`);
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

    if (statement.startsWith('select * from lavados order by')) {
      const [limit, offset] = parameters.map(Number);
      const rows = [...this.rows]
        .sort((a, b) => b.creado_en - a.creado_en || b.id - a.id)
        .slice(offset, offset + limit);
      return [rows, []];
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

    throw new Error(`Operacion no implementada por el adaptador de memoria: ${sql}`);
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
import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS lavados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente VARCHAR(80) NOT NULL,
    placa VARCHAR(15) NOT NULL,
    tipo_vehiculo ENUM('MOTO', 'CARRO', 'CAMIONETA') NOT NULL,
    servicio ENUM('BASICO', 'GENERAL', 'PREMIUM') NOT NULL,
    turno ENUM('MANANA', 'TARDE') NOT NULL,
    estado ENUM('EN_PROCESO', 'TERMINADO') DEFAULT 'EN_PROCESO',
    precio INT NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

export async function initDB(retries = 10, database = pool) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let connection;

    try {
      connection = await database.getConnection();
      await connection.query(createTableQuery);
      console.log('Base de datos lista: tabla lavados disponible');
      return;
    } catch (error) {
      lastError = error;
      console.error(`MySQL no disponible (intento ${attempt}/${retries}): ${error.message}`);
    } finally {
      connection?.release();
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`No fue posible inicializar la base de datos: ${lastError?.message || 'sin detalles'}`);
}

export default pool;
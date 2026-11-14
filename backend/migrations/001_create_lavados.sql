CREATE TABLE IF NOT EXISTS lavados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente VARCHAR(80) NOT NULL,
  placa VARCHAR(15) NOT NULL,
  tipo_vehiculo ENUM('MOTO', 'CARRO', 'CAMIONETA') NOT NULL,
  servicio ENUM('BASICO', 'GENERAL', 'PREMIUM') NOT NULL,
  turno ENUM('MANANA', 'TARDE') NOT NULL,
  estado ENUM('EN_PROCESO', 'TERMINADO') DEFAULT 'EN_PROCESO',
  precio INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_lavados_precio_positive CHECK (precio > 0),
  INDEX idx_lavados_creado_id (creado_en, id)
)
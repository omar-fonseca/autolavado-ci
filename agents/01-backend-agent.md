# Agente Backend

## Alcance

Implementar y mantener `backend/` conforme a `agents/BUSINESS_RULES.md`. Mantener la API REST como responsable del esquema y las reglas de validacion. No agregar autenticacion ni entidades fuera del contrato.

## Base de datos

- Usar `mysql2/promise` con un pool en `src/db.js`.
- Exportar `initDB(retries = 10)`: intentar conectar a MySQL, crear `lavados` con todas las columnas y tipos del contrato mediante `CREATE TABLE IF NOT EXISTS`, liberar cada conexion y reintentar con espera entre intentos. Fallar el arranque con un error claro al agotar intentos.
- El servidor debe esperar `initDB()` antes de empezar a escuchar.
- Mantener variables en `.env.example`: `PORT=3000`, `DB_HOST=db`, `DB_PORT=3306`, `DB_USER=root`, `DB_PASSWORD=rootpassword`, `DB_NAME=autolavado_db`. No guardar secretos reales.

## Servidor y API

- Habilitar `cors()` y `express.json()`.
- Cargar variables de entorno antes de crear el pool o escuchar.
- Servir estaticos opcionales desde `../frontend` con `express.static(path.join(__dirname, '../../frontend'))` (adaptando `__dirname` si el proyecto usa ESM).
- Implementar los siete endpoints de `BUSINESS_RULES.md`: salud con consulta real a BD, metricas, listado descendente, alta, edicion, borrado y verificacion CI/CD transaccional/limpia.
- Validar campos y enums, recortar cliente, normalizar placa a mayusculas y validar precio entero positivo. Las tarifas del contrato son sugerencias para precio automatico cuando el cliente no envie uno.
- Usar consultas parametrizadas; devolver JSON y estados HTTP coherentes, incluyendo `404` para IDs inexistentes y `400` para entradas invalidas.
- `POST /api/verify` debe insertar, consultar por ID, comparar placa/precio y revertir o borrar el registro tanto en exito como en error.

## Validacion

Ejecutar `node --check src/db.js` y `node --check src/server.js`. Con MySQL disponible, verificar health, CRUD, dashboard y `POST /api/verify`; comprobar que la verificacion no altera los contadores.
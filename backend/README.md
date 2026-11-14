# Backend AutoLavado CI

## Desarrollo

1. Copiar `.env.example` a `.env` y completar credenciales de una base `autolavado_db`.
2. Ejecutar `npm install`.
3. Aplicar esquema con `npm run db:migrate`.
4. Iniciar API con `npm start`; ejecutar la suite con `npm test`.

`npm start` solo comprueba que MySQL responda y que exista la tabla; no ejecuta DDL. Aplicar `npm run db:migrate` como paso separado con el usuario `MIGRATION_DB_USER` antes de iniciar la API, tanto en desarrollo como en produccion. Las migraciones toman un bloqueo asesor de MySQL para evitar ejecuciones simultaneas y comprueban restricciones/indices antes de reintentar un cambio cuyo DDL se hubiera aplicado antes de registrar su version.

## Roles de MySQL

Crear primero la base y los usuarios mediante una cuenta administrativa. Reemplazar los valores de ejemplo por secretos administrados fuera del repositorio:

```sql
CREATE DATABASE autolavado_db;
CREATE USER 'autolavado_app'@'%' IDENTIFIED BY 'REEMPLAZAR_SECRETO_APP';
GRANT SELECT, INSERT, UPDATE, DELETE ON autolavado_db.* TO 'autolavado_app'@'%';
CREATE USER 'autolavado_migrator'@'%' IDENTIFIED BY 'REEMPLAZAR_SECRETO_MIGRACIONES';
GRANT SELECT, INSERT, CREATE, ALTER, INDEX ON autolavado_db.* TO 'autolavado_migrator'@'%';
```

La API usa solo el usuario `autolavado_app`. El usuario migrador se limita al comando `npm run db:migrate` y no debe usarse para servir peticiones.

## Seguridad de escritura

En `NODE_ENV=production`, el proceso no inicia sin `API_WRITE_KEY` de al menos 32 bytes, `CORS_ORIGINS` con los origenes exactos permitidos y un `DB_USER` distinto de `root`. Las rutas `POST`, `PUT` y `DELETE` requieren `X-API-Key`; las escrituras tienen un limite configurable con `WRITE_RATE_LIMIT` (60 cada 15 minutos por IP por defecto). El limite usa memoria local y no se comparte entre replicas. Helmet agrega cabeceras de seguridad y los cuerpos JSON se limitan a 32 KB.

No incluir `API_WRITE_KEY` en JavaScript del navegador ni en variables compiladas del frontend: cualquier secreto del navegador es publico. En produccion, un proxy/BFF de confianza debe inyectar la cabecera, o debe integrarse un mecanismo de identidad apropiado antes de exponer escritura directa. El modo de desarrollo sin clave es solo para una red local controlada.

## API y decisiones

- `GET /api/lavados` mantiene una respuesta array y pagina con `page` (1 por defecto) y `limit` (50 por defecto, maximo 100). Expone `X-Total-Count`, `X-Page`, `X-Page-Size` y `X-Total-Pages`.
- `PUT /api/lavados/:id` conserva actualizacion parcial: solo aplica los campos enviados y conserva el resto. Campos desconocidos y valores invalidos se rechazan.
- `GET /api/dashboard` resume todos los lavados historicos: `ingresos_totales` suma el precio de cada registro existente, sin filtrar por fecha ni estado. Eliminar un lavado elimina tambien su precio del total.
- Las respuestas de error de API son JSON; errores de validacion usan `400`, credenciales invalidas `401`, limite excedido `429`, no encontrado `404`, fallo de BD en health `503` y errores inesperados `500` con `requestId`.

## Migraciones

Los SQL versionados viven en `migrations/` y se registran en `schema_migrations`. Agregar una nueva migracion numerada; no editar migraciones que ya fueron aplicadas en un entorno compartido. Ejecutar las migraciones una sola vez por despliegue antes de iniciar nuevas replicas de la API.
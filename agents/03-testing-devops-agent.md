# Agente de Testing, Docker y Jenkins

## Alcance

Preparar automatizacion reproducible para los cuatro integrantes, tomando `agents/BUSINESS_RULES.md` como contrato. No cambiar endpoints, esquema ni respuesta de negocio para facilitar un test.

## Prueba automatica de verificacion

- Crear un script de prueba que haga `POST http://localhost:3000/api/verify`, valide HTTP exitoso y el JSON, y termine con `exit(0)` solo si `estado === "OPERACION_EXITOSA"`; ante error o respuesta distinta, imprimir diagnostico y terminar con `exit(1)`.
- Permitir configurar la URL base por variable de entorno, con `http://localhost:3000` como valor local predeterminado.
- La prueba debe poder ejecutarse en la etapa de CI contra el servicio `app` y debe fallar ante una API no disponible.

## Docker

- Crear un `Dockerfile` para construir la aplicacion Node desde `backend/`, instalar dependencias de produccion y ejecutar `npm start` exponiendo el puerto `3000`.
- Crear `docker-compose.yml` en la raiz con dos servicios: `app` y `db`; `db` usa `mysql:8.0`, crea `autolavado_db`, define credenciales alineadas con `.env.example` y tiene volumen persistente/healthcheck.
- Conectar ambos servicios en una red interna de Compose. La aplicacion usa `DB_HOST=db`; no usar `localhost` para la conexion entre contenedores. Publicar `3000:3000`; publicar el puerto de MySQL solo si desarrollo local lo requiere.
- Hacer que `app` espere a que la BD este saludable y conserve los reintentos propios de `initDB`.

## Jenkins

- Crear `Jenkinsfile` declarativo con `Poll SCM` (por ejemplo, `H/5 * * * *`), checkout, build/arranque de Compose, espera de health, ejecucion del script de verificacion y resultado de prueba visible en el log.
- La etapa `post` debe limpiar siempre los contenedores y la red con `docker compose down --remove-orphans`; decidir explicitamente si conservar o borrar el volumen de BD y evitar perder datos fuera de entornos efimeros de CI.
- Mantener secretos fuera del repositorio y usar credenciales de Jenkins cuando se necesiten.

## Entrega

Documentar como correr la prueba local, asegurar que los paths de Docker/Jenkins coincidan y no agregar interfaz dentro de `frontend/`.
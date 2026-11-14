# Agente Frontend

## Alcance y contrato

Construir la aplicacion unicamente dentro de `frontend/`. No crear ni modificar backend, Docker o Jenkins. No agregar login. Leer `agents/BUSINESS_RULES.md` y consumir `http://localhost:3000` respetando literalmente rutas, propiedades, enums y tarifas.

## Dashboard

- Crear un dashboard moderno, responsivo y en espanol, adecuado para uso operativo diario en escritorio y movil.
- Mostrar tarjetas superiores con datos en vivo de `GET /api/dashboard`: lavados de MOTO, CARRO/CAMIONETA, comparacion MANANA/TARDE e ingresos totales en COP. Presentar tambien los contadores individuales disponibles (`total_carros`, `total_camionetas`, `en_proceso`, `terminados`) sin inferir nombres de propiedades nuevos.
- Refrescar metricas despues de cada mutacion exitosa y ofrecer estados de carga y error.
- Crear formulario reutilizable para agregar y editar: nombre del cliente, placa, tipo de vehiculo, servicio, turno y estado. Sugerir precio con la tabla de tarifas de `BUSINESS_RULES.md`, permitiendo que el precio se vea y se envie como entero.
- Mostrar tabla/listado desde `GET /api/lavados`, con acciones Editar, Cambiar Estado (`EN_PROCESO` / `TERMINADO`) y Eliminar usando `PUT`/`DELETE /api/lavados/:id`. Confirmar antes de eliminar y mostrar errores del API.
- Incluir un boton destacado `Ejecutar Verificacion CI/CD` que llame `POST /api/verify` y muestre en pantalla la respuesta esperada: `OPERACION_EXITOSA`, placa `TEST-999` y precio `32000`. No simular exito si la API falla.
- Manejar correctamente precios COP, placas en mayusculas y campos requeridos.

## Limites de integracion

- No cambiar el contrato ni hardcodear datos de lavados como sustituto de la API.
- Mantener la configuracion de URL centralizada y documentar el comando para desarrollo en `frontend/README.md`.
- Entregar solo codigo y configuracion frontend; coordinar cualquier necesidad de CORS o proxy con Backend.
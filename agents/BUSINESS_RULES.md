# AutoLavado CI: reglas de negocio y contrato unico

## Dominio

AutoLavado CI es un sistema de control operativo para un autolavado. El MVP no tiene login ni autenticacion: los flujos deben ser directos y no deben agregar una barrera de acceso.

## Persistencia

La unica entidad de negocio es `lavados`, almacenada en la base MySQL `autolavado_db`.

| Columna | Definicion |
| --- | --- |
| `id` | `INT AUTO_INCREMENT PRIMARY KEY` |
| `cliente` | `VARCHAR(80) NOT NULL`, nombre de la persona |
| `placa` | `VARCHAR(15) NOT NULL`, guardar en mayusculas (ejemplo: `ABC-123`) |
| `tipo_vehiculo` | `ENUM('MOTO', 'CARRO', 'CAMIONETA') NOT NULL` |
| `servicio` | `ENUM('BASICO', 'GENERAL', 'PREMIUM') NOT NULL` |
| `turno` | `ENUM('MANANA', 'TARDE') NOT NULL` |
| `estado` | `ENUM('EN_PROCESO', 'TERMINADO') DEFAULT 'EN_PROCESO'` |
| `precio` | `INT NOT NULL`, valor en COP (por ejemplo: 15000, 30000, 45000) |
| `creado_en` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |

### Tarifas sugeridas de referencia (COP)

| Vehiculo | BASICO | GENERAL | PREMIUM |
| --- | ---: | ---: | ---: |
| MOTO | 12000 | 18000 | 25000 |
| CARRO | 22000 | 32000 | 45000 |
| CAMIONETA | 28000 | 40000 | 55000 |

Las tarifas son sugerencias para precargar el formulario y completar un precio omitido. El precio guardado siempre debe ser un entero positivo en COP.

## Contrato HTTP

Base URL local: `http://localhost:3000`. Las respuestas de error deben usar un estado HTTP apropiado y JSON con una propiedad `error` descriptiva. No se debe cambiar nombres de rutas, campos o valores de enumeracion sin coordinar una nueva version de este contrato.

| Metodo y ruta | Comportamiento y respuesta exitosa |
| --- | --- |
| `GET /api/health` | Comprueba servidor y base de datos. `200`: `{"ok":true,"db":"connected"}`. Si la BD no esta disponible, responder `503`. |
| `GET /api/dashboard` | Resumen operativo en tiempo real con `total_lavados`, `total_motos`, `total_carros`, `total_camionetas`, `turno_manana`, `turno_tarde`, `en_proceso`, `terminados` e `ingresos_totales`. |
| `GET /api/lavados` | Lista todos los lavados, ordenados del mas reciente al mas antiguo. `200`. |
| `POST /api/lavados` | Crea un lavado. `201`. El estado inicial es `EN_PROCESO` si no se envia. |
| `PUT /api/lavados/:id` | Actualiza cliente, placa, tipo_vehiculo, servicio, turno, estado o precio. `200`. |
| `DELETE /api/lavados/:id` | Elimina el lavado identificado. `200`. |
| `POST /api/verify` | Ejecuta la operacion de control de CI/CD descrita abajo. |

Las propiedades del resumen y del contrato de verificacion son nombres estables en `snake_case`. El backend normaliza `placa` a mayusculas.

### Verificacion CI/CD

`POST /api/verify` inserta un lavado de control con `cliente: 'Cliente CI'`, `placa: 'TEST-999'`, `tipo_vehiculo: 'CARRO'`, `servicio: 'GENERAL'`, `turno: 'MANANA'` y `precio: 32000`. Consulta el registro por el ID recien creado, comprueba placa y precio y limpia el registro de prueba antes de responder, incluso ante error. Puede usarse una transaccion con rollback para garantizar que no contamine el dashboard.

En caso exitoso responde `200` exactamente con esta forma:

```json
{
  "ok": true,
  "estado": "OPERACION_EXITOSA",
  "esperado": { "placa": "TEST-999", "precio": 32000 },
  "obtenido": { "placa": "TEST-999", "precio": 32000 }
}
```

## Reglas compartidas

- `tipo_vehiculo`: `MOTO`, `CARRO` o `CAMIONETA`.
- `servicio`: `BASICO`, `GENERAL` o `PREMIUM`.
- `turno`: `MANANA` o `TARDE`.
- `estado`: `EN_PROCESO` o `TERMINADO`.
- El dashboard suma `precio` de los lavados existentes en `ingresos_totales`.
- No crear otras entidades para representar lavados, clientes, pagos o usuarios en este MVP.
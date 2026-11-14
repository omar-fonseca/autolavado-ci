# AutoLavado Ops — Plataforma de Control Operativo y Gestión Vehicular

Sistema empresarial para la gestión operativa en tiempo real de centros de lavado vehicular, control de turnos diarios, liquidación automática por tipología de vehículo y auditoría transaccional. Diseñado bajo una arquitectura desacoplada de micro-componentes contenerizados con flujos automatizados de Integración Continua y Entrega Continua (CI/CD).

## Visión General del Sistema

**AutoLavado Ops (`autolavado-ci`)** centraliza la operación diaria de bahías de lavado permitiendo registrar, auditar y totalizar el flujo de vehículos (**Motos, Automóviles y Camionetas**) por franja operativa (**Turno Mañana y Turno Tarde**). La plataforma garantiza trazabilidad completa desde la recepción del vehículo hasta el cierre del servicio, exponiendo métricas operativas en tiempo real y un motor de autoverificación transaccional para entornos de integración continua.

## Arquitectura e Ingeniería por Roles del Equipo

El desarrollo y operación de la plataforma se estructura en cuatro frentes de ingeniería especializados que trabajan de forma coordinada sobre el mismo contrato de dominio (`agents/BUSINESS_RULES.md`):

| Frente de Ingeniería | Alcance Técnico y Responsabilidades en la Plataforma | Directorio / Artefactos Clave |
| :--- | :--- | :--- |
| **1. Ingeniería de Frontend & Experiencia Operativa** | Construcción del Dashboard interactivo de control diario, visualización de KPIs en vivo (conteo de motos, automóviles, camionetas, turnos e ingresos), formularios reactivos de registro/edición y panel de disparo de diagnóstico operativo. | `frontend/` · `agents/02-frontend-agent.md` |
| **2. Ingeniería de Backend, Reglas de Negocio & Datos** | Implementación de la API RESTful en [Node.js](https://nodejs.org/) y [Express](https://expressjs.com/), validación de reglas de negocio y tarifas, capa de seguridad/control de acceso (CORS, sanitización de payloads y políticas de autorización) y persistencia relacional en [MySQL](https://dev.mysql.com/doc/) con aprovisionamiento automático de esquemas. | `backend/` · `agents/01-backend-agent.md` |
| **3. Ingeniería de Contenerización & Infraestructura** | Empaquetado estandarizado de la aplicación mediante `Dockerfile` optimizado y orquestación multi-contenedor con [Docker Compose](https://docs.docker.com/compose/), aislando el servidor de aplicación y el motor de base de datos en una red privada interna con resolución DNS por nombre de servicio (`db`). | `Dockerfile` · `docker-compose.yml` · `.env.example` |
| **4. Ingeniería de Calidad (QA), CI/CD & Despliegue** | Automatización de pruebas de integración transaccional (`/api/verify`), codificación del pipeline declarativo (`Jenkinsfile`) sobre [Jenkins](https://www.jenkins.io/doc/) con detección automática de cambios (`Poll SCM`), integración con [GitHub Actions](https://docs.github.com/actions) y aseguramiento de despliegues limpios. | `Jenkinsfile` · `tests/` · `agents/03-testing-devops-agent.md` |

## Reglas de Negocio y Matriz Tarifaria

La plataforma aplica validación estricta sobre los registros operativos y estandariza las tarifas de referencia (en COP) según la combinación de tipología vehicular y nivel de servicio:

| Tipología de Vehículo (`tipo_vehiculo`) | Lavado Básico (`BASICO`) | Lavado General (`GENERAL`) | Lavado Premium (`PREMIUM`) |
| :--- | ---: | ---: | ---: |
| **Motocicleta (`MOTO`)** | $12.000 | $18.000 | $25.000 |
| **Automóvil (`CARRO`)** | $22.000 | $32.000 | $45.000 |
| **Camioneta / SUV (`CAMIONETA`)** | $28.000 | $40.000 | $55.000 |

Cada orden de trabajo registra el nombre del titular (`cliente`), identificador de placa normalizado en mayúsculas (`placa`), franja operativa (`MANANA` o `TARDE`) y estado de bahía (`EN_PROCESO` o `TERMINADO`).

## Estructura del Repositorio

```text
autolavado-ci/
├── agents/                        # Especificaciones de arquitectura y contexto multiagente
│   ├── BUSINESS_RULES.md          # Contrato único de datos, reglas de negocio y API
│   ├── 00-orchestrator.md         # Lineamientos del orquestador de arquitectura
│   ├── 01-backend-agent.md        # Especificación técnica del módulo Backend y BD
│   ├── 02-frontend-agent.md       # Especificación técnica del Dashboard Frontend
│   └── 03-testing-devops-agent.md # Especificación de pruebas, Docker y pipelines CI/CD
├── backend/                       # Servicio API REST (Node.js + Express + MySQL2)
│   ├── src/
│   │   ├── db.js                  # Pool de conexiones MySQL con reintentos e inicialización
│   │   └── server.js              # Rutas CRUD, agregaciones de Dashboard y verificación CI
│   ├── .env.example               # Plantilla de variables de entorno requeridas
│   └── package.json               # Manifiesto de dependencias y scripts del servidor
├── frontend/                      # Interfaz operativa web (Dashboard de control diario)
├── Dockerfile                     # Definición de imagen del contenedor de aplicación
├── docker-compose.yml             # Orquestación de contenedores (App + MySQL) y red interna
├── Jenkinsfile                    # Pipeline declarativo de Integración Continua
└── README.md                      # Documentación técnica y operativa del sistema
```

## Especificación de la API REST

El servicio de Backend expone los siguientes endpoints sobre el puerto configurado (`3000` por defecto):

| Método | Ruta HTTP | Descripción Funcional | Código de Éxito |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Verifica la disponibilidad del servidor Node.js y la conectividad activa con el contenedor `db`. | `200 OK` |
| `GET` | `/api/dashboard` | Retorna indicadores consolidados del día: total de motos, carros, camionetas, distribución por turnos e ingresos acumulados. | `200 OK` |
| `GET` | `/api/lavados` | Lista el historial completo de órdenes de lavado ordenado cronológicamente. | `200 OK` |
| `POST` | `/api/lavados` | Registra un nuevo ingreso vehicular validando campos obligatorios y formato de placa. | `201 Created` |
| `PUT` | `/api/lavados/:id` | Actualiza los datos o el estado operativo (`EN_PROCESO` / `TERMINADO`) de una orden existente. | `200 OK` |
| `DELETE` | `/api/lavados/:id` | Elimina un registro operativo por su identificador único. | `200 OK` |
| `POST` | `/api/verify` | **Operación de Verificación Transaccional (CI/CD):** Inserta un registro de control en MySQL, lo consulta por ID y valida la integridad de respuesta entre ambos contenedores. | `200 OK` |

## Configuración de Variables de Entorno

Por políticas de seguridad, las credenciales y archivos `.env` nunca se almacenan en el control de versiones. Antes de iniciar el despliegue, cree un archivo `.env` a partir de la plantilla `.env.example` con las siguientes variables:

| Variable | Valor de Referencia | Descripción |
| :--- | :--- | :--- |
| `PORT` | `3000` | Puerto de escucha del servidor HTTP de la aplicación. |
| `DB_HOST` | `db` | Nombre del servicio de base de datos dentro de la red interna de [Docker Compose](https://docs.docker.com/compose/). |
| `DB_PORT` | `3306` | Puerto interno del motor relacional [MySQL](https://dev.mysql.com/doc/). |
| `DB_USER` | `root` | Usuario administrativo o de aplicación para la conexión a datos. |
| `DB_PASSWORD` | `rootpassword` | Contraseña local asignada al contenedor de base de datos. |
| `DB_NAME` | `autolavado_db` | Esquema de base de datos utilizado por la plataforma. |

## Guía de Despliegue desde Cero (Entorno Limpio)

Siga estos pasos para levantar la totalidad de la infraestructura en cualquier estación de trabajo que cuente con [Docker](https://docs.docker.com/) y [Git](https://git-scm.com/doc):

1. **Clonar el repositorio en un directorio limpio:**
   ```bash
   git clone https://github.com/omar-fonseca/autolavado-ci.git
   cd autolavado-ci
   ```

2. **Configurar el archivo de variables de entorno:**
   ```bash
   cp backend/.env.example .env
   cp backend/.env.example backend/.env
   ```

3. **Construir y levantar los contenedores en segundo plano:**
   ```bash
   docker compose up -d --build
   ```

4. **Verificar que ambos contenedores (`app` y `db`) estén en ejecución:**
   ```bash
   docker compose ps
   ```

5. **Ejecutar la operación de verificación extremo a extremo (App ↔ Base de Datos):**
   ```bash
   curl -X POST http://localhost:3000/api/verify
   ```
   **Respuesta esperada (`HTTP 200 OK`):**
   ```json
   {
     "ok": true,
     "estado": "OPERACION_EXITOSA",
     "esperado": {
       "placa": "TEST-999",
       "precio": 32000
     },
     "obtenido": {
       "placa": "TEST-999",
       "precio": 32000
     }
   }
   ```

## Prevención y Solución de Incidentes Frecuentes (Troubleshooting)

* **Demora en la inicialización en frío del contenedor de Base de Datos:** Durante la primera ejecución, la imagen oficial de [MySQL](https://hub.docker.com/_/mysql) inicializa el diccionario de datos antes de aceptar conexiones TCP en el puerto `3306`. El módulo `backend/src/db.js` incluye una rutina de reconexión automática con retroceso (`initDB`) que espera hasta que el motor esté disponible sin interrumpir el contenedor principal.
* **Colisión de puertos en el equipo anfitrión (`Bind for 0.0.0.0:3000 failed` o `3306`):** Si otro servicio local ocupa el puerto `3000` o `3306`, modifique el valor de `PORT` en el archivo `.env` o detenga la instancia local previa antes de ejecutar `docker compose up -d --build`.
* **Permisos del demonio de Docker en el servidor CI ([Jenkins](https://www.jenkins.io/doc/)):** Para que el agente de integración continua construya imágenes y orqueste contenedores automáticamente, asegúrese de que la cuenta de servicio `jenkins` pertenezca al grupo `docker` (en sistemas Linux) o `docker-users` (en entornos Windows) y reinicie el servicio tras aplicar el cambio.

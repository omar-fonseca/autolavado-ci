# Frontend AutoLavado CI

Interfaz operativa estática para AutoLavado CI. Consume la API en `http://localhost:3000`; la URL se centraliza en `app.js`. No requiere instalación de dependencias ni incluye credenciales de escritura.

## Desarrollo local

1. Configura y prepara la base de datos siguiendo `backend/README.md`.
2. Desde `backend/`, ejecuta `npm install` una vez y luego `npm run dev`.
3. Abre `http://localhost:3000`.

El backend sirve los archivos estáticos de esta carpeta. Las escrituras del navegador no incluyen `API_WRITE_KEY`: en desarrollo local el backend permite escribir sin clave, mientras que producción requiere un proxy/BFF de confianza para inyectarla.
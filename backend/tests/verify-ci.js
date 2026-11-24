const baseUrl = (process.env.VERIFY_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const endpoint = `${baseUrl}/api/verify`;
const expected = {
  estado: 'OPERACION_EXITOSA',
  placa: 'TEST-999',
  precio: 32000
};

try {
  const headers = {};
  if (process.env.API_WRITE_KEY) {
    headers['x-api-key'] = process.env.API_WRITE_KEY;
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10000)
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`La API devolvio una respuesta no JSON (HTTP ${response.status}).`);
  }
  const passed = response.ok
    && result.estado === expected.estado
    && result.esperado?.placa === expected.placa
    && Number(result.esperado?.precio) === expected.precio
    && result.obtenido?.placa === expected.placa
    && Number(result.obtenido?.precio) === expected.precio;

  console.log('\nVerificacion E2E CI/CD - AutoLavado CI');
  console.table([
    { campo: 'HTTP', esperado: 'exitoso', obtenido: String(response.status), resultado: response.ok ? 'PASS' : 'FAIL' },
    { campo: 'estado', esperado: expected.estado, obtenido: result.estado ?? 'ausente', resultado: result.estado === expected.estado ? 'PASS' : 'FAIL' },
    { campo: 'placa', esperado: expected.placa, obtenido: result.obtenido?.placa ?? 'ausente', resultado: result.obtenido?.placa === expected.placa ? 'PASS' : 'FAIL' },
    { campo: 'precio', esperado: String(expected.precio), obtenido: String(result.obtenido?.precio ?? 'ausente'), resultado: Number(result.obtenido?.precio) === expected.precio ? 'PASS' : 'FAIL' }
  ]);
  process.exit(passed ? 0 : 1);
} catch (error) {
  console.error(`Verificacion E2E fallida: ${error.message}`);
  process.exit(1);
}
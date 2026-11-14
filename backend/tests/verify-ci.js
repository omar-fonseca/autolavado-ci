const endpoint = `http://localhost:${process.env.PORT || 3000}/api/verify`;
const expected = {
  estado: 'OPERACION_EXITOSA',
  placa: 'TEST-999',
  precio: 32000
};

try {
  const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  const passed = response.status === 200
    && result.estado === expected.estado
    && result.esperado?.placa === expected.placa
    && Number(result.esperado?.precio) === expected.precio
    && result.obtenido?.placa === expected.placa
    && Number(result.obtenido?.precio) === expected.precio;

  console.log('\nVerificacion E2E CI/CD - AutoLavado CI');
  console.table([
    { campo: 'HTTP', esperado: '200', obtenido: String(response.status), resultado: response.status === 200 ? 'PASS' : 'FAIL' },
    { campo: 'estado', esperado: expected.estado, obtenido: result.estado ?? 'ausente', resultado: result.estado === expected.estado ? 'PASS' : 'FAIL' },
    { campo: 'placa', esperado: expected.placa, obtenido: result.obtenido?.placa ?? 'ausente', resultado: result.obtenido?.placa === expected.placa ? 'PASS' : 'FAIL' },
    { campo: 'precio', esperado: String(expected.precio), obtenido: String(result.obtenido?.precio ?? 'ausente'), resultado: Number(result.obtenido?.precio) === expected.precio ? 'PASS' : 'FAIL' }
  ]);
  process.exit(passed ? 0 : 1);
} catch (error) {
  console.error(`Verificacion E2E fallida: ${error.message}`);
  process.exit(1);
}
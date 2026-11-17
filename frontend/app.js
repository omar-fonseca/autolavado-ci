const API_BASE_URL = 'http://localhost:3000';
const PAGE_SIZE = 10;
const SUGGESTED_PRICES = {
  MOTO: { BASICO: 12000, GENERAL: 18000, PREMIUM: 25000 },
  CARRO: { BASICO: 22000, GENERAL: 32000, PREMIUM: 45000 },
  CAMIONETA: { BASICO: 28000, GENERAL: 40000, PREMIUM: 55000 }
};
const LABELS = {
  tipo_vehiculo: { MOTO: 'Moto', CARRO: 'Carro', CAMIONETA: 'Camioneta' },
  servicio: { BASICO: 'Básico', GENERAL: 'General', PREMIUM: 'Premium' },
  turno: { MANANA: 'Mañana', TARDE: 'Tarde' },
  estado: { EN_PROCESO: 'En proceso', TERMINADO: 'Terminado' }
};

const elements = {
  connection: document.querySelector('#connection-status'),
  connectionLabel: document.querySelector('#connection-label'),
  today: document.querySelector('#today-label'),
  dashboardError: document.querySelector('#dashboard-error'),
  listError: document.querySelector('#list-error'),
  rows: document.querySelector('#wash-rows'),
  recordCount: document.querySelector('#record-count'),
  pageSummary: document.querySelector('#page-summary'),
  pageIndicator: document.querySelector('#page-indicator'),
  previous: document.querySelector('#previous-page'),
  next: document.querySelector('#next-page'),
  search: document.querySelector('#search-input'),
  dialog: document.querySelector('#wash-dialog'),
  form: document.querySelector('#wash-form'),
  formTitle: document.querySelector('#form-title'),
  washId: document.querySelector('#wash-id'),
  client: document.querySelector('#cliente'),
  plate: document.querySelector('#placa'),
  vehicle: document.querySelector('#tipo-vehiculo'),
  service: document.querySelector('#servicio'),
  shift: document.querySelector('#turno'),
  state: document.querySelector('#estado'),
  price: document.querySelector('#precio'),
  formError: document.querySelector('#form-error'),
  save: document.querySelector('#save-wash'),
  verifyButton: document.querySelector('#verify-button'),
  verifySection: document.querySelector('.verify-section'),
  verifyResult: document.querySelector('#verify-result'),
  toast: document.querySelector('#toast')
};

let currentPage = 1;
let totalPages = 1;
let totalRecords = 0;
let washList = [];
let searchTerm = '';
let toastTimer;

function formatCop(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount)}`;
}

function setMetrics(metrics) {
  document.querySelectorAll('[data-metric]').forEach((node) => {
    const key = node.dataset.metric;
    node.textContent = key === 'ingresos_totales' ? formatCop(metrics[key]) : new Intl.NumberFormat('es-CO').format(Number(metrics[key] ?? 0));
  });
  elements.dashboardError.hidden = true;
}

function setConnection(connected) {
  elements.connection.classList.toggle('is-connected', connected);
  elements.connection.classList.toggle('is-error', !connected);
  elements.connectionLabel.textContent = connected ? 'API conectada' : 'Sin conexión';
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
  } catch {
    throw new Error('No fue posible conectar con la API. Verifica que el backend esté ejecutándose en localhost:3000.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `La solicitud falló (HTTP ${response.status}).`);
  }
  return { payload, response };
}

async function loadDashboard() {
  try {
    const { payload } = await apiRequest('/api/dashboard');
    setMetrics(payload);
    setConnection(true);
  } catch (error) {
    elements.dashboardError.textContent = error.message;
    elements.dashboardError.hidden = false;
    setConnection(false);
  }
}

async function loadLavados({ showLoading = false } = {}) {
  elements.listError.hidden = true;
  if (showLoading) {
    elements.rows.innerHTML = '<tr><td class="table-message" colspan="7"><span class="loader"></span> Cargando lavados...</td></tr>';
  }
  try {
    const query = new URLSearchParams({ page: String(currentPage), limit: String(PAGE_SIZE) });
    const { payload, response } = await apiRequest(`/api/lavados?${query}`);
    if (!Array.isArray(payload)) throw new Error('La API devolvió un formato de listado inesperado.');
    washList = payload;
    totalRecords = Number(response.headers.get('X-Total-Count') || payload.length);
    totalPages = Math.max(1, Number(response.headers.get('X-Total-Pages') || 1));
    renderRows();
    setConnection(true);
  } catch (error) {
    elements.rows.innerHTML = '<tr><td class="table-message" colspan="7">No se pudieron cargar los lavados.</td></tr>';
    elements.recordCount.textContent = 'Error de carga';
    elements.listError.textContent = error.message;
    elements.listError.hidden = false;
    setConnection(false);
  }
}

function createCell(content, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  if (content instanceof Node) cell.append(content);
  else cell.textContent = content;
  return cell;
}

function createButton(label, className, handler, title = label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', handler);
  return button;
}

function renderRows() {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('es');
  const visibleRows = washList.filter((wash) => !normalizedSearch ||
    String(wash.cliente).toLocaleLowerCase('es').includes(normalizedSearch) ||
    String(wash.placa).toLocaleLowerCase('es').includes(normalizedSearch));
  elements.rows.replaceChildren();

  if (visibleRows.length === 0) {
    const message = searchTerm ? 'No hay resultados para esta búsqueda.' : 'Todavía no hay lavados registrados.';
    const row = document.createElement('tr');
    const cell = createCell(message, 'table-message');
    cell.colSpan = 7;
    row.append(cell);
    elements.rows.append(row);
  }

  visibleRows.forEach((wash) => {
    const row = document.createElement('tr');
    const client = document.createElement('div');
    client.className = 'cell-client';
    const name = document.createElement('strong');
    name.textContent = wash.cliente;
    const plate = document.createElement('code');
    plate.textContent = wash.placa;
    client.append(name, plate);
    row.append(createCell(client));

    const vehicle = document.createElement('span');
    vehicle.className = 'vehicle-type';
    const dot = document.createElement('span');
    dot.className = 'vehicle-dot';
    dot.setAttribute('aria-hidden', 'true');
    vehicle.append(dot, document.createTextNode(LABELS.tipo_vehiculo[wash.tipo_vehiculo] || wash.tipo_vehiculo));
    row.append(createCell(vehicle));
    row.append(createCell(LABELS.servicio[wash.servicio] || wash.servicio, 'service-name'));
    row.append(createCell(LABELS.turno[wash.turno] || wash.turno, 'shift-label'));

    const status = document.createElement('span');
    status.className = `state-pill${wash.estado === 'TERMINADO' ? ' is-done' : ''}`;
    status.textContent = LABELS.estado[wash.estado] || wash.estado;
    row.append(createCell(status));
    row.append(createCell(formatCop(wash.precio), 'price-cell'));

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(createButton('Editar', 'row-action', () => openEditDialog(wash)));
    const nextState = wash.estado === 'TERMINADO' ? 'EN_PROCESO' : 'TERMINADO';
    const nextLabel = nextState === 'TERMINADO' ? 'Terminar' : 'Reabrir';
    actions.append(createButton(nextLabel, 'row-action', () => updateState(wash, nextState), `${nextLabel}: ${wash.placa}`));
    actions.append(createButton('Eliminar', 'row-action is-delete', () => deleteWash(wash), `Eliminar lavado ${wash.placa}`));
    row.append(createCell(actions));
    elements.rows.append(row);
  });

  const start = totalRecords === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalRecords);
  elements.recordCount.textContent = `${totalRecords} ${totalRecords === 1 ? 'registro' : 'registros'}`;
  elements.pageSummary.textContent = totalRecords ? `Mostrando ${start}–${end} de ${totalRecords}` : 'Sin registros';
  elements.pageIndicator.textContent = `${currentPage} / ${totalPages}`;
  elements.previous.disabled = currentPage <= 1;
  elements.next.disabled = currentPage >= totalPages;
}

async function refreshData({ showLoading = false } = {}) {
  await Promise.all([loadDashboard(), loadLavados({ showLoading })]);
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3800);
}

function suggestPrice() {
  const price = SUGGESTED_PRICES[elements.vehicle.value]?.[elements.service.value];
  if (price) elements.price.value = String(price);
}

function resetForm() {
  elements.form.reset();
  elements.washId.value = '';
  elements.state.value = 'EN_PROCESO';
  elements.vehicle.value = 'MOTO';
  elements.service.value = 'BASICO';
  elements.price.value = String(SUGGESTED_PRICES.MOTO.BASICO);
  elements.formError.hidden = true;
  elements.formError.textContent = '';
  elements.save.disabled = false;
  elements.save.textContent = 'Guardar lavado';
}

function openCreateDialog() {
  resetForm();
  elements.formTitle.textContent = 'Nuevo lavado';
  elements.dialog.showModal();
  elements.client.focus();
}

function openEditDialog(wash) {
  resetForm();
  elements.formTitle.textContent = 'Editar lavado';
  elements.washId.value = String(wash.id);
  elements.client.value = wash.cliente;
  elements.plate.value = wash.placa;
  elements.vehicle.value = wash.tipo_vehiculo;
  elements.service.value = wash.servicio;
  elements.shift.value = wash.turno;
  elements.state.value = wash.estado;
  elements.price.value = String(wash.precio);
  elements.dialog.showModal();
  elements.client.focus();
}

async function saveWash(event) {
  event.preventDefault();
  elements.formError.hidden = true;
  elements.plate.value = elements.plate.value.trim().toUpperCase();
  if (!elements.form.reportValidity()) return;

  const priceValue = Number(elements.price.value);
  if (!Number.isInteger(priceValue) || priceValue <= 0 || priceValue > 2147483647) {
    elements.formError.textContent = 'El precio debe ser un entero positivo en COP.';
    elements.formError.hidden = false;
    return;
  }

  const washId = elements.washId.value;
  const body = {
    cliente: elements.client.value.trim(),
    placa: elements.plate.value,
    tipo_vehiculo: elements.vehicle.value,
    servicio: elements.service.value,
    turno: elements.shift.value,
    estado: elements.state.value,
    precio: priceValue
  };
  elements.save.disabled = true;
  elements.save.textContent = 'Guardando...';

  try {
    await apiRequest(washId ? `/api/lavados/${encodeURIComponent(washId)}` : '/api/lavados', {
      method: washId ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    elements.dialog.close();
    showToast(washId ? 'Lavado actualizado.' : 'Lavado registrado.');
    currentPage = 1;
    await refreshData({ showLoading: true });
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  } finally {
    elements.save.disabled = false;
    elements.save.textContent = washId ? 'Guardar cambios' : 'Guardar lavado';
  }
}

async function updateState(wash, state) {
  try {
    await apiRequest(`/api/lavados/${encodeURIComponent(wash.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ estado: state })
    });
    showToast(`Estado actualizado: ${LABELS.estado[state]}.`);
    await refreshData();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteWash(wash) {
  if (!window.confirm(`¿Eliminar el lavado de ${wash.cliente} (${wash.placa})? Esta acción no se puede deshacer.`)) return;
  try {
    await apiRequest(`/api/lavados/${encodeURIComponent(wash.id)}`, { method: 'DELETE' });
    if (washList.length === 1 && currentPage > 1) currentPage -= 1;
    showToast('Lavado eliminado.');
    await refreshData({ showLoading: true });
  } catch (error) {
    showToast(error.message, true);
  }
}

async function runVerification() {
  elements.verifyButton.disabled = true;
  elements.verifyButton.textContent = 'Verificando...';
  elements.verifyResult.hidden = true;
  elements.verifySection.classList.remove('has-result');
  try {
    const { payload } = await apiRequest('/api/verify', { method: 'POST', body: '{}' });
    const passed = payload?.ok === true && payload?.estado === 'OPERACION_EXITOSA' &&
      payload?.esperado?.placa === 'TEST-999' && payload?.esperado?.precio === 32000 &&
      payload?.obtenido?.placa === 'TEST-999' && payload?.obtenido?.precio === 32000;
    elements.verifyResult.textContent = JSON.stringify(payload, null, 2);
    elements.verifyResult.classList.toggle('is-failure', !passed);
    elements.verifyResult.hidden = false;
    elements.verifySection.classList.add('has-result');
    if (!passed) showToast('La API respondió, pero la verificación no coincide con lo esperado.', true);
    else showToast('Verificación CI/CD exitosa.');
  } catch (error) {
    elements.verifyResult.textContent = error.message;
    elements.verifyResult.classList.add('is-failure');
    elements.verifyResult.hidden = false;
    elements.verifySection.classList.add('has-result');
    showToast(error.message, true);
  } finally {
    elements.verifyButton.disabled = false;
    elements.verifyButton.innerHTML = 'Ejecutar Verificación CI/CD <span aria-hidden="true">↗</span>';
  }
}

function updateDate() {
  elements.today.textContent = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  }).format(new Date()).replaceAll('.', '').toLocaleUpperCase('es');
}

document.querySelector('#new-wash-button').addEventListener('click', openCreateDialog);
document.querySelector('#close-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#refresh-button').addEventListener('click', () => refreshData({ showLoading: true }));
elements.form.addEventListener('submit', saveWash);
elements.plate.addEventListener('input', () => {
  const start = elements.plate.selectionStart;
  const end = elements.plate.selectionEnd;
  elements.plate.value = elements.plate.value.toUpperCase();
  elements.plate.setSelectionRange(start, end);
});
elements.vehicle.addEventListener('change', suggestPrice);
elements.service.addEventListener('change', suggestPrice);
elements.search.addEventListener('input', (event) => {
  searchTerm = event.target.value;
  renderRows();
});
elements.previous.addEventListener('click', async () => {
  if (currentPage > 1) {
    currentPage -= 1;
    await loadLavados({ showLoading: true });
  }
});
elements.next.addEventListener('click', async () => {
  if (currentPage < totalPages) {
    currentPage += 1;
    await loadLavados({ showLoading: true });
  }
});
elements.verifyButton.addEventListener('click', runVerification);
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

updateDate();
refreshData({ showLoading: true });
setInterval(() => refreshData(), 30000);

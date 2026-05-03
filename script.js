// ==========================================
// КОНФИГУРАЦИЯ (замени на свои значения)
// ==========================================
const ADMIN_ID = 372708944;          // Твой реальный VK ID
const APP_ID = 54575499;              // ID мини-приложения VK
const API_URL = 'https://script.google.com/macros/s/AKfycbweogVun2KupPEbuq7WLZpQa0gUIwbrMKlIpNF-PvycDVLubHNaNHIubGyBL4Ans_uM4A/exec'; // Твой URL
const ITEMS_PER_PAGE = 10;

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;
let isAdmin = false;
let requests = [];
let currentTab = 'active';
let selectedRequestId = null;

// Поиск и фильтры
let searchQuery = '';
let statusFilter = 'all';
let typeFilter = 'all';

// Пагинация
let currentPage = 1;

let isInputFocused = false;
let autoRefreshInterval = null;

// Все DOM-элементы будем получать внутри init()
let loadingEl, userPanel, adminPanel,
    typeSelect, datetimeBlock, requestForm, submitBtn,
    myRequestsList, adminRequestsList,
    tabActive, tabDone, refreshBtn, refreshIcon,
    fileInput, fileInfo, notification, notificationText;

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================
async function init() {
  // Получаем элементы здесь, когда DOM точно готов
  loadingEl = document.getElementById('loading');
  userPanel = document.getElementById('userPanel');
  adminPanel = document.getElementById('adminPanel');
  typeSelect = document.getElementById('typeSelect');
  datetimeBlock = document.getElementById('datetimeBlock');
  requestForm = document.getElementById('requestForm');
  submitBtn = document.getElementById('submitBtn');
  myRequestsList = document.getElementById('myRequestsList');
  adminRequestsList = document.getElementById('adminRequestsList');
  tabActive = document.getElementById('tabActive');
  tabDone = document.getElementById('tabDone');
  refreshBtn = document.getElementById('refreshBtn');
  refreshIcon = document.getElementById('refreshIcon');
  fileInput = document.getElementById('fileInput');
  fileInfo = document.getElementById('fileInfo');
  notification = document.getElementById('notification');
  notificationText = document.getElementById('notificationText');

  console.log('init стартовал');

  if (typeof vkBridge !== 'undefined') {
    try { await vkBridge.send('VKWebAppInit'); } catch (e) {}
  }

  if (typeof vkBridge === 'undefined') {
    currentUser = { id: 0, first_name: 'Тест', last_name: 'Тестов' };
    isAdmin = false;
  } else {
    try {
      const user = await Promise.race([
        vkBridge.send('VKWebAppGetUserInfo'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут')), 3000))
      ]);
      currentUser = { id: user.id, first_name: user.first_name, last_name: user.last_name };
      isAdmin = (currentUser.id === ADMIN_ID);
    } catch (e) {
      currentUser = { id: 0, first_name: 'Гость', last_name: '' };
      isAdmin = false;
    }
  }

  await loadRequestsFromServer();
  loadingEl.classList.add('hidden');

  if (isAdmin) {
    adminPanel.classList.remove('hidden');
    renderAdminPanel();
  } else {
    userPanel.classList.remove('hidden');
    renderMyRequests();
  }

  // Обработчики событий (проверяем, что элементы существуют)
  if (typeSelect) typeSelect.addEventListener('change', toggleDatetime);
  if (fileInput) fileInput.addEventListener('change', handleFile);
  if (requestForm) requestForm.addEventListener('submit', handleFormSubmit);
  if (tabActive) tabActive.addEventListener('click', () => switchAdminTab('active'));
  if (tabDone) tabDone.addEventListener('click', () => switchAdminTab('done'));
  if (refreshBtn) refreshBtn.addEventListener('click', manualRefresh);

  // Отслеживание фокуса на полях
  document.querySelectorAll('.search-box input, .search-box select').forEach(el => {
    el.addEventListener('focus', () => { isInputFocused = true; });
    el.addEventListener('blur', () => {
      isInputFocused = false;
      // Когда фокус ушёл, применяем фильтры
      if (isAdmin) renderAdminPanel();
      else renderMyRequests();
    });
  });

  startAutoRefresh();
}

// ==========================================
// СЕРВЕРНЫЕ ЗАПРОСЫ
// ==========================================
async function loadRequestsFromServer() {
  try {
    const response = await fetch(API_URL + '?action=getAll');
    if (!response.ok) throw new Error('Ошибка сети');
    requests = await response.json();
  } catch (e) {
    console.error('Не удалось загрузить заявки:', e);
  }
}

async function createRequestOnServer(newRequest) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(newRequest)
    });
    if (!response.ok) throw new Error('Ошибка сети');
    const result = await response.json();
    if (!result.success) throw new Error('Сервер вернул ошибку');
    return result.id;
  } catch (e) {
    console.error('Ошибка при создании заявки:', e);
    alert('Не удалось отправить заявку. Проверьте соединение.');
    return null;
  }
}

async function updateStatusOnServer(requestId, newStatus) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'updateStatus', id: requestId, status: newStatus })
    });
    if (!response.ok) throw new Error('Ошибка сети');
    const result = await response.json();
    if (!result.success) throw new Error('Сервер вернул ошибку');
    return true;
  } catch (e) {
    console.error('Ошибка при обновлении статуса:', e);
    alert('Не удалось обновить статус.');
    return false;
  }
}

// ==========================================
// АВТООБНОВЛЕНИЕ
// ==========================================
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    if (isInputFocused) {
      await loadRequestsFromServer();
      return;
    }
    await loadRequestsFromServer();
    if (isAdmin) renderAdminPanel();
    else renderMyRequests();
  }, 15000);
}

async function manualRefresh() {
  if (!refreshIcon || !refreshBtn) return;
  refreshIcon.textContent = '⏳';
  refreshBtn.disabled = true;
  await loadRequestsFromServer();
  if (isAdmin) renderAdminPanel();
  else renderMyRequests();
  refreshIcon.textContent = '🔄';
  refreshBtn.disabled = false;
}

// ==========================================
// УВЕДОМЛЕНИЕ
// ==========================================
function showNotification(msg) {
  if (!notificationText || !notification) return;
  notificationText.textContent = msg;
  notification.classList.remove('hidden');
  setTimeout(hideNotification, 5000);
}

function hideNotification() {
  if (notification) notification.classList.add('hidden');
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function toggleDatetime() {
  if (!datetimeBlock || !typeSelect) return;
  datetimeBlock.classList.toggle('hidden', typeSelect.value !== 'support');
}

function handleFile() {
  if (!fileInput || !fileInfo) return;
  const file = fileInput.files[0];
  fileInfo.textContent = file ? `Файл: ${file.name} (${(file.size / 1024).toFixed(1)} КБ)` : '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadFile(base64Data, fileName) {
  const link = document.createElement('a');
  link.href = base64Data;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!typeSelect || !requestForm || !submitBtn) return;

  const type = typeSelect.value;
  const subdivision = document.getElementById('subdivision')?.value.trim() || '';
  const description = document.getElementById('description')?.value.trim() || '';
  const datetime = type === 'support' ? document.getElementById('datetime')?.value || null : null;

  if (!subdivision || !description) {
    alert('Заполните подразделение и описание');
    return;
  }
  if (type === 'support' && !datetime) {
    alert('Укажите дату и время');
    return;
  }

  let fileData = null, fileName = null;
  const file = fileInput?.files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой (макс. 5 МБ)');
      return;
    }
    try {
      fileData = await fileToBase64(file);
      fileName = file.name;
    } catch { alert('Ошибка чтения файла'); return; }
  }

  const newReq = {
    userId: currentUser.id,
    userName: `${currentUser.first_name} ${currentUser.last_name}`,
    subdivision, type, description, datetime,
    file: fileData ? { name: fileName, data: fileData } : null,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  submitBtn.textContent = 'Отправка...';
  submitBtn.disabled = true;

  const serverId = await createRequestOnServer(newReq);
  if (serverId) {
    newReq.id = serverId;
    requests.push(newReq);
    if (isAdmin) showNotification(`Новая заявка от ${newReq.userName}`);
    selectedRequestId = null;
    currentPage = 1;
    if (isAdmin) renderAdminPanel(); else renderMyRequests();
    requestForm.reset();
    if (fileInfo) fileInfo.textContent = '';
    if (datetimeBlock) datetimeBlock.classList.add('hidden');
    alert('✅ Заявка отправлена!');
  }

  submitBtn.textContent = 'Отправить заявку';
  submitBtn.disabled = false;
}
// ==========================================
// ФИЛЬТРАЦИЯ И ПОИСК
// ==========================================
function getFilteredRequests(sourceList) {
  return sourceList.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (r.userName?.toLowerCase().includes(q) ||
              r.subdivision?.toLowerCase().includes(q) ||
              r.description?.toLowerCase().includes(q));
    }
    return true;
  }).sort((a, b) => b.id - a.id);
}

function onSearchInput(event, panel) {
  searchQuery = event.target.value;
  currentPage = 1;
  if (panel === 'user') renderMyRequests();
  else renderAdminPanel();
}

function onFilterChange(panel) {
  const statusSel = document.getElementById(panel === 'user' ? 'userStatusFilter' : 'adminStatusFilter');
  const typeSel = document.getElementById(panel === 'user' ? 'userTypeFilter' : 'adminTypeFilter');
  statusFilter = statusSel?.value || 'all';
  typeFilter = typeSel?.value || 'all';
  currentPage = 1;
  if (panel === 'user') renderMyRequests();
  else renderAdminPanel();
}

// ==========================================
// ПАГИНАЦИЯ
// ==========================================
function renderPagination(totalItems, containerId, renderFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1}, '${containerId}', '${renderFn}')">← Назад</button>`;
  html += `<span>Стр. ${currentPage} из ${totalPages}</span>`;
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1}, '${containerId}', '${renderFn}')">Вперёд →</button>`;
  container.innerHTML = html;
}

function goToPage(page, containerId, renderFn) {
  currentPage = page;
  if (renderFn === 'renderMyRequests') renderMyRequests();
  else if (renderFn === 'renderAdminPanel') renderAdminPanel();
}

function paginate(list) {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  return list.slice(start, start + ITEMS_PER_PAGE);
}

// ==========================================
// ОТОБРАЖЕНИЕ КАРТОЧЕК
// ==========================================
function getRequestById(id) {
  return requests.find(r => r.id == id);
}

function showRequestDetail(id) {
  selectedRequestId = id;
  if (isAdmin) renderAdminPanel();
  else renderMyRequests();
}

function hideRequestDetail() {
  selectedRequestId = null;
  if (isAdmin) renderAdminPanel();
  else renderMyRequests();
}

function renderRequestListItem(req) {
  const typeName = req.type === 'support' ? 'Тех.сопровождение' : 'Тех.обслуживание';
  const created = new Date(req.createdAt).toLocaleString('ru-RU');
  const statusMap = { pending: 'В ожидании', in_progress: 'В работе', done: 'Выполнено' };
  const badgeClass = { pending: 'pending', in_progress: 'in_progress', done: 'done' };

  return `
    <div class="request-card" onclick="showRequestDetail(${req.id})">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${typeName}</strong>
          <span class="badge ${badgeClass[req.status]}">${statusMap[req.status]}</span>
        </div>
        <span style="color:#888; font-size:13px;">${created}</span>
      </div>
      <p style="margin-top:4px;">${req.userName} (${req.subdivision})</p>
    </div>
  `;
}

function renderRequestDetail(req, showAdminControls = false) {
  const statusMap = { pending: 'В ожидании', in_progress: 'В работе', done: 'Выполнено' };
  const badgeClass = { pending: 'pending', in_progress: 'in_progress', done: 'done' };
  const typeName = req.type === 'support' ? 'Тех.сопровождение' : 'Тех.обслуживание';
  const created = new Date(req.createdAt).toLocaleString('ru-RU');

  let fileHtml = '';
  let fileDownloadBtn = '';
  if (req.file) {
    let fileObj = req.file;
    if (typeof fileObj === 'string') {
      try { fileObj = JSON.parse(fileObj); } catch (e) { fileObj = null; }
    }
    if (fileObj?.name) {
      fileHtml = `<p><strong>Файл:</strong> ${fileObj.name}</p>`;
      if (fileObj.data) {
        // Безопасное экранирование
        const safeData = fileObj.data.replace(/'/g, "\\'");
        const safeName = fileObj.name.replace(/'/g, "\\'");
        fileDownloadBtn = `<button onclick="downloadFile('${safeData}', '${safeName}')" style="margin-top:4px; background:#4bb34b;">Скачать файл</button>`;
      }
    }
  }

  let datetimeHtml = req.datetime ? `<p><strong>Дата/время:</strong> ${new Date(req.datetime).toLocaleString('ru-RU')}</p>` : '';
  let actionsHtml = '';
  if (showAdminControls) {
    actionsHtml += '<div class="actions">';
    if (req.status === 'pending') {
      actionsHtml += `<button onclick="changeStatus(${req.id}, 'in_progress')">В работу</button>`;
    } else if (req.status === 'in_progress') {
      actionsHtml += `<button onclick="changeStatus(${req.id}, 'done')">Выполнено</button>`;
      actionsHtml += `<button onclick="changeStatus(${req.id}, 'pending')" style="background:#ffa000;">Откатить на "В ожидании"</button>`;
    } else if (req.status === 'done') {
      actionsHtml += `<button onclick="changeStatus(${req.id}, 'in_progress')" style="background:#ffa000;">Откатить на "В работе"</button>`;
    }
    actionsHtml += '</div>';
  }

  return `
    <div class="panel">
      <button onclick="hideRequestDetail()" style="margin-bottom:12px; background:#888;">← Назад к списку</button>
      <h2>${typeName} <span class="badge ${badgeClass[req.status]}">${statusMap[req.status]}</span></h2>
      <p><strong>От:</strong> ${req.userName} (${req.subdivision})</p>
      <p><strong>Создана:</strong> ${created}</p>
      ${datetimeHtml}
      <p><strong>Описание:</strong> ${req.description}</p>
      ${fileHtml}
      ${fileDownloadBtn}
      ${actionsHtml}
    </div>
  `;
}

// ==========================================
// РЕНДЕР СПИСКОВ
// ==========================================
function renderMyRequests() {
  if (!myRequestsList) return;
  if (selectedRequestId) {
    const req = getRequestById(selectedRequestId);
    if (req) {
      myRequestsList.innerHTML = renderRequestDetail(req, false);
      const pag = document.getElementById('userPagination');
      if (pag) pag.innerHTML = '';
      return;
    }
  }

  const myReqs = requests.filter(r => r.userId == currentUser.id);
  const filtered = getFilteredRequests(myReqs);
  const paginated = paginate(filtered);

  // ⬇️ Вот эта часть добавляет поиск поверх списка
  let html = `
    <div class="search-box">
      <input type="text" id="userSearch" placeholder="Поиск..." value="${searchQuery}" oninput="onSearchInput(event, 'user')">
      <select id="userStatusFilter" onchange="onFilterChange('user')">
        <option value="all" ${statusFilter==='all'?'selected':''}>Все статусы</option>
        <option value="pending" ${statusFilter==='pending'?'selected':''}>В ожидании</option>
        <option value="in_progress" ${statusFilter==='in_progress'?'selected':''}>В работе</option>
        <option value="done" ${statusFilter==='done'?'selected':''}>Выполнено</option>
      </select>
      <select id="userTypeFilter" onchange="onFilterChange('user')">
        <option value="all" ${typeFilter==='all'?'selected':''}>Все типы</option>
        <option value="maintenance" ${typeFilter==='maintenance'?'selected':''}>Тех.обслуживание</option>
        <option value="support" ${typeFilter==='support'?'selected':''}>Тех.сопровождение</option>
      </select>
    </div>
  `;
  html += paginated.length
    ? paginated.map(req => renderRequestListItem(req)).join('')
    : '<p>Заявок не найдено.</p>';

  myRequestsList.innerHTML = html;
  renderPagination(filtered.length, 'userPagination', 'renderMyRequests');
}

function renderAdminPanel() {
  if (!adminRequestsList) return;
  if (selectedRequestId) {
    const req = getRequestById(selectedRequestId);
    if (req) {
      adminRequestsList.innerHTML = renderRequestDetail(req, true);
      const pag = document.getElementById('adminPagination');
      if (pag) pag.innerHTML = '';
      return;
    }
  }

  const base = currentTab === 'active'
    ? requests.filter(r => r.status !== 'done')
    : requests.filter(r => r.status === 'done');
  const filtered = getFilteredRequests(base);
  const paginated = paginate(filtered);

  adminRequestsList.innerHTML = paginated.length
    ? paginated.map(req => renderRequestListItem(req)).join('')
    : '<p>Заявок нет.</p>';

  renderPagination(filtered.length, 'adminPagination', 'renderAdminPanel');
}

// ==========================================
// СМЕНА ВКЛАДОК И СТАТУСОВ
// ==========================================
function switchAdminTab(tab) {
  if (!tabActive || !tabDone) return;
  currentTab = tab;
  selectedRequestId = null;
  searchQuery = '';
  statusFilter = 'all';
  typeFilter = 'all';
  const adminSearch = document.getElementById('adminSearch');
  const adminStatusFilter = document.getElementById('adminStatusFilter');
  const adminTypeFilter = document.getElementById('adminTypeFilter');
  if (adminSearch) adminSearch.value = '';
  if (adminStatusFilter) adminStatusFilter.value = 'all';
  if (adminTypeFilter) adminTypeFilter.value = 'all';
  currentPage = 1;

  tabActive.classList.toggle('active', tab === 'active');
  tabDone.classList.toggle('active', tab === 'done');
  renderAdminPanel();
}

async function changeStatus(requestId, newStatus) {
  if (!isAdmin) return;
  const success = await updateStatusOnServer(requestId, newStatus);
  if (success) {
    await loadRequestsFromServer();
    selectedRequestId = null;
    renderAdminPanel();
  }
}

// Старт
document.addEventListener('DOMContentLoaded', init);
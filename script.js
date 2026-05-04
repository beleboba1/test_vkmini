// ==========================================
// КОНФИГУРАЦИЯ (замени на свои значения)
// ==========================================
const ADMIN_ID = 372708944;          // Твой реальный VK ID
const APP_ID = 54575499;              // ID мини-приложения VK
const API_URL = 'https://script.google.com/macros/s/AKfycbweogVun2KupPEbuq7WLZpQa0gUIwbrMKlIpNF-PvycDVLubHNaNHIubGyBL4Ans_uM4A/exec'; // Твой URL

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;
let isAdmin = false;
let requests = [];
let currentTab = 'active';
let selectedRequestId = null;
let searchQuery = '';                // строка поиска
let statusFilter = 'all';            // фильтр по статусу (all / pending / in_progress / done)

// DOM-элементы
const loadingEl = document.getElementById('loading');
const userPanel = document.getElementById('userPanel');
const adminPanel = document.getElementById('adminPanel');
const typeSelect = document.getElementById('typeSelect');
const datetimeBlock = document.getElementById('datetimeBlock');
const requestForm = document.getElementById('requestForm');
const myRequestsList = document.getElementById('myRequestsList');
const adminRequestsList = document.getElementById('adminRequestsList');
const tabActive = document.getElementById('tabActive');
const tabDone = document.getElementById('tabDone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');

// Таймер автообновления
let autoRefreshInterval = null;

// ==========================================
// ОБРАБОТЧИКИ СТАТИЧЕСКИХ ПОЛЕЙ ПОИСКА / ФИЛЬТРА
// ==========================================
function onUserSearchInput(e) {
  searchQuery = e.target.value;
  renderMyRequests();
}

function onUserFilterChange() {
  const sel = document.getElementById('userStatusFilter');
  statusFilter = sel ? sel.value : 'all';
  renderMyRequests();
}

function onAdminSearchInput(e) {
  searchQuery = e.target.value;
  renderAdminPanel();
}

function onAdminFilterChange() {
  const sel = document.getElementById('adminStatusFilter');
  statusFilter = sel ? sel.value : 'all';
  renderAdminPanel();
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================
async function init() {
  console.log('1. init стартовал');

  if (typeof vkBridge !== 'undefined') {
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('VKWebAppInit отправлен');
    } catch (e) {
      console.error('Ошибка VKWebAppInit:', e);
    }
  }

  if (typeof vkBridge === 'undefined') {
    console.warn('vkBridge не найден – тестовый пользователь');
    currentUser = { id: 0, first_name: 'Тест', last_name: 'Тестов' };
    isAdmin = false;
  } else {
    console.log('2. вызываю getUserInfo с таймаутом');
    try {
      const user = await Promise.race([
        vkBridge.send('VKWebAppGetUserInfo'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут VK Bridge')), 3000))
      ]);
      currentUser = { id: user.id, first_name: user.first_name, last_name: user.last_name };
      isAdmin = (currentUser.id === ADMIN_ID);
      console.log('3. пользователь получен:', currentUser);
    } catch (e) {
      console.error('4. ошибка получения пользователя:', e);
      currentUser = { id: 0, first_name: 'Гость', last_name: '' };
      isAdmin = false;
    }
  }

  console.log('5. загружаю заявки с сервера...');
  await loadRequestsFromServer();
  console.log('6. скрываю loading');
  loadingEl.classList.add('hidden');

  if (isAdmin) {
    adminPanel.classList.remove('hidden');
    renderAdminPanel();
  } else {
    userPanel.classList.remove('hidden');
    renderMyRequests();
  }

  // Обработчики
  typeSelect.addEventListener('change', toggleDatetime);
  fileInput.addEventListener('change', handleFile);
  requestForm.addEventListener('submit', handleFormSubmit);
  tabActive.addEventListener('click', () => switchAdminTab('active'));
  tabDone.addEventListener('click', () => switchAdminTab('done'));

  // Запускаем автообновление каждые 6 секунд
  startAutoRefresh();
  console.log('7. готово');
}

// ==========================================
// ВЗАИМОДЕЙСТВИЕ С СЕРВЕРОМ
// ==========================================
async function loadRequestsFromServer() {
  try {
    const response = await fetch(API_URL + '?action=getAll');
    if (!response.ok) throw new Error('Ошибка сети');
    requests = await response.json();
  } catch (e) {
    console.error('Не удалось загрузить заявки:', e);
    requests = [];
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
    console.log('Заявка создана, ID:', result.id);
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
    console.log('Статус обновлён');
    return true;
  } catch (e) {
    console.error('Ошибка при обновлении статуса:', e);
    alert('Не удалось обновить статус.');
    return false;
  }
}

// ==========================================
// АВТООБНОВЛЕНИЕ (опрос сервера)
// ==========================================
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    await loadRequestsFromServer();
    if (isAdmin) {
      renderAdminPanel();
    } else {
      renderMyRequests();
    }
  }, 6000); // каждые 6 секунд
}

// Остановка автообновления при закрытии
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
});

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function toggleDatetime() {
  datetimeBlock.classList.toggle('hidden', typeSelect.value !== 'support');
}

function handleFile() {
  const file = fileInput.files[0];
  fileInfo.textContent = file
    ? `Выбран файл: ${file.name} (${(file.size / 1024).toFixed(1)} КБ)`
    : '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Надёжное скачивание / открытие файла
function downloadFile(base64Data, fileName) {
  const parts = base64Data.split(',');
  if (parts.length !== 2) return;
  const mime = parts[0].split(':')[1].split(';')[0];
  const byteStr = atob(parts[1]);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) {
    ia[i] = byteStr.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mime });
  const blobUrl = URL.createObjectURL(blob);

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    window.open(blobUrl, '_blank');
    if (!localStorage.getItem('saveHintShown')) {
      alert('💡 Файл открыт в браузере.\nДля сохранения используйте меню «Поделиться» → «Сохранить в файлы» или долгое нажатие на файл.');
      localStorage.setItem('saveHintShown', '1');
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } else {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 100);
  }
}

// Отправка заявки
async function handleFormSubmit(e) {
  e.preventDefault();
  const type = typeSelect.value;
  const subdivision = document.getElementById('subdivision').value.trim();
  const description = document.getElementById('description').value.trim();
  const datetime = type === 'support' ? document.getElementById('datetime').value : null;

  if (!subdivision || !description) {
    alert('Заполните подразделение и описание');
    return;
  }
  if (type === 'support' && !datetime) {
    alert('Укажите дату и время');
    return;
  }

  let fileData = null;
  let fileName = null;
  const file = fileInput.files[0];
  if (file) {
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('Файл слишком большой. Максимальный размер: 5 МБ.');
      return;
    }
    try {
      fileData = await fileToBase64(file);
      fileName = file.name;
    } catch (err) {
      alert('Ошибка чтения файла');
      return;
    }
  }

  const newRequest = {
    userId: currentUser.id,
    userName: `${currentUser.first_name} ${currentUser.last_name}`,
    subdivision,
    type,
    description,
    datetime,
    file: fileData ? { name: fileName, data: fileData } : null,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const submitBtn = requestForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Отправка...';
  submitBtn.disabled = true;

  const serverId = await createRequestOnServer(newRequest);
  if (serverId) {
    newRequest.id = serverId;
    requests.push(newRequest);
    selectedRequestId = null;
    if (isAdmin) {
      renderAdminPanel();
    } else {
      renderMyRequests();
    }
    alert('Заявка успешно отправлена!');
  }

  submitBtn.textContent = originalText;
  submitBtn.disabled = false;
  requestForm.reset();
  fileInfo.textContent = '';
  datetimeBlock.classList.add('hidden');
}

// ==========================================
// ОТОБРАЖЕНИЕ (список + детали)
// ==========================================
function getRequestById(id) {
  return requests.find(r => r.id == id);
}

function showRequestDetail(id) {
  selectedRequestId = id;
  if (isAdmin) {
    renderAdminPanel();
  } else {
    renderMyRequests();
  }
}

function hideRequestDetail() {
  selectedRequestId = null;
  if (isAdmin) {
    renderAdminPanel();
  } else {
    renderMyRequests();
  }
}

// Краткая карточка для списка
function renderRequestListItem(req) {
  const typeName = req.type === 'support' ? 'Тех.сопровождение' : 'Тех.обслуживание';
  const created = new Date(req.createdAt).toLocaleString('ru-RU');
  const statusMap = {
    pending: 'В ожидании',
    in_progress: 'В работе',
    done: 'Выполнено'
  };
  const badgeClass = {
    pending: 'pending',
    in_progress: 'in_progress',
    done: 'done'
  };

  return `
    <div class="request-card" style="cursor:pointer;" onclick="showRequestDetail(${req.id})">
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

// Детальная карточка
function renderRequestDetail(req, showAdminControls = false) {
  const statusMap = {
    pending: 'В ожидании',
    in_progress: 'В работе',
    done: 'Выполнено'
  };
  const badgeClass = {
    pending: 'pending',
    in_progress: 'in_progress',
    done: 'done'
  };
  const typeName = req.type === 'support' ? 'Тех.сопровождение' : 'Тех.обслуживание';
  const created = new Date(req.createdAt).toLocaleString('ru-RU');

  let fileHtml = '';
  let fileDownloadBtn = '';

  if (req.file) {
    let fileObj = req.file;
    if (typeof fileObj === 'string') {
      try { fileObj = JSON.parse(fileObj); } catch (e) { fileObj = null; }
    }
    if (fileObj && fileObj.name) {
      fileHtml = `<p><strong>Файл:</strong> ${fileObj.name}</p>`;
      if (fileObj.data) {
        fileDownloadBtn = `<button onclick="downloadFile('${fileObj.data.replace(/'/g, "\\'")}', '${fileObj.name.replace(/'/g, "\\'")}')" style="margin-top:4px; background:#4bb34b;">Скачать файл</button>`;
      }
    }
  }

  let datetimeHtml = req.datetime ? `<p><strong>Дата/время:</strong> ${new Date(req.datetime).toLocaleString('ru-RU')}</p>` : '';

  let actionsHtml = '';
  if (showAdminControls) {
    if (req.status === 'pending') {
      actionsHtml = `<div class="actions"><button onclick="changeStatus(${req.id}, 'in_progress'); hideRequestDetail();">В работу</button></div>`;
    } else if (req.status === 'in_progress') {
      actionsHtml = `<div class="actions"><button onclick="changeStatus(${req.id}, 'done'); hideRequestDetail();">Выполнено</button></div>`;
    }
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
// РЕНДЕР СПИСКОВ (БЕЗ ПЕРЕРИСОВКИ ПОЛЕЙ ПОИСКА)
// ==========================================
function renderMyRequests() {
  if (!myRequestsList) return;
  if (selectedRequestId) {
    const req = getRequestById(selectedRequestId);
    if (req) {
      myRequestsList.innerHTML = renderRequestDetail(req, false);
      return;
    }
  }

  const myReqs = requests.filter(r => r.userId == currentUser.id);
  let filtered = myReqs.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!r.userName?.toLowerCase().includes(q) &&
          !r.subdivision?.toLowerCase().includes(q) &&
          !r.description?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => b.id - a.id);

  if (filtered.length === 0) {
    myRequestsList.innerHTML = '<p>Заявок не найдено.</p>';
  } else {
    myRequestsList.innerHTML = filtered.map(req => renderRequestListItem(req)).join('');
  }
}

function renderAdminPanel() {
  if (!adminRequestsList) return;
  if (selectedRequestId) {
    const req = getRequestById(selectedRequestId);
    if (req) {
      adminRequestsList.innerHTML = renderRequestDetail(req, true);
      return;
    }
  }

  const base = currentTab === 'active'
    ? requests.filter(r => r.status !== 'done')
    : requests.filter(r => r.status === 'done');

  let filtered = base.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!r.userName?.toLowerCase().includes(q) &&
          !r.subdivision?.toLowerCase().includes(q) &&
          !r.description?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => b.id - a.id);

  if (filtered.length === 0) {
    adminRequestsList.innerHTML = '<p>Заявок нет.</p>';
  } else {
    adminRequestsList.innerHTML = filtered.map(req => renderRequestListItem(req)).join('');
  }
}

function switchAdminTab(tab) {
  currentTab = tab;
  selectedRequestId = null;
  searchQuery = '';
  statusFilter = 'all';
  // Очищаем статические поля (если они существуют)
  const adminSearch = document.getElementById('adminSearch');
  const adminStatus = document.getElementById('adminStatusFilter');
  if (adminSearch) adminSearch.value = '';
  if (adminStatus) adminStatus.value = 'all';
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

document.addEventListener('DOMContentLoaded', init);
// ==========================================
// КОНФИГУРАЦИЯ (замени на свои значения)
// ==========================================
const ADMIN_ID = 372708944;          // Твой реальный VK ID
const APP_ID = 54575499;              // ID мини-приложения VK
const API_URL = 'https://script.google.com/macros/s/AKfycbweogVun2KupPEbuq7WLZpQa0gUIwbrMKlIpNF-PvycDVLubHNaNHIubGyBL4Ans_uM4A/exec'; // URL веб-приложения Google Apps Script

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;
let isAdmin = false;
let requests = [];
let currentTab = 'active';

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

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================
async function init() {
  console.log('1. init стартовал');

  // Обязательная инициализация VK Mini App
  if (typeof vkBridge !== 'undefined') {
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('VKWebAppInit отправлен');
    } catch (e) {
      console.error('Ошибка VKWebAppInit:', e);
    }
  }
  
  // Получаем пользователя
  if (typeof vkBridge === 'undefined') {
    console.warn('vkBridge не найден – работаем с тестовым пользователем');
    currentUser = { id: 0, first_name: 'Тест', last_name: 'Тестов' };
    isAdmin = false;
  } else {
    console.log('2. vkBridge найден, вызываю getUserInfo с таймаутом 3 сек');
    try {
      const user = await Promise.race([
        vkBridge.send('VKWebAppGetUserInfo'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут VK Bridge')), 3000))
      ]);
      console.log('3. пользователь получен:', user);
      currentUser = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name
      };
      isAdmin = (currentUser.id === ADMIN_ID);
    } catch (e) {
      console.error('4. ошибка получения пользователя:', e);
      currentUser = { id: 0, first_name: 'Гость', last_name: '' };
      isAdmin = false;
    }
  }

  console.log('5. загружаю заявки с сервера...');
  await loadRequestsFromServer();
  console.log('6. скрываю loading, показываю интерфейс');
  loadingEl.classList.add('hidden');

  if (isAdmin) {
    adminPanel.classList.remove('hidden');
    renderAdminPanel();
  } else {
    userPanel.classList.remove('hidden');
    renderMyRequests();
  }

  typeSelect.addEventListener('change', toggleDatetime);
  fileInput.addEventListener('change', handleFile);
  requestForm.addEventListener('submit', handleFormSubmit);
  tabActive.addEventListener('click', () => switchAdminTab('active'));
  tabDone.addEventListener('click', () => switchAdminTab('done'));
  console.log('7. готово');
}

// ==========================================
// ВЗАИМОДЕЙСТВИЕ С СЕРВЕРОМ (Google Sheets)
// ==========================================
async function loadRequestsFromServer() {
  try {
    const response = await fetch(API_URL + '?action=getAll');
    if (!response.ok) throw new Error('Ошибка сети');
    requests = await response.json();
  } catch (e) {
    console.error('Не удалось загрузить заявки:', e);
    requests = [];
    // Если нужно — покажи уведомление пользователю
  }
}

async function createRequestOnServer(newRequest) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      // Без 'Content-Type' — браузер отправит text/plain, preflight не нужен
      body: JSON.stringify(newRequest)
    });
    if (!response.ok) throw new Error('Ошибка сети');
    const result = await response.json();
    if (!result.success) throw new Error('Сервер вернул ошибку');
    console.log('Заявка создана, ID:', result.id);
  } catch (e) {
    console.error('Ошибка при создании заявки:', e);
    alert('Не удалось отправить заявку. Проверьте соединение.');
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
  } catch (e) {
    console.error('Ошибка при обновлении статуса:', e);
    alert('Не удалось обновить статус.');
  }
}

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

  await createRequestOnServer(newRequest);
  await loadRequestsFromServer();

  requestForm.reset();
  fileInfo.textContent = '';
  datetimeBlock.classList.add('hidden');
  alert('Заявка успешно отправлена!');
  renderMyRequests();
  if (isAdmin) renderAdminPanel();
}

// ==========================================
// ОТОБРАЖЕНИЕ ЗАЯВОК
// ==========================================
function renderMyRequests() {
  const myReqs = requests.filter(r => r.userId == currentUser.id);
  if (myReqs.length === 0) {
    myRequestsList.innerHTML = '<p>У вас пока нет заявок.</p>';
    return;
  }
  myRequestsList.innerHTML = myReqs
    .sort((a, b) => b.id - a.id)
    .map(req => renderRequestCard(req, false))
    .join('');
}

function renderRequestCard(req, showAdminControls = false) {
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
  if (req.file) {
    // file – это строка JSON, её нужно распарсить
    let fileObj = req.file;
    if (typeof fileObj === 'string') {
      try {
        fileObj = JSON.parse(fileObj);
      } catch (e) {}
    }
    if (fileObj && fileObj.name) {
      fileHtml = `<p><strong>Файл:</strong> ${fileObj.name}</p>`;
    }
  }
  let datetimeHtml = req.datetime ? `<p><strong>Дата/время:</strong> ${new Date(req.datetime).toLocaleString('ru-RU')}</p>` : '';

  let actionsHtml = '';
  if (showAdminControls) {
    if (req.status === 'pending') {
      actionsHtml = `<div class="actions"><button onclick="changeStatus(${req.id}, 'in_progress')">В работу</button></div>`;
    } else if (req.status === 'in_progress') {
      actionsHtml = `<div class="actions"><button onclick="changeStatus(${req.id}, 'done')">Выполнено</button></div>`;
    }
  }

  return `
    <div class="request-card">
      <p><strong>${typeName}</strong> <span class="badge ${badgeClass[req.status]}">${statusMap[req.status]}</span></p>
      <p><strong>От:</strong> ${req.userName} (${req.subdivision})</p>
      <p><strong>Создана:</strong> ${created}</p>
      ${datetimeHtml}
      <p>${req.description}</p>
      ${fileHtml}
      ${actionsHtml}
    </div>
  `;
}

// Админ-панель
function switchAdminTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));
  if (tab === 'active') {
    tabActive.classList.add('active');
  } else {
    tabDone.classList.add('active');
  }
  renderAdminPanel();
}

function renderAdminPanel() {
  const filtered = currentTab === 'active'
    ? requests.filter(r => r.status !== 'done')
    : requests.filter(r => r.status === 'done');

  if (filtered.length === 0) {
    adminRequestsList.innerHTML = '<p>Заявок нет.</p>';
    return;
  }
  adminRequestsList.innerHTML = filtered
    .sort((a, b) => b.id - a.id)
    .map(req => renderRequestCard(req, true))
    .join('');
}

async function changeStatus(requestId, newStatus) {
  if (!isAdmin) return;
  await updateStatusOnServer(requestId, newStatus);
  await loadRequestsFromServer();
  renderAdminPanel();
  // Если обычный пользователь сейчас смотрит — обновить и его список
  if (!isAdmin && currentUser) {
    renderMyRequests();
  }
}

// Старт
document.addEventListener('DOMContentLoaded', init);
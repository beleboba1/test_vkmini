// ==========================================
// КОНФИГУРАЦИЯ (замени на свои значения)
// ==========================================
const ADMIN_ID = 372708944;          // Твой реальный VK ID
const APP_ID = 54575499;              // ID мини-приложения VK
const API_URL = 'https://script.google.com/macros/s/AKfycbweogVun2KupPEbuq7WLZpQa0gUIwbrMKlIpNF-PvycDVLubHNaNHIubGyBL4Ans_uM4A/exec'; // Твой URL веб-приложения Google Apps Script

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;
let isAdmin = false;
let requests = [];
let currentTab = 'active';
let selectedRequestId = null; // ID заявки для детального просмотра

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

  // Обязательная инициализация для VK Mini App
  if (typeof vkBridge !== 'undefined') {
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('VKWebAppInit отправлен');
    } catch (e) {
      console.error('Ошибка VKWebAppInit:', e);
    }
  }

  // Получаем данные пользователя (с таймаутом для браузера)
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

  // Обработчики
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

// Скачивание файла по base64-строке
function downloadFile(base64Data, fileName) {
  const link = document.createElement('a');
  link.href = base64Data;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

  await createRequestOnServer(newRequest);

  submitBtn.textContent = originalText;
  submitBtn.disabled = false;

  requestForm.reset();
  fileInfo.textContent = '';
  datetimeBlock.classList.add('hidden');

  // Локально добавляем заявку без перезагрузки всего списка
  newRequest.id = Date.now();
  requests.push(newRequest);
  selectedRequestId = null; // сбрасываем детальный просмотр
  if (isAdmin) {
    renderAdminPanel();
  } else {
    renderMyRequests();
  }
  alert('Заявка успешно отправлена!');
}

// ==========================================
// ОТОБРАЖЕНИЕ (список + детали)
// ==========================================

// Получение объекта заявки по ID
function getRequestById(id) {
  return requests.find(r => r.id == id);
}

// Показать детальную информацию о заявке
function showRequestDetail(id) {
  selectedRequestId = id;
  if (isAdmin) {
    renderAdminPanel();
  } else {
    renderMyRequests();
  }
}

// Вернуться к списку
function hideRequestDetail() {
  selectedRequestId = null;
  if (isAdmin) {
    renderAdminPanel();
  } else {
    renderMyRequests();
  }
}

// Рендер одной строки в списке (краткий вид)
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

// Рендер детальной карточки заявки
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
      try {
        fileObj = JSON.parse(fileObj);
      } catch (e) {
        fileObj = null;
      }
    }
    if (fileObj && fileObj.name) {
      fileHtml = `<p><strong>Файл:</strong> ${fileObj.name}</p>`;
      if (fileObj.data) {
        fileDownloadBtn = `<button onclick="downloadFile('${fileObj.data}', '${fileObj.name}')" style="margin-top:4px; background:#4bb34b;">Скачать файл</button>`;
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

// Пользовательский список
function renderMyRequests() {
  // Если выбран детальный просмотр, показываем его
  if (selectedRequestId) {
    const req = getRequestById(selectedRequestId);
    if (req) {
      myRequestsList.innerHTML = renderRequestDetail(req, false);
      return;
    }
  }

  // Иначе показываем список
  const myReqs = requests.filter(r => r.userId == currentUser.id);
  if (myReqs.length === 0) {
    myRequestsList.innerHTML = '<p>У вас пока нет заявок.</p>';
    return;
  }
  myRequestsList.innerHTML = myReqs
    .sort((a, b) => b.id - a.id)
    .map(req => renderRequestListItem(req))
    .join('');
}

// Админ-панель
function switchAdminTab(tab) {
  currentTab = tab;
  selectedRequestId = null; // сбрасываем детальный просмотр при смене вкладки
  document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));
  if (tab === 'active') {
    tabActive.classList.add('active');
  } else {
    tabDone.classList.add('active');
  }
  renderAdminPanel();
}

function renderAdminPanel() {
  // Если выбран детальный просмотр, показываем его
  if (selectedRequestId) {
    const req = getRequestById(selectedRequestId);
    if (req) {
      adminRequestsList.innerHTML = renderRequestDetail(req, true);
      return;
    }
  }

  // Иначе показываем список
  const filtered = currentTab === 'active'
    ? requests.filter(r => r.status !== 'done')
    : requests.filter(r => r.status === 'done');

  if (filtered.length === 0) {
    adminRequestsList.innerHTML = '<p>Заявок нет.</p>';
    return;
  }
  adminRequestsList.innerHTML = filtered
    .sort((a, b) => b.id - a.id)
    .map(req => renderRequestListItem(req))
    .join('');
}

// Смена статуса
async function changeStatus(requestId, newStatus) {
  if (!isAdmin) return;
  await updateStatusOnServer(requestId, newStatus);
  await loadRequestsFromServer();
  selectedRequestId = null; // после обновления возвращаемся к списку
  renderAdminPanel();
  if (!isAdmin && currentUser) {
    renderMyRequests();
  }
}

// Старт
document.addEventListener('DOMContentLoaded', init);
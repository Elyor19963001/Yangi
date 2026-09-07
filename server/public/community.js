const state = {
  token: localStorage.getItem('qrp_token') || '',
  profile: null,
  districts: [],
  spaces: [],
  active: null,
  messages: new Map(),
  firstMessageId: null,
  filter: 'all',
  socket: null,
  typingTimer: null,
  searchTimer: null,
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.status === 401) {
    localStorage.removeItem('qrp_token');
    state.token = '';
    $('loginModal').classList.remove('hidden');
    throw new Error('Sessiya tugagan. Qayta kiring.');
  }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return formatTime(value);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(n) + ' so‘m';
}

async function loadProfile() {
  state.profile = await api('/api/user/profile');
  const name = state.profile?.full_name || 'Foydalanuvchi';
  $('userName').textContent = name;
  $('userAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
  const district = state.districts.find((d) => Number(d.district_id) === Number(state.profile?.district_id));
  $('userDistrict').textContent = district?.name || 'Qishloq Raqamli Platformasi';
}

async function loadDistricts() {
  state.districts = await api('/api/meta/districts');
  $('createDistrict').innerHTML = '<option value="">Barcha hududlar</option>' + state.districts.map((d) => `<option value="${Number(d.district_id)}">${esc(d.name)}</option>`).join('');
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
  document.querySelectorAll('[data-chip]').forEach((b) => b.classList.toggle('active', b.dataset.chip === filter));
  loadSpaces();
}

async function loadSpaces() {
  const params = new URLSearchParams();
  const search = $('spaceSearch').value.trim();
  if (search) params.set('search', search);
  if (state.filter === 'group' || state.filter === 'channel') params.set('type', state.filter);
  if (state.filter === 'mine') params.set('mine', '1');
  try {
    state.spaces = await api('/api/chat/spaces?' + params.toString());
    renderSpaces();
  } catch (error) {
    $('spaceList').innerHTML = `<div class="empty-card">${esc(error.message)}</div>`;
  }
}

function renderSpaces() {
  $('spaceCount').textContent = `${state.spaces.length} ta chat`;
  if (!state.spaces.length) {
    $('spaceList').innerHTML = '<div class="empty-card">Hozircha chat topilmadi. Yangi guruh yoki kanal yarating.</div>';
    return;
  }
  $('spaceList').innerHTML = state.spaces.map((space) => {
    const active = Number(state.active?.space_id) === Number(space.space_id) ? ' active' : '';
    const type = space.space_type === 'channel' ? 'KANAL' : 'GURUH';
    const last = space.last_message || (space.is_member ? 'Hali xabar yo‘q' : 'Qo‘shilish uchun bosing');
    return `<button class="space-item${active}" data-space-id="${space.space_id}">
      <span class="space-avatar">${esc(space.avatar_emoji || (space.space_type === 'channel' ? '📢' : '💬'))}</span>
      <span class="space-main"><span class="space-top"><strong>${esc(space.name)}</strong><span class="type-mini">${type}</span></span><p>${esc(last)}</p></span>
      <span class="space-side">${formatDate(space.last_message_at)}<span class="member-mini">${Number(space.member_count || 0)} a’zo</span></span>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-space-id]').forEach((button) => button.addEventListener('click', () => openSpace(Number(button.dataset.spaceId))));
}

function connectSocket() {
  if (!window.io || !state.token) return;
  state.socket = io({ auth: { token: state.token } });
  state.socket.on('connect_error', (error) => console.warn('Realtime:', error.message));
  state.socket.on('chat:message', (message) => {
    if (Number(message.space_id) !== Number(state.active?.space_id)) {
      loadSpaces();
      return;
    }
    addMessage(message, true);
  });
  state.socket.on('chat:typing', (payload) => {
    if (Number(payload.space_id) !== Number(state.active?.space_id) || String(payload.user_id) === String(state.profile?.user_id)) return;
    $('typingIndicator').classList.toggle('hidden', !payload.active);
    if (payload.active) {
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => $('typingIndicator').classList.add('hidden'), 1600);
    }
  });
}

async function openSpace(spaceId) {
  try {
    if (state.active?.space_id && state.socket) state.socket.emit('chat:leave', state.active.space_id);
    state.active = await api(`/api/chat/spaces/${spaceId}`);
    state.messages.clear();
    state.firstMessageId = null;
    $('messages').innerHTML = '';
    $('emptyConversation').classList.add('hidden');
    $('chatView').classList.remove('hidden');
    document.querySelector('.app-shell').classList.add('chat-open');
    renderActiveHeader();
    renderSpaces();
    await loadMessages(false);
    if (state.socket) state.socket.emit('chat:join', spaceId, (result) => { if (!result?.ok) console.warn(result?.error); });
    const url = new URL(location.href);
    url.searchParams.set('space', spaceId);
    history.replaceState(null, '', url);
  } catch (error) {
    toast(error.message);
  }
}

function renderActiveHeader() {
  const space = state.active;
  $('chatAvatar').textContent = space.avatar_emoji || (space.space_type === 'channel' ? '📢' : '💬');
  $('chatName').textContent = space.name;
  $('chatMeta').textContent = `${Number(space.member_count || 0)} a’zo · ${space.visibility === 'public' ? 'ommaviy' : 'xususiy'}`;
  $('channelBadge').classList.toggle('hidden', space.space_type !== 'channel');
  $('channelBanner').classList.toggle('hidden', space.space_type !== 'channel');

  $('infoAvatar').textContent = space.avatar_emoji || '💬';
  $('infoName').textContent = space.name;
  $('infoDescription').textContent = space.description || 'Tavsif mavjud emas.';
  $('infoMembers').textContent = Number(space.member_count || 0);
  $('infoType').textContent = space.space_type === 'channel' ? 'Kanal' : 'Guruh';
  $('infoVisibility').textContent = space.visibility === 'public' ? 'Ommaviy' : 'Xususiy';
  $('infoRole').textContent = space.my_role === 'owner' ? 'Egasi' : space.my_role === 'admin' ? 'Admin' : space.is_member ? 'A’zo' : 'Mehmon';
  $('leaveBtn').classList.toggle('hidden', !space.is_member || space.my_role === 'owner');
  $('inviteBtn').classList.toggle('hidden', !(space.invite_code || space.visibility === 'public'));
  $('joinBtn').classList.toggle('hidden', Boolean(space.is_member));
  $('joinBtn').textContent = space.space_type === 'channel' ? '＋' : '＋';

  const canPost = space.is_member && (space.space_type === 'group' || ['owner','admin'].includes(space.my_role));
  $('composer').classList.toggle('hidden', !canPost);
  $('joinGate').classList.toggle('hidden', canPost);
  if (!canPost) {
    if (!space.is_member) {
      $('joinGate').querySelector('strong').textContent = space.space_type === 'channel' ? 'Kanalga obuna bo‘ling' : 'Guruhga qo‘shiling';
      $('joinGate').querySelector('span').textContent = space.space_type === 'channel' ? 'Yangiliklarni kuzatish uchun kanalga obuna bo‘ling.' : 'Xabar yozish uchun guruhga qo‘shiling.';
      $('joinGateBtn').classList.remove('hidden');
      $('joinGateBtn').textContent = space.space_type === 'channel' ? 'Obuna bo‘lish' : 'Qo‘shilish';
    } else {
      $('joinGate').querySelector('strong').textContent = 'Faqat administratorlar yozadi';
      $('joinGate').querySelector('span').textContent = 'Siz ushbu kanal yangiliklarini kuzatyapsiz.';
      $('joinGateBtn').classList.add('hidden');
    }
  }
}

async function loadMessages(older = false) {
  if (!state.active) return;
  const params = new URLSearchParams({ limit: '50' });
  if (older && state.firstMessageId) params.set('before', state.firstMessageId);
  try {
    const rows = await api(`/api/chat/spaces/${state.active.space_id}/messages?${params}`);
    if (!older) {
      state.messages.clear();
      $('messages').innerHTML = '';
    }
    for (const row of rows) addMessage(row, false, older);
    const ids = [...state.messages.keys()].map(Number).filter(Number.isFinite);
    state.firstMessageId = ids.length ? Math.min(...ids) : null;
    $('loadMoreBtn').classList.toggle('hidden', rows.length < 50);
    if (!older) scrollBottom();
  } catch (error) {
    toast(error.message);
  }
}

function messageHtml(message) {
  const mine = String(message.sender_id) === String(state.profile?.user_id);
  const signal = message.signal_id ? `<div class="price-signal"><strong>₿ ${esc(message.product_text)} · ${money(message.price_min)}${Number(message.price_max) !== Number(message.price_min) ? ' – ' + money(message.price_max) : ''}/${esc(message.unit || 'kg')}</strong><span>${message.market_text ? esc(message.market_text) + ' · ' : ''}chatdan avtomatik ajratildi · ishonchlilik ${Math.round(Number(message.confidence || 0) * 100)}%</span><span class="signal-status">TASDIQLANMAGAN SIGNAL</span></div>` : '';
  return `<div class="message-row${mine ? ' mine' : ''}" data-message-id="${message.message_id}"><div class="message-bubble">${mine ? '' : `<div class="message-author">${esc(message.sender_name || 'Foydalanuvchi')}</div>`}<div class="message-body">${esc(message.body)}</div>${signal}<div class="message-meta"><span>${formatTime(message.created_at)}</span>${mine ? '<span>✓</span>' : ''}</div></div></div>`;
}

function addMessage(message, shouldScroll = false, prepend = false) {
  const id = String(message.message_id);
  if (state.messages.has(id)) return;
  state.messages.set(id, message);
  const temp = document.createElement('div');
  temp.innerHTML = messageHtml(message);
  const node = temp.firstElementChild;
  if (prepend) $('messages').prepend(node); else $('messages').appendChild(node);
  if (shouldScroll) scrollBottom();
}

function scrollBottom() {
  const scroller = $('messageScroll');
  requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
}

async function sendMessage(event) {
  event.preventDefault();
  if (!state.active) return;
  const input = $('messageInput');
  const body = input.value.trim();
  if (!body) return;
  input.value = '';
  resizeComposer();
  try {
    const message = await api(`/api/chat/spaces/${state.active.space_id}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
    addMessage(message, true);
    loadSpaces();
  } catch (error) {
    input.value = body;
    resizeComposer();
    toast(error.message);
  }
}

async function joinActive() {
  if (!state.active) return;
  try {
    await api(`/api/chat/spaces/${state.active.space_id}/join`, { method: 'POST' });
    toast(state.active.space_type === 'channel' ? 'Kanalga obuna bo‘ldingiz.' : 'Guruhga qo‘shildingiz.');
    await openSpace(state.active.space_id);
    loadSpaces();
  } catch (error) { toast(error.message); }
}

async function leaveActive() {
  if (!state.active) return;
  if (!confirm('Ushbu chatni tark etasizmi?')) return;
  try {
    await api(`/api/chat/spaces/${state.active.space_id}/leave`, { method: 'DELETE' });
    toast('Chat tark etildi.');
    closeInfo();
    await openSpace(state.active.space_id);
    loadSpaces();
  } catch (error) { toast(error.message); }
}

function openCreate() {
  $('createModal').classList.remove('hidden');
  setTimeout(() => $('createName').focus(), 100);
}
function closeCreate() { $('createModal').classList.add('hidden'); $('createMessage').textContent = ''; }

async function createSpace(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const spaceType = new FormData(form).get('space_type');
  const payload = {
    space_type: spaceType,
    name: $('createName').value.trim(),
    description: $('createDescription').value.trim() || null,
    district_id: Number($('createDistrict').value) || null,
    visibility: $('createVisibility').value,
    avatar_emoji: $('createEmoji').value,
  };
  $('createMessage').textContent = 'Yaratilmoqda…';
  $('createMessage').className = 'form-message';
  try {
    const created = await api('/api/chat/spaces', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    $('createMessage').textContent = '';
    closeCreate();
    await loadSpaces();
    await openSpace(Number(created.space_id));
    toast(created.space_type === 'channel' ? 'Kanal yaratildi.' : 'Guruh yaratildi.');
  } catch (error) {
    $('createMessage').textContent = error.message;
    $('createMessage').className = 'form-message error';
  }
}

function openInfo() {
  if (!state.active) return;
  $('infoPanel').classList.remove('hidden');
  document.querySelector('.app-shell').classList.add('info-open');
}
function closeInfo() {
  $('infoPanel').classList.add('hidden');
  document.querySelector('.app-shell').classList.remove('info-open');
}

async function copyInvite() {
  if (!state.active) return;
  const url = new URL('/community.html', location.origin);
  if (state.active.invite_code) url.searchParams.set('invite', state.active.invite_code);
  else url.searchParams.set('space', state.active.space_id);
  try { await navigator.clipboard.writeText(url.toString()); toast('Taklif havolasi nusxalandi.'); }
  catch { prompt('Taklif havolasi:', url.toString()); }
}

async function openSignals() {
  $('signalsModal').classList.remove('hidden');
  $('signalList').innerHTML = '<div class="empty-card">Yuklanmoqda…</div>';
  try {
    const rows = await api('/api/chat/price-signals?status=unverified');
    if (!rows.length) {
      $('signalList').innerHTML = '<div class="empty-card">Hozircha chatlardan narx signali aniqlanmadi.</div>';
      return;
    }
    $('signalList').innerHTML = rows.map((row) => `<article class="signal-card"><div><strong>${esc(row.product_text)} · ${money(row.price_min)}${Number(row.price_max)!==Number(row.price_min) ? ' – '+money(row.price_max) : ''}/${esc(row.unit || 'kg')}</strong><p>${esc(row.space_name)}${row.market_text ? ' · '+esc(row.market_text) : ''}${row.district_name ? ' · '+esc(row.district_name) : ''}</p></div><div class="signal-confidence">${Math.round(Number(row.confidence || 0)*100)}%<br><small>tasdiqlanmagan</small></div></article>`).join('');
  } catch (error) { $('signalList').innerHTML = `<div class="empty-card">${esc(error.message)}</div>`; }
}

function resizeComposer() {
  const el = $('messageInput');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
}

function emitTyping() {
  if (!state.socket || !state.active) return;
  state.socket.emit('chat:typing', { space_id: state.active.space_id, active: true });
  clearTimeout(emitTyping.timer);
  emitTyping.timer = setTimeout(() => state.socket?.emit('chat:typing', { space_id: state.active?.space_id, active: false }), 900);
}

async function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite');
  const space = Number(params.get('space'));
  if (invite) {
    try {
      const result = await api('/api/chat/join-by-invite', { method: 'POST', body: JSON.stringify({ invite_code: invite }) });
      await loadSpaces();
      await openSpace(Number(result.space_id));
      toast('Taklif orqali chatga qo‘shildingiz.');
      return;
    } catch (error) { toast(error.message); }
  }
  if (Number.isInteger(space) && space > 0) await openSpace(space);
}

function bindEvents() {
  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  document.querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.chip)));
  $('spaceSearch').addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(loadSpaces, 260); });
  $('refreshSpaces').addEventListener('click', loadSpaces);
  $('newSpaceBtn').addEventListener('click', openCreate);
  $('newSpaceRail').addEventListener('click', openCreate);
  $('emptyCreateBtn').addEventListener('click', openCreate);
  document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', closeCreate));
  $('createSpaceForm').addEventListener('submit', createSpace);
  $('composer').addEventListener('submit', sendMessage);
  $('messageInput').addEventListener('input', () => { resizeComposer(); emitTyping(); });
  $('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } });
  $('joinBtn').addEventListener('click', joinActive);
  $('joinGateBtn').addEventListener('click', joinActive);
  $('chatInfoBtn').addEventListener('click', openInfo);
  $('closeInfo').addEventListener('click', closeInfo);
  $('leaveBtn').addEventListener('click', leaveActive);
  $('inviteBtn').addEventListener('click', copyInvite);
  $('loadMoreBtn').addEventListener('click', () => loadMessages(true));
  $('signalsBtn').addEventListener('click', openSignals);
  document.querySelectorAll('[data-close-signals]').forEach((b) => b.addEventListener('click', () => $('signalsModal').classList.add('hidden')));
  $('priceHintBtn').addEventListener('click', () => { $('messageInput').value = 'Urgut bozorida pomidor 12 ming so‘m/kg'; resizeComposer(); $('messageInput').focus(); });
  $('mobileBack').addEventListener('click', () => document.querySelector('.app-shell').classList.remove('chat-open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCreate(); closeInfo(); $('signalsModal').classList.add('hidden'); } });
}

async function boot() {
  bindEvents();
  if (!state.token) {
    $('loginModal').classList.remove('hidden');
    return;
  }
  try {
    await loadDistricts();
    await loadProfile();
    connectSocket();
    await loadSpaces();
    await handleDeepLink();
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}

boot();

const state = {
  token: localStorage.getItem('qrp_token') || '',
  profile: null,
  districts: [],
  pendingPhone: '',
  activeTab: 'prices',
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('uz-UZ').format(number) + ' so‘m';
}

function shortId(value) {
  if (!value) return '—';
  const text = String(value);
  return text.length > 18 ? text.slice(0, 8) + '…' + text.slice(-6) : text;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function weatherEmoji(code) {
  const n = Number(code);
  if ([0,1].includes(n)) return '☀️';
  if ([2,3].includes(n)) return '⛅';
  if ([45,48].includes(n)) return '🌫️';
  if ([51,53,55,61,63,65,80,81,82].includes(n)) return '🌧️';
  if ([71,73,75].includes(n)) return '❄️';
  if ([95,96,99].includes(n)) return '⛈️';
  return '🌤️';
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (response.status === 401 && state.token) {
    clearSession(false);
    throw new Error('Sessiya tugagan. Qayta kiring.');
  }
  if (!response.ok) throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  return payload;
}

function setMessage(element, message = '', type = '') {
  element.textContent = message;
  element.className = `form-message${type ? ' ' + type : ''}`;
}

async function checkServer() {
  try {
    const data = await api('/health');
    $('serverText').textContent = `Server online · v${data.version || '0.6.0'}`;
    $('serverPill').classList.add('online');
  } catch {
    $('serverText').textContent = 'Server bilan aloqa yo‘q';
    $('serverPill').classList.add('offline');
  }
}

async function loadDistricts() {
  try {
    state.districts = await api('/api/meta/districts');
    const options = state.districts
      .map((d) => `<option value="${Number(d.district_id)}">${escapeHtml(d.name)}</option>`)
      .join('');
    $('districtSelect').innerHTML = `<option value="">Tumanni tanlang</option>${options}`;
    $('activeDistrict').innerHTML = `<option value="">Barcha tumanlar</option>${options}`;
  } catch (error) {
    $('districtSelect').innerHTML = '<option value="">Tumanlar yuklanmadi</option>';
    setMessage($('authMessage'), error.message, 'error');
  }
}

function renderLoggedOut() {
  $('registerForm').classList.remove('hidden');
  $('otpForm').classList.add('hidden');
  $('userSession').classList.add('hidden');
  $('loginGate').classList.remove('hidden');
  $('moduleArea').classList.add('hidden');
}

async function renderLoggedIn() {
  $('registerForm').classList.add('hidden');
  $('otpForm').classList.add('hidden');
  $('userSession').classList.remove('hidden');
  $('loginGate').classList.add('hidden');
  $('moduleArea').classList.remove('hidden');

  try {
    state.profile = await api('/api/user/profile');
    const name = state.profile?.full_name || 'Pilot foydalanuvchi';
    $('sessionName').textContent = name;
    $('avatarInitial').textContent = name.trim().charAt(0).toUpperCase() || 'U';
    $('sessionStudy').textContent = `study_id: ${shortId(state.profile?.study_id)}`;
    $('researchStudyId').textContent = shortId(state.profile?.study_id);
    $('researchConsent').textContent = state.profile?.consent_analytics ? 'Berilgan' : 'Berilmagan';
    $('researchConsent').className = state.profile?.consent_analytics ? 'positive' : 'warning';
    if (state.profile?.district_id) $('activeDistrict').value = String(state.profile.district_id);
    await loadActiveModule();
  } catch (error) {
    setMessage($('authMessage'), error.message, 'error');
  }
}

function clearSession(showMessage = true) {
  state.token = '';
  state.profile = null;
  localStorage.removeItem('qrp_token');
  renderLoggedOut();
  if (showMessage) setMessage($('authMessage'), 'Sessiyadan chiqildi.', 'success');
}

async function handleRegister(event) {
  event.preventDefault();
  const phone = $('phone').value.trim();
  const fullName = $('fullName').value.trim();
  const districtId = Number($('districtSelect').value) || null;
  const consent = $('consentAnalytics').checked;

  setMessage($('authMessage'), 'OTP tayyorlanmoqda…');
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone, full_name: fullName || null, district_id: districtId }),
    });

    state.pendingPhone = phone;
    await api('/api/auth/consent', {
      method: 'POST',
      body: JSON.stringify({ phone, consent_version: 'v1', consent_analytics: consent }),
    });

    $('registerForm').classList.add('hidden');
    $('otpForm').classList.remove('hidden');
    const demoText = result.dev_otp
      ? `Test rejimi: OTP kodi ${result.dev_otp}. Production pilotda kod SMS orqali yuboriladi.`
      : 'OTP telefon raqamingizga yuborildi.';
    $('otpInfo').textContent = demoText;
    if (result.dev_otp) $('otp').value = result.dev_otp;
    setMessage($('authMessage'), 'OTP yaratildi. Kodni tasdiqlang.', 'success');
  } catch (error) {
    setMessage($('authMessage'), error.message, 'error');
  }
}

async function handleOtp(event) {
  event.preventDefault();
  const otp = $('otp').value.trim();
  setMessage($('authMessage'), 'Tasdiqlanmoqda…');
  try {
    const result = await api('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: state.pendingPhone, otp }),
    });
    state.token = result.token;
    localStorage.setItem('qrp_token', result.token);
    setMessage($('authMessage'), 'Muvaffaqiyatli kirdingiz.', 'success');
    await renderLoggedIn();
  } catch (error) {
    setMessage($('authMessage'), error.message, 'error');
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
  if (state.token) loadActiveModule();
}

async function loadActiveModule() {
  if (!state.token) return;
  if (state.activeTab === 'prices') return loadPrices();
  if (state.activeTab === 'market') return loadListings();
  if (state.activeTab === 'weather') return loadWeather();
  if (state.activeTab === 'programs') return loadPrograms();
}

async function loadPrices() {
  const body = $('pricesBody');
  body.innerHTML = '<tr><td colspan="6">Ma’lumot yuklanmoqda…</td></tr>';
  try {
    const districtId = $('activeDistrict').value;
    const query = districtId ? `?district_id=${encodeURIComponent(districtId)}` : '';
    const rows = await api('/api/prices' + query);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6">Tanlangan tuman bo‘yicha hozircha narx ma’lumoti yo‘q.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr><td><strong>${escapeHtml(row.product)}</strong></td><td>${escapeHtml(row.market)}</td><td class="price-cell">${money(row.price)}</td><td>${escapeHtml(row.unit || '—')}</td><td>${escapeHtml(row.price_date ? String(row.price_date).slice(0, 10) : '—')}</td><td><span class="source-pill">${escapeHtml(row.source || '—')}</span></td></tr>`).join('');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" class="error-text">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadListings() {
  const grid = $('listingsGrid');
  grid.innerHTML = '<div class="empty-card">E’lonlar yuklanmoqda…</div>';
  try {
    const rows = await api('/api/listings');
    if (!rows.length) {
      grid.innerHTML = '<div class="empty-card">Hozircha faol e’lon yo‘q. Birinchi e’lonni joylashtiring.</div>';
      return;
    }
    grid.innerHTML = rows.map((row) => `
      <article class="listing-card"><div class="listing-top"><span class="listing-label">Sotuvda</span><small>${escapeHtml(row.created_at ? new Date(row.created_at).toLocaleDateString('uz-UZ') : '')}</small></div><h5>${escapeHtml(row.title)}</h5><strong class="listing-price">${money(row.price)}</strong><p>${escapeHtml(row.description || 'Tavsif kiritilmagan.')}</p><div class="listing-meta"><span>${escapeHtml(row.quantity || '—')} ${escapeHtml(row.unit || '')}</span><span>${escapeHtml(row.seller_name || 'Pilot foydalanuvchi')}</span></div></article>`).join('');
  } catch (error) {
    grid.innerHTML = `<div class="empty-card error-text">${escapeHtml(error.message)}</div>`;
  }
}

async function createListing(event) {
  event.preventDefault();
  setMessage($('listingMessage'), 'E’lon saqlanmoqda…');
  try {
    await api('/api/listings', {
      method: 'POST',
      body: JSON.stringify({
        title: $('listingTitle').value.trim(),
        description: $('listingDescription').value.trim() || null,
        price: Number($('listingPrice').value),
        quantity: $('listingQty').value ? Number($('listingQty').value) : null,
        unit: $('listingUnit').value,
      }),
    });
    $('listingForm').reset();
    $('listingUnit').value = 'kg';
    setMessage($('listingMessage'), 'E’lon muvaffaqiyatli joylashtirildi.', 'success');
    await loadListings();
  } catch (error) {
    setMessage($('listingMessage'), error.message, 'error');
  }
}

async function loadWeather() {
  const content = $('weatherContent');
  const districtId = $('activeDistrict').value || state.profile?.district_id;
  if (!districtId) {
    content.innerHTML = '<div class="empty-card">Ob-havoni ko‘rish uchun tuman tanlang.</div>';
    return;
  }
  content.innerHTML = '<div class="empty-card">Ob-havo yuklanmoqda…</div>';
  try {
    const data = await api(`/api/weather/${encodeURIComponent(districtId)}`);
    if (data.mode === 'demo' || !data.daily?.length) {
      content.innerHTML = `<div class="weather-demo"><div class="weather-symbol">🌤️</div><div><span class="demo-badge">JOY ANIQLANMADI</span><h4>${escapeHtml(data.district || 'Tanlangan tuman')}</h4><p>${escapeHtml(data.message || 'Aniq lokatsiya bilan xarita modulidan foydalaning.')}</p><a class="btn btn-primary" href="/map.html">⌖ Xarita va real ob-havo</a></div></div>`;
      return;
    }

    const current = data.current || {};
    content.innerHTML = `
      <div class="weather-title"><div><h4>${escapeHtml(data.district || data.location || 'Tanlangan tuman')}</h4><small>${escapeHtml(current.condition || '')} · ${Math.round(Number(current.temperature_2m || 0))}°C · namlik ${Math.round(Number(current.relative_humidity_2m || 0))}%</small></div><span class="live-badge">LIVE · Open-Meteo</span></div>
      <div class="forecast-grid">${data.daily.slice(0,5).map((day) => `<article class="forecast-card"><small>${escapeHtml(String(day.date || ''))}</small><div class="forecast-temp">${weatherEmoji(day.weather_code)} ${Math.round(Number(day.temp_max || 0))}°</div><strong>${escapeHtml(day.condition || '')}</strong><span>Min: ${Math.round(Number(day.temp_min || 0))}° · yomg‘ir ${Math.round(Number(day.precipitation_probability_max || 0))}%</span></article>`).join('')}</div>
      <div class="research-note"><strong>🌾 Agro signal:</strong> ${escapeHtml(data.agro_advice?.[0] || 'Keskin signal aniqlanmadi.')} <a class="text-link" href="/map.html">Yaqin xizmatlar xaritasini ochish →</a></div>`;
  } catch (error) {
    content.innerHTML = `<div class="empty-card error-text">${escapeHtml(error.message)}</div>`;
  }
}

async function loadPrograms() {
  const grid = $('programsGrid');
  grid.innerHTML = '<div class="empty-card">Dasturlar yuklanmoqda…</div>';
  try {
    const rows = await api('/api/programs');
    if (!rows.length) {
      grid.innerHTML = '<div class="empty-card">Hozircha faol dastur kiritilmagan.</div>';
      return;
    }
    grid.innerHTML = rows.map((row) => {
      const url = safeHttpUrl(row.source_url);
      return `<article class="program-card"><div class="program-top"><span class="program-type">${escapeHtml(row.program_type || 'dastur')}</span>${row.valid_to ? `<small>${escapeHtml(String(row.valid_to).slice(0, 10))} gacha</small>` : ''}</div><h4>${escapeHtml(row.title)}</h4><p>${escapeHtml(row.summary || 'Qisqa ma’lumot mavjud emas.')}</p><div class="eligibility"><strong>Kimlar uchun:</strong> ${escapeHtml(row.eligibility || 'Aniqlanmagan')}</div>${url ? `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Rasmiy manba →</a>` : '<span class="demo-source">Demo ma’lumot</span>'}</article>`;
    }).join('');
  } catch (error) {
    grid.innerHTML = `<div class="empty-card error-text">${escapeHtml(error.message)}</div>`;
  }
}

function bindEvents() {
  $('registerForm').addEventListener('submit', handleRegister);
  $('otpForm').addEventListener('submit', handleOtp);
  $('backToRegister').addEventListener('click', () => {
    $('otpForm').classList.add('hidden');
    $('registerForm').classList.remove('hidden');
    setMessage($('authMessage'));
  });
  $('logoutBtn').addEventListener('click', () => clearSession(true));
  $('listingForm').addEventListener('submit', createListing);
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('activeDistrict').addEventListener('change', () => {
    if (state.activeTab === 'prices') loadPrices();
    if (state.activeTab === 'weather') loadWeather();
  });
  $('refreshPrices').addEventListener('click', loadPrices);
  $('refreshListings').addEventListener('click', loadListings);
  $('refreshWeather').addEventListener('click', loadWeather);
  $('refreshPrograms').addEventListener('click', loadPrograms);
}

async function init() {
  bindEvents();
  await Promise.all([checkServer(), loadDistricts()]);
  if (state.token) await renderLoggedIn();
  else renderLoggedOut();
}

init();

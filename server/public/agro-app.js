const state = {
  token: localStorage.getItem('qrp_token') || '',
  profile: null,
  districts: [],
  mode: 'trader',
  map: null,
  fieldLayer: null,
  districtMarker: null,
  currentFields: [],
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

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(n) + ' so‘m';
}

function cropColor(name) {
  const palette = ['#2f855a','#d69e2e','#3182ce','#805ad5','#dd6b20','#2c7a7b','#c53030','#718096','#68d391','#b7791f'];
  let hash = 0;
  for (const char of String(name || '')) hash = ((hash << 5) - hash) + char.charCodeAt(0);
  return palette[Math.abs(hash) % palette.length];
}

function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView([39.65, 66.96], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);
  state.fieldLayer = L.geoJSON(null, {
    style: (feature) => ({
      color: cropColor(feature.properties?.crop_name),
      fillColor: cropColor(feature.properties?.crop_name),
      fillOpacity: .42,
      weight: 1.5,
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const confidence = p.confidence == null ? '—' : `${Math.round(Number(p.confidence) * 100)}%`;
      const ndvi = p.ndvi == null ? '—' : Number(p.ndvi).toFixed(2);
      const harvest = p.harvest_start || p.harvest_end ? `${p.harvest_start || '—'} → ${p.harvest_end || '—'}` : '—';
      layer.bindPopup(`<div class="field-popup"><h3>${esc(p.crop_name || 'Ekin')}</h3><div class="line"><span>Tuman</span><strong>${esc(p.district_name || '—')}</strong></div><div class="line"><span>Maydon</span><strong>${p.area_ha == null ? '—' : Number(p.area_ha).toLocaleString('uz-UZ') + ' ga'}</strong></div><div class="line"><span>Ishonchlilik</span><strong>${confidence}</strong></div><div class="line"><span>NDVI</span><strong>${ndvi}</strong></div><div class="line"><span>Bosqich</span><strong>${esc(p.growth_stage || '—')}</strong></div><div class="line"><span>Hosil oynasi</span><strong>${esc(harvest)}</strong></div><div class="line"><span>Manba</span><strong>${esc(p.source_type || '—')}</strong></div><div class="signal">Sun’iy yo‘ldosh/model bahosi. Platforma buni daladagi fakt bilan tenglashtirmaydi.</div></div>`);
    },
  }).addTo(state.map);
}

async function loadProfileAndDistricts() {
  const [districts, profile] = await Promise.all([api('/api/meta/districts'), api('/api/user/profile')]);
  state.districts = districts;
  state.profile = profile;
  $('districtSelect').innerHTML = '<option value="">Tumanni tanlang</option>' + districts.map((d) => `<option value="${Number(d.district_id)}">${esc(d.name)}</option>`).join('');
  if (profile?.district_id) $('districtSelect').value = String(profile.district_id);
}

async function loadStatus() {
  try {
    const data = await api('/api/agro/status');
    $('publishedBadge').textContent = `${Number(data.published_fields || 0)} FIELD`;
    if (Number(data.published_fields || 0) > 0) {
      $('statusTitle').textContent = 'Agro Intelligence qatlamlari mavjud';
      $('statusText').textContent = `${data.published_fields} ta published dala poligoni, ${data.verified_samples} ta verified ground-truth namuna. Sentinel-2 katalogi jonli ishlaydi.`;
    } else {
      $('statusTitle').textContent = 'Satellite katalog ulandi, crop-classification qatlamlari hali chop etilmagan';
      $('statusText').textContent = 'Hozir Sentinel-2 sahnalarini ko‘ramiz. Ekin poligonlari faqat model + ground-truth tekshiruvidan so‘ng xaritada paydo bo‘ladi.';
    }
  } catch (error) {
    $('statusTitle').textContent = 'Agro status yuklanmadi';
    $('statusText').textContent = error.message;
  }
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  const copy = {
    trader: {
      title: 'Savdogar uchun taklif signallari',
      insight: 'Savdogar oynasi',
      text: 'Ekin maydoni, model ishonchliligi, hosil yig‘im oynasi va bozor narxi bir joyda ko‘rsatiladi.',
    },
    consumer: {
      title: 'Iste’molchi uchun mavjudlik signallari',
      insight: 'Iste’molchi oynasi',
      text: 'Qaysi mahsulot qayerda yetishtirilayotgani va bozorga chiqish davri soddalashtirilgan ko‘rinishda beriladi.',
    },
    research: {
      title: 'Model sifati va vegetatsiya ko‘rsatkichlari',
      insight: 'Tadqiqotchi oynasi',
      text: 'Confidence, NDVI, source_type va kuzatuv davri orqali crop-classification natijasini ilmiy nazorat qilish mumkin.',
    },
  }[mode];
  $('summaryTitle').textContent = copy.title;
  $('insightTitle').textContent = copy.insight;
  $('insightText').textContent = copy.text;
  renderSummary(state.lastSummary || []);
}

function renderSummary(rows) {
  state.lastSummary = rows;
  const list = $('summaryList');
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">Tanlangan mavsum uchun `published` crop-model natijasi yo‘q. Bu yerga taxminiy ma’lumot to‘ldirilmaydi.</div>';
    return;
  }
  list.innerHTML = rows.map((row) => {
    const color = cropColor(row.crop_name);
    const conf = row.avg_confidence == null ? '—' : `${Math.round(Number(row.avg_confidence) * 100)}%`;
    const ndvi = row.avg_ndvi == null ? '—' : Number(row.avg_ndvi).toFixed(2);
    const harvest = row.harvest_start || row.harvest_end ? `${String(row.harvest_start || '—').slice(0,10)} — ${String(row.harvest_end || '—').slice(0,10)}` : '—';
    const price = row.avg_market_price == null ? '—' : money(row.avg_market_price);
    const priceBadge = row.market_price_is_demo ? '<span class="demo-price">DEMO NARX</span>' : '';
    let meta = '';
    if (state.mode === 'trader') {
      meta = `<span>Hosil oynasi<strong>${esc(harvest)}</strong></span><span>Bozor narxi<strong>${price} ${priceBadge}</strong></span>`;
    } else if (state.mode === 'consumer') {
      meta = `<span>Taxminiy yetishtirilayotgan maydon<strong>${Number(row.area_ha || 0).toLocaleString('uz-UZ')} ga</strong></span><span>Bozorga chiqish oynasi<strong>${esc(harvest)}</strong></span>`;
    } else {
      meta = `<span>Confidence<strong>${conf}</strong></span><span>O‘rtacha NDVI<strong>${ndvi}</strong></span>`;
    }
    return `<article class="crop-row"><div class="crop-top"><div class="crop-name"><span class="crop-dot" style="background:${color}"></span>${esc(row.crop_name)}</div><span class="crop-area">${Number(row.area_ha || 0).toLocaleString('uz-UZ')} ga</span></div><div class="crop-meta">${meta}</div></article>`;
  }).join('');
}

function renderScenes(payload) {
  const list = $('sceneList');
  const rows = payload?.scenes || [];
  if (payload?.district?.latitude && payload?.district?.longitude) {
    state.map.setView([Number(payload.district.latitude), Number(payload.district.longitude)], 10);
    if (state.districtMarker) state.map.removeLayer(state.districtMarker);
    state.districtMarker = L.circleMarker([Number(payload.district.latitude), Number(payload.district.longitude)], { radius: 6, color: '#173f2d', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(state.map).bindTooltip(payload.district.name);
  }
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">Tanlangan filtr bo‘yicha Sentinel-2 sahnasi topilmadi.</div>';
    return;
  }
  list.innerHTML = rows.slice(0, 8).map((scene) => `<article class="scene-item"><div><strong>${esc(scene.id)}</strong><span>${esc(scene.datetime ? new Date(scene.datetime).toLocaleString('uz-UZ') : 'Sana yo‘q')} · ${esc(scene.platform || 'Sentinel-2')}</span></div><span class="cloud-pill">☁ ${scene.cloud_cover == null ? '—' : Number(scene.cloud_cover).toFixed(1) + '%'}</span></article>`).join('');
}

function renderFields(fc) {
  state.fieldLayer.clearLayers();
  const features = fc?.features || [];
  state.currentFields = features;
  state.fieldLayer.addData(fc || { type: 'FeatureCollection', features: [] });
  if (features.length) {
    const bounds = state.fieldLayer.getBounds();
    if (bounds.isValid()) state.map.fitBounds(bounds.pad(.08));
  }
  const crops = [...new Set(features.map((f) => f.properties?.crop_name).filter(Boolean))];
  $('legendItems').innerHTML = crops.length ? crops.map((crop) => `<span class="legend-item"><span class="legend-swatch" style="background:${cropColor(crop)}"></span>${esc(crop)}</span>`).join('') : '<span class="muted">Published crop-layer mavjud emas.</span>';
}

async function refresh() {
  const districtId = Number($('districtSelect').value) || null;
  const season = $('seasonSelect').value;
  const cloud = $('cloudSelect').value;
  if (!districtId) {
    $('summaryList').innerHTML = '<div class="empty-state">Avval tuman tanlang.</div>';
    $('sceneList').innerHTML = '<div class="empty-state">Avval tuman tanlang.</div>';
    return;
  }
  $('summaryList').innerHTML = '<div class="empty-state">Crop summary yuklanmoqda…</div>';
  $('sceneList').innerHTML = '<div class="empty-state">Sentinel katalogi tekshirilmoqda…</div>';

  const [summaryResult, fieldsResult, scenesResult] = await Promise.allSettled([
    api(`/api/agro/summary?district_id=${districtId}&season=${encodeURIComponent(season)}`),
    api(`/api/agro/fields?district_id=${districtId}&season=${encodeURIComponent(season)}`),
    api(`/api/agro/scenes?district_id=${districtId}&days=60&cloud=${encodeURIComponent(cloud)}`),
  ]);

  if (summaryResult.status === 'fulfilled') renderSummary(summaryResult.value.rows || []);
  else $('summaryList').innerHTML = `<div class="empty-state">${esc(summaryResult.reason.message)}</div>`;

  if (fieldsResult.status === 'fulfilled') renderFields(fieldsResult.value);
  else { renderFields({ type:'FeatureCollection', features:[] }); toast(fieldsResult.reason.message); }

  if (scenesResult.status === 'fulfilled') renderScenes(scenesResult.value);
  else $('sceneList').innerHTML = `<div class="empty-state">${esc(scenesResult.reason.message)}</div>`;
}

function bindEvents() {
  $('refreshBtn').addEventListener('click', refresh);
  $('districtSelect').addEventListener('change', refresh);
  $('seasonSelect').addEventListener('change', refresh);
  $('cloudSelect').addEventListener('change', refresh);
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
}

async function boot() {
  if (!state.token) {
    $('loginModal').classList.remove('hidden');
    return;
  }
  initMap();
  bindEvents();
  try {
    await Promise.all([loadProfileAndDistricts(), loadStatus()]);
    if ($('districtSelect').value) await refresh();
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}

boot();

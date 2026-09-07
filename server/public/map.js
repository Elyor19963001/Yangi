const state = {
  token: localStorage.getItem('qrp_token') || '',
  profile: null,
  districts: [],
  categories: [],
  category: 'market',
  radius: 5000,
  lat: 39.6542,
  lon: 66.9597,
  map: null,
  markerLayer: null,
  userMarker: null,
  places: [],
  filtered: [],
  activeKey: null,
  suggestLat: null,
  suggestLon: null,
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

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

function weatherEmoji(code) {
  if ([0,1].includes(Number(code))) return '☀️';
  if ([2,3].includes(Number(code))) return '⛅';
  if ([45,48].includes(Number(code))) return '🌫️';
  if ([51,53,55,61,63,65,80,81,82].includes(Number(code))) return '🌧️';
  if ([71,73,75].includes(Number(code))) return '❄️';
  if ([95,96,99].includes(Number(code))) return '⛈️';
  return '🌤️';
}

function formatDistance(meters) {
  const n = Number(meters);
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return `${Math.round(n)} m`;
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} km`;
}

function categoryMeta(key) {
  return state.categories.find((item) => item.key === key) || { key, label: key, emoji: '📍' };
}

function initMap() {
  state.map = L.map('map', { zoomControl: true, attributionControl: true }).setView([state.lat, state.lon], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.map.on('moveend', () => {
    const center = state.map.getCenter();
    $('mapCenterLabel').textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  });
}

function userLocationMarker(lat, lon, label = 'Sizning joylashuvingiz') {
  if (state.userMarker) state.userMarker.remove();
  const icon = L.divIcon({
    className: '',
    html: '<div style="width:20px;height:20px;border-radius:50%;background:#0b78ff;border:4px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.28)"></div>',
    iconSize: [20,20], iconAnchor: [10,10],
  });
  state.userMarker = L.marker([lat, lon], { icon }).addTo(state.map).bindPopup(esc(label));
}

async function loadCategories() {
  state.categories = await api('/api/places/categories');
  renderCategories();
  $('suggestCategory').innerHTML = state.categories.map((c) => `<option value="${esc(c.key)}">${esc(c.emoji)} ${esc(c.label)}</option>`).join('');
}

function renderCategories() {
  $('categoryGrid').innerHTML = state.categories.map((c) => `<button class="category-btn${c.key === state.category ? ' active' : ''}" data-category="${esc(c.key)}" title="${esc(c.label)}"><span>${esc(c.emoji)}</span><small>${esc(c.label)}</small></button>`).join('');
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', async () => {
    state.category = button.dataset.category;
    renderCategories();
    await loadPlaces();
  }));
}

async function loadProfileContext() {
  const [profile, districts] = await Promise.all([
    api('/api/user/profile'),
    api('/api/meta/districts'),
  ]);
  state.profile = profile;
  state.districts = districts;
  const district = districts.find((d) => Number(d.district_id) === Number(profile?.district_id));
  if (!district) return false;
  try {
    const weather = await api(`/api/weather/${district.district_id}`);
    if (weather.mode === 'live' && Number.isFinite(Number(weather.latitude)) && Number.isFinite(Number(weather.longitude))) {
      state.lat = Number(weather.latitude);
      state.lon = Number(weather.longitude);
      state.map.setView([state.lat, state.lon], 12);
      $('mapCenterLabel').textContent = district.name;
      renderWeather(weather);
      return true;
    }
  } catch (error) {
    console.warn('District weather:', error.message);
  }
  return false;
}

async function loadWeather(lat = state.lat, lon = state.lon, label = 'Joriy hudud') {
  try {
    const weather = await api(`/api/weather/coords?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&label=${encodeURIComponent(label)}`);
    renderWeather(weather);
  } catch (error) {
    $('weatherLocation').textContent = 'Ob-havo olinmadi';
    $('agroAdvice').textContent = error.message;
  }
}

function renderWeather(weather) {
  const current = weather.current || {};
  $('weatherIcon').textContent = weatherEmoji(current.weather_code);
  $('weatherLocation').textContent = weather.location || weather.district || 'Joriy joylashuv';
  $('weatherTemp').textContent = Number.isFinite(Number(current.temperature_2m)) ? `${Math.round(Number(current.temperature_2m))}°C` : '—';
  $('weatherCondition').textContent = current.condition || '—';
  $('weatherHumidity').textContent = Number.isFinite(Number(current.relative_humidity_2m)) ? `${Math.round(Number(current.relative_humidity_2m))}%` : '—';
  $('weatherWind').textContent = Number.isFinite(Number(current.wind_speed_10m)) ? `${Math.round(Number(current.wind_speed_10m))} km/soat` : '—';
  const firstDay = weather.daily?.[0] || {};
  $('weatherRain').textContent = Number.isFinite(Number(firstDay.precipitation_probability_max)) ? `${Math.round(Number(firstDay.precipitation_probability_max))}%` : '—';
  $('agroAdvice').textContent = weather.agro_advice?.[0] || 'Keskin signal aniqlanmadi.';
  $('forecastRow').innerHTML = (weather.daily || []).map((day) => `<div class="forecast-day"><strong>${new Date(day.date + 'T12:00:00').toLocaleDateString('uz-UZ',{weekday:'short',day:'2-digit'})}</strong><span>${weatherEmoji(day.weather_code)} ${Math.round(Number(day.temp_max))}° / ${Math.round(Number(day.temp_min))}°</span><small>Yomg‘ir ${Math.round(Number(day.precipitation_probability_max || 0))}% · shamol ${Math.round(Number(day.wind_speed_max || 0))}</small></div>`).join('');
}

function placeKey(place) {
  if (place.osm_type && place.osm_id) return `osm:${place.osm_type}:${place.osm_id}`;
  if (place.place_id) return `db:${place.place_id}`;
  return `${place.name}:${Number(place.latitude).toFixed(5)}:${Number(place.longitude).toFixed(5)}`;
}

function mergePlaces(localRows, osmRows) {
  const map = new Map();
  for (const row of [...localRows, ...osmRows]) {
    const key = placeKey(row);
    if (!map.has(key)) map.set(key, { ...row, _key: key });
  }
  return [...map.values()].sort((a,b) => Number(a.distance_m || Infinity) - Number(b.distance_m || Infinity));
}

async function loadPlaces() {
  if (!state.map) return;
  $('placeList').innerHTML = '<div class="empty-state">Yaqin joylar qidirilmoqda…</div>';
  $('sourceStatus').textContent = 'qidirilmoqda';
  state.radius = Number($('radiusSelect').value) || 5000;
  const base = `lat=${encodeURIComponent(state.lat)}&lon=${encodeURIComponent(state.lon)}&radius=${state.radius}&category=${encodeURIComponent(state.category)}`;
  const [localResult, osmResult] = await Promise.allSettled([
    api(`/api/places/nearby?${base}`),
    api(`/api/places/discover?${base}`),
  ]);
  const localRows = localResult.status === 'fulfilled' ? localResult.value : [];
  const osmRows = osmResult.status === 'fulfilled' ? (osmResult.value.places || []) : [];
  state.places = mergePlaces(localRows, osmRows);
  $('sourceStatus').textContent = osmRows.length ? 'OSM + platforma' : localRows.length ? 'platforma' : 'natija yo‘q';
  applySearch();
  renderMarkers();
  if (localResult.status === 'rejected' && osmResult.status === 'rejected') toast('Yaqin xizmatlarni yuklab bo‘lmadi.');
}

function applySearch() {
  const query = $('placeSearch').value.trim().toLocaleLowerCase('uz-UZ');
  state.filtered = query ? state.places.filter((p) => [p.name,p.address,p.phone].filter(Boolean).join(' ').toLocaleLowerCase('uz-UZ').includes(query)) : [...state.places];
  renderPlaceList();
}

function renderPlaceList() {
  $('resultCount').textContent = `${state.filtered.length} ta joy`;
  if (!state.filtered.length) {
    $('placeList').innerHTML = '<div class="empty-state">Bu radiusda tanlangan turdagi joy topilmadi. Radiusni kengaytiring yoki boshqa kategoriya tanlang.</div>';
    return;
  }
  const meta = categoryMeta(state.category);
  $('placeList').innerHTML = state.filtered.map((p) => {
    const source = p.source_type === 'osm' ? 'OpenStreetMap' : p.verification_status === 'verified' ? 'Tasdiqlangan' : 'Platforma';
    return `<button class="place-card${state.activeKey === p._key ? ' active' : ''}" data-place-key="${esc(p._key)}"><span class="place-icon">${esc(meta.emoji)}</span><span class="place-main"><strong>${esc(p.name || meta.label)}</strong><p>${esc(p.address || p.opening_hours || 'Manzil ma’lumoti mavjud')}</p><span class="meta"><span class="mini-tag${p.verification_status === 'verified' ? ' verified' : ''}">${esc(source)}</span>${p.phone ? '<span class="mini-tag">☎ telefon</span>' : ''}</span></span><span class="place-distance">${formatDistance(p.distance_m)}</span></button>`;
  }).join('');
  document.querySelectorAll('[data-place-key]').forEach((button) => button.addEventListener('click', () => focusPlace(button.dataset.placeKey)));
}

function renderMarkers() {
  state.markerLayer.clearLayers();
  for (const place of state.places) {
    const lat = Number(place.latitude);
    const lon = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const meta = categoryMeta(place.category || state.category);
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:36px;height:36px;border-radius:12px;background:#fff;border:1px solid #dce7e1;display:grid;place-items:center;font-size:18px;box-shadow:0 5px 16px rgba(18,48,33,.18)">${esc(meta.emoji)}</div>`,
      iconSize: [36,36], iconAnchor: [18,18], popupAnchor: [0,-16],
    });
    const marker = L.marker([lat, lon], { icon }).addTo(state.markerLayer);
    marker._placeKey = place._key;
    marker.bindPopup(popupHtml(place));
    marker.on('click', () => {
      state.activeKey = place._key;
      renderPlaceList();
    });
  }
}

function popupHtml(place) {
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  const directionUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
  const phone = place.phone ? String(place.phone).replace(/[^+\d]/g,'') : '';
  return `<div class="popup-card"><strong>${esc(place.name)}</strong><p>${esc(place.address || 'Manzil tafsiloti kiritilmagan')}<br>${place.opening_hours ? '🕒 '+esc(place.opening_hours)+'<br>' : ''}${formatDistance(place.distance_m)} uzoqlikda</p><div class="popup-actions"><a href="${directionUrl}" target="_blank" rel="noopener">Yo‘l ko‘rsatish</a>${phone ? `<a href="tel:${esc(phone)}">Qo‘ng‘iroq</a>` : ''}</div></div>`;
}

function focusPlace(key) {
  const place = state.places.find((p) => p._key === key);
  if (!place) return;
  state.activeKey = key;
  renderPlaceList();
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  state.map.flyTo([lat, lon], Math.max(state.map.getZoom(), 15), { duration: .6 });
  state.markerLayer.eachLayer((layer) => {
    if (layer._placeKey === key) layer.openPopup();
  });
}

async function locateUser() {
  if (!navigator.geolocation) return toast('Brauzer geolokatsiyani qo‘llamaydi.');
  $('locateBtn').textContent = '⌖ Aniqlanmoqda…';
  navigator.geolocation.getCurrentPosition(async (position) => {
    state.lat = position.coords.latitude;
    state.lon = position.coords.longitude;
    state.map.setView([state.lat, state.lon], 14);
    userLocationMarker(state.lat, state.lon);
    $('mapCenterLabel').textContent = 'Mening joylashuvim';
    $('locateBtn').textContent = '✓ Joylashuv aniqlandi';
    await Promise.all([loadWeather(state.lat, state.lon, 'Mening joylashuvim'), loadPlaces()]);
  }, (error) => {
    $('locateBtn').textContent = '⌖ Mening joylashuvim';
    toast(error.code === 1 ? 'Joylashuvga ruxsat berilmadi.' : 'Joylashuvni aniqlab bo‘lmadi.');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
}

function openSuggest() {
  const center = state.map.getCenter();
  state.suggestLat = center.lat;
  state.suggestLon = center.lng;
  $('suggestCategory').value = state.category;
  updateSuggestCoords();
  $('suggestModal').classList.remove('hidden');
  setTimeout(() => $('suggestName').focus(), 100);
}

function closeSuggest() {
  $('suggestModal').classList.add('hidden');
  $('suggestMessage').textContent = '';
}

function updateSuggestCoords() {
  $('suggestCoords').textContent = state.suggestLat != null ? `${Number(state.suggestLat).toFixed(6)}, ${Number(state.suggestLon).toFixed(6)}` : '—';
}

async function submitSuggestion(event) {
  event.preventDefault();
  const payload = {
    category: $('suggestCategory').value,
    name: $('suggestName').value.trim(),
    address: $('suggestAddress').value.trim() || null,
    phone: $('suggestPhone').value.trim() || null,
    opening_hours: $('suggestHours').value.trim() || null,
    description: $('suggestDescription').value.trim() || null,
    latitude: state.suggestLat,
    longitude: state.suggestLon,
    district_id: state.profile?.district_id || null,
  };
  $('suggestMessage').className = 'form-message';
  $('suggestMessage').textContent = 'Yuborilmoqda…';
  try {
    const result = await api('/api/places/suggest', { method: 'POST', body: JSON.stringify(payload) });
    $('suggestMessage').className = 'form-message success';
    $('suggestMessage').textContent = result.message || 'Taklif yuborildi.';
    event.currentTarget.reset();
    setTimeout(closeSuggest, 1200);
  } catch (error) {
    $('suggestMessage').className = 'form-message error';
    $('suggestMessage').textContent = error.message;
  }
}

function bindEvents() {
  $('locateBtn').addEventListener('click', locateUser);
  $('refreshBtn').addEventListener('click', () => Promise.all([loadWeather(), loadPlaces()]));
  $('radiusSelect').addEventListener('change', loadPlaces);
  $('placeSearch').addEventListener('input', applySearch);
  $('forecastToggle').addEventListener('click', () => $('forecastRow').classList.toggle('hidden'));
  $('suggestBtn').addEventListener('click', openSuggest);
  $('closeSuggest').addEventListener('click', closeSuggest);
  $('cancelSuggest').addEventListener('click', closeSuggest);
  $('useMapCenter').addEventListener('click', () => {
    const center = state.map.getCenter();
    state.suggestLat = center.lat;
    state.suggestLon = center.lng;
    updateSuggestCoords();
  });
  $('suggestForm').addEventListener('submit', submitSuggestion);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSuggest(); });
}

async function boot() {
  initMap();
  bindEvents();
  if (!state.token) {
    $('loginModal').classList.remove('hidden');
    return;
  }
  try {
    await loadCategories();
    const centered = await loadProfileContext();
    if (!centered) await loadWeather(state.lat, state.lon, 'Samarqand');
    await loadPlaces();
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}

document.addEventListener('DOMContentLoaded', boot);

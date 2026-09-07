(() => {
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  const VECTOR_URL = 'https://tiles.openfreemap.org/planet';
  let shell = null;
  let glMap = null;
  let syncTimer = null;
  let leafletMap = null;

  const finite = (v) => Number.isFinite(Number(v));
  const coord = (lat, lon) => finite(lat) && finite(lon) ? [Number(lon), Number(lat)] : null;

  function getState() {
    try { return typeof state !== 'undefined' ? state : null; } catch { return null; }
  }

  function currentCenter(map) {
    const s = getState();
    if (s?.live?.current && finite(s.live.current.latitude) && finite(s.live.current.longitude)) {
      return [Number(s.live.current.longitude), Number(s.live.current.latitude)];
    }
    if (s?.start && finite(s.start.latitude) && finite(s.start.longitude)) {
      return [Number(s.start.longitude), Number(s.start.latitude)];
    }
    if (finite(s?.lat) && finite(s?.lon)) return [Number(s.lon), Number(s.lat)];
    if (map?.getCenter) {
      const c = map.getCenter();
      return [c.lng, c.lat];
    }
    return [66.9597, 39.6542];
  }

  function routeGeometry() {
    const s = getState();
    const live = s?.live?.routeGeometry;
    if (live?.type === 'LineString') return live;
    const day = s?.result?.days?.[Number(s?.activeDay || 0)];
    return day?.route?.geometry?.type === 'LineString' ? day.route.geometry : null;
  }

  function poiRows() {
    const s = getState();
    const day = s?.result?.days?.[Number(s?.activeDay || 0)];
    if (Array.isArray(day?.stops)) {
      return day.stops.map((row, i) => ({
        name: row.name || `${i + 1}-nuqta`,
        order: Number(row.order || i + 1),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        kind: 'tour',
      })).filter((row) => finite(row.latitude) && finite(row.longitude));
    }
    const places = Array.isArray(s?.filtered) && s.filtered.length ? s.filtered : (Array.isArray(s?.places) ? s.places : []);
    return places.slice(0, 120).map((row, i) => ({
      name: row.name || `${i + 1}-joy`,
      order: i + 1,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      kind: row.category || 'place',
    })).filter((row) => finite(row.latitude) && finite(row.longitude));
  }

  function userPoint() {
    const s = getState();
    if (s?.live?.current && finite(s.live.current.latitude) && finite(s.live.current.longitude)) {
      return { latitude: Number(s.live.current.latitude), longitude: Number(s.live.current.longitude), name: 'Siz shu yerdasiz' };
    }
    if (finite(s?.lat) && finite(s?.lon)) {
      return { latitude: Number(s.lat), longitude: Number(s.lon), name: 'Joriy joylashuv' };
    }
    if (s?.start && finite(s.start.latitude) && finite(s.start.longitude)) {
      return { latitude: Number(s.start.latitude), longitude: Number(s.start.longitude), name: s.start.name || 'Boshlanish' };
    }
    return null;
  }

  function routeData() {
    const geometry = routeGeometry();
    return {
      type: 'FeatureCollection',
      features: geometry ? [{ type: 'Feature', properties: {}, geometry }] : [],
    };
  }

  function poiData() {
    return {
      type: 'FeatureCollection',
      features: poiRows().map((row) => ({
        type: 'Feature',
        properties: { name: String(row.name || ''), order: Number(row.order || 0), kind: String(row.kind || '') },
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      })),
    };
  }

  function userData() {
    const row = userPoint();
    return {
      type: 'FeatureCollection',
      features: row ? [{
        type: 'Feature',
        properties: { name: row.name },
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      }] : [],
    };
  }

  function ensureShell() {
    if (shell) return shell;
    const mapNode = document.getElementById('map');
    if (!mapNode) return null;
    const parent = mapNode.parentElement;
    if (!parent) return null;
    const computed = window.getComputedStyle(parent);
    if (computed.position === 'static') parent.style.position = 'relative';

    shell = document.createElement('div');
    shell.className = 'qrp-3d-shell hidden';
    shell.innerHTML = `
      <div class="qrp-3d-toolbar">
        <div><strong>🏙 3D Buildings</strong><span>OpenStreetMap bino geometriyasi · MapLibre</span></div>
        <div class="qrp-3d-actions">
          <button type="button" data-3d-pitch="0">2D ↑</button>
          <button type="button" data-3d-pitch="55">3D ◢</button>
          <button type="button" data-3d-rotate="-20">↺</button>
          <button type="button" data-3d-rotate="20">↻</button>
          <button type="button" data-3d-close>✕ 2D xaritaga qaytish</button>
        </div>
      </div>
      <div class="qrp-3d-map" id="qrp3dMap"></div>
      <div class="qrp-3d-note"><strong>3D bino modeli</strong><span>Balandlik OSMda mavjud bo‘lsa ishlatiladi; aks holda bino konturi 8 m standart balandlikda ko‘rsatiladi. Bu geovizualizatsiya, aniq arxitektura o‘lchovi emas.</span></div>
    `;
    parent.appendChild(shell);

    shell.querySelector('[data-3d-close]').addEventListener('click', () => {
      if (window.QRPMapStyle?.setMode) window.QRPMapStyle.setMode(window.QRPMapStyle.last2DMode || 'hybrid');
      else close();
    });
    shell.querySelectorAll('[data-3d-pitch]').forEach((button) => button.addEventListener('click', () => {
      glMap?.easeTo({ pitch: Number(button.dataset['3dPitch'] || 55), duration: 550 });
    }));
    shell.querySelectorAll('[data-3d-rotate]').forEach((button) => button.addEventListener('click', () => {
      if (!glMap) return;
      glMap.easeTo({ bearing: glMap.getBearing() + Number(button.dataset['3dRotate'] || 0), duration: 450 });
    }));
    return shell;
  }

  function addLayers() {
    if (!glMap || !glMap.isStyleLoaded()) return;
    if (!glMap.getSource('qrp-openfreemap')) {
      glMap.addSource('qrp-openfreemap', { type: 'vector', url: VECTOR_URL });
    }
    if (!glMap.getLayer('qrp-3d-buildings')) {
      const labelLayer = (glMap.getStyle().layers || []).find((layer) => layer.type === 'symbol' && layer.layout?.['text-field']);
      glMap.addLayer({
        id: 'qrp-3d-buildings',
        type: 'fill-extrusion',
        source: 'qrp-openfreemap',
        'source-layer': 'building',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'],
            ['case', ['has', 'render_height'], ['get', 'render_height'], 8],
            0, '#d9d6cf',
            20, '#c9c3b8',
            60, '#b2ab9e',
            150, '#989084'
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            15.2, ['case', ['has', 'render_height'], ['get', 'render_height'], 8]
          ],
          'fill-extrusion-base': ['case', ['has', 'render_min_height'], ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.96,
        },
      }, labelLayer?.id);
    }

    if (!glMap.getSource('qrp-route')) glMap.addSource('qrp-route', { type: 'geojson', data: routeData() });
    if (!glMap.getLayer('qrp-route-line')) {
      glMap.addLayer({
        id: 'qrp-route-line',
        type: 'line',
        source: 'qrp-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1269e6', 'line-width': 6, 'line-opacity': 0.88 },
      });
    }

    if (!glMap.getSource('qrp-pois')) glMap.addSource('qrp-pois', { type: 'geojson', data: poiData() });
    if (!glMap.getLayer('qrp-poi-halo')) {
      glMap.addLayer({
        id: 'qrp-poi-halo',
        type: 'circle',
        source: 'qrp-pois',
        paint: { 'circle-radius': 10, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': '#173f2d' },
      });
    }
    if (!glMap.getLayer('qrp-poi-core')) {
      glMap.addLayer({
        id: 'qrp-poi-core',
        type: 'circle',
        source: 'qrp-pois',
        paint: { 'circle-radius': 5, 'circle-color': '#173f2d' },
      });
    }

    if (!glMap.getSource('qrp-user')) glMap.addSource('qrp-user', { type: 'geojson', data: userData() });
    if (!glMap.getLayer('qrp-user-halo')) {
      glMap.addLayer({
        id: 'qrp-user-halo',
        type: 'circle',
        source: 'qrp-user',
        paint: { 'circle-radius': 13, 'circle-color': '#ffffff', 'circle-stroke-width': 5, 'circle-stroke-color': 'rgba(25,118,210,.25)' },
      });
    }
    if (!glMap.getLayer('qrp-user-core')) {
      glMap.addLayer({
        id: 'qrp-user-core',
        type: 'circle',
        source: 'qrp-user',
        paint: { 'circle-radius': 7, 'circle-color': '#1976d2' },
      });
    }

    glMap.on('click', 'qrp-poi-halo', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      new maplibregl.Popup({ closeButton: true, offset: 12 })
        .setLngLat(feature.geometry.coordinates)
        .setText(feature.properties?.name || 'Turistik nuqta')
        .addTo(glMap);
    });
    glMap.on('mouseenter', 'qrp-poi-halo', () => { glMap.getCanvas().style.cursor = 'pointer'; });
    glMap.on('mouseleave', 'qrp-poi-halo', () => { glMap.getCanvas().style.cursor = ''; });
  }

  function syncSources() {
    if (!glMap || !glMap.isStyleLoaded()) return;
    glMap.getSource('qrp-route')?.setData(routeData());
    glMap.getSource('qrp-pois')?.setData(poiData());
    glMap.getSource('qrp-user')?.setData(userData());
  }

  function open(map) {
    leafletMap = map || leafletMap;
    if (typeof maplibregl === 'undefined') {
      if (typeof toast === 'function') toast('3D xarita kutubxonasi yuklanmadi.');
      return false;
    }
    const node = ensureShell();
    if (!node) return false;
    node.classList.remove('hidden');

    if (!glMap) {
      const center = currentCenter(leafletMap);
      const zoom = Math.max(15.2, Math.min(18, Number(leafletMap?.getZoom?.() || 16)));
      try {
        glMap = new maplibregl.Map({
          container: 'qrp3dMap',
          style: STYLE_URL,
          center,
          zoom,
          pitch: 55,
          bearing: -18,
          maxPitch: 75,
          canvasContextAttributes: { antialias: true },
        });
        glMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
        glMap.on('load', () => {
          addLayers();
          syncSources();
        });
        glMap.on('error', (event) => console.warn('3D map:', event.error?.message || event.error || 'unknown error'));
      } catch (error) {
        console.error(error);
        node.classList.add('hidden');
        if (typeof toast === 'function') toast('WebGL 3D xaritani ishga tushirib bo‘lmadi.');
        return false;
      }
    } else {
      const center = currentCenter(leafletMap);
      glMap.resize();
      glMap.jumpTo({ center, zoom: Math.max(15.2, Number(leafletMap?.getZoom?.() || glMap.getZoom())) });
      syncSources();
    }

    clearInterval(syncTimer);
    syncTimer = setInterval(syncSources, 1000);
    setTimeout(() => glMap?.resize(), 80);
    if (typeof toast === 'function') toast('3D Buildings rejimi yoqildi');
    return true;
  }

  function close() {
    clearInterval(syncTimer);
    syncTimer = null;
    shell?.classList.add('hidden');
    if (typeof toast === 'function') toast('2D xaritaga qaytildi');
  }

  window.QRP3D = { open, close, sync: syncSources };
})();

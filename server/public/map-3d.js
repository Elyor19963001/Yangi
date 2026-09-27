(() => {
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  const VECTOR_URL = 'https://tiles.openfreemap.org/planet';
  let shell = null;
  let glMap = null;
  let syncTimer = null;
  let leafletMap = null;
  let activeLandmark = null;
  let landmarkLayer = null;
  let photoMap = false;
  const LANDMARKS = {
    registan: { name: 'Registon', aliases: /registon|registan/i, center: [66.975868, 39.654694] },
    'gur-amir': { name: 'Go‘ri Amir', aliases: /go.ri amir|gur.?amir|gur.?emir/i, center: [66.968, 39.649] },
    'bibi-khanum': { name: 'Bibixonim', aliases: /bibi.?xonim|bibi.?khanym|bibi.?khanum/i, center: [66.9805, 39.6609] },
  };
  const MODEL_IDS = {
    af54f5280eb249beb6501eab4769c351: 'registan',
    fd795227e0bc4f61bc1e4e453d29a74b: 'gur-amir',
    dc8ec865fd0d480c8ae06196fd18d296: 'bibi-khanum',
  };

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
        <div><strong data-3d-title>3D xarita</strong><span data-3d-subtitle>Obidani tanlang yoki xaritani aylantiring</span></div>
        <div class="qrp-3d-actions">
          <label class="qrp-3d-select-label"><span>Obida</span><select data-3d-landmark aria-label="3D obidani tanlash"><option value="">Bino xaritasi</option><option value="registan">Registon</option><option value="gur-amir">Go‘ri Amir</option><option value="bibi-khanum">Bibixonim</option></select></label>
          <button type="button" data-3d-photo aria-pressed="false" title="Sun’iy yo‘ldosh suratlari">📷 Foto xarita</button>
          <button type="button" data-3d-pitch="0">2D ↑</button>
          <button type="button" data-3d-pitch="55">3D ◢</button>
          <button type="button" data-3d-rotate="-20">↺</button>
          <button type="button" data-3d-rotate="20">↻</button>
          <button type="button" data-3d-close>✕ 2D</button>
        </div>
      </div>
      <div class="qrp-3d-map" id="qrp3dMap"></div>
      <div class="qrp-3d-note" role="status"><strong data-3d-status>3D xarita</strong><span data-3d-description>Obidani tanlang. Boshqa binolar OpenStreetMap konturlari bo‘yicha ko‘rsatiladi.</span><a data-3d-source href="#" target="_blank" rel="noopener noreferrer" hidden>Asl 3D model ↗</a></div>
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
    shell.querySelector('[data-3d-landmark]').addEventListener('change', (event) => {
      if (event.target.value) openLandmark(event.target.value);
      else clearLandmark();
    });
    shell.querySelector('[data-3d-photo]').addEventListener('click', () => setPhotoMap(!photoMap));
    return shell;
  }

  function setPhotoMap(enabled) {
    photoMap = enabled;
    const button = shell?.querySelector('[data-3d-photo]');
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? '🗺️ Ko‘cha xaritasi' : '📷 Foto xarita';
    }
    if (glMap?.getLayer('qrp-photo-imagery')) {
      glMap.setLayoutProperty('qrp-photo-imagery', 'visibility', enabled ? 'visible' : 'none');
    }
  }

  function setLandmarkStatus(title, description) {
    const node = ensureShell();
    if (!node) return;
    node.querySelector('[data-3d-title]').textContent = title;
    node.querySelector('[data-3d-status]').textContent = title;
    node.querySelector('[data-3d-description]').textContent = description;
  }

  function landmarkCenter(id, clicked) {
    if (finite(clicked?.lat) && finite(clicked?.lon) && Math.abs(clicked.lat) > 1 && Math.abs(clicked.lon) > 1) {
      return [Number(clicked.lon), Number(clicked.lat)];
    }
    const stop = poiRows().find((row) => LANDMARKS[id].aliases.test(row.name));
    return stop ? [stop.longitude, stop.latitude] : LANDMARKS[id].center;
  }

  function clearLandmark() {
    activeLandmark = null;
    if (landmarkLayer && glMap?.getLayer(landmarkLayer.id)) glMap.removeLayer(landmarkLayer.id);
    landmarkLayer = null;
    if (glMap?.getLayer('qrp-3d-buildings')) glMap.setLayoutProperty('qrp-3d-buildings', 'visibility', 'visible');
    if (shell) shell.querySelector('[data-3d-landmark]').value = '';
    if (shell) shell.querySelector('[data-3d-source]').hidden = true;
    setLandmarkStatus('3D xarita', 'Obidani tanlang. Boshqa binolar OpenStreetMap konturlari bo‘yicha ko‘rsatiladi.');
  }

  function attachLandmark() {
    if (!glMap?.isStyleLoaded() || !activeLandmark || !window.QRPThreeMap || landmarkLayer) return;
    const { THREE, GLTFLoader, DRACOLoader } = window.QRPThreeMap;
    const selected = activeLandmark;
    const origin = maplibregl.MercatorCoordinate.fromLngLat(selected.center, 0);
    const scale = origin.meterInMercatorCoordinateUnits();
    const layer = {
      id: 'qrp-heritage-model', type: 'custom', renderingMode: '3d',
      onAdd(map, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc5bba8, 1.35));
        const sun = new THREE.DirectionalLight(0xfff2dc, 1.15);
        sun.position.set(50, 100, 70);
        this.scene.add(sun);
        this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        const draco = new DRACOLoader().setDecoderPath('/vendor/three/draco/');
        const loader = new GLTFLoader().setDRACOLoader(draco);
        loader.load('/heritage/' + selected.id + '.glb', (gltf) => {
          draco.dispose();
          if (activeLandmark !== selected) return;
          // The scan has a local origin and includes surrounding terrain. Center its
          // bounds on the POI, with the lowest point on the map's ground plane.
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          gltf.scene.position.x -= center.x;
          gltf.scene.position.z -= center.z;
          gltf.scene.position.y -= box.min.y;
          // GLTFLoader preserves the scan's photographic base-color textures.
          // Improve the grazing-angle detail without changing the original colors.
          gltf.scene.traverse((part) => {
            const materials = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of materials) {
              if (material?.map) material.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
            }
          });
          this.scene.add(gltf.scene);
          setLandmarkStatus(selected.name + ' · rangli 3D', 'Asl foto teksturali 3D skan taxminiy joyga qo‘yildi. Xaritani aylantirib ko‘ring.');
          map.triggerRepaint();
        }, (progress) => {
          if (progress.total && activeLandmark === selected) {
            const percent = Math.min(99, Math.round(progress.loaded / progress.total * 100));
            setLandmarkStatus(selected.name + ' · yuklanmoqda', '3D model ' + percent + '% yuklandi…');
          }
        }, (error) => {
          draco.dispose();
          console.warn('Heritage model:', error);
          if (activeLandmark === selected) setLandmarkStatus('Model yuklanmadi', 'Internet aloqasini tekshiring yoki boshqa obidani tanlang.');
        });
      },
      render(_gl, args) {
        if (activeLandmark !== selected) return;
        const projection = args.defaultProjectionData?.mainMatrix || args;
        const modelMatrix = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)
          .scale(new THREE.Vector3(scale, -scale, scale))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(projection).multiply(modelMatrix);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
      },
      onRemove() {
        this.scene?.traverse((object) => {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { material?.map?.dispose?.(); material?.dispose?.(); });
        });
        this.renderer?.dispose();
      },
    };
    try {
      if (glMap.getLayer('qrp-3d-buildings')) glMap.setLayoutProperty('qrp-3d-buildings', 'visibility', 'none');
      glMap.addLayer(layer);
      landmarkLayer = layer;
    } catch (error) {
      console.warn('3D overlay:', error);
      setLandmarkStatus('3D rejim xatosi', 'Ushbu qurilmada 3D modelni ko‘rsatib bo‘lmadi.');
    }
  }

  function openLandmark(modelId, clicked) {
    const id = MODEL_IDS[modelId] || modelId;
    if (!LANDMARKS[id] || !window.QRPThreeMap) return false;
    const center = landmarkCenter(id, clicked);
    if (!open(leafletMap)) return false;
    clearLandmark();
    activeLandmark = { id, center, name: LANDMARKS[id].name };
    setPhotoMap(true);
    shell.querySelector('[data-3d-landmark]').value = id;
    const source = shell.querySelector('[data-3d-source]');
    source.href = 'https://sketchfab.com/models/' + Object.keys(MODEL_IDS).find((key) => MODEL_IDS[key] === id);
    source.hidden = false;
    setLandmarkStatus(LANDMARKS[id].name + ' · yuklanmoqda', 'Obidaning 3D skani xaritada yuklanmoqda…');
    glMap.flyTo({ center, zoom: id === 'registan' ? 16.7 : 17.5, pitch: 65, bearing: -25, duration: 1100 });
    if (glMap.isStyleLoaded()) attachLandmark();
    else glMap.once('load', attachLandmark);
    return true;
  }

  function addLayers() {
    if (!glMap || !glMap.isStyleLoaded()) return;
    if (!glMap.getSource('qrp-photo-imagery')) {
      glMap.addSource('qrp-photo-imagery', {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      });
    }
    if (!glMap.getLayer('qrp-photo-imagery')) {
      const firstLabel = (glMap.getStyle().layers || []).find((layer) => layer.type === 'symbol');
      glMap.addLayer({ id: 'qrp-photo-imagery', type: 'raster', source: 'qrp-photo-imagery',
        layout: { visibility: photoMap ? 'visible' : 'none' }, paint: { 'raster-opacity': 1 } }, firstLabel?.id);
    }
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
          attachLandmark();
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
    if (typeof toast === 'function') toast('3D xarita ochildi');
    return true;
  }

  function close() {
    clearInterval(syncTimer);
    syncTimer = null;
    shell?.classList.add('hidden');
    if (typeof toast === 'function') toast('2D xaritaga qaytildi');
  }

  window.QRP3D = { open, close, openLandmark, clearLandmark, sync: syncSources };
})();

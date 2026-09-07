(() => {
  const STORAGE_KEY = 'qrp_map_style';
  const MODES = ['hybrid', 'satellite', 'street', 'standard'];

  function install(map) {
    if (!map || map._qrpMapStyleSwitcherInstalled) return;
    map._qrpMapStyleSwitcherInstalled = true;

    const existingTiles = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) existingTiles.push(layer);
    });
    existingTiles.forEach((layer) => map.removeLayer(layer));

    if (!map.getPane('qrpLabels')) {
      const pane = map.createPane('qrpLabels');
      pane.style.zIndex = '250';
      pane.style.pointerEvents = 'none';
    }

    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });

    const street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      attribution: 'Tiles &copy; Esri',
    });

    const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics and GIS User Community',
    });

    const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      pane: 'qrpLabels',
      attribution: 'Labels &copy; Esri',
    });

    const configs = {
      hybrid: { base: imagery, overlay: labels, label: 'Hybrid' },
      satellite: { base: imagery, label: 'Satellite' },
      street: { base: street, label: 'Ko‘cha' },
      standard: { base: osm, label: 'OSM' },
    };

    let activeMode = null;
    let activeBase = null;
    let activeOverlay = null;
    let imageryErrors = 0;
    let controlNode = null;

    function updateButtons() {
      if (!controlNode) return;
      controlNode.querySelectorAll('[data-map-mode]').forEach((button) => {
        const active = button.dataset.mapMode === activeMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setMode(mode, notify = true) {
      const safeMode = MODES.includes(mode) ? mode : 'hybrid';
      const config = configs[safeMode];
      if (activeBase) map.removeLayer(activeBase);
      if (activeOverlay) map.removeLayer(activeOverlay);
      activeBase = config.base;
      activeOverlay = config.overlay || null;
      activeBase.addTo(map);
      if (activeOverlay) activeOverlay.addTo(map);
      activeMode = safeMode;
      imageryErrors = 0;
      try { localStorage.setItem(STORAGE_KEY, safeMode); } catch {}
      updateButtons();
      if (notify && typeof toast === 'function') {
        toast(`Xarita: ${config.label}`);
      }
    }

    imagery.on('tileerror', () => {
      imageryErrors += 1;
      if (imageryErrors >= 6 && (activeMode === 'hybrid' || activeMode === 'satellite')) {
        setMode('standard', false);
        if (typeof toast === 'function') toast('Satellite qatlam javob bermadi. OSM xaritaga qaytildi.');
      }
    });

    const StyleControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'qrp-map-style leaflet-control');
        div.setAttribute('role', 'group');
        div.setAttribute('aria-label', 'Xarita ko‘rinishi');
        div.innerHTML = [
          '<button type="button" data-map-mode="hybrid" title="Sun’iy yo‘ldosh tasviri va joy nomlari">🛰 <span>Hybrid</span></button>',
          '<button type="button" data-map-mode="satellite" title="Sun’iy yo‘ldosh tasviri">📷 <span>Satellite</span></button>',
          '<button type="button" data-map-mode="street" title="Ko‘cha va bino konturlari uchun ko‘cha xaritasi">🏙 <span>Ko‘cha</span></button>',
          '<button type="button" data-map-mode="standard" title="OpenStreetMap standart xaritasi">🗺 <span>OSM</span></button>',
        ].join('');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        div.querySelectorAll('[data-map-mode]').forEach((button) => {
          button.addEventListener('click', () => setMode(button.dataset.mapMode));
        });
        controlNode = div;
        updateButtons();
        return div;
      },
    });

    map.addControl(new StyleControl());
    const preferred = (() => {
      try { return localStorage.getItem(STORAGE_KEY) || 'hybrid'; } catch { return 'hybrid'; }
    })();
    setMode(preferred, false);

    const DetailControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'qrp-map-detail leaflet-control');
        const update = () => {
          const z = map.getZoom();
          div.textContent = z >= 17 ? `Zoom ${z} · bino detali` : `Zoom ${z} · binolar uchun +`;
          div.classList.toggle('ready', z >= 17);
        };
        map.on('zoomend', update);
        update();
        return div;
      },
    });
    map.addControl(new DetailControl());
  }

  function wait(attempt = 0) {
    try {
      if (typeof L !== 'undefined' && typeof state !== 'undefined' && state?.map) {
        install(state.map);
        return;
      }
    } catch {}
    if (attempt < 120) setTimeout(() => wait(attempt + 1), 50);
  }

  wait();
})();

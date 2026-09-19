(() => {
  const PHOTO_CATALOG = {
    'registan': {
      file: 'Registan-Samarkand.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Registan-Samarkand.jpg'
    },
    'gur-amir': {
      file: 'Gur-e Amir in Samarkand.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Gur-e_Amir_in_Samarkand.jpg'
    },
    'bibi-khanum': {
      file: 'Samarkand, Bibi-Khanym.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Samarkand,_Bibi-Khanym.jpg'
    },
    'shah-i-zinda': {
      file: 'Shah-i-Zinda, Samarkand (4956251569).jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Shah-i-Zinda,_Samarkand_(4956251569).jpg'
    },
    'ulugbek-observatory': {
      file: 'Ulugh Beg Observatory 02.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Ulugh_Beg_Observatory_02.jpg'
    },
    'afrosiyob-museum': {
      file: 'Afrasiab Museum of Samarkand.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Afrasiab_Museum_of_Samarkand.jpg'
    },
    'siyob-bazaar': {
      file: 'Siyob Bazaar in Samarkand.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Siyob_Bazaar_in_Samarkand.jpg'
    },
    'ruhabad': {
      file: 'Ruhabad Mausoleum 04.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Ruhabad_Mausoleum_04.jpg'
    },
    'hazrati-khizr': {
      file: 'Hazret-Khizr Mosque.jpg',
      page: 'https://commons.wikimedia.org/wiki/File:Hazret-Khizr_Mosque.jpg'
    }
  };

  function photoMeta(stop = {}) {
    const id = stop?.audio_guide?.id || '';
    const row = PHOTO_CATALOG[id];
    if (!row) return null;
    return {
      url: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(row.file) + '?width=720',
      thumb: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(row.file) + '?width=320',
      page: row.page
    };
  }

  function savedPoiKey(stop = {}) {
    return 'tfe_saved_poi:' + String(stop.audio_guide?.id || stop.name || '').toLowerCase();
  }

  function isSaved(stop = {}) {
    try { return localStorage.getItem(savedPoiKey(stop)) === '1'; } catch { return false; }
  }

  function setSaved(stop = {}, on = true) {
    try {
      if (on) localStorage.setItem(savedPoiKey(stop), '1');
      else localStorage.removeItem(savedPoiKey(stop));
    } catch {}
  }

  function visitDuration(stop = {}) {
    const mins = Number(stop.visit_minutes || 0);
    return mins > 0 ? mins + ' daqiqa' : '40–60 daqiqa';
  }

  function photoMarkup(stop = {}, cls = 'poi-v19-photo') {
    const p = photoMeta(stop);
    const meta = poiCategoryMeta(stop);
    if (!p) return '<div class="' + cls + ' placeholder"><span>' + meta.icon + '</span></div>';
    return '<div class="' + cls + '"><img src="' + esc(p.thumb) + '" alt="' + esc(stop.name || 'Turistik obyekt') + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.' + cls + '\').classList.add(\'image-error\');this.remove()"></div>';
  }

  function v19PoiPopupHtml(stop = {}) {
    const meta = poiCategoryMeta(stop);
    const op = stop.operational || {};
    const ticket = op.ticket || {};
    const official = op.official || null;
    const open = compactOpenStatus(op);
    const price = compactTicketStatus(ticket);
    const photo = photoMeta(stop);
    const hasAudio = Boolean(stop.audio_guide?.id);
    const audio = hasAudio ? audioGuideHtml(stop, true) : '<div class="poi-audio-empty">🎧 Bu obyekt uchun audio gid hozircha tayyorlanmagan.</div>';
    const planned = op.planned || {};
    const now = op.now || {};
    const sourceUrl = official?.source_url || op.website || stop.source_url || stop.osm_source_url || '';
    const sourceLabel = official ? 'Rasmiy manba' : (op.website ? 'Obyekt sayti' : stop.source === 'OpenStreetMap' ? 'OpenStreetMap' : 'Manba');
    const detailedTicket = ticket.status === 'official-published' ? ticketTariffHtml(ticket) : '';
    const nowInfo = now.label ? '<div><span>🕒 Hozirgi holat</span><strong>' + esc(now.label) + '</strong></div>' : '';
    const planInfo = planned.label ? '<div><span>📅 Rejadagi tashrif</span><strong>' + esc(stop.time_start || '') + ' · ' + esc(planned.label) + '</strong></div>' : '';
    const saved = isSaved(stop);
    const order = Number(stop.order || 0);

    return '<article class="poi-v19-card" data-poi-name="' + esc(stop.name || '') + '">'
      + '<div class="poi-v19-hero">'
        + photoMarkup(stop, 'poi-v19-photo')
        + '<div class="poi-v19-heading">'
          + '<span class="poi-v19-type">' + meta.icon + ' ' + esc(meta.label) + (official ? ' · ✓ rasmiy' : '') + '</span>'
          + '<strong>' + esc(stop.name || 'Turistik obyekt') + '</strong>'
          + '<span class="poi-v19-location">⌖ Samarqand shahri</span>'
          + '<small>' + esc(stop.time_start || '') + (stop.time_end ? '–' + esc(stop.time_end) : '') + (order ? ' · ' + order + '-nuqta' : '') + '</small>'
        + '</div>'
      + '</div>'

      + '<div class="poi-v19-facts">'
        + '<div class="poi-v19-fact ' + esc(open.className) + '"><span>● Ish vaqti</span><strong>' + esc(open.text) + '</strong></div>'
        + '<div class="poi-v19-fact ticket"><span>🎟 Chipta narxi</span><strong>' + esc(price.text) + '</strong></div>'
        + '<div class="poi-v19-fact duration"><span>◷ Tashrif davomiyligi</span><strong>' + esc(visitDuration(stop)) + '</strong></div>'
      + '</div>'

      + audio

      + '<div class="poi-v19-primary-actions">'
        + '<button type="button" class="poi-v19-btn nav" data-popup-gps data-stop-lat="' + esc(stop.latitude) + '" data-stop-lon="' + esc(stop.longitude) + '" data-stop-name="' + esc(stop.name || '') + '">➤ Navigator</button>'
        + '<button type="button" class="poi-v19-btn details" data-popup-details>ⓘ Batafsil ma’lumot</button>'
      + '</div>'

      + '<div class="poi-place-details poi-v19-details hidden">'
        + '<p class="poi-place-summary full-summary">' + esc(poiPopupSummary(stop)) + '</p>'
        + '<div class="poi-place-info-grid">' + nowInfo + planInfo + '<div><span>⏱ Tavsiya etilgan tashrif</span><strong>' + esc(visitDuration(stop)) + '</strong></div></div>'
        + detailedTicket
        + (sourceUrl ? '<a class="poi-source-link" href="' + esc(sourceUrl) + '" target="_blank" rel="noopener">' + esc(sourceLabel) + ' ↗</a>' : '')
        + (photo ? '<a class="poi-photo-credit" href="' + esc(photo.page) + '" target="_blank" rel="noopener">Foto: Wikimedia Commons ↗</a>' : '')
      + '</div>'

      + '<div class="poi-v19-secondary-actions">'
        + '<button type="button" data-poi-photo data-photo-url="' + esc(photo?.page || '') + '"><b>▧</b><span>Rasmlar</span></button>'
        + '<button type="button" data-poi-focus data-stop-lat="' + esc(stop.latitude) + '" data-stop-lon="' + esc(stop.longitude) + '"><b>⌖</b><span>Xaritada ko‘rish</span></button>'
        + '<button type="button" data-poi-share data-share-name="' + esc(stop.name || '') + '" data-stop-lat="' + esc(stop.latitude) + '" data-stop-lon="' + esc(stop.longitude) + '"><b>⌯</b><span>Ulashish</span></button>'
        + '<button type="button" data-poi-save data-stop-name="' + esc(stop.name || '') + '" data-poi-key="' + esc(savedPoiKey(stop)) + '" class="' + (saved ? 'saved' : '') + '"><b>' + (saved ? '♥' : '♡') + '</b><span>' + (saved ? 'Saqlandi' : 'Saqlash') + '</span></button>'
      + '</div>'
    + '</article>';
  }

  try { poiPopupHtml = v19PoiPopupHtml; } catch {}

  function ensureRail() {
    const panel = document.querySelector('.map-panel');
    if (!panel) return null;
    let rail = panel.querySelector('.poi-v19-rail');
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'poi-v19-rail hidden';
      panel.appendChild(rail);
    }
    return rail;
  }

  function renderRail(day = {}) {
    const rail = ensureRail();
    if (!rail) return;
    const stops = Array.isArray(day.stops) ? day.stops : [];
    if (!stops.length) {
      rail.classList.add('hidden');
      rail.innerHTML = '';
      return;
    }
    rail.classList.remove('hidden');
    rail.innerHTML = stops.map((stop, index) => {
      const meta = poiCategoryMeta(stop);
      const p = photoMeta(stop);
      const image = p
        ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
        : '<span class="fallback">' + meta.icon + '</span>';
      return '<button type="button" class="poi-v19-rail-item ' + (index === 0 ? 'active' : '') + '" data-poi-index="' + index + '">'
        + '<span class="poi-v19-rail-photo">' + image + '<i>' + (index + 1) + '</i></span>'
        + '<strong>' + esc(stop.name || 'Turistik obyekt') + '</strong>'
      + '</button>';
    }).join('');
  }

  try {
    const originalRenderMap = renderMap;
    renderMap = function(day, daySupport) {
      originalRenderMap(day, daySupport);
      renderRail(day);
    };
  } catch {}

  document.addEventListener('click', async (event) => {
    const railButton = event.target.closest('.poi-v19-rail-item');
    if (railButton) {
      const index = Number(railButton.dataset.poiIndex);
      const marker = state.markers?.[index + 1];
      const stop = state.result?.days?.[state.activeDay]?.stops?.[index];
      if (marker && stop) {
        document.querySelectorAll('.poi-v19-rail-item').forEach((x, i) => x.classList.toggle('active', i === index));
        state.map.setView([Number(stop.latitude), Number(stop.longitude)], Math.max(state.map.getZoom(), 16), { animate: true });
        setTimeout(() => marker.openPopup(), 180);
      }
      return;
    }

    const photoButton = event.target.closest('[data-poi-photo]');
    if (photoButton) {
      const url = photoButton.dataset.photoUrl;
      if (url) window.open(url, '_blank', 'noopener');
      else toast('Bu obyekt uchun rasm manbasi hali qo‘shilmagan.');
      return;
    }

    const focusButton = event.target.closest('[data-poi-focus]');
    if (focusButton) {
      const lat = Number(focusButton.dataset.stopLat);
      const lon = Number(focusButton.dataset.stopLon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        try { state.map.closePopup(); } catch {}
        state.map.setView([lat, lon], Math.max(state.map.getZoom(), 17), { animate: true });
      }
      return;
    }

    const shareButton = event.target.closest('[data-poi-share]');
    if (shareButton) {
      const name = shareButton.dataset.shareName || 'Samarqand turistik obyekti';
      const lat = shareButton.dataset.stopLat || '';
      const lon = shareButton.dataset.stopLon || '';
      const shareUrl = location.origin + location.pathname + '#poi=' + encodeURIComponent(name) + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);
      try {
        if (navigator.share) await navigator.share({ title: name, text: name + ' · Tourism for Everyone', url: shareUrl });
        else {
          await navigator.clipboard.writeText(shareUrl);
          toast('Havola nusxalandi.');
        }
      } catch {}
      return;
    }

    const saveButton = event.target.closest('[data-poi-save]');
    if (saveButton) {
      const key = saveButton.dataset.poiKey;
      let on = !saveButton.classList.contains('saved');
      try {
        if (on) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      } catch {}
      saveButton.classList.toggle('saved', on);
      const b = saveButton.querySelector('b');
      const span = saveButton.querySelector('span');
      if (b) b.textContent = on ? '♥' : '♡';
      if (span) span.textContent = on ? 'Saqlandi' : 'Saqlash';
      toast(on ? 'Obyekt saqlandi.' : 'Saqlanganlardan olib tashlandi.');
    }
  }, true);
})();
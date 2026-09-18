(() => {
  const get = (id) => document.getElementById(id);
  const prefs = {
    interests: new Set(['history']),
    pace: 'normal',
    transport: 'mixed',
    lowWalking: false,
    wheelchair: false,
    ownCar: false,
  };

  const labels = {
    interests: {
      history: 'tarixiy obidalar',
      pilgrimage: 'ziyorat joylari',
      gastronomy: 'milliy taomlar',
      museum: 'muzeylar',
      architecture: 'arxitektura',
      family: 'oilaviy joylar',
    },
    pace: { relaxed: 'xotirjam temp', normal: 'muvozanatli temp', active: 'faol temp' },
    transport: { mixed: 'aralash transport', taxi: 'taksi ustuvor', walking: 'asosan piyoda' },
  };

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function buildConsole() {
    const form = get('plannerForm');
    const textarea = get('prompt');
    if (!form || !textarea || document.querySelector('.ai-console')) return;

    const box = document.createElement('section');
    box.className = 'ai-console';
    box.setAttribute('aria-label', 'AI tur sozlamalari');
    box.innerHTML = `
      <div class="ai-console-head">
        <div class="ai-console-title"><strong>AI tur sozlamalari</strong><span>Bir bosishda qiziqish, temp va transportni aniqlashtiring.</span></div>
        <span class="ai-status" id="tfeAiStatus">AI tekshirilmoqda…</span>
      </div>
      <div class="preference-row">
        <div class="preference-label">Qiziqish</div>
        <div class="preference-options" data-pref-group="interest">
          <button type="button" class="pref-chip active" data-interest="history">🏛 Tarix</button>
          <button type="button" class="pref-chip" data-interest="pilgrimage">🕌 Ziyorat</button>
          <button type="button" class="pref-chip" data-interest="gastronomy">🍽 Taomlar</button>
          <button type="button" class="pref-chip" data-interest="museum">🏺 Muzey</button>
          <button type="button" class="pref-chip" data-interest="architecture">✨ Arxitektura</button>
          <button type="button" class="pref-chip" data-interest="family">👨‍👩‍👧 Oila</button>
        </div>
      </div>
      <div class="preference-row">
        <div class="preference-label">Temp</div>
        <div class="preference-options">
          <button type="button" class="pref-chip" data-pace="relaxed">☕ Xotirjam</button>
          <button type="button" class="pref-chip active" data-pace="normal">⚖ Muvozanatli</button>
          <button type="button" class="pref-chip" data-pace="active">⚡ Faol</button>
        </div>
      </div>
      <div class="preference-row">
        <div class="preference-label">Transport</div>
        <div class="preference-options">
          <button type="button" class="pref-chip active" data-transport="mixed">🧭 Aralash</button>
          <button type="button" class="pref-chip" data-transport="taxi">🚕 Taksi</button>
          <button type="button" class="pref-chip" data-transport="walking">🚶 Piyoda</button>
          <button type="button" class="pref-chip" data-low-walking="true">🪑 Kam yurish</button>
        </div>
      </div>
      <div class="traveler-profile">
        <div class="profile-head"><strong>Sayohatchi profili</strong><span>Ixtiyoriy. AI marshrutni guruh tarkibi va kun vaqtingizga moslashtiradi.</span></div>
        <div class="profile-grid">
          <label>Qayerdan kelasiz?<input id="originCountry" maxlength="60" placeholder="Masalan: O‘zbekiston, Rossiya" /></label>
          <label>Bolalar soni<input id="childrenCount" type="number" min="0" max="10" value="0" inputmode="numeric" /></label>
          <label>65+ yoshdagilar<input id="seniorCount" type="number" min="0" max="10" value="0" inputmode="numeric" /></label>
          <label>Kun boshlanishi<input id="preferredStartTime" type="time" value="09:00" /></label>
          <label>Kun yakuni<input id="preferredEndTime" type="time" value="18:00" /></label>
        </div>
        <div class="profile-toggle-row">
          <button type="button" class="pref-chip" data-own-car="true">🚗 Shaxsiy avtomobil</button>
          <button type="button" class="pref-chip" data-wheelchair="true">♿ Aravachaga qulaylik muhim</button>
        </div>
        <small class="profile-caveat">♿ Accessibility ma’lumoti barcha obyektlarda to‘liq emas; AI buni ehtiyotkor rejalash signali sifatida ishlatadi va yakuniy kirish sharoitini rasmiy manbadan tekshirish kerak.</small>
      </div>
      <div class="template-strip">
        <button type="button" class="tour-template" data-template="classic">1 kun · Klassik Samarqand</button>
        <button type="button" class="tour-template" data-template="first">2 kun · Birinchi tashrif</button>
        <button type="button" class="tour-template" data-template="family">2 kun · Oilaviy</button>
        <button type="button" class="tour-template" data-template="pilgrim">2 kun · Ziyorat + taom</button>
      </div>
      <div class="trip-progress" aria-label="Tur yaratish bosqichlari">
        <div class="trip-step active" data-step="1"><b>1</b><span>Istaklar</span></div>
        <div class="trip-step" data-step="2"><b>2</b><span>AI reja</span></div>
        <div class="trip-step" data-step="3"><b>3</b><span>Live GPS</span></div>
      </div>`;
    textarea.insertAdjacentElement('afterend', box);

    box.querySelectorAll('[data-interest]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.interest;
        if (prefs.interests.has(key) && prefs.interests.size > 1) prefs.interests.delete(key);
        else prefs.interests.add(key);
        button.classList.toggle('active', prefs.interests.has(key));
      });
    });

    box.querySelectorAll('[data-pace]').forEach((button) => {
      button.addEventListener('click', () => {
        prefs.pace = button.dataset.pace;
        box.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b === button));
      });
    });

    box.querySelectorAll('[data-transport]').forEach((button) => {
      button.addEventListener('click', () => {
        prefs.transport = button.dataset.transport;
        box.querySelectorAll('[data-transport]').forEach((b) => b.classList.toggle('active', b === button));
      });
    });

    box.querySelector('[data-low-walking]').addEventListener('click', (event) => {
      prefs.lowWalking = !prefs.lowWalking;
      event.currentTarget.classList.toggle('active', prefs.lowWalking);
    });

    box.querySelector('[data-own-car]').addEventListener('click', (event) => {
      prefs.ownCar = !prefs.ownCar;
      event.currentTarget.classList.toggle('active', prefs.ownCar);
      if (prefs.ownCar) {
        prefs.transport = 'mixed';
        box.querySelectorAll('[data-transport]').forEach((b) => b.classList.toggle('active', b.dataset.transport === 'mixed'));
      }
    });

    box.querySelector('[data-wheelchair]').addEventListener('click', (event) => {
      prefs.wheelchair = !prefs.wheelchair;
      if (prefs.wheelchair) prefs.lowWalking = true;
      event.currentTarget.classList.toggle('active', prefs.wheelchair);
      box.querySelector('[data-low-walking]').classList.toggle('active', prefs.lowWalking);
    });

    box.querySelectorAll('[data-template]').forEach((button) => {
      button.addEventListener('click', () => applyTemplate(button.dataset.template));
    });

    form.addEventListener('submit', () => setProgress(2));

    get('startLiveBtn')?.addEventListener('click', () => setProgress(3));
    checkAiStatus();
  }

  function applyTemplate(name) {
    const prompt = get('prompt');
    const days = get('days');
    if (!prompt || !days) return;
    const templates = {
      classic: {
        days: '1',
        text: 'Samarqandning eng muhim tarixiy obidalarini 1 kunda ko‘rmoqchiman. Vaqtni tejamkor tashkil qiling, tushlik uchun milliy taom ham bo‘lsin.',
        interests: ['history','architecture'], pace: 'normal', transport: 'mixed', lowWalking: false, ownCar: false, wheelchair: false, children: 0, seniors: 0,
      },
      first: {
        days: '2',
        text: 'Samarqandga birinchi marta kelyapman. 2 kun ichida asosiy tarixiy joylar, muzey va milliy taomlarni ko‘rishni xohlayman.',
        interests: ['history','museum','gastronomy'], pace: 'normal', transport: 'mixed', lowWalking: false, ownCar: false, wheelchair: false, children: 0, seniors: 0,
      },
      family: {
        days: '2',
        text: 'Oila bilan Samarqand bo‘ylab 2 kunlik qulay tur kerak. Bolalar bilan ko‘p yurmaydigan, dam olishga vaqt qoladigan marshrut tuzing.',
        interests: ['history','family','gastronomy'], pace: 'relaxed', transport: 'taxi', lowWalking: true, ownCar: false, wheelchair: false, children: 2, seniors: 0,
      },
      pilgrim: {
        days: '2',
        text: 'Samarqandning ziyorat joylari bo‘yicha 2 kunlik tur kerak. Tarixiy qadamjolar va milliy taomlar ham kiritsin, ortiqcha piyoda yurish bo‘lmasin.',
        interests: ['pilgrimage','history','gastronomy'], pace: 'relaxed', transport: 'mixed', lowWalking: true, ownCar: false, wheelchair: false, children: 0, seniors: 1,
      },
    };
    const t = templates[name];
    if (!t) return;
    prompt.value = t.text;
    days.value = t.days;
    days.dispatchEvent(new Event('change', { bubbles: true }));
    prefs.interests = new Set(t.interests);
    prefs.pace = t.pace;
    prefs.transport = t.transport;
    prefs.lowWalking = t.lowWalking;
    prefs.ownCar = Boolean(t.ownCar);
    prefs.wheelchair = Boolean(t.wheelchair);
    if (get('childrenCount')) get('childrenCount').value = String(t.children || 0);
    if (get('seniorCount')) get('seniorCount').value = String(t.seniors || 0);
    syncButtons();
    prompt.focus();
  }

  function syncButtons() {
    document.querySelectorAll('[data-interest]').forEach((b) => b.classList.toggle('active', prefs.interests.has(b.dataset.interest)));
    document.querySelectorAll('[data-pace]').forEach((b) => b.classList.toggle('active', b.dataset.pace === prefs.pace));
    document.querySelectorAll('[data-transport]').forEach((b) => b.classList.toggle('active', b.dataset.transport === prefs.transport));
    const low = document.querySelector('[data-low-walking]');
    if (low) low.classList.toggle('active', prefs.lowWalking);
    const own = document.querySelector('[data-own-car]');
    if (own) own.classList.toggle('active', prefs.ownCar);
    const wheelchair = document.querySelector('[data-wheelchair]');
    if (wheelchair) wheelchair.classList.toggle('active', prefs.wheelchair);
  }

  function setProgress(step) {
    document.querySelectorAll('.trip-step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) <= step));
  }

  async function checkAiStatus() {
    const node = get('tfeAiStatus');
    if (!node) return;
    try {
      const response = await fetch('/api/tourism/status', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (data.openai_configured) {
        node.textContent = `AI online · ${data.openai_model || 'OpenAI'}`;
        node.classList.add('online');
      } else {
        node.textContent = 'Smart planner · offline AI';
        node.classList.add('fallback');
      }
    } catch {
      node.textContent = 'Planner tayyor';
      node.classList.add('fallback');
    }
  }

  function buildResultToolbar() {
    const shell = get('resultShell');
    const panel = shell?.querySelector('.itinerary-panel');
    if (!shell || !panel || panel.querySelector('.result-toolbar')) return;
    const bar = document.createElement('div');
    bar.className = 'result-toolbar';
    bar.innerHTML = '<strong>Sayohat boshqaruvi</strong><button type="button" class="result-tool" data-copy-plan>⧉ Rejani nusxalash</button><button type="button" class="result-tool" data-start-gps>▶ GPS boshlash</button><button type="button" class="result-tool" data-focus-map>⌖ Xarita</button>';
    panel.prepend(bar);
    bar.querySelector('[data-start-gps]').addEventListener('click', () => get('startLiveBtn')?.click());
    bar.querySelector('[data-focus-map]').addEventListener('click', () => {
      shell.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    bar.querySelector('[data-copy-plan]').addEventListener('click', copyPlan);
  }

  async function copyPlan() {
    try {
      const data = typeof state !== 'undefined' ? state.result : null;
      if (!data) return typeof toast === 'function' && toast('Avval marshrut yarating');
      const lines = [data.summary || 'Samarqand marshruti'];
      (data.days || []).forEach((day) => {
        lines.push('', day.title + (day.date ? ' · ' + day.date : ''));
        (day.stops || []).forEach((stop) => lines.push(`${stop.order}. ${stop.name} · ${stop.time_start}–${stop.time_end}`));
      });
      await navigator.clipboard.writeText(lines.join('\n'));
      if (typeof toast === 'function') toast('Marshrut nusxalandi');
    } catch {
      if (typeof toast === 'function') toast('Nusxalash imkoni bo‘lmadi');
    }
  }

  function buildMapTools() {
    const panel = document.querySelector('.map-panel');
    if (!panel || panel.querySelector('.map-v2-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'map-v2-tools';
    tools.innerHTML = '<button type="button" title="Marshrutni sig‘dirish" aria-label="Marshrutni sig‘dirish" data-map-fit>⌗</button><button type="button" title="Mening joylashuvim" aria-label="Mening joylashuvim" data-map-me>◎</button><button type="button" title="To‘liq ekran" aria-label="To‘liq ekran" data-map-full>⛶</button>';
    panel.appendChild(tools);

    const pill = document.createElement('div');
    pill.className = 'map-gps-pill';
    pill.innerHTML = '<i></i><span>GPS tayyor</span>';
    panel.appendChild(pill);

    tools.querySelector('[data-map-me]').addEventListener('click', () => {
      try {
        const live = state?.live?.current;
        if (live && state.map) state.map.setView([live.latitude, live.longitude], Math.max(state.map.getZoom(), 16), { animate: true });
        else get('locateBtn')?.click();
      } catch { get('locateBtn')?.click(); }
    });

    tools.querySelector('[data-map-fit]').addEventListener('click', () => {
      try {
        const day = state?.result?.days?.[state.activeDay];
        if (!day || !state.map) return;
        const points = [state.result.start, ...(day.stops || [])].filter(Boolean).map((p) => [Number(p.latitude), Number(p.longitude)]);
        if (points.length) state.map.fitBounds(L.latLngBounds(points).pad(.12));
      } catch {}
    });

    tools.querySelector('[data-map-full]').addEventListener('click', () => {
      const opening = !panel.classList.contains('tfe-fullscreen');
      panel.classList.toggle('tfe-fullscreen', opening);
      document.body.classList.toggle('tfe-map-open', opening);
      setTimeout(() => { try { state?.map?.invalidateSize(); } catch {} }, 80);
    });

    const liveStatus = get('liveStatus');
    if (liveStatus) {
      const sync = () => {
        const text = liveStatus.textContent || 'GPS tayyor';
        pill.querySelector('span').textContent = text;
        pill.classList.toggle('live', /faol|ulanmoqda|qayta/i.test(text));
      };
      new MutationObserver(sync).observe(liveStatus, { childList: true, subtree: true, characterData: true });
      sync();
    }
  }

  function watchResults() {
    const shell = get('resultShell');
    if (!shell) return;
    const sync = () => {
      if (!shell.classList.contains('hidden')) {
        buildResultToolbar();
        setProgress(2);
      }
    };
    new MutationObserver(sync).observe(shell, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  ready(() => {
    buildConsole();
    buildMapTools();
    watchResults();
  });
})();
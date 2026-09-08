(() => {
  const labels = {
    node_env_production: 'NODE_ENV = production',
    database_configured: 'PostgreSQL ulanishi mavjud',
    jwt_configured: 'JWT secret sozlangan',
    dev_mode_disabled: 'DEV_MODE o‘chirilgan',
    demo_seed_disabled: 'SEED_DEMO o‘chirilgan',
    sms_provider_configured: 'Playmobile credentiallari to‘liq',
    sms_status_callback_configured: 'SMS delivery callback himoyalangan',
  };

  function card(key, ok) {
    const status = ok ? 'READY' : 'BLOCKED';
    const cls = ok ? 'positive' : 'warning';
    return `<article class="metric-card"><span>${labels[key] || key}</span><strong class="${cls}">${status}</strong><small>${ok ? 'Talab bajarilgan' : 'Pilotdan oldin tuzatish kerak'}</small></article>`;
  }

  async function load() {
    const overall = document.getElementById('overall');
    const grid = document.getElementById('pilotChecks');
    try {
      const response = await fetch('/api/pilot/readiness', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      const entries = Object.entries(data.checks || {});
      grid.innerHTML = entries.map(([key, ok]) => card(key, Boolean(ok))).join('');
      if (data.pilot_ready) {
        overall.innerHTML = `<strong class="positive">✅ TEXNIK PILOT READY</strong><br>${data.note || ''}`;
      } else {
        const failed = (data.failed_checks || []).map((key) => labels[key] || key).join(', ');
        overall.innerHTML = `<strong class="warning">⚠ REAL RESPONDENT PILOTI HALI BLOKLANGAN</strong><br>${data.note || ''}<br><small>Qolgan bandlar: ${failed}</small>`;
      }
    } catch (error) {
      overall.textContent = `Readiness tekshiruvi ishlamadi: ${error.message}`;
      grid.innerHTML = '<article class="metric-card"><span>API</span><strong class="warning">ERROR</strong></article>';
    }
  }

  document.getElementById('refreshPilot')?.addEventListener('click', load);
  load();
})();

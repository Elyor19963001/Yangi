(() => {
  const labels = {
    node_env_production: 'NODE_ENV = production',
    database_configured: 'Research PostgreSQL ulanishi mavjud',
    jwt_configured: 'JWT secret sozlangan',
    dev_mode_disabled: 'DEV_MODE o‘chirilgan',
    demo_seed_disabled: 'SEED_DEMO o‘chirilgan',
    sms_provider_configured: 'Playmobile credentiallari to‘liq',
    sms_status_callback_configured: 'SMS delivery callback himoyalangan',
    pii_vault_external: 'PII alohida tashqi bazada',
    pii_vault_connection_ok: 'PII vault ulanishi ishlayapti',
    pii_transport_tls: 'PII vault transporti TLS bilan himoyalangan',
    pii_residency_declared_uz: 'PII data residency = UZ deb deklaratsiya qilingan',
    legacy_research_db_pii_scrubbed: 'Research DB dan telefon/F.I.Sh. tozalangan',
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
      const piiInfo = data.pii
        ? `<br><small>PII mode: ${data.pii.mode || '—'} · TLS: ${data.pii.transport_tls ? 'ON' : 'OFF'} · residency: ${data.pii.residency_declared || 'aniqlanmagan'} · legacy PII: ${Number(data.pii.legacy_pii_records_in_research_db || 0)}</small>`
        : '';
      if (data.pilot_ready) {
        overall.innerHTML = `<strong class="positive">✅ TEXNIK PILOT READY</strong><br>${data.note || ''}${piiInfo}`;
      } else {
        const failed = (data.failed_checks || []).map((key) => labels[key] || key).join(', ');
        overall.innerHTML = `<strong class="warning">⚠ REAL RESPONDENT PILOTI HALI BLOKLANGAN</strong><br>${data.note || ''}<br><small>Qolgan bandlar: ${failed}</small>${piiInfo}`;
      }
    } catch (error) {
      overall.textContent = `Readiness tekshiruvi ishlamadi: ${error.message}`;
      grid.innerHTML = '<article class="metric-card"><span>API</span><strong class="warning">ERROR</strong></article>';
    }
  }

  document.getElementById('refreshPilot')?.addEventListener('click', load);
  load();
})();

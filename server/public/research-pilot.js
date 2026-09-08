const token = localStorage.getItem('qrp_token') || '';
const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function setMessage(text = '', error = false) {
  $('message').innerHTML = text ? `<div class="${error ? 'error-box' : 'privacy-note'}">${esc(text)}</div>` : '';
}

function shortId(id) {
  const s = String(id || '');
  return s ? `${s.slice(0, 8)}…${s.slice(-6)}` : '—';
}

function waveMark(value) {
  return value ? '<span class="wave-ok">✓</span>' : '<span class="wave-no">—</span>';
}

function optionList(values, selected) {
  return values.map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

async function loadMetrics() {
  const data = await api('/api/research/metrics');
  const p = data.pilot || {};
  $('mTotal').textContent = p.total ?? 0;
  $('mEnrolled').textContent = p.enrolled ?? 0;
  $('mGroups').textContent = `${p.treatment ?? 0} / ${p.control ?? 0}`;
  $('mEligible').textContent = p.analysis_eligible ?? 0;
}

async function loadProgress() {
  const data = await api('/api/research/progress');
  const rows = data.wave_completion || [];
  $('waveProgress').innerHTML = rows.length ? rows.map((r) => `
    <article class="pilot-card">
      <small>${esc(r.assignment_group || 'unassigned')}</small>
      <strong>${Number(r.participants || 0)}</strong>
      <span>T0 ${Number(r.t0 || 0)} · T3 ${Number(r.t3 || 0)} · T6 ${Number(r.t6 || 0)}</span>
    </article>`).join('') : '<div class="muted">Hali enrolled participant yo‘q.</div>';
}

async function loadParticipants() {
  const data = await api('/api/research/participants?limit=500');
  const rows = data.participants || [];
  const body = $('participantsBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10">Participant topilmadi.</td></tr>';
    return;
  }

  const statuses = ['screened','eligible','enrolled','randomized','active','completed','withdrawn','excluded'];
  const quality = ['pending','reviewed','clean','flagged','excluded'];
  body.innerHTML = rows.map((r) => `
    <tr data-study-id="${esc(r.study_id)}">
      <td title="${esc(r.study_id)}"><code>${esc(shortId(r.study_id))}</code></td>
      <td><select data-field="pilot_status">${optionList(statuses, r.pilot_status)}</select></td>
      <td><input data-field="pilot_cohort" value="${esc(r.pilot_cohort || '')}" placeholder="pilot-01" /></td>
      <td><select data-field="assignment_group"><option value="">unassigned</option><option value="treatment" ${r.assignment_group === 'treatment' ? 'selected' : ''}>treatment</option><option value="control" ${r.assignment_group === 'control' ? 'selected' : ''}>control</option></select></td>
      <td><select data-field="data_quality_status">${optionList(quality, r.data_quality_status)}</select></td>
      <td><input data-field="eligible_for_analysis" type="checkbox" ${r.eligible_for_analysis ? 'checked' : ''} /></td>
      <td>${waveMark(r.t0_complete)}</td><td>${waveMark(r.t3_complete)}</td><td>${waveMark(r.t6_complete)}</td>
      <td><button class="btn btn-secondary save-row" type="button">Saqlash</button></td>
    </tr>`).join('');

  document.querySelectorAll('.save-row').forEach((button) => button.addEventListener('click', saveParticipantRow));
}

async function saveParticipantRow(event) {
  const row = event.currentTarget.closest('tr');
  const studyId = row.dataset.studyId;
  const status = row.querySelector('[data-field="pilot_status"]').value;
  const cohort = row.querySelector('[data-field="pilot_cohort"]').value.trim();
  const group = row.querySelector('[data-field="assignment_group"]').value;
  const quality = row.querySelector('[data-field="data_quality_status"]').value;
  const eligible = row.querySelector('[data-field="eligible_for_analysis"]').checked;

  const body = {
    pilot_status: status,
    pilot_cohort: cohort || null,
    data_quality_status: quality,
    eligible_for_analysis: eligible,
  };
  if (group) {
    body.assignment_group = group;
    body.assignment_source = 'external_randomization';
  }

  event.currentTarget.disabled = true;
  try {
    await api(`/api/research/participants/${encodeURIComponent(studyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setMessage('Participant holati saqlandi.');
    await Promise.all([loadMetrics(), loadProgress(), loadAudit()]);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    event.currentTarget.disabled = false;
  }
}

async function loadAudit() {
  const data = await api('/api/research/audit?limit=20');
  const rows = data.events || [];
  $('auditList').innerHTML = rows.length ? rows.map((r) => {
    const when = r.created_at ? new Date(r.created_at).toLocaleString('uz-UZ') : '';
    return `<div style="padding:8px 0;border-bottom:1px solid #e8eeeb"><strong>${esc(r.action_type)}</strong> · <code>${esc(shortId(r.study_id))}</code> · ${esc(when)}</div>`;
  }).join('') : 'Audit eventlari hali yo‘q.';
}

async function downloadProtected(path) {
  if (!token) throw new Error('Avval admin hisob bilan kiring.');
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const data = await response.json(); message = data.error || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || 'research-export.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshAll() {
  if (!token) {
    setMessage('Admin dashboard uchun avval platformada admin hisob bilan kiring.', true);
    return;
  }
  setMessage('Dashboard yangilanmoqda…');
  try {
    await Promise.all([loadMetrics(), loadProgress(), loadParticipants(), loadAudit()]);
    setMessage('Pseudonymous pilot ma’lumotlari yangilandi.');
  } catch (error) {
    setMessage(error.message, true);
  }
}

$('refreshBtn').addEventListener('click', refreshAll);
document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', async () => {
  try { await downloadProtected(button.dataset.export); }
  catch (error) { setMessage(error.message, true); }
}));

refreshAll();

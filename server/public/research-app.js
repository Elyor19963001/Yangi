const token = localStorage.getItem('qrp_token') || '';
const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function msg(id, text = '', type = '') {
  const el = $(id); el.textContent = text; el.className = `message ${type}`;
}
function val(id) { return $(id).value; }
function boolVal(id) { const v = val(id); return v === '' ? null : v === 'true'; }
function numVal(id) { const v = val(id); return v === '' ? null : Number(v); }

async function loadDistricts() {
  const rows = await api('/api/meta/districts');
  $('district_id').innerHTML = '<option value="">Tumanni tanlang</option>' + rows.map(d => `<option value="${d.district_id}">${d.name}</option>`).join('');
}

async function loadStatus() {
  if (!token) return;
  $('loginNotice').classList.add('hidden');
  $('consentCard').classList.remove('hidden');
  try {
    const s = await api('/api/survey/status');
    $('studyStatus').classList.remove('hidden');
    $('studyStatus').textContent = `study_id: ${s.study_id} · Yakunlangan bosqichlar: ${s.completed_waves.map(x => x.wave).join(', ') || 'yo‘q'}`;
    $('researchConsent').checked = Boolean(s.consent_research);
    $('withdrawConsent').classList.toggle('hidden', !s.consent_research);
    $('surveyCard').classList.toggle('hidden', !s.consent_research);
  } catch (e) { msg('consentMessage', e.message, 'error'); }
}

async function saveConsent() {
  const accepted = $('researchConsent').checked;
  if (!accepted) return msg('consentMessage', 'Davom etish uchun rozilik belgilang.', 'error');
  try {
    await api('/api/survey/consent', { method: 'POST', body: JSON.stringify({ accepted: true, consent_version: 'research-v1' }) });
    msg('consentMessage', 'Rozilik qayd etildi.', 'success');
    await loadStatus();
  } catch (e) { msg('consentMessage', e.message, 'error'); }
}

async function withdrawConsent() {
  if (!confirm('Tadqiqot roziligini qaytarib olmoqchimisiz?')) return;
  try {
    await api('/api/survey/withdraw', { method: 'POST' });
    msg('consentMessage', 'Rozilik qaytarib olindi.', 'success');
    await loadStatus();
  } catch (e) { msg('consentMessage', e.message, 'error'); }
}

const fields = ['district_id','age_group','gender','education_level','household_size','employment_status','monthly_household_income_uzs','internet_access','internet_type','monthly_internet_cost_uzs','internet_quality','smartphone_access','computer_access','digital_skills','egov_use','digital_payment_use','ecommerce_use','online_selling_use','price_knowledge','financial_services_use','platform_usage_frequency','nps'];

function payload() {
  return {
    district_id: numVal('district_id'), age_group: val('age_group') || null, gender: val('gender') || null,
    education_level: val('education_level') || null, household_size: numVal('household_size'), employment_status: val('employment_status') || null,
    monthly_household_income_uzs: numVal('monthly_household_income_uzs'), internet_access: boolVal('internet_access'), internet_type: val('internet_type') || null,
    monthly_internet_cost_uzs: numVal('monthly_internet_cost_uzs'), internet_quality: numVal('internet_quality'), smartphone_access: boolVal('smartphone_access'),
    computer_access: boolVal('computer_access'), digital_skills: numVal('digital_skills'), egov_use: boolVal('egov_use'), digital_payment_use: boolVal('digital_payment_use'),
    ecommerce_use: boolVal('ecommerce_use'), online_selling_use: boolVal('online_selling_use'), price_knowledge: numVal('price_knowledge'),
    financial_services_use: boolVal('financial_services_use'), platform_usage_frequency: numVal('platform_usage_frequency'), nps: numVal('nps')
  };
}

async function submitSurvey(e) {
  e.preventDefault();
  const wave = val('wave');
  msg('surveyMessage', 'Saqlanmoqda…');
  try {
    await api(`/api/survey/${wave}`, { method: 'POST', body: JSON.stringify(payload()) });
    msg('surveyMessage', `${wave} javoblari saqlandi.`, 'success');
    await loadStatus();
  } catch (e2) { msg('surveyMessage', e2.message, 'error'); }
}

async function loadWave() {
  const wave = val('wave');
  try {
    const data = await api(`/api/survey/${wave}`);
    if (!data) return msg('surveyMessage', 'Bu bosqich uchun saqlangan javob yo‘q.', 'error');
    for (const key of fields) {
      if (!$(key) || data[key] == null) continue;
      $(key).value = String(data[key]);
    }
    $('internet_quality_out').textContent = val('internet_quality');
    $('digital_skills_out').textContent = val('digital_skills');
    msg('surveyMessage', `${wave} javobi yuklandi.`, 'success');
  } catch (e) { msg('surveyMessage', e.message, 'error'); }
}

window.addEventListener('DOMContentLoaded', async () => {
  $('saveConsent').addEventListener('click', saveConsent);
  $('withdrawConsent').addEventListener('click', withdrawConsent);
  $('surveyForm').addEventListener('submit', submitSurvey);
  $('loadWave').addEventListener('click', loadWave);
  $('internet_quality').addEventListener('input', () => $('internet_quality_out').textContent = val('internet_quality'));
  $('digital_skills').addEventListener('input', () => $('digital_skills_out').textContent = val('digital_skills'));
  try { await loadDistricts(); } catch {}
  await loadStatus();
});

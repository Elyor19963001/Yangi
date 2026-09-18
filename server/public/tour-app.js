const state={
  map:null,start:null,result:null,support:null,activeDay:0,routeLayer:null,markers:[],supportMarkers:[],selectedServices:{},
  audioEngine:'unknown',
  live:{watchId:null,active:false,paused:false,nextIndex:0,marker:null,accuracyCircle:null,trailLayer:null,trailCoords:[],travelledM:0,lastPos:null,liveRouteLayer:null,routeGeometry:null,lastRerouteAt:0,current:null,follow:true,rerouting:false,navSteps:[],navStepIndex:0,navAnnounced:new Set(),navFallbackAnnounced:new Set(),voiceLang:'uz',guidanceMode:'essential',autoGuide:true,navAudio:null,professionalVoice:false,lastOffrouteSpokenAt:0}
};
const guideAudioCache=new Map();
let guideAudioPlayer=null;
const $=(id)=>document.getElementById(id);
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const money=(v)=>new Intl.NumberFormat('uz-UZ').format(Number(v)||0);
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),3000)}
function initMap(){state.map=L.map('map').setView([39.6542,66.9597],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map)}
async function api(path,options={}){const headers={...(options.headers||{})};if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';const r=await fetch(path,{...options,headers});let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(data?.error||`HTTP ${r.status}`);return data}
function setMessage(msg,type=''){$('message').textContent=msg;$('message').className=`message ${type}`}
function localDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function addDays(dateText,n){const [y,m,d]=dateText.split('-').map(Number);const dt=new Date(y,m-1,d);dt.setDate(dt.getDate()+n);return localDate(dt)}
function syncDateRange(){const today=localDate();const days=Math.max(1,Number($('days').value)||2);$('startDate').min=today;$('startDate').max=addDays(today,Math.max(0,14-(days-1)));if(!$('startDate').value||$('startDate').value<$('startDate').min||$('startDate').value>$('startDate').max)$('startDate').value=today}
function haversine(lat1,lon1,lat2,lon2){const toRad=v=>v*Math.PI/180,R=6371000,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(a)))}
function formatDistance(m){const n=Math.max(0,Number(m)||0);return n<1000?`${Math.round(n)} m`:`${(n/1000).toFixed(n<10000?1:0)} km`}
function audioGuideHtml(stop,compact=false){
  const guide=stop?.audio_guide;
  const short=guide?.short||{};
  const detailed=guide?.detailed||{};
  if(!guide?.id||(!short.uz&&!short.en&&!short.ru&&!detailed.uz&&!detailed.en&&!detailed.ru))return '';
  const first=short.uz||short.en||short.ru||detailed.uz||detailed.en||detailed.ru||'';
  const name=stop?.name||'Turistik obyekt';
  const button=(lang,label,shortText,detailedText)=>shortText||detailedText
    ? `<button type="button" class="audio-guide-play" data-guide-id="${esc(guide.id)}" data-guide-lang="${esc(lang)}" data-guide-name="${esc(name)}" data-guide-short="${esc(shortText||detailedText||'')}" data-guide-detailed="${esc(detailedText||shortText||'')}">🔊 ${esc(label)}</button>`
    : '';
  return `<div class="audio-guide ${compact?'compact':''}" data-mode="short" data-lang="uz">
    <div class="audio-guide-head"><strong>🎧 Audio gid</strong><span class="audio-engine-label">3 tilda</span></div>
    <div class="audio-guide-modes">
      <button type="button" class="audio-guide-mode active" data-guide-mode="short">Qisqa</button>
      <button type="button" class="audio-guide-mode" data-guide-mode="detailed">Batafsil</button>
    </div>
    <p class="audio-guide-text">${esc(first)}</p>
    <div class="audio-guide-actions">
      ${button('uz','O‘zbek',short.uz,detailed.uz)}
      ${button('en','English',short.en,detailed.en)}
      ${button('ru','Русский',short.ru,detailed.ru)}
      <button type="button" class="audio-guide-stop" aria-label="Ovozni to‘xtatish">■</button>
    </div>
  </div>`;
}
function poiCategoryMeta(stop={}){
  const map={
    historic:{icon:'🏛',label:'Tarixiy obida'},
    museum:{icon:'🏺',label:'Muzey'},
    pilgrimage:{icon:'🕌',label:'Ziyoratgoh'},
    attraction:{icon:'✦',label:'Diqqatga sazovor joy'},
    market:{icon:'🧺',label:'Bozor'},
    heritage:{icon:'🏛',label:'Meros obyekti'},
  };
  return map[stop.category]||{icon:'📍',label:'Turistik obyekt'};
}
function compactOpenStatus(op={}){
  const row=op.now?.status&&op.now.status!=='unknown'?op.now:(op.planned||{});
  const raw=String(row.label||'').trim();
  if(row.status==='open'){
    const match=raw.match(/(?:Ochiq\s*·\s*)?(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})/i);
    return {className:'open',text:match?`Hozir ochiq · ${match[2]} gacha`:'Hozir ochiq'};
  }
  if(row.status==='closed'){
    const match=raw.match(/(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})/);
    return {className:'closed',text:match?`Hozir yopiq · ${match[1]}–${match[2]}`:'Hozir yopiq'};
  }
  return {className:'unknown',text:raw||'Ish vaqti aniqlanmagan'};
}
function compactTicketStatus(ticket={}){
  if(ticket.status==='official-published'){
    const amounts=(ticket.rows||[]).map(x=>Number(x.amount_uzs)).filter(x=>Number.isFinite(x)&&x>=0);
    if(amounts.length){
      const min=Math.min(...amounts),max=Math.max(...amounts);
      if(min===0&&max===0)return {className:'free',text:'Bepul'};
      if(min===max)return {className:'official',text:`${money(min)} so‘m`};
      return {className:'official',text:`${money(min)}–${money(max)} so‘m`};
    }
    return {className:'official',text:'Rasmiy tarif'};
  }
  if(ticket.status==='free')return {className:'free',text:'Bepul'};
  if(ticket.status==='known')return {className:'known',text:String(ticket.label||'Narx ma’lum')};
  if(ticket.status==='paid-unknown')return {className:'unknown',text:'Pullik · narx noma’lum'};
  return {className:'unknown',text:'Narxni tekshirish'};
}
function poiPopupSummary(stop={}){
  const guide=stop.audio_guide;
  const lang=state.live?.voiceLang||'uz';
  const short=guide?.short||{};
  if(short[lang])return short[lang];
  if(short.uz)return short.uz;
  const meta=poiCategoryMeta(stop);
  return meta.label+' · Samarqand marshrutidagi tavsiya etilgan tashrif nuqtasi.';
}
function poiPopupHtml(stop={}){
  const meta=poiCategoryMeta(stop);
  const op=stop.operational||{};
  const ticket=op.ticket||{};
  const official=op.official||null;
  const open=compactOpenStatus(op);
  const price=compactTicketStatus(ticket);
  const sourceUrl=official?.source_url||op.website||stop.source_url||stop.osm_source_url||'';
  const sourceLabel=official?'Rasmiy manba':(op.website?'Obyekt sayti':stop.source==='OpenStreetMap'?'OpenStreetMap':'Manba');
  const hasAudio=Boolean(stop.audio_guide?.id);
  const order=Number(stop.order)||0;
  const planned=op.planned||{};
  const now=op.now||{};
  const detailedTicket=ticket.status==='official-published'?ticketTariffHtml(ticket):'';
  const audio=hasAudio?audioGuideHtml(stop,true):'<div class="poi-audio-empty">🎧 Bu obyekt uchun audio gid hozircha tayyorlanmagan.</div>';
  const visitInfo=Number(stop.visit_minutes)>0?`<div><span>⏱ Tavsiya etilgan tashrif</span><strong>${Number(stop.visit_minutes)} daqiqa</strong></div>`:'';
  const nowInfo=now.label?`<div><span>🕒 Hozirgi holat</span><strong>${esc(now.label)}</strong></div>`:'';
  const planInfo=planned.label?`<div><span>📅 Rejadagi vaqt</span><strong>${esc(stop.time_start||'')} · ${esc(planned.label)}</strong></div>`:'';
  return `<article class="poi-place-card audio-first">
    <div class="poi-simple-head">
      <div>
        <span class="poi-simple-type">${meta.icon} ${esc(meta.label)}${official?' · ✓ rasmiy':''}</span>
        <strong>${esc(stop.name||'Turistik obyekt')}</strong>
        <small>${esc(stop.time_start||'')}${stop.time_end?'–'+esc(stop.time_end):''}${order?' · '+order+'-nuqta':''}</small>
      </div>
    </div>
    <div class="poi-place-chips primary-facts">
      <span class="poi-chip ${open.className}">● ${esc(open.text)}</span>
      <span class="poi-chip ticket ${price.className}">🎟 ${esc(price.text)}</span>
    </div>
    ${audio}
    <div class="poi-place-actions compact-actions">
      <button type="button" class="poi-action navigate" data-popup-gps data-stop-lat="${esc(stop.latitude)}" data-stop-lon="${esc(stop.longitude)}" data-stop-name="${esc(stop.name||'')}">◎ Navigator</button>
      <button type="button" class="poi-action details" data-popup-details>Batafsil ma’lumot</button>
    </div>
    <div class="poi-place-details hidden">
      <p class="poi-place-summary full-summary">${esc(poiPopupSummary(stop))}</p>
      <div class="poi-place-info-grid">${nowInfo}${planInfo}${visitInfo}</div>
      ${detailedTicket}
      ${sourceUrl?`<a class="poi-source-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(sourceLabel)} ↗</a>`:''}
    </div>
  </article>`;
}
function popupStopIndex(button){
  const lat=Number(button?.dataset?.stopLat),lon=Number(button?.dataset?.stopLon),name=String(button?.dataset?.stopName||'');
  const stops=liveStops();
  let index=stops.findIndex(x=>name&&String(x.name||'')===name);
  if(index<0&&Number.isFinite(lat)&&Number.isFinite(lon)){
    index=stops.findIndex(x=>haversine(lat,lon,Number(x.latitude),Number(x.longitude))<35);
  }
  return index;
}
function handlePoiPopupClick(event){
  const detailsButton=event.target.closest('[data-popup-details]');
  if(detailsButton){
    event.preventDefault();event.stopPropagation();
    const card=detailsButton.closest('.poi-place-card');
    const panel=card?.querySelector('.poi-place-details');
    if(panel){
      panel.classList.toggle('hidden');
      const open=!panel.classList.contains('hidden');
      detailsButton.classList.toggle('active',open);
      detailsButton.textContent=open?'Batafsilni yopish':'Batafsil ma’lumot';
    }
    return;
  }
  const gpsButton=event.target.closest('[data-popup-gps]');
  if(gpsButton){
    event.preventDefault();event.stopPropagation();
    const index=popupStopIndex(gpsButton);
    if(index<0){toast('Bu nuqta joriy marshrutda topilmadi');return}
    try{state.map.closePopup()}catch{}
    startLive(index);
    document.getElementById('livePanel')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
}
function selectGuideVoice(lang){
  if(!('speechSynthesis' in window))return null;
  const locale={uz:'uz-UZ',en:'en-US',ru:'ru-RU'}[lang]||lang;
  const voices=window.speechSynthesis.getVoices?.()||[];
  const target=String(locale||'').toLowerCase();
  const base=target.split('-')[0];
  return voices.find(v=>String(v.lang||'').toLowerCase()===target)
    ||voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base))
    ||null;
}
function guideTextForButton(button,mode){
  if(!button)return '';
  return mode==='detailed'
    ? (button.dataset.guideDetailed||button.dataset.guideShort||'')
    : (button.dataset.guideShort||button.dataset.guideDetailed||'');
}
function updateGuidePreview(box){
  if(!box)return;
  const mode=box.dataset.mode||'short';
  const lang=box.dataset.lang||'uz';
  const button=[...box.querySelectorAll('.audio-guide-play')].find(x=>x.dataset.guideLang===lang)
    ||box.querySelector('.audio-guide-play');
  const textNode=box.querySelector('.audio-guide-text');
  if(textNode&&button)textNode.textContent=guideTextForButton(button,mode);
}
function stopGuideAudio(){
  if(guideAudioPlayer){
    try{guideAudioPlayer.pause();guideAudioPlayer.currentTime=0;}catch{}
    guideAudioPlayer=null;
  }
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
  document.querySelectorAll('.audio-guide-play.speaking,.audio-guide-play.loading').forEach(x=>x.classList.remove('speaking','loading'));
}
function browserGuideFallback(button,notify=true){
  if(!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined'){
    toast('Audio gidni ijro etib bo‘lmadi.');
    return;
  }
  const box=button.closest('.audio-guide');
  const mode=box?.dataset.mode||'short';
  const lang=button.dataset.guideLang||'uz';
  const guideText=guideTextForButton(button,mode);
  if(!guideText)return;
  const locale={uz:'uz-UZ',en:'en-US',ru:'ru-RU'}[lang]||lang;
  const utter=new SpeechSynthesisUtterance(guideText);
  utter.lang=locale;
  utter.rate=mode==='detailed' ? (lang==='ru'?0.90:0.92) : (lang==='ru'?0.94:0.96);
  utter.pitch=1;
  const voice=selectGuideVoice(lang);
  if(voice)utter.voice=voice;
  button.classList.add('speaking');
  utter.onend=()=>button.classList.remove('speaking');
  utter.onerror=()=>{button.classList.remove('speaking');toast('Ovozli ma’lumotni ijro etib bo‘lmadi.');};
  window.speechSynthesis.speak(utter);
  if(notify)toast('AI MP3 hozir mavjud emas — brauzer ovozi zaxira sifatida ishladi.');
}
async function playProfessionalGuide(button){
  const box=button.closest('.audio-guide');
  const mode=box?.dataset.mode||'short';
  const lang=button.dataset.guideLang||'uz';
  const guideId=button.dataset.guideId||'';
  if(!guideId)return browserGuideFallback(button);
  if(box)box.dataset.lang=lang;
  updateGuidePreview(box);
  stopGuideAudio();
  button.classList.add('loading');
  const key=`${guideId}:${lang}:${mode}`;
  try{
    let url=guideAudioCache.get(key);
    if(!url){
      const response=await fetch(`/api/tourism/audio-guide/${encodeURIComponent(guideId)}?lang=${encodeURIComponent(lang)}&mode=${encodeURIComponent(mode)}`,{headers:{Accept:'audio/mpeg'}});
      if(!response.ok){
        let detail='';
        try{detail=(await response.json())?.error||''}catch{}
        throw new Error(detail||`HTTP ${response.status}`);
      }
      const blob=await response.blob();
      if(!blob.size)throw new Error('Audio bo‘sh qaytdi.');
      url=URL.createObjectURL(blob);
      guideAudioCache.set(key,url);
    }
    button.classList.remove('loading');
    guideAudioPlayer=new Audio(url);
    guideAudioPlayer.preload='auto';
    button.classList.add('speaking');
    guideAudioPlayer.onended=()=>{button.classList.remove('speaking');guideAudioPlayer=null;};
    guideAudioPlayer.onerror=()=>{button.classList.remove('speaking');guideAudioPlayer=null;browserGuideFallback(button,false);};
    await guideAudioPlayer.play();
  }catch(err){
    button.classList.remove('loading');
    browserGuideFallback(button,true);
  }
}
function handleAudioGuideClick(event){
  const modeButton=event.target.closest('.audio-guide-mode');
  if(modeButton){
    event.preventDefault();event.stopPropagation();
    const box=modeButton.closest('.audio-guide');
    if(!box)return;
    box.dataset.mode=modeButton.dataset.guideMode==='detailed'?'detailed':'short';
    box.querySelectorAll('.audio-guide-mode').forEach(x=>x.classList.toggle('active',x===modeButton));
    stopGuideAudio();
    updateGuidePreview(box);
    return;
  }
  const play=event.target.closest('.audio-guide-play');
  if(play){event.preventDefault();event.stopPropagation();playProfessionalGuide(play);return;}
  const stop=event.target.closest('.audio-guide-stop');
  if(stop){event.preventDefault();event.stopPropagation();stopGuideAudio();}
}

function navLocale(lang){return {uz:'uz-UZ',en:'en-US',ru:'ru-RU'}[lang]||'uz-UZ'}
function stopNavAudio(){
  const l=state.live;
  if(l.navAudio){try{l.navAudio.pause();l.navAudio.currentTime=0}catch{}l.navAudio=null}
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
  document.querySelectorAll('.nav-speaking').forEach(x=>x.classList.remove('nav-speaking'));
}
function browserSpeakNav(text,lang){
  if(!text||!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined')return;
  if(guideAudioPlayer)stopGuideAudio();
  stopNavAudio();
  const utter=new SpeechSynthesisUtterance(text);
  utter.lang=navLocale(lang);
  utter.rate=0.98;
  utter.pitch=1;
  const voice=selectGuideVoice(lang);
  if(voice)utter.voice=voice;
  window.speechSynthesis.speak(utter);
}
async function navPhraseJson(payload){
  try{
    const r=await fetch('/api/tourism/live/voice?format=json',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)return null;
    return await r.json();
  }catch{return null}
}
async function speakNavEvent(payload,options={}){
  const l=state.live;
  if(l.guidanceMode==='mute'&&!options.force)return;
  const body=Object.assign({},payload,{lang:l.voiceLang});
  const visual=document.getElementById('navVoiceState');
  if(visual)visual.textContent=l.professionalVoice?'AI ovoz':'Qurilma ovozi';
  if(!l.professionalVoice){
    const meta=await navPhraseJson(body);
    if(meta&&meta.phrase)browserSpeakNav(meta.phrase,l.voiceLang);
    return;
  }
  try{
    stopNavAudio();
    if(guideAudioPlayer)stopGuideAudio();
    const response=await fetch('/api/tourism/live/voice',{method:'POST',headers:{'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify(body)});
    if(!response.ok)throw new Error('nav audio unavailable');
    const blob=await response.blob();
    if(!blob.size)throw new Error('empty nav audio');
    const url=URL.createObjectURL(blob);
    l.navAudio=new Audio(url);
    l.navAudio.onended=()=>{URL.revokeObjectURL(url);l.navAudio=null};
    l.navAudio.onerror=()=>{URL.revokeObjectURL(url);l.navAudio=null};
    await l.navAudio.play();
  }catch{
    const meta=await navPhraseJson(body);
    if(meta&&meta.phrase)browserSpeakNav(meta.phrase,l.voiceLang);
  }
}
function maneuverIcon(step){
  const m=String(step&&step.modifier||'').toLowerCase();
  if(m==='left'||m==='slight left'||m==='sharp left')return '↰';
  if(m==='right'||m==='slight right'||m==='sharp right')return '↱';
  if(m==='uturn')return '↶';
  return '↑';
}
function localTurnText(step){
  const lang=state.live.voiceLang;
  const mod=String(step&&step.modifier||'straight').toLowerCase();
  const dirs={
    uz:{'straight':'To‘g‘ri davom eting','slight right':'Biroz o‘ngga','right':'O‘ngga buriling','sharp right':'Keskin o‘ngga','uturn':'Ortga qayriling','sharp left':'Keskin chapga','left':'Chapga buriling','slight left':'Biroz chapga'},
    en:{'straight':'Continue straight','slight right':'Bear right','right':'Turn right','sharp right':'Sharp right','uturn':'Make a U-turn','sharp left':'Sharp left','left':'Turn left','slight left':'Bear left'},
    ru:{'straight':'Продолжайте прямо','slight right':'Возьмите вправо','right':'Поверните направо','sharp right':'Резко направо','uturn':'Развернитесь','sharp left':'Резко налево','left':'Поверните налево','slight left':'Возьмите влево'}
  };
  const set=dirs[lang]||dirs.uz;
  const base=set[mod]||set.straight;
  return step&&step.name?base+' · '+step.name:base;
}
function setNavigationSteps(steps){
  const l=state.live;
  l.navSteps=(Array.isArray(steps)?steps:[]).filter(step=>!['depart','arrive'].includes(String(step&&step.type||''))&&step&&step.maneuver);
  l.navStepIndex=0;
  l.navAnnounced=new Set();
  l.navFallbackAnnounced=new Set();
  renderNavigationBanner();
}
function nextNavigationStep(){return state.live.navSteps[state.live.navStepIndex]||null}
function renderNavigationBanner(distance){
  const step=nextNavigationStep();
  const next=nextLiveStop();
  const lang=state.live.voiceLang;
  const labels={uz:{next:'Keyingi manzil',ready:'Marshrut tayyor',waiting:'GPS masofa aniqlanmoqda…',tracking:'Manzilgacha GPS kuzatuvi'},en:{next:'Next stop',ready:'Route ready',waiting:'Waiting for GPS distance…',tracking:'GPS guidance to destination'},ru:{next:'Следующая точка',ready:'Маршрут готов',waiting:'Определяю расстояние по GPS…',tracking:'GPS-навигация до точки'}};
  const t=labels[lang]||labels.uz;
  const icon=document.getElementById('navManeuverIcon');
  const title=document.getElementById('navInstruction');
  const meta=document.getElementById('navInstructionDistance');
  if(icon)icon.textContent=step?maneuverIcon(step):'◎';
  if(title)title.textContent=step?localTurnText(step):(next?t.next+': '+next.name:t.ready);
  if(meta)meta.textContent=Number.isFinite(Number(distance))?formatDistance(Number(distance)):(step?t.waiting:t.tracking);
}
function stepDistanceM(current,step){
  const lat=Number(step&&step.maneuver&&step.maneuver.latitude),lon=Number(step&&step.maneuver&&step.maneuver.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lon)?haversine(current.latitude,current.longitude,lat,lon):null;
}
function announcementBuckets(){
  const walking=state.result&&state.result.intent&&state.result.intent.transport==='walking';
  if(state.live.guidanceMode==='full')return walking?[120,60,20]:[300,120,35];
  return walking?[60,20]:[120,35];
}
function maybeSpeakTurn(current,accuracy){
  const l=state.live,step=nextNavigationStep();
  if(!step)return false;
  const d=stepDistanceM(current,step);
  if(d===null)return false;
  renderNavigationBanner(d);
  const buckets=announcementBuckets();
  for(const threshold of buckets){
    const key=String(step.id)+':'+String(threshold);
    if(d<=threshold&&!l.navAnnounced.has(key)){
      l.navAnnounced.add(key);
      speakNavEvent({event:'turn',distance_m:d,modifier:step.modifier,street:step.name||''});
      break;
    }
  }
  const passRadius=Math.max(20,Math.min(38,Number(accuracy||25)));
  if(d<=passRadius){l.navStepIndex+=1;renderNavigationBanner()}
  return true;
}
function maybeSpeakFallbackDistance(distance){
  const l=state.live;
  if(l.guidanceMode==='mute')return;
  const thresholds=l.guidanceMode==='full'?[500,250,100]:[250,100];
  for(const threshold of thresholds){
    const key=String(l.nextIndex)+':'+String(threshold);
    if(distance<=threshold&&!l.navFallbackAnnounced.has(key)){
      l.navFallbackAnnounced.add(key);
      speakNavEvent({event:'continue',distance_m:distance});
      break;
    }
  }
}
async function playAutoGuideForStop(stop){
  const guide=stop&&stop.audio_guide;
  if(!state.live.autoGuide||!guide||!guide.id)return;
  const lang=state.live.voiceLang;
  const key=guide.id+':'+lang+':short';
  try{
    stopNavAudio();
    let url=guideAudioCache.get(key);
    if(!url){
      const response=await fetch('/api/tourism/audio-guide/'+encodeURIComponent(guide.id)+'?lang='+encodeURIComponent(lang)+'&mode=short',{headers:{Accept:'audio/mpeg'}});
      if(!response.ok)return;
      const blob=await response.blob();
      if(!blob.size)return;
      url=URL.createObjectURL(blob);
      guideAudioCache.set(key,url);
    }
    if(guideAudioPlayer){try{guideAudioPlayer.pause()}catch{}}
    guideAudioPlayer=new Audio(url);
    await guideAudioPlayer.play();
  }catch{}
}
function syncNavigatorControls(){
  const l=state.live;
  const lang=document.getElementById('navLanguage');
  const mode=document.getElementById('navGuidance');
  const auto=document.getElementById('navAutoGuide');
  if(lang)lang.value=l.voiceLang;
  if(mode)mode.value=l.guidanceMode;
  if(auto)auto.checked=l.autoGuide;
  const badge=document.getElementById('navVoiceState');
  if(badge)badge.textContent=l.professionalVoice?'AI ovoz':'Qurilma ovozi';
  renderNavigationBanner();
}
function locate(){if(!navigator.geolocation){toast('Brauzer geolokatsiyani qo‘llamaydi');return}const replan=Boolean(state.result);toast('Joylashuv aniqlanmoqda…');navigator.geolocation.getCurrentPosition(pos=>{state.start={latitude:pos.coords.latitude,longitude:pos.coords.longitude,name:'Mening GPS joylashuvim'};$('locationLine').textContent=`Boshlanish: GPS joylashuvim · ±${Math.round(pos.coords.accuracy||0)} m`;if(replan){toast('GPS olindi — marshrut shu joydan qayta optimallashtirilmoqda');setTimeout(()=>$('plannerForm')?.requestSubmit(),250)}else toast('Joylashuv olindi — marshrut shu nuqtadan boshlanadi')},()=>toast('Joylashuvga ruxsat berilmadi'),{enableHighAccuracy:true,timeout:10000,maximumAge:60000})}
function intentBadges(intent={},support={}){const labels={history:'Tarix',pilgrimage:'Ziyorat',gastronomy:'Gastronomiya',museum:'Muzey',family:'Oilaviy',architecture:'Arxitektura'};const timeWindow=intent.preferred_start_time&&intent.preferred_end_time?`🕘 ${intent.preferred_start_time}–${intent.preferred_end_time}`:intent.preferred_start_time?`🕘 ${intent.preferred_start_time} dan`:null;const rows=[...(intent.interests||[]).map(i=>labels[i]||i),`${intent.days||2} kun`,state.result?.trip_start_date?`📅 ${state.result.trip_start_date}`:null,state.result?.weather_adaptive?'🌦️ Adaptive':null,intent.low_walking?'Kam yurish':null,intent.transport==='taxi'?'Taksi':intent.transport==='walking'?'Piyoda':intent.own_vehicle?'🚗 Shaxsiy avtomobil':'Aralash transport',Number(intent.children_count||0)>0?`👧 ${Number(intent.children_count)} bola`:null,Number(intent.seniors_count||0)>0?`👵 ${Number(intent.seniors_count)} kishi 65+`:null,intent.wheelchair_accessible?'♿ Qulaylik muhim':null,timeWindow,intent.origin_country?`🌍 ${intent.origin_country}`:null,support.party_size?`${support.party_size} sayohatchi`:null,support.budget?.total_uzs?`${money(support.budget.total_uzs)} so‘m budjet`:intent.budget_uzs?`${money(intent.budget_uzs)} so‘m budjet`:null].filter(Boolean);return rows.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}
function ticketTariffHtml(ticket={}){
  if(ticket.status!=='official-published'||!Array.isArray(ticket.rows))return ticket.label?`<span class="ticket-status">🎟 ${esc(ticket.label)}</span>`:'';
  const rows=ticket.rows.filter(row=>Number.isFinite(Number(row.amount_uzs))).map(row=>`<div class="official-price-row"><span>${esc(row.audience)}</span><strong>${money(row.amount_uzs)} so‘m</strong></div>`).join('');
  if(!rows)return '';
  const season=ticket.season?` · ${esc(ticket.season)}`:'';
  return `<details class="official-tariff"><summary>🎟 Rasmiy tariflar${season}</summary>
    <div class="official-price-list">${rows}</div>
    ${ticket.free_note?`<small>${esc(ticket.free_note)}</small>`:''}
    ${ticket.note?`<small>${esc(ticket.note)}</small>`:''}
    <div class="official-source-line">Tekshirildi: ${esc(ticket.checked_on||'—')} · ${esc(ticket.authority||'rasmiy manba')}</div>
    <div class="official-actions">${ticket.source_url?`<a href="${esc(ticket.source_url)}" target="_blank" rel="noopener">Tarif manbasi ↗</a>`:''}${ticket.ticket_url?`<a href="${esc(ticket.ticket_url)}" target="_blank" rel="noopener">Chipta portali ↗</a>`:''}</div>
  </details>`;
}
function stopCard(stop){
  const cat={historic:'Tarixiy obida',museum:'Muzey',pilgrimage:'Ziyorat joyi',attraction:'Turistik obyekt',market:'Bozor',heritage:'Meros obyekt'}[stop.category]||'Turistik nuqta';
  const sourceLabel=stop.source==='OpenStreetMap'?'OpenStreetMap manbasi':'Obyekt manbasi';
  const shelter=Number(stop.weather_resilience||0)>=2?' · ob-havoga nisbatan qulayroq':'';
  const op=stop.operational||{};
  const planned=op.planned||{};
  const now=op.now||{};
  const ticket=op.ticket||{};
  const officialMeta=op.official||null;
  const statusClass=planned.status==='open'?'open':planned.status==='closed'?'closed':'unknown';
  const statusIcon=planned.status==='open'?'●':planned.status==='closed'?'●':'◌';
  const visitStatus=planned.label?`<span class="visit-status ${statusClass}">${statusIcon} Rejadagi vaqtda: ${esc(planned.label)}</span>`:'';
  const nowStatus=now.status&&now.status!=='unknown'?`<span class="now-status ${now.status}">Hozir: ${esc(now.label)}</span>`:'';
  const ticketStatus=ticket.status==='official-published'?'<span class="ticket-status official">✓ Rasmiy tarif mavjud</span>':ticket.label?`<span class="ticket-status">🎟 ${esc(ticket.label)}</span>`:'';
  const primaryOfficial=officialMeta?.source_url||op.website||null;
  const officialLink=primaryOfficial?`<a href="${esc(primaryOfficial)}" target="_blank" rel="noopener">${officialMeta?'Rasmiy manba':'Obyekt sayti'} ↗</a>`:'';
  const osm=stop.osm_source_url||(stop.source==='OpenStreetMap'?stop.source_url:null);
  const hoursLine=officialMeta
    ? `<small class="official-verified">✓ Ish vaqti: ${esc(planned.source||officialMeta.authority||'rasmiy manba')} · katalog ${esc(officialMeta.checked_on||'')}</small>`
    : stop.opening_hours?`<small>OSM ish vaqti: ${esc(stop.opening_hours)}</small>`:'';
  return `<article class="stop ${planned.status==='closed'?'stop-closed':''} ${officialMeta?'stop-official':''}">
    <div class="stop-number">${Number(stop.order)}</div>
    <div><strong>${esc(stop.name)}</strong>
      <span>${esc(stop.time_start)}–${esc(stop.time_end)} · ${esc(cat)} · ${Number(stop.visit_minutes||0)} daqiqa${shelter}</span>
      <div class="operational-row">${visitStatus}${nowStatus}${ticketStatus}</div>
      ${hoursLine}
      ${audioGuideHtml(stop,true)}
      ${ticketTariffHtml(ticket)}
      <div class="stop-links">${officialLink}${osm?`<a href="${esc(osm)}" target="_blank" rel="noopener">OSM metadata ↗</a>`:''}${!osm&&!primaryOfficial&&stop.source_url?`<a href="${esc(stop.source_url)}" target="_blank" rel="noopener">${esc(sourceLabel)} ↗</a>`:''}</div>
    </div>
  </article>`;
}
function weatherLabel(code){const n=Number(code);if(n===0)return 'Ochiq';if([1,2,3].includes(n))return 'Bulutli';if([45,48].includes(n))return 'Tuman';if(n>=51&&n<=67)return 'Yomg‘ir';if(n>=71&&n<=77)return 'Qor';if(n>=80&&n<=82)return 'Jala';if(n>=95)return 'Momaqaldiroq';return 'Prognoz'}
function selected(kind,row){return state.selectedServices?.[kind]?.id===row.id}
function serviceItem(row,kind){const distance=Number(row.distance_m||0);const meta=[distance?formatDistance(distance):null,row.cuisine?`oshxona: ${row.cuisine}`:null,row.opening_hours?`ish vaqti: ${row.opening_hours}`:null].filter(Boolean).join(' · ');const chosen=selected(kind,row);const chooseButton=`<button type="button" class="select-service ${chosen?'selected':''}" data-kind="${esc(kind)}" data-id="${esc(row.id)}" data-name="${esc(row.name)}">${chosen?'✓ Tanlangan':'Tanlash'}</button>`;const hotelButton=kind==='hotel'?`<button type="button" class="hotel-start" data-lat="${Number(row.latitude)}" data-lon="${Number(row.longitude)}" data-name="${esc(row.name)}">🏨 Shu yerdan qayta rejalash</button>`:'';return `<div class="service-item ${chosen?'chosen':''}"><strong>${esc(row.name)}</strong>${meta?`<span>${esc(meta)}</span>`:''}${row.phone?`<span>☎ ${esc(row.phone)}</span>`:''}<a href="${esc(row.source_url)}" target="_blank" rel="noopener">Xaritada ko‘rish ↗</a><div class="service-actions">${chooseButton}${hotelButton}</div></div>`}
function servicesBlock(title,emoji,rows,kind){return `<div class="context-card"><h4>${emoji} ${esc(title)}</h4>${rows?.length?`<div class="service-list">${rows.map(r=>serviceItem(r,kind)).join('')}</div>`:'<small>Jonli xarita manbasidan yaqin obyekt topilmadi.</small>'}</div>`}
function budgetBlock(budget){if(!budget)return '';const warning=budget.over_budget_uzs?`<div class="budget-alert">⚠ Reja xarajatlari umumiy budjetdan ${money(budget.over_budget_uzs)} so‘mga oshdi.</div>`:'';return `<div class="context-card wide"><h4>💳 Budjet hisob-kitobi</h4><div class="context-main">${money(budget.total_uzs)} so‘m · ${budget.party_size} kishi</div>${budget.planned_commitments_uzs?`<small>Rejalashtirilgan xarajatlar: ${money(budget.planned_commitments_uzs)} so‘m · qolgan: ${money(budget.remaining_after_planned_uzs)} so‘m</small>`:''}<div class="budget-list">${(budget.allocations||[]).map(a=>`<div class="budget-row"><span>${esc(a.label)}${a.selected_service?` · ${esc(a.selected_service)}`:''}</span><strong>${money(a.amount_uzs)} so‘m</strong><small>${a.calculation==='user-planned-cost'?'Siz kiritgan reja narxi':'Qolgan budjet taqsimoti'}</small></div>`).join('')}</div>${warning}<small>${esc(budget.note||'')}</small></div>`}
function supportBlock(day,daySupport){const w=day?.weather||daySupport?.weather;const risk=w?.risk;const weather=w?`<div class="context-card"><h4>🌦️ ${esc(w.date||day?.date||'Ob-havo')}</h4><div class="context-main">${esc(weatherLabel(w.weather_code))} · ${Number(w.temperature_min_c).toFixed(0)}…${Number(w.temperature_max_c).toFixed(0)}°C</div><small>Yomg‘ir ehtimoli ${Number(w.precipitation_probability_max_pct||0)}% · shamol ${Number(w.wind_speed_max_kmh||0).toFixed(0)} km/soat${risk?.label?` · ${esc(risk.label)}`:''}</small></div>`:'<div class="context-card"><h4>🌦️ Ob-havo</h4><small>Prognoz hozir olinmadi.</small></div>';const adaptive=day?.adaptation_note?`<div class="adaptive-note"><strong>🧭 Marshrut moslashtirildi</strong><span>${esc(day.adaptation_note)}</span></div>`:'';return `${adaptive}<div class="context-grid">${weather}${servicesBlock('Yaqin ovqatlanish','🍽️',daySupport?.restaurants,'restaurant')}${servicesBlock('Yaqin mehmonxona','🏨',daySupport?.hotels,'hotel')}${servicesBlock('Taksi punktlari','🚕',daySupport?.taxi_points,'taxi')}${state.activeDay===0?budgetBlock(state.support?.budget):''}</div>`}
function plannedCosts(){const positive=id=>{const n=Number($(id).value);return Number.isFinite(n)&&n>0?n:null};return {food_per_person_day_uzs:positive('foodPlan'),hotel_nightly_total_uzs:positive('hotelPlan'),transport_daily_total_uzs:positive('transportPlan')}}
function plannerProfile(){const active=(selector,attr)=>document.querySelector(selector)?.dataset?.[attr]||null;const interests=[...document.querySelectorAll('[data-interest].active')].map(x=>x.dataset.interest).filter(Boolean);const budget=Number($('budget')?.value);return {interests,pace:active('[data-pace].active','pace')||'normal',transport:active('[data-transport].active','transport')||'mixed',low_walking:Boolean(document.querySelector('[data-low-walking].active')),wheelchair_accessible:Boolean(document.querySelector('[data-wheelchair].active')),own_vehicle:Boolean(document.querySelector('[data-own-car].active')),children_count:Math.max(0,Number($('childrenCount')?.value)||0),seniors_count:Math.max(0,Number($('seniorCount')?.value)||0),preferred_start_time:$('preferredStartTime')?.value||null,preferred_end_time:$('preferredEndTime')?.value||null,origin_country:$('originCountry')?.value?.trim()||null,budget_uzs:Number.isFinite(budget)&&budget>0?budget:null}}
function supportPayload(data){
  const budget=Number($('budget').value);
  const partySize=Math.min(20,Math.max(1,Number($('partySize').value)||1));
  return {
    party_size:partySize,
    budget_uzs:Number.isFinite(budget)&&budget>0?budget:null,
    start_date:data.trip_start_date||$('startDate').value,
    selected_services:state.selectedServices,
    planned_costs:plannedCosts(),
    profile:data.intent||plannerProfile(),
    days:(data.days||[]).map(day=>({
      day:day.day,title:day.title,weather:day.weather,
      stops:(day.stops||[]).map(x=>({name:x.name,latitude:x.latitude,longitude:x.longitude}))
    }))
  };
}

function serviceCard(row,kind,title){
  if(!row)return '';
  const emoji=kind==='restaurant'?'🍽️':kind==='hotel'?'🏨':'🚕';
  const meta=[
    Number(row.distance_m||0)>0?formatDistance(row.distance_m):null,
    row.cuisine?String(row.cuisine):null,
    row.opening_hours?String(row.opening_hours):null
  ].filter(Boolean).join(' · ');
  const note=row.recommendation_reason==='user-selected'?'Siz tanlagan xizmat':'Marshrutga avtomatik moslashtirilgan';
  return `<article class="integrated-service integrated-${esc(kind)}">
    <div class="integrated-icon">${emoji}</div>
    <div><span class="integrated-kicker">${esc(title)}</span><strong>${esc(row.name)}</strong>
    ${meta?`<small>${esc(meta)}</small>`:''}
    <small>${esc(note)} · OpenStreetMap</small>
    ${row.source_url?`<a href="${esc(row.source_url)}" target="_blank" rel="noopener">Xaritada tekshirish ↗</a>`:''}</div>
  </article>`;
}

function timelineHtml(day,daySupport){
  const stops=Array.isArray(day?.stops)?day.stops:[];
  const rec=daySupport?.recommendations||{};
  const midpoint=Math.max(1,Math.ceil(stops.length/2));
  const first=stops.slice(0,midpoint).map(stopCard).join('');
  const second=stops.slice(midpoint).map(stopCard).join('');
  const lunch=serviceCard(rec.restaurant,'restaurant','Tushlik · yo‘nalish ichida');
  const taxi=serviceCard(rec.taxi,'taxi','Transport varianti');
  const hotel=serviceCard(rec.hotel,'hotel','Kun yakuni uchun yaqin turar joy');
  return `${taxi}<div class="stop-list">${first}${lunch}${second}</div>${hotel}`;
}

async function integrateSupportRoutes(data,support){
  if(!data?.days?.length||!support?.days?.length)return data;
  for(let i=0;i<data.days.length;i+=1){
    const day=data.days[i];
    const rec=support.days?.[i]?.recommendations?.restaurant;
    const baseStops=Array.isArray(day.stops)?day.stops:[];
    if(!rec||baseStops.length<2){
      day.navigation_stops=[...baseStops];
      continue;
    }
    const midpoint=Math.max(1,Math.ceil(baseStops.length/2));
    const mealStop={
      id:rec.id,
      name:`Tushlik · ${rec.name}`,
      latitude:Number(rec.latitude),
      longitude:Number(rec.longitude),
      category:'restaurant',
      kind:'service',
      source:'OpenStreetMap'
    };
    if(!Number.isFinite(mealStop.latitude)||!Number.isFinite(mealStop.longitude)){
      day.navigation_stops=[...baseStops];
      continue;
    }
    const navigation=[...baseStops.slice(0,midpoint),mealStop,...baseStops.slice(midpoint)];
    try{
      const routed=await api('/api/tourism/live/route',{
        method:'POST',
        body:JSON.stringify({
          current:{latitude:data.start.latitude,longitude:data.start.longitude,name:data.start.name||'Boshlanish'},
          stops:navigation.map(x=>({latitude:x.latitude,longitude:x.longitude,name:x.name})),
          transport:data.intent?.transport||'mixed'
        })
      });
      day.navigation_stops=navigation;
      if(routed.route){
        day.route=routed.route;
        day.distance_km=Number(((Number(routed.route.distance_m)||0)/1000).toFixed(1));
        day.transfer_minutes=Number(routed.route.duration_min)||day.transfer_minutes;
        day.integrated_services={restaurant:rec};
      }
    }catch{
      day.navigation_stops=[...baseStops];
    }
  }
  if(data.sources){
    const routing=new Set(data.sources.routing||[]);
    if(data.days.some(d=>d.integrated_services?.restaurant))routing.add('Integrated service route');
    data.sources.routing=[...routing];
  }
  return data;
}
async function refreshSupport(silent=false){
  if(!state.result)return;
  try{
    if(!silent)setMessage('Tanlangan xizmat, marshrut va budjet qayta hisoblanmoqda…');
    const support=await api('/api/tourism/support',{method:'POST',body:JSON.stringify(supportPayload(state.result))});
    await integrateSupportRoutes(state.result,support);
    state.support=support;
    $('intentBadges').innerHTML=intentBadges(state.result.intent,support);
    $('sourceNote').innerHTML=sourceNote();
    renderDetails();
    if(!silent)setMessage('Xizmat tanlovi marshrutga qo‘shildi va budjet yangilandi.');
  }catch(err){
    if(!silent)setMessage(`Qo‘shimcha kontekst xatosi: ${err.message}`,'error');
  }
}
function bindServiceActions(){document.querySelectorAll('.select-service').forEach(btn=>btn.addEventListener('click',async()=>{const kind=btn.dataset.kind;const current=state.selectedServices[kind];if(current?.id===btn.dataset.id)delete state.selectedServices[kind];else state.selectedServices[kind]={id:btn.dataset.id,name:btn.dataset.name,source:'OpenStreetMap'};renderDetails();await refreshSupport()}));document.querySelectorAll('.hotel-start').forEach(btn=>btn.addEventListener('click',()=>{const latitude=Number(btn.dataset.lat);const longitude=Number(btn.dataset.lon);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;state.start={latitude,longitude,name:btn.dataset.name||'Tanlangan mehmonxona'};$('locationLine').textContent=`Boshlanish: 🏨 ${state.start.name}`;toast('Mehmonxona boshlanish nuqtasi qilindi — marshrut qayta optimallashtirilmoqda');setTimeout(()=>$('plannerForm')?.requestSubmit(),250)}))}

function liveDay(){return state.result?.days?.[state.activeDay]||null}
function liveStops(){const day=liveDay();return day?.navigation_stops?.length?day.navigation_stops:(day?.stops||[])}
function nextLiveStop(){return liveStops()[state.live.nextIndex]||null}
function setLiveStatus(text,mode='idle'){$('liveStatus').textContent=text;$('liveDot').className=`live-dot ${mode}`}
function resetLiveUi(){setLiveStatus('GPS tayyor');$('liveNextName').textContent='—';$('liveNextMeta').textContent='Live Tour boshlanganda masofa va ETA chiqadi.';$('liveAccuracy').textContent='—';$('liveDeviation').textContent='—';$('liveTravelled').textContent='0 m';$('startLiveBtn').disabled=false;$('pauseLiveBtn').disabled=true;$('pauseLiveBtn').textContent='⏸ Pauza';$('stopLiveBtn').disabled=true;$('centerLiveBtn').disabled=true;state.live.navSteps=[];state.live.navStepIndex=0;state.live.navAnnounced=new Set();state.live.navFallbackAnnounced=new Set();stopNavAudio();syncNavigatorControls()}
function clearLiveLayers(){const l=state.live;if(l.marker){state.map.removeLayer(l.marker);l.marker=null}if(l.accuracyCircle){state.map.removeLayer(l.accuracyCircle);l.accuracyCircle=null}if(l.trailLayer){state.map.removeLayer(l.trailLayer);l.trailLayer=null}if(l.liveRouteLayer){state.map.removeLayer(l.liveRouteLayer);l.liveRouteLayer=null}}
function stopGpsWatch(){if(state.live.watchId!==null){navigator.geolocation.clearWatch(state.live.watchId);state.live.watchId=null}}
function stopLive(clear=true){stopGpsWatch();stopNavAudio();state.live.active=false;state.live.paused=false;state.live.rerouting=false;if(clear){clearLiveLayers();state.live.nextIndex=0;state.live.trailCoords=[];state.live.travelledM=0;state.live.lastPos=null;state.live.current=null;state.live.routeGeometry=null;resetLiveUi()}else{$('startLiveBtn').disabled=false;$('pauseLiveBtn').disabled=true;$('stopLiveBtn').disabled=true;$('centerLiveBtn').disabled=false}}
function startGpsWatch(){if(!navigator.geolocation){setLiveStatus('GPS mavjud emas','error');toast('Brauzer GPS kuzatuvini qo‘llamaydi');return}stopGpsWatch();state.live.watchId=navigator.geolocation.watchPosition(onLivePosition,onLiveError,{enableHighAccuracy:true,timeout:15000,maximumAge:2500})}
function startLive(targetIndex=null){if(!state.result){toast('Avval marshrut yarating');return}if(!navigator.geolocation){toast('Brauzer geolokatsiyani qo‘llamaydi');return}stopLive(true);if(Number.isInteger(targetIndex)&&targetIndex>=0&&targetIndex<liveStops().length)state.live.nextIndex=targetIndex;stopGuideAudio();state.live.active=true;state.live.follow=true;state.live.routeGeometry=liveDay()?.route?.geometry||null;$('startLiveBtn').disabled=true;$('pauseLiveBtn').disabled=false;$('stopLiveBtn').disabled=false;$('centerLiveBtn').disabled=false;setLiveStatus('GPS ulanmoqda…','active');$('liveNextName').textContent=nextLiveStop()?.name||'—';$('liveNextMeta').textContent='Aniq joylashuv kutilmoqda…';renderNavigationBanner();startGpsWatch();speakNavEvent({event:'start',stop_name:nextLiveStop()?.name||''});toast(targetIndex!==null?'Navigator tanlangan obyektga boshlandi':'Live Tour boshlandi')}
function togglePause(){if(!state.live.active&&state.live.paused){state.live.active=true;state.live.paused=false;$('pauseLiveBtn').textContent='⏸ Pauza';setLiveStatus('Live GPS faol','active');startGpsWatch();return}if(!state.live.active)return;stopGpsWatch();stopNavAudio();state.live.active=false;state.live.paused=true;$('pauseLiveBtn').textContent='▶ Davom ettirish';setLiveStatus('Pauza','paused')}
function finishLiveDay(){stopGpsWatch();state.live.active=false;state.live.paused=false;setLiveStatus('Kun marshruti yakunlandi','done');$('liveNextName').textContent='Barcha nuqtalarga yetib keldingiz';$('liveNextMeta').textContent=`Yurilgan GPS yo‘li: ${formatDistance(state.live.travelledM)}`;$('startLiveBtn').disabled=false;$('pauseLiveBtn').disabled=true;$('stopLiveBtn').disabled=true;toast('Bugungi Live Tour yakunlandi')}
function onLiveError(err){const msg=err.code===1?'GPS ruxsati berilmadi':err.code===2?'Joylashuv aniqlanmadi':'GPS javobi kechikdi';setLiveStatus(msg,'error');$('liveNextMeta').textContent='Brauzer lokatsiya ruxsatini va GPS holatini tekshiring.';toast(msg)}
function project(lat,lon,refLat){const r=6371000,rad=Math.PI/180;return {x:r*lon*rad*Math.cos(refLat*rad),y:r*lat*rad}}
function pointSegmentDistanceM(p,a,b){const ref=(p.lat+a.lat+b.lat)/3,P=project(p.lat,p.lon,ref),A=project(a.lat,a.lon,ref),B=project(b.lat,b.lon,ref),dx=B.x-A.x,dy=B.y-A.y;if(dx===0&&dy===0)return Math.hypot(P.x-A.x,P.y-A.y);const t=Math.max(0,Math.min(1,((P.x-A.x)*dx+(P.y-A.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(P.x-(A.x+t*dx),P.y-(A.y+t*dy))}
function distanceToGeometryM(latitude,longitude,geometry){const coords=geometry?.coordinates;if(geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2)return null;let best=Infinity;for(let i=1;i<coords.length;i++){const a={lat:Number(coords[i-1][1]),lon:Number(coords[i-1][0])},b={lat:Number(coords[i][1]),lon:Number(coords[i][0])};if(![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))continue;best=Math.min(best,pointSegmentDistanceM({lat:latitude,lon:longitude},a,b))}return Number.isFinite(best)?best:null}
function updateLiveLayers(pos){const l=state.live,lat=pos.coords.latitude,lon=pos.coords.longitude,accuracy=Math.max(1,Number(pos.coords.accuracy)||1);if(!l.marker){const icon=L.divIcon({className:'live-user-marker',html:'●',iconSize:[30,30],iconAnchor:[15,15]});l.marker=L.marker([lat,lon],{icon,zIndexOffset:1200}).addTo(state.map).bindPopup('<strong>Siz shu yerdasiz</strong>')}else l.marker.setLatLng([lat,lon]);if(!l.accuracyCircle)l.accuracyCircle=L.circle([lat,lon],{radius:accuracy,weight:1,fillOpacity:.08}).addTo(state.map);else{l.accuracyCircle.setLatLng([lat,lon]);l.accuracyCircle.setRadius(accuracy)}if(!l.trailLayer)l.trailLayer=L.polyline(l.trailCoords,{weight:4,opacity:.7,dashArray:'7 6'}).addTo(state.map);else l.trailLayer.setLatLngs(l.trailCoords);if(l.follow)state.map.panTo([lat,lon],{animate:true,duration:.5})}
async function rerouteFromCurrent(current,forced=false){
  const l=state.live,stops=liveStops().slice(l.nextIndex);
  if(!stops.length||l.rerouting)return;
  const now=Date.now();
  if(!forced&&now-l.lastRerouteAt<30000)return;
  const hadSteps=l.navSteps.length>0;
  l.rerouting=true;l.lastRerouteAt=now;
  setLiveStatus('Yo‘nalish qayta hisoblanmoqda…','reroute');
  try{
    const data=await api('/api/tourism/live/route',{method:'POST',body:JSON.stringify({
      current:{latitude:current.latitude,longitude:current.longitude,name:'Joriy GPS'},
      stops:stops.map(x=>({latitude:x.latitude,longitude:x.longitude,name:x.name})),
      transport:state.result?.intent?.transport||'mixed'
    })});
    l.routeGeometry=data.route?.geometry||l.routeGeometry;
    setNavigationSteps(data.route?.steps||[]);
    if(l.liveRouteLayer){state.map.removeLayer(l.liveRouteLayer);l.liveRouteLayer=null}
    if(l.routeGeometry)l.liveRouteLayer=L.geoJSON(l.routeGeometry,{style:{weight:6,opacity:.85,dashArray:'10 5'}}).addTo(state.map);
    setLiveStatus('Live GPS faol','active');
    if(hadSteps&&!forced)speakNavEvent({event:'reroute'});
    toast(forced?'Joriy joylashuvdan yo‘l hisoblandi':'Marshrutdan chetlandingiz — yo‘l yangilandi');
  }catch(err){
    setLiveStatus('Live GPS faol','active');
    toast('Yo‘lni yangilash imkoni bo‘lmadi: '+err.message);
  }finally{l.rerouting=false}
}
function liveEtaSeconds(distance,pos){const speed=Number(pos.coords.speed);let mps=Number.isFinite(speed)&&speed>0.6?speed:(state.result?.intent?.transport==='walking'?1.25:5.5);return Math.max(60,Math.round(distance/mps))}
function formatEta(seconds){const min=Math.max(1,Math.round(seconds/60));return min<60?`~${min} daqiqa`:`~${Math.floor(min/60)} soat ${min%60} daqiqa`}
async function onLivePosition(pos){
  if(!state.live.active)return;
  const l=state.live,current={latitude:pos.coords.latitude,longitude:pos.coords.longitude};
  l.current=current;
  const accuracy=Math.round(Number(pos.coords.accuracy)||0);
  $('liveAccuracy').textContent=accuracy?'±'+accuracy+' m':'—';
  if(l.lastPos){
    const moved=haversine(l.lastPos.latitude,l.lastPos.longitude,current.latitude,current.longitude);
    if(moved>=3&&moved<500){l.travelledM+=moved;l.trailCoords.push([current.latitude,current.longitude])}
  }else l.trailCoords.push([current.latitude,current.longitude]);
  l.lastPos=current;
  $('liveTravelled').textContent=formatDistance(l.travelledM);
  updateLiveLayers(pos);

  const next=nextLiveStop();
  if(!next){finishLiveDay();return}
  const distance=haversine(current.latitude,current.longitude,Number(next.latitude),Number(next.longitude));
  $('liveNextName').textContent=next.name;
  $('liveNextMeta').textContent=formatDistance(distance)+' · '+formatEta(liveEtaSeconds(distance,pos));
  const deviation=distanceToGeometryM(current.latitude,current.longitude,l.routeGeometry||liveDay()?.route?.geometry);
  $('liveDeviation').textContent=deviation===null?'—':formatDistance(deviation);

  if(l.navSteps.length)maybeSpeakTurn(current,accuracy);
  else{renderNavigationBanner(distance);maybeSpeakFallbackDistance(distance)}

  const arrivalRadius=Math.max(35,Math.min(70,Math.round((accuracy||35)*1.25)));
  if(distance<=arrivalRadius&&accuracy<=100){
    speakNavEvent({event:'arrive',stop_name:next.name});
    toast(next.name+': yetib keldingiz');
    const arrived=next;
    l.nextIndex+=1;
    l.navSteps=[];l.navStepIndex=0;l.navAnnounced=new Set();l.navFallbackAnnounced=new Set();
    const following=nextLiveStop();
    if(!following){
      setTimeout(()=>playAutoGuideForStop(arrived),1400);
      finishLiveDay();
      return;
    }
    $('liveNextName').textContent=following.name;
    $('liveNextMeta').textContent='Keyingi nuqta uchun yo‘l yangilanmoqda…';
    setTimeout(()=>playAutoGuideForStop(arrived),1500);
    await rerouteFromCurrent(current,true);
    if(l.guidanceMode==='full')setTimeout(()=>speakNavEvent({event:'next_stop',stop_name:following.name}),2500);
    return;
  }

  if(!l.liveRouteLayer&&l.trailCoords.length===1){await rerouteFromCurrent(current,true);return}
  if(deviation!==null&&deviation>120&&accuracy<=100){
    if(Date.now()-l.lastOffrouteSpokenAt>45000){
      l.lastOffrouteSpokenAt=Date.now();
      speakNavEvent({event:'offroute'});
    }
    await rerouteFromCurrent(current,false);
  }
}
function centerLive(){const c=state.live.current;if(!c)return;state.live.follow=true;state.map.setView([c.latitude,c.longitude],Math.max(state.map.getZoom(),16),{animate:true})}

function renderDetails(){
  const day=state.result?.days?.[state.activeDay];
  if(!day)return;
  const daySupport=state.support?.days?.[state.activeDay];
  const window=day.preferred_window;
  const windowText=window?.start&&window?.end?` · reja ${esc(window.start)}–${esc(window.end)}`:'';
  const overrun=Number(window?.overrun_minutes||0)>0?`<div class="context-warning">⏱ Tanlangan yakun vaqtiga taxminan ${Number(window.overrun_minutes)} daqiqa sig‘mayapti. Bitta nuqtani qisqartirish yoki vaqtni uzaytirish mumkin.</div>`:'';
  const opt=day.optimization||{};
  const saved=Number(opt.saved_distance_m||0);
  const integrated=day.integrated_services?.restaurant?' · 🍽 tushlik marshrutda':'';
  const optimization=`<div class="route-optimization"><strong>🧭 Yo‘nalish optimallashtirildi</strong><span>Boshlanish: ${esc(opt.origin||state.result?.start?.name||'nuqta')} · ${opt.method==='weather-priority'?'ob-havo ustuvorligi':'eng qisqa ketma-ketlik'}${saved>=100?` · ~${formatDistance(saved)} tejaldi`:''}${integrated}</span></div>`;
  $('dayDetails').innerHTML=`<section class="day-card">
    <div class="day-head"><div><h3>${esc(day.title)}${day.date?` · ${esc(day.date)}`:''}</h3>
    <small>${day.stops.length} ta turistik nuqta${day.weather_adapted?' · ob-havoga moslashtirilgan':''}${windowText}</small></div>
    <small>${Number(day.distance_km||0).toFixed(1)} km · transfer ~${Number(day.transfer_minutes||0)} daqiqa</small></div>
    ${optimization}
    ${timelineHtml(day,daySupport)}
    ${day.meal_break&&!daySupport?.recommendations?.restaurant?`<div class="meal">🍽️ ${esc(day.meal_break)}</div>`:''}
    ${overrun}
    ${supportBlock(day,daySupport)}
  </section>`;
  $('mapDayTitle').textContent=day.date?`${day.title} · ${day.date}`:day.title;
  $('mapDayMeta').textContent=`${day.stops.length} turistik nuqta${day.integrated_services?.restaurant?' + tushlik':''} · ${day.distance_km} km · ${day.route?.profile||'route'}`;
  bindServiceActions();
  renderMap(day,daySupport);
}
function renderMap(day,daySupport){
  if(!state.map)initMap();
  if(state.routeLayer){state.map.removeLayer(state.routeLayer);state.routeLayer=null}
  state.markers.forEach(m=>state.map.removeLayer(m));
  state.supportMarkers.forEach(m=>state.map.removeLayer(m));
  state.markers=[];state.supportMarkers=[];
  const start=state.result.start;
  const startMarker=L.circleMarker([start.latitude,start.longitude],{radius:8,weight:3,fillOpacity:1})
    .addTo(state.map).bindPopup(`<strong>${esc(start.name)}</strong>`);
  state.markers.push(startMarker);
  day.stops.forEach(stop=>{
    const icon=L.divIcon({className:'poi-marker',html:String(stop.order),iconSize:[28,28],iconAnchor:[14,14]});
    const popup=poiPopupHtml(stop);
    const m=L.marker([stop.latitude,stop.longitude],{icon}).addTo(state.map)
      .bindPopup(popup,{maxWidth:390,minWidth:300,className:'tfe-place-popup',autoPanPadding:[18,90]});
    state.markers.push(m);
  });
  const seen=new Set();
  const recommended=daySupport?.recommendations||{};
  [['restaurant','🍽️'],['hotel','🏨'],['taxi','🚕']].forEach(([kind,emoji])=>{
    const row=recommended[kind];
    if(!row||!Number.isFinite(Number(row.latitude))||!Number.isFinite(Number(row.longitude)))return;
    seen.add(row.id);
    const icon=L.divIcon({className:'support-marker selected',html:emoji,iconSize:[31,31],iconAnchor:[15,15]});
    const m=L.marker([row.latitude,row.longitude],{icon}).addTo(state.map)
      .bindPopup(`<strong>${esc(row.name)}</strong><br>Marshrutga mos tavsiya · ${esc(kind)}`);
    state.supportMarkers.push(m);
  });
  const supportKinds=[['restaurants','🍽️','restaurant'],['hotels','🏨','hotel'],['taxi_points','🚕','taxi']];
  supportKinds.forEach(([key,emoji,kind])=>(daySupport?.[key]||[]).slice(0,2).forEach(row=>{
    if(seen.has(row.id))return;
    const chosen=selected(kind,row);
    const icon=L.divIcon({className:`support-marker ${chosen?'selected':''}`,html:chosen?'✓':emoji,iconSize:[29,29],iconAnchor:[14,14]});
    const m=L.marker([row.latitude,row.longitude],{icon}).addTo(state.map)
      .bindPopup(`<strong>${esc(row.name)}</strong><br>${chosen?'Tanlangan xizmat':esc(row.category||'xizmat')}`);
    state.supportMarkers.push(m);
  }));
  if(day.route?.geometry)state.routeLayer=L.geoJSON(day.route.geometry,{style:{weight:5,opacity:.72}}).addTo(state.map);
  const layers=[...state.markers,...state.supportMarkers,...(state.routeLayer?[state.routeLayer]:[])];
  const group=L.featureGroup(layers);
  const b=group.getBounds();
  if(b.isValid()&&!state.live.active&&!state.live.paused)state.map.fitBounds(b.pad(.15));
  setTimeout(()=>state.map.invalidateSize(),50);
}
function sourceNote(){const data=state.result||{};const support=state.support||{};const sourceAI=data.sources?.ai||'Smart parser';const warnings=[...(data.warnings||[]),...(support.warnings||[])];return `<strong>Manbalar:</strong> ${esc(data.sources?.places||'Samarqand reference katalogi')} · routing: ${esc((data.sources?.routing||[]).join(', '))} · optimizatsiya: ${esc((data.sources?.optimization||[]).join(', ')||'—')} · AI: ${esc(sourceAI)} · ob-havo: ${esc(data.sources?.weather||support.sources?.weather||'—')} · ish vaqti/chipta: ${esc(data.sources?.operational||'—')} · xizmatlar: ${esc(support.sources?.services||'—')}<br>${warnings.map(w=>`⚠ ${esc(w)}`).join('<br>')}`}
function switchDay(index){stopGuideAudio();if((state.live.active||state.live.paused)&&index!==state.activeDay){stopLive(true);toast('Live Tour to‘xtatildi: boshqa kun tanlandi')}state.activeDay=index;$('dayTabs').querySelectorAll('.day-tab').forEach((x,i)=>x.classList.toggle('active',i===index));renderDetails()}
function renderResult(data,support){stopLive(true);state.result=data;state.support=support||null;state.activeDay=0;$('resultShell').classList.remove('hidden');$('livePanel').classList.remove('hidden');$('summaryTitle').textContent=`${data.intent.days} kunlik Samarqand marshruti`;$('summaryText').textContent=data.summary;$('intentBadges').innerHTML=intentBadges(data.intent,support||{});$('dayTabs').innerHTML=data.days.map((d,i)=>`<button class="day-tab ${i===0?'active':''}" data-day="${i}">${esc(d.title)}${d.weather_adapted?' 🌦️':''}</button>`).join('');$('dayTabs').querySelectorAll('[data-day]').forEach(btn=>btn.addEventListener('click',()=>switchDay(Number(btn.dataset.day))));$('sourceNote').innerHTML=sourceNote();resetLiveUi();renderDetails();setTimeout(()=>$('resultShell').scrollIntoView({behavior:'smooth',block:'start'}),100)}
async function submit(e){
  e.preventDefault();
  const prompt=$('prompt').value.trim();
  if(prompt.length<4){setMessage('Sayohat istagingizni yozing.','error');return}
  stopLive(true);
  stopGuideAudio();
  state.selectedServices={};
  $('planBtn').disabled=true;
  $('planBtn').textContent='Marshrut tuzilmoqda…';
  setMessage('Sana, ob-havo, tarixiy joylar va yo‘nalish hisoblanmoqda…');
  try{
    const payload={prompt,days:Number($('days').value)||2,start_date:$('startDate').value,weather_adaptive:$('weatherAdaptive').checked,profile:plannerProfile()};
    if(state.start){payload.start_latitude=state.start.latitude;payload.start_longitude=state.start.longitude;payload.start_name=state.start.name}
    const data=await api('/api/tourism/plan',{method:'POST',body:JSON.stringify(payload)});
    setMessage('Asosiy marshrut tayyor. Real restoran, mehmonxona va transport variantlari qo‘shilmoqda…');
    let support=null;
    try{
      support=await api('/api/tourism/support',{method:'POST',body:JSON.stringify(supportPayload(data))});
      await integrateSupportRoutes(data,support);
    }catch(err){
      support={warnings:[`Qo‘shimcha kontekst olinmadi: ${err.message}`],sources:{}};
    }
    renderResult(data,support);
    setMessage(`Tayyor · ${data.sources?.ai||'planner'} · xizmatlar marshrutga integratsiya qilindi · Live GPS`);
  }catch(err){
    setMessage(err.message,'error');
  }finally{
    $('planBtn').disabled=false;
    $('planBtn').textContent='✨ Marshrut yaratish';
  }
}
async function boot(){
  initMap();syncDateRange();resetLiveUi();
  document.addEventListener('click',handleAudioGuideClick);document.addEventListener('click',handlePoiPopupClick);
  $('days').addEventListener('change',syncDateRange);
  $('locateBtn').addEventListener('click',locate);
  $('plannerForm').addEventListener('submit',submit);
  $('startLiveBtn').addEventListener('click',()=>startLive());
  $('pauseLiveBtn').addEventListener('click',togglePause);
  $('stopLiveBtn').addEventListener('click',()=>{stopLive(true);toast('Live Tour tugatildi')});
  $('centerLiveBtn').addEventListener('click',centerLive);
  $('navLanguage')?.addEventListener('change',e=>{
    state.live.voiceLang=e.target.value;
    renderNavigationBanner();
    toast('Navigator tili: '+e.target.options[e.target.selectedIndex].text);
  });
  $('navGuidance')?.addEventListener('change',e=>{
    state.live.guidanceMode=e.target.value;
    stopNavAudio();
    toast(e.target.value==='mute'?'Navigator ovozi o‘chirildi':e.target.value==='full'?'To‘liq ovozli ko‘rsatma':'Muhim ovozli ko‘rsatmalar');
  });
  $('navAutoGuide')?.addEventListener('change',e=>{state.live.autoGuide=e.target.checked});
  state.map.on('dragstart',()=>{if(state.live.active)state.live.follow=false});
  try{
    const status=await api('/api/tourism/status');
    const live=await api('/api/tourism/live/status');
    state.audioEngine=status.professional_audio_configured?'openai-tts':'browser-fallback';
    state.live.professionalVoice=Boolean(live.professional_voice_configured);
    syncNavigatorControls();
    if(state.live.professionalVoice)toast('3 tildagi AI navigator tayyor · GPS '+live.version);
    else if(status.professional_audio_configured)toast('Audio gid tayyor · navigator qurilma ovozida · GPS '+live.version);
    else if(live.version)toast('Tour Planner Live GPS '+live.version+' tayyor · ovoz zaxira rejimida');
  }catch{syncNavigatorControls()}
}
boot();

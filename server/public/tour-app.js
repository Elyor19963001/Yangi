const state={
  map:null,start:null,result:null,support:null,activeDay:0,routeLayer:null,markers:[],supportMarkers:[],selectedServices:{},
  live:{watchId:null,active:false,paused:false,nextIndex:0,marker:null,accuracyCircle:null,trailLayer:null,trailCoords:[],travelledM:0,lastPos:null,liveRouteLayer:null,routeGeometry:null,lastRerouteAt:0,current:null,follow:true,rerouting:false}
};
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
function locate(){if(!navigator.geolocation){toast('Brauzer geolokatsiyani qo‘llamaydi');return}const replan=Boolean(state.result);toast('Joylashuv aniqlanmoqda…');navigator.geolocation.getCurrentPosition(pos=>{state.start={latitude:pos.coords.latitude,longitude:pos.coords.longitude,name:'Mening GPS joylashuvim'};$('locationLine').textContent=`Boshlanish: GPS joylashuvim · ±${Math.round(pos.coords.accuracy||0)} m`;if(replan){toast('GPS olindi — marshrut shu joydan qayta optimallashtirilmoqda');setTimeout(()=>$('plannerForm')?.requestSubmit(),250)}else toast('Joylashuv olindi — marshrut shu nuqtadan boshlanadi')},()=>toast('Joylashuvga ruxsat berilmadi'),{enableHighAccuracy:true,timeout:10000,maximumAge:60000})}
function intentBadges(intent={},support={}){const labels={history:'Tarix',pilgrimage:'Ziyorat',gastronomy:'Gastronomiya',museum:'Muzey',family:'Oilaviy',architecture:'Arxitektura'};const timeWindow=intent.preferred_start_time&&intent.preferred_end_time?`🕘 ${intent.preferred_start_time}–${intent.preferred_end_time}`:intent.preferred_start_time?`🕘 ${intent.preferred_start_time} dan`:null;const rows=[...(intent.interests||[]).map(i=>labels[i]||i),`${intent.days||2} kun`,state.result?.trip_start_date?`📅 ${state.result.trip_start_date}`:null,state.result?.weather_adaptive?'🌦️ Adaptive':null,intent.low_walking?'Kam yurish':null,intent.transport==='taxi'?'Taksi':intent.transport==='walking'?'Piyoda':intent.own_vehicle?'🚗 Shaxsiy avtomobil':'Aralash transport',Number(intent.children_count||0)>0?`👧 ${Number(intent.children_count)} bola`:null,Number(intent.seniors_count||0)>0?`👵 ${Number(intent.seniors_count)} kishi 65+`:null,intent.wheelchair_accessible?'♿ Qulaylik muhim':null,timeWindow,intent.origin_country?`🌍 ${intent.origin_country}`:null,support.party_size?`${support.party_size} sayohatchi`:null,support.budget?.total_uzs?`${money(support.budget.total_uzs)} so‘m budjet`:intent.budget_uzs?`${money(intent.budget_uzs)} so‘m budjet`:null].filter(Boolean);return rows.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}
function stopCard(stop){
  const cat={historic:'Tarixiy obida',museum:'Muzey',pilgrimage:'Ziyorat joyi',attraction:'Turistik obyekt',market:'Bozor',heritage:'Meros obyekt'}[stop.category]||'Turistik nuqta';
  const sourceLabel=stop.source==='OpenStreetMap'?'OpenStreetMap manbasi':'Obyekt manbasi';
  const shelter=Number(stop.weather_resilience||0)>=2?' · ob-havoga nisbatan qulayroq':'';
  const planned=stop.operational?.planned||{};
  const now=stop.operational?.now||{};
  const ticket=stop.operational?.ticket||{};
  const statusClass=planned.status==='open'?'open':planned.status==='closed'?'closed':'unknown';
  const statusIcon=planned.status==='open'?'●':planned.status==='closed'?'●':'◌';
  const visitStatus=planned.label?`<span class="visit-status ${statusClass}">${statusIcon} Rejadagi vaqtda: ${esc(planned.label)}</span>`:'';
  const nowStatus=now.status&&now.status!=='unknown'?`<span class="now-status ${now.status}">Hozir: ${esc(now.label)}</span>`:'';
  const ticketStatus=ticket.label?`<span class="ticket-status">🎟 ${esc(ticket.label)}</span>`:'';
  const official=stop.operational?.website?`<a href="${esc(stop.operational.website)}" target="_blank" rel="noopener">Rasmiy/obyekt sayti ↗</a>`:'';
  const osm=stop.osm_source_url|| (stop.source==='OpenStreetMap'?stop.source_url:null);
  return `<article class="stop ${planned.status==='closed'?'stop-closed':''}">
    <div class="stop-number">${Number(stop.order)}</div>
    <div><strong>${esc(stop.name)}</strong>
      <span>${esc(stop.time_start)}–${esc(stop.time_end)} · ${esc(cat)} · ${Number(stop.visit_minutes||0)} daqiqa${shelter}</span>
      <div class="operational-row">${visitStatus}${nowStatus}${ticketStatus}</div>
      ${stop.opening_hours?`<small>OSM ish vaqti: ${esc(stop.opening_hours)}</small>`:''}
      <div class="stop-links">${official}${osm?`<a href="${esc(osm)}" target="_blank" rel="noopener">OSM metadata ↗</a>`:''}${!osm&&stop.source_url?`<a href="${esc(stop.source_url)}" target="_blank" rel="noopener">${esc(sourceLabel)} ↗</a>`:''}</div>
    </div>
  </article>`}
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
function resetLiveUi(){setLiveStatus('GPS tayyor');$('liveNextName').textContent='—';$('liveNextMeta').textContent='Live Tour boshlanganda masofa va ETA chiqadi.';$('liveAccuracy').textContent='—';$('liveDeviation').textContent='—';$('liveTravelled').textContent='0 m';$('startLiveBtn').disabled=false;$('pauseLiveBtn').disabled=true;$('pauseLiveBtn').textContent='⏸ Pauza';$('stopLiveBtn').disabled=true;$('centerLiveBtn').disabled=true}
function clearLiveLayers(){const l=state.live;if(l.marker){state.map.removeLayer(l.marker);l.marker=null}if(l.accuracyCircle){state.map.removeLayer(l.accuracyCircle);l.accuracyCircle=null}if(l.trailLayer){state.map.removeLayer(l.trailLayer);l.trailLayer=null}if(l.liveRouteLayer){state.map.removeLayer(l.liveRouteLayer);l.liveRouteLayer=null}}
function stopGpsWatch(){if(state.live.watchId!==null){navigator.geolocation.clearWatch(state.live.watchId);state.live.watchId=null}}
function stopLive(clear=true){stopGpsWatch();state.live.active=false;state.live.paused=false;state.live.rerouting=false;if(clear){clearLiveLayers();state.live.nextIndex=0;state.live.trailCoords=[];state.live.travelledM=0;state.live.lastPos=null;state.live.current=null;state.live.routeGeometry=null;resetLiveUi()}else{$('startLiveBtn').disabled=false;$('pauseLiveBtn').disabled=true;$('stopLiveBtn').disabled=true;$('centerLiveBtn').disabled=false}}
function startGpsWatch(){if(!navigator.geolocation){setLiveStatus('GPS mavjud emas','error');toast('Brauzer GPS kuzatuvini qo‘llamaydi');return}stopGpsWatch();state.live.watchId=navigator.geolocation.watchPosition(onLivePosition,onLiveError,{enableHighAccuracy:true,timeout:15000,maximumAge:2500})}
function startLive(){if(!state.result){toast('Avval marshrut yarating');return}if(!navigator.geolocation){toast('Brauzer geolokatsiyani qo‘llamaydi');return}stopLive(true);state.live.active=true;state.live.follow=true;state.live.routeGeometry=liveDay()?.route?.geometry||null;$('startLiveBtn').disabled=true;$('pauseLiveBtn').disabled=false;$('stopLiveBtn').disabled=false;$('centerLiveBtn').disabled=false;setLiveStatus('GPS ulanmoqda…','active');$('liveNextName').textContent=nextLiveStop()?.name||'—';$('liveNextMeta').textContent='Aniq joylashuv kutilmoqda…';startGpsWatch();toast('Live Tour boshlandi')}
function togglePause(){if(!state.live.active&&state.live.paused){state.live.active=true;state.live.paused=false;$('pauseLiveBtn').textContent='⏸ Pauza';setLiveStatus('Live GPS faol','active');startGpsWatch();return}if(!state.live.active)return;stopGpsWatch();state.live.active=false;state.live.paused=true;$('pauseLiveBtn').textContent='▶ Davom ettirish';setLiveStatus('Pauza','paused')}
function finishLiveDay(){stopGpsWatch();state.live.active=false;state.live.paused=false;setLiveStatus('Kun marshruti yakunlandi','done');$('liveNextName').textContent='Barcha nuqtalarga yetib keldingiz';$('liveNextMeta').textContent=`Yurilgan GPS yo‘li: ${formatDistance(state.live.travelledM)}`;$('startLiveBtn').disabled=false;$('pauseLiveBtn').disabled=true;$('stopLiveBtn').disabled=true;toast('Bugungi Live Tour yakunlandi')}
function onLiveError(err){const msg=err.code===1?'GPS ruxsati berilmadi':err.code===2?'Joylashuv aniqlanmadi':'GPS javobi kechikdi';setLiveStatus(msg,'error');$('liveNextMeta').textContent='Brauzer lokatsiya ruxsatini va GPS holatini tekshiring.';toast(msg)}
function project(lat,lon,refLat){const r=6371000,rad=Math.PI/180;return {x:r*lon*rad*Math.cos(refLat*rad),y:r*lat*rad}}
function pointSegmentDistanceM(p,a,b){const ref=(p.lat+a.lat+b.lat)/3,P=project(p.lat,p.lon,ref),A=project(a.lat,a.lon,ref),B=project(b.lat,b.lon,ref),dx=B.x-A.x,dy=B.y-A.y;if(dx===0&&dy===0)return Math.hypot(P.x-A.x,P.y-A.y);const t=Math.max(0,Math.min(1,((P.x-A.x)*dx+(P.y-A.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(P.x-(A.x+t*dx),P.y-(A.y+t*dy))}
function distanceToGeometryM(latitude,longitude,geometry){const coords=geometry?.coordinates;if(geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2)return null;let best=Infinity;for(let i=1;i<coords.length;i++){const a={lat:Number(coords[i-1][1]),lon:Number(coords[i-1][0])},b={lat:Number(coords[i][1]),lon:Number(coords[i][0])};if(![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))continue;best=Math.min(best,pointSegmentDistanceM({lat:latitude,lon:longitude},a,b))}return Number.isFinite(best)?best:null}
function updateLiveLayers(pos){const l=state.live,lat=pos.coords.latitude,lon=pos.coords.longitude,accuracy=Math.max(1,Number(pos.coords.accuracy)||1);if(!l.marker){const icon=L.divIcon({className:'live-user-marker',html:'●',iconSize:[30,30],iconAnchor:[15,15]});l.marker=L.marker([lat,lon],{icon,zIndexOffset:1200}).addTo(state.map).bindPopup('<strong>Siz shu yerdasiz</strong>')}else l.marker.setLatLng([lat,lon]);if(!l.accuracyCircle)l.accuracyCircle=L.circle([lat,lon],{radius:accuracy,weight:1,fillOpacity:.08}).addTo(state.map);else{l.accuracyCircle.setLatLng([lat,lon]);l.accuracyCircle.setRadius(accuracy)}if(!l.trailLayer)l.trailLayer=L.polyline(l.trailCoords,{weight:4,opacity:.7,dashArray:'7 6'}).addTo(state.map);else l.trailLayer.setLatLngs(l.trailCoords);if(l.follow)state.map.panTo([lat,lon],{animate:true,duration:.5})}
async function rerouteFromCurrent(current,forced=false){const l=state.live,stops=liveStops().slice(l.nextIndex);if(!stops.length||l.rerouting)return;const now=Date.now();if(!forced&&now-l.lastRerouteAt<30000)return;l.rerouting=true;l.lastRerouteAt=now;setLiveStatus('Yo‘nalish qayta hisoblanmoqda…','reroute');try{const data=await api('/api/tourism/live/route',{method:'POST',body:JSON.stringify({current:{latitude:current.latitude,longitude:current.longitude,name:'Joriy GPS'},stops:stops.map(s=>({latitude:s.latitude,longitude:s.longitude,name:s.name})),transport:state.result?.intent?.transport||'mixed'})});l.routeGeometry=data.route?.geometry||l.routeGeometry;if(l.liveRouteLayer){state.map.removeLayer(l.liveRouteLayer);l.liveRouteLayer=null}if(l.routeGeometry)l.liveRouteLayer=L.geoJSON(l.routeGeometry,{style:{weight:6,opacity:.85,dashArray:'10 5'}}).addTo(state.map);setLiveStatus('Live GPS faol','active');toast(forced?'Joriy joylashuvdan yo‘l hisoblandi':'Marshrutdan chetlandingiz — yo‘l yangilandi')}catch(err){setLiveStatus('Live GPS faol','active');toast(`Yo‘lni yangilash imkoni bo‘lmadi: ${err.message}`)}finally{l.rerouting=false}}
function liveEtaSeconds(distance,pos){const speed=Number(pos.coords.speed);let mps=Number.isFinite(speed)&&speed>0.6?speed:(state.result?.intent?.transport==='walking'?1.25:5.5);return Math.max(60,Math.round(distance/mps))}
function formatEta(seconds){const min=Math.max(1,Math.round(seconds/60));return min<60?`~${min} daqiqa`:`~${Math.floor(min/60)} soat ${min%60} daqiqa`}
async function onLivePosition(pos){if(!state.live.active)return;const l=state.live,current={latitude:pos.coords.latitude,longitude:pos.coords.longitude};l.current=current;const accuracy=Math.round(Number(pos.coords.accuracy)||0);$('liveAccuracy').textContent=accuracy?`±${accuracy} m`:'—';if(l.lastPos){const step=haversine(l.lastPos.latitude,l.lastPos.longitude,current.latitude,current.longitude);if(step>=3&&step<500){l.travelledM+=step;l.trailCoords.push([current.latitude,current.longitude])}}else l.trailCoords.push([current.latitude,current.longitude]);l.lastPos=current;$('liveTravelled').textContent=formatDistance(l.travelledM);updateLiveLayers(pos);const next=nextLiveStop();if(!next){finishLiveDay();return}const distance=haversine(current.latitude,current.longitude,Number(next.latitude),Number(next.longitude));$('liveNextName').textContent=next.name;$('liveNextMeta').textContent=`${formatDistance(distance)} · ${formatEta(liveEtaSeconds(distance,pos))}`;const deviation=distanceToGeometryM(current.latitude,current.longitude,l.routeGeometry||liveDay()?.route?.geometry);$('liveDeviation').textContent=deviation===null?'—':formatDistance(deviation);const arrivalRadius=Math.max(80,Math.min(100,accuracy||80));if(distance<=arrivalRadius&&accuracy<=120){toast(`${next.name}: yetib keldingiz`);l.nextIndex+=1;const following=nextLiveStop();if(!following){finishLiveDay();return}$('liveNextName').textContent=following.name;$('liveNextMeta').textContent='Keyingi nuqta uchun yo‘l yangilanmoqda…';await rerouteFromCurrent(current,true);return}if(!l.liveRouteLayer&&l.trailCoords.length===1){await rerouteFromCurrent(current,true);return}if(deviation!==null&&deviation>120&&accuracy<=100)await rerouteFromCurrent(current,false)}
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
    const m=L.marker([stop.latitude,stop.longitude],{icon}).addTo(state.map)
      .bindPopup(`<strong>${esc(stop.name)}</strong><br>${esc(stop.time_start)}–${esc(stop.time_end)}`);
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
function switchDay(index){if((state.live.active||state.live.paused)&&index!==state.activeDay){stopLive(true);toast('Live Tour to‘xtatildi: boshqa kun tanlandi')}state.activeDay=index;$('dayTabs').querySelectorAll('.day-tab').forEach((x,i)=>x.classList.toggle('active',i===index));renderDetails()}
function renderResult(data,support){stopLive(true);state.result=data;state.support=support||null;state.activeDay=0;$('resultShell').classList.remove('hidden');$('livePanel').classList.remove('hidden');$('summaryTitle').textContent=`${data.intent.days} kunlik Samarqand marshruti`;$('summaryText').textContent=data.summary;$('intentBadges').innerHTML=intentBadges(data.intent,support||{});$('dayTabs').innerHTML=data.days.map((d,i)=>`<button class="day-tab ${i===0?'active':''}" data-day="${i}">${esc(d.title)}${d.weather_adapted?' 🌦️':''}</button>`).join('');$('dayTabs').querySelectorAll('[data-day]').forEach(btn=>btn.addEventListener('click',()=>switchDay(Number(btn.dataset.day))));$('sourceNote').innerHTML=sourceNote();resetLiveUi();renderDetails();setTimeout(()=>$('resultShell').scrollIntoView({behavior:'smooth',block:'start'}),100)}
async function submit(e){
  e.preventDefault();
  const prompt=$('prompt').value.trim();
  if(prompt.length<4){setMessage('Sayohat istagingizni yozing.','error');return}
  stopLive(true);
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
async function boot(){initMap();syncDateRange();resetLiveUi();$('days').addEventListener('change',syncDateRange);$('locateBtn').addEventListener('click',locate);$('plannerForm').addEventListener('submit',submit);$('startLiveBtn').addEventListener('click',startLive);$('pauseLiveBtn').addEventListener('click',togglePause);$('stopLiveBtn').addEventListener('click',()=>{stopLive(true);toast('Live Tour tugatildi')});$('centerLiveBtn').addEventListener('click',centerLive);state.map.on('dragstart',()=>{if(state.live.active)state.live.follow=false});try{const status=await api('/api/tourism/status');const live=await api('/api/tourism/live/status');if(status.openai_configured)toast(`AI online · ${status.openai_model} · GPS ${live.version}`);else if(live.version)toast(`Tour Planner Live GPS ${live.version} tayyor`)}catch{}}
boot();

(() => {
  const mq=()=>window.matchMedia('(max-width:760px)').matches;
  const get=(id)=>document.getElementById(id);
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}

  function value(id){return get(id)?.value??''}
  function setValue(id,v,event='input'){const el=get(id);if(!el)return;el.value=v;el.dispatchEvent(new Event(event,{bubbles:true}))}
  function syncLocation(){
    const out=qs('[data-mobile-location]');
    const src=get('locationLine');
    if(out&&src)out.textContent=src.textContent.replace(/^Boshlanish:\s*/,'')||'Samarqand markazi';
  }
  function selectedOriginal(selector){return qs(selector)?.classList.contains('active')}

  function build(){
    if(qs('.mobile-ai-planner'))return;
    const card=qs('.planner-card');if(!card)return;
    const section=document.createElement('section');
    section.className='mobile-ai-planner';
    section.innerHTML=`
      <div class="mobile-ai-hero">
        <div class="mobile-ai-hero-top"><span class="mobile-ai-hero-badge">✨ AI TOUR</span><span class="mobile-ai-hero-status" data-mobile-ai-status>Marshrut 1 daqiqadan kam</span></div>
        <h2>Samarqand safaringizni yarating</h2>
        <p>Istagingizni yozing yoki tayyor variantni tanlang. AI kun, budjet, ob-havo va GPS boshlanish nuqtasiga mos reja tuzadi.</p>
      </div>

      <div class="mobile-ai-card">
        <div class="mobile-ai-card-head"><strong>AI’ga nimani xohlashingizni ayting</strong><span>1-qadam</span></div>
        <textarea class="mobile-ai-prompt" maxlength="1500" placeholder="Masalan: 2 kunlik ziyorat turi, ko‘p yurmasin, milliy taomlar ham bo‘lsin."></textarea>
        <div class="mobile-ai-prompt-tools"><small data-prompt-count>0 / 1500</small><button class="mobile-ai-clear" type="button">Tozalash</button></div>
        <div class="mobile-pref-group"><div class="mobile-pref-label">Tez tayyor variant</div>
          <div class="mobile-ai-scroll">
            <button type="button" class="mobile-ai-chip template" data-mobile-template="classic">🏛 Klassik</button>
            <button type="button" class="mobile-ai-chip template" data-mobile-template="pilgrim">🕌 Ziyorat</button>
            <button type="button" class="mobile-ai-chip template" data-mobile-template="family">👨‍👩‍👧 Oila</button>
            <button type="button" class="mobile-ai-chip template" data-mobile-template="first">✨ Birinchi tashrif</button>
          </div>
        </div>
      </div>

      <div class="mobile-ai-card">
        <div class="mobile-ai-card-head"><strong>Safar tafsilotlari</strong><span>2-qadam</span></div>
        <div class="mobile-trip-grid">
          <label class="mobile-trip-field"><span>Sana</span><input type="date" data-mobile-sync="startDate"></label>
          <label class="mobile-trip-field"><span>Davomiyligi</span><select data-mobile-sync="days"><option value="1">1 kun</option><option value="2">2 kun</option><option value="3">3 kun</option><option value="4">4 kun</option><option value="5">5 kun</option></select></label>
          <label class="mobile-trip-field"><span>Sayohatchi</span><input type="number" min="1" max="20" inputmode="numeric" data-mobile-sync="partySize"></label>
          <label class="mobile-trip-field"><span>Budjet</span><input type="number" min="0" step="50000" inputmode="numeric" placeholder="2 000 000" data-mobile-sync="budget"></label>
        </div>

        <div class="mobile-pref-group"><div class="mobile-pref-label">Qiziqish</div>
          <div class="mobile-ai-scroll" data-mobile-group="interest">
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-interest="history"]'>🏛 Tarix</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-interest="pilgrimage"]'>🕌 Ziyorat</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-interest="gastronomy"]'>🍽 Taom</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-interest="museum"]'>🏺 Muzey</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-interest="architecture"]'>✨ Arxitektura</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-interest="family"]'>👨‍👩‍👧 Oila</button>
          </div>
        </div>
        <div class="mobile-pref-group"><div class="mobile-pref-label">Harakat usuli</div>
          <div class="mobile-ai-scroll">
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-transport="mixed"]'>🧭 Aralash</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-transport="walking"]'>🚶 Piyoda</button>
            <button type="button" class="mobile-ai-chip" data-original-selector='[data-transport="taxi"]'>🚕 Taksi</button>
          </div>
        </div>

        <div class="mobile-start-row">
          <div class="mobile-location-card"><span>Boshlanish nuqtasi</span><strong data-mobile-location>Samarqand markazi</strong></div>
          <button type="button" class="mobile-locate-btn" aria-label="GPS joylashuvim" title="GPS joylashuvim">◎</button>
        </div>
        <div class="mobile-weather-row"><div><strong>🌦 Ob-havoga moslashtirish</strong><span>Yomg‘ir, issiq va shamolda tartibni o‘zgartiradi</span></div><label class="mobile-switch"><input type="checkbox" data-mobile-weather><i></i></label></div>

        <details class="mobile-advanced">
          <summary>Qo‘shimcha sozlamalar</summary>
          <div class="mobile-advanced-body">
            <div class="mobile-pref-group"><div class="mobile-pref-label">Sayohat tempi</div><div class="mobile-ai-scroll">
              <button type="button" class="mobile-ai-chip" data-original-selector='[data-pace="relaxed"]'>☕ Xotirjam</button>
              <button type="button" class="mobile-ai-chip" data-original-selector='[data-pace="normal"]'>⚖ Muvozanatli</button>
              <button type="button" class="mobile-ai-chip" data-original-selector='[data-pace="active"]'>⚡ Faol</button>
            </div></div>
            <div class="mobile-pref-group"><div class="mobile-pref-label">Qulaylik</div><div class="mobile-ai-scroll">
              <button type="button" class="mobile-ai-chip" data-original-selector='[data-low-walking]'>🪑 Kam yurish</button>
              <button type="button" class="mobile-ai-chip" data-original-selector='[data-own-car]'>🚗 Avtomobilim bor</button>
              <button type="button" class="mobile-ai-chip" data-original-selector='[data-wheelchair]'>♿ Aravacha</button>
            </div></div>
            <div class="mobile-advanced-grid">
              <label class="wide">Qayerdan kelasiz?<input data-mobile-sync="originCountry" placeholder="Masalan: O‘zbekiston"></label>
              <label>Bolalar<input type="number" min="0" max="10" data-mobile-sync="childrenCount"></label>
              <label>65+ yosh<input type="number" min="0" max="10" data-mobile-sync="seniorCount"></label>
              <label>Boshlash<input type="time" data-mobile-sync="preferredStartTime"></label>
              <label>Yakunlash<input type="time" data-mobile-sync="preferredEndTime"></label>
            </div>
            <div class="mobile-advanced-note">Accessibility ma’lumoti barcha obyektlarda to‘liq emas. Muhim kirish sharoitlarini rasmiy manbada tekshirish kerak.</div>
          </div>
        </details>
      </div>

      <div class="mobile-ai-submit-wrap">
        <button type="button" class="mobile-ai-submit"><span>✨ AI marshrut yaratish</span><small>GPS + ob-havo + budjet + audio gid</small></button>
        <div class="mobile-ai-message" data-mobile-message></div>
      </div>`;
    card.insertAdjacentElement('beforebegin',section);

    const prompt=qs('.mobile-ai-prompt',section);
    prompt.value=value('prompt');
    const count=qs('[data-prompt-count]',section);
    const syncPrompt=()=>{if(get('prompt'))get('prompt').value=prompt.value;count.textContent=`${prompt.value.length} / 1500`};
    prompt.addEventListener('input',syncPrompt);syncPrompt();
    qs('.mobile-ai-clear',section).addEventListener('click',()=>{prompt.value='';syncPrompt();prompt.focus()});

    qsa('[data-mobile-sync]',section).forEach(clone=>{
      const id=clone.dataset.mobileSync, original=get(id);if(!original)return;
      clone.value=original.value;
      const event=clone.tagName==='SELECT'||clone.type==='date'||clone.type==='time'?'change':'input';
      clone.addEventListener(event,()=>{original.value=clone.value;original.dispatchEvent(new Event(event,{bubbles:true}))});
      original.addEventListener(event,()=>{clone.value=original.value});
    });

    const weather=qs('[data-mobile-weather]',section), originalWeather=get('weatherAdaptive');
    if(weather&&originalWeather){weather.checked=originalWeather.checked;weather.addEventListener('change',()=>{originalWeather.checked=weather.checked;originalWeather.dispatchEvent(new Event('change',{bubbles:true}))})}

    const syncChips=()=>qsa('[data-original-selector]',section).forEach(btn=>{const orig=qs(btn.dataset.originalSelector);btn.classList.toggle('active',Boolean(orig?.classList.contains('active')))});
    qsa('[data-original-selector]',section).forEach(btn=>btn.addEventListener('click',()=>{qs(btn.dataset.originalSelector)?.click();setTimeout(syncChips,0)}));
    syncChips();

    qsa('[data-mobile-template]',section).forEach(btn=>btn.addEventListener('click',()=>{
      qs(`.tour-template[data-template="${btn.dataset.mobileTemplate}"]`)?.click();
      setTimeout(()=>{prompt.value=value('prompt');syncPrompt();qsa('[data-mobile-sync]',section).forEach(c=>{const o=get(c.dataset.mobileSync);if(o)c.value=o.value});syncChips()},10);
    }));

    qs('.mobile-locate-btn',section).addEventListener('click',()=>{get('locateBtn')?.click();setTimeout(syncLocation,800)});
    if(get('locationLine'))new MutationObserver(syncLocation).observe(get('locationLine'),{childList:true,subtree:true,characterData:true});syncLocation();

    const submit=qs('.mobile-ai-submit',section), msg=qs('[data-mobile-message]',section), originalSubmit=get('planBtn'), originalMsg=get('message');
    submit.addEventListener('click',()=>{
      syncPrompt();
      document.body.classList.remove('mobile-editing');
      get('plannerForm')?.requestSubmit();
      submit.disabled=true;qs('span',submit).textContent='AI reja tuzyapti…';
    });
    if(originalSubmit)new MutationObserver(()=>{
      submit.disabled=originalSubmit.disabled;
      qs('span',submit).textContent=originalSubmit.disabled?'AI reja tuzyapti…':'✨ AI marshrut yaratish';
    }).observe(originalSubmit,{attributes:true,attributeFilter:['disabled']});
    if(originalMsg)new MutationObserver(()=>{msg.textContent=originalMsg.textContent;msg.classList.toggle('error',originalMsg.classList.contains('error'))}).observe(originalMsg,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

    const status=qs('[data-mobile-ai-status]',section), ai=get('tfeAiStatus');
    if(ai){const update=()=>{status.textContent=ai.textContent||'AI tayyor'};new MutationObserver(update).observe(ai,{childList:true,subtree:true,characterData:true});update()}
  }

  function upgradeNav(){
    const nav=qs('.mobile-tour-nav');if(!nav||qs('[data-mobile-tab="ai"]',nav))return;
    const btn=document.createElement('button');btn.type='button';btn.dataset.mobileTab='ai';btn.innerHTML='<b>✨</b><span>AI</span>';nav.prepend(btn);
    btn.addEventListener('click',e=>{e.stopPropagation();document.body.classList.add('mobile-editing');window.scrollTo({top:0,behavior:'smooth'});qsa('.mobile-tour-nav button').forEach(x=>x.classList.toggle('active',x===btn))});
    const plan=qs('[data-mobile-tab="plan"]',nav);if(plan)plan.querySelector('span').textContent='Reja';
    nav.addEventListener('click',e=>{const tab=e.target.closest('[data-mobile-tab]')?.dataset.mobileTab;if(tab&&tab!=='ai')document.body.classList.remove('mobile-editing')},true);
  }

  function init(){if(!mq())return;build();upgradeNav();setTimeout(upgradeNav,100);window.addEventListener('resize',()=>{if(mq()){build();upgradeNav()}})}
  ready(()=>setTimeout(init,20));
})();
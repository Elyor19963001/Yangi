(() => {
  const $ = (id) => document.getElementById(id);
  const qs = (s,r=document) => r.querySelector(s);
  const qsa = (s,r=document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { answers:{}, additions:[], data:null, busy:false, started:false };

  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
  function fullPrompt(){return [String($('prompt')?.value||'').trim(),...state.additions].filter(Boolean).join('. ');}
  function todayLocal(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);}

  function build(){
    document.querySelectorAll('.feature-grid').forEach((node)=>node.remove());
    const form=$('plannerForm'), hiddenPrompt=$('prompt');
    if(!form||!hiddenPrompt||qs('.ai-copilot-v17'))return;
    hiddenPrompt.required=false;
    hiddenPrompt.value='';
    $('startDate')?.removeAttribute('required');

    const shell=document.createElement('section');
    shell.className='ai-copilot-v17';
    shell.innerHTML=`
      <div class="simple-ai-head">
        <div>
          <span class="simple-ai-kicker">✨ AI TUR YORDAMCHISI</span>
          <h2>Safaringizni oddiy gap bilan ayting</h2>
          <p>Men tushunmagan narsamni bittadan so‘rayman. Forma to‘ldirish shart emas.</p>
        </div>
        <span class="simple-ai-status" data-ai-status>AI tayyorlanmoqda…</span>
      </div>

      <div class="simple-starters" data-starters>
        <button type="button" data-starter="Samarqandga birinchi marta kelyapman. 2 kunlik klassik tur kerak.">✨ Birinchi tashrif</button>
        <button type="button" data-starter="Samarqand ziyoratgohlari bo‘yicha 2 kunlik tur kerak. Ko‘p yurishni xohlamayman.">🕌 Ziyorat</button>
        <button type="button" data-starter="Oila bilan 2 kunlik qulay tur kerak. Bolalar bilan ko‘p yurmasin.">👨‍👩‍👧 Oila</button>
        <button type="button" data-starter="1 kunlik tarixiy tur kerak. Milliy taomlar ham bo‘lsin.">🍽 Tarix + taom</button>
      </div>

      <div class="simple-chat" data-chat>
        <div class="simple-msg assistant">
          <span class="simple-avatar assistant-mascot" aria-hidden="true"><img src="/uzbek-ai-emoji.svg?v=19.1" alt="" /></span>
          <div class="simple-bubble">
            <strong>Qanday sayohat xohlaysiz?</strong>
            <p>Masalan: “2 kunlik ziyorat turi kerak, ko‘p yurmaylik, milliy taomlar ham bo‘lsin.”</p>
          </div>
        </div>
      </div>

      <div class="simple-composer">
        <textarea data-ai-input rows="2" maxlength="500" placeholder="Safaringizni yozing…"></textarea>
        <button type="button" data-ai-send aria-label="Yuborish">➤</button>
      </div>
      <div class="simple-footer">
        <button type="button" class="simple-gps" data-gps-start>◎ GPS boshlanish nuqtasi</button>
        <span data-simple-location>Samarqand markazi</span>
      </div>`;
    hiddenPrompt.insertAdjacentElement('afterend',shell);
    bind(shell);
    checkStatus(shell);
    syncLocation(shell);
  }

  function addMessage(role,title,text,extra=''){
    const chat=qs('[data-chat]');
    if(!chat)return null;
    const row=document.createElement('div');
    row.className='simple-msg '+role;
    row.innerHTML=`
      <span class="simple-avatar ${role==='assistant'?'assistant-mascot':''}">${role==='assistant'?'<img src="/uzbek-ai-emoji.svg?v=19.1" alt="" aria-hidden="true" />':'Siz'}</span>
      <div class="simple-bubble">
        ${title?`<strong>${esc(title)}</strong>`:''}
        ${text?`<p>${esc(text)}</p>`:''}
        ${extra}
      </div>`;
    chat.appendChild(row);
    requestAnimationFrame(()=>{chat.scrollTop=chat.scrollHeight;});
    return row;
  }

  function factChips(data){
    return (data?.facts||[]).map(x=>`<span class="summary-chip">${esc(x.icon)} <b>${esc(x.value)}</b></span>`).join('');
  }

  function renderQuestion(question){
    if(!question)return;
    let controls='';
    if(question.input==='date'){
      const min=todayLocal();
      controls=`<div class="date-answer"><input type="date" min="${min}" value="${min}" data-date-answer><button type="button" data-date-confirm>Tanlash</button></div>`;
    }else{
      controls=`<div class="quick-row">${(question.options||[]).map(o=>`<button type="button" class="quick-answer" data-q-key="${esc(question.key)}" data-q-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`;
    }
    const row=addMessage('assistant','Bitta savol',question.text,`<small class="question-hint">${esc(question.hint||'')}</small>${controls}`);
    if(!row)return;
    qsa('.quick-answer',row).forEach(btn=>btn.addEventListener('click',()=>answerQuick(question,btn.dataset.qValue,btn.textContent.trim())));
    const confirm=qs('[data-date-confirm]',row);
    if(confirm)confirm.addEventListener('click',()=>{
      const value=qs('[data-date-answer]',row)?.value;
      if(!value)return;
      state.answers.start_date=value;
      if($('startDate'))$('startDate').value=value;
      addMessage('user','',value.split('-').reverse().join('.'));
      analyze(false);
    });
  }

  function renderReady(data){
    const summary=`
      <div class="ready-summary">
        <div class="ready-title"><span>✓</span><div><strong>Rejani tushundim</strong><small>Quyidagicha marshrut tuzaman</small></div></div>
        <div class="summary-chips">${factChips(data)}</div>
        <div class="ready-actions">
          <button type="button" class="ready-create" data-ready-create>Marshrutni yaratish <b>→</b></button>
          <button type="button" class="ready-edit" data-ready-edit>Bir narsani o‘zgartiraman</button>
        </div>
      </div>`;
    const row=addMessage('assistant','', '',summary);
    qs('[data-ready-create]',row)?.addEventListener('click',createRoute);
    qs('[data-ready-edit]',row)?.addEventListener('click',()=>{
      const input=qs('[data-ai-input]');
      input.placeholder='Nimani o‘zgartirishni yozing…';
      input.focus();
    });
  }

  function setAnswer(key,value){
    if(key==='days'||key==='party_size')value=Number(value);
    if(key==='transport'&&value==='own_vehicle'){
      state.answers.transport='own_vehicle';
      state.answers.own_vehicle=true;
      return;
    }
    state.answers[key]=value;
  }

  async function answerQuick(question,value,label){
    setAnswer(question.key,value);
    addMessage('user','',label);
    await analyze(false);
  }

  function syncPlanner(data){
    if(!data)return;
    window.tfeAiProfile={...(data.intent||{})};
    if(data.intent?.days&&$('days')){
      $('days').value=String(data.intent.days);
      $('days').dispatchEvent(new Event('change',{bubbles:true}));
    }
    const party=Number(data.party_size||state.answers.party_size||1);
    if($('partySize'))$('partySize').value=String(party);
    const date=data.start_date||state.answers.start_date||todayLocal();
    if($('startDate'))$('startDate').value=date;
    if(Number(data.intent?.budget_uzs)>0&&$('budget'))$('budget').value=String(data.intent.budget_uzs);
  }

  async function analyze(addUser){
    if(state.busy)return;
    const prompt=fullPrompt();
    if(prompt.length<4){
      addMessage('assistant','Yana biroz yozing','Masalan: “2 kunlik tarixiy tur kerak.”');
      return;
    }
    state.busy=true;
    const send=qs('[data-ai-send]');
    if(send)send.disabled=true;
    try{
      const response=await fetch('/api/tourism/clarify',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({prompt,answers:state.answers})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||'AI javobi olinmadi');
      state.data=data;
      syncPlanner(data);
      if(data.ready)renderReady(data);
      else renderQuestion(data.next_question);
    }catch(err){
      addMessage('assistant','Xatolik',err.message||'AI javobi olinmadi.');
    }finally{
      state.busy=false;
      if(send)send.disabled=false;
    }
  }

  function parseFreeAnswer(question,value){
    const v=value.toLowerCase();
    if(!question)return false;
    if(question.key==='days'||question.key==='party_size'){
      const n=Number((value.match(/\d+/)||[])[0]);
      if(Number.isFinite(n)&&n>0){setAnswer(question.key,n);return true;}
    }
    if(question.key==='transport'){
      if(/taksi|taxi|такси/.test(v)){setAnswer('transport','taxi');return true;}
      if(/piyoda|walk|пеш/.test(v)){setAnswer('transport','walking');return true;}
      if(/avtomobil|mashina|car|авто|машин/.test(v)){setAnswer('transport','own_vehicle');return true;}
      if(/aralash|mixed/.test(v)){setAnswer('transport','mixed');return true;}
    }
    if(question.key==='start_date'){
      const iso=value.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
      const local=value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
      let date=null;
      if(iso)date=`${iso[1]}-${String(iso[2]).padStart(2,'0')}-${String(iso[3]).padStart(2,'0')}`;
      if(local)date=`${local[3]}-${String(local[2]).padStart(2,'0')}-${String(local[1]).padStart(2,'0')}`;
      if(date){state.answers.start_date=date;return true;}
    }
    return false;
  }

  function applyNaturalOverrides(value){
    const v=String(value||'').toLowerCase();
    const day=v.match(/\b([1-5])\s*(?:kun|day|days|дн)/i);
    if(day)state.answers.days=Number(day[1]);
    const party=v.match(/\b(\d{1,2})\s*(?:kishi|odam|sayohatchi|person|people|человек)/i);
    if(party)state.answers.party_size=Math.max(1,Math.min(20,Number(party[1])));
    if(/taksi|taxi|такси/.test(v))state.answers.transport='taxi';
    else if(/faqat piyoda|walking only|пешком/.test(v))state.answers.transport='walking';
    else if(/shaxsiy avtomobil|o.?z avtomobil|own car|личн.*авто/.test(v)){state.answers.transport='own_vehicle';state.answers.own_vehicle=true;}
    else if(/aralash|mixed/.test(v))state.answers.transport='mixed';
    const interests=[];
    if(/tarix|histor|истор/.test(v))interests.push('history');
    if(/ziyorat|maqbara|masjid|pilgrim|mosque|мавзол|мечет/.test(v))interests.push('pilgrimage');
    if(/taom|food|restaurant|osh|plov|кухн|еда/.test(v))interests.push('gastronomy');
    if(/muzey|museum|музей/.test(v))interests.push('museum');
    if(/arxitekt|architect|архитект/.test(v))interests.push('architecture');
    if(/oila|bola|family|child|семь|ребен/.test(v))interests.push('family');
    if(interests.length)state.answers.interests=[...new Set(interests)];
  }

  function submitChat(){
    const input=qs('[data-ai-input]');
    const value=String(input?.value||'').trim();
    if(!value)return;
    input.value='';
    addMessage('user','',value);

    if(!state.started){
      state.started=true;
      $('prompt').value=value;
      qs('[data-starters]')?.classList.add('hidden');
      analyze(false);
      return;
    }

    const question=state.data?.next_question;
    applyNaturalOverrides(value);
    if(!parseFreeAnswer(question,value))state.additions.push(value);
    analyze(false);
  }

  function createRoute(){
    if(!state.data?.ready)return;
    syncPlanner(state.data);
    $('prompt').value=fullPrompt();
    const form=$('plannerForm');
    if(!form)return;
    addMessage('assistant','Marshrut tuzilmoqda','Ob-havo, ish vaqti, yo‘l va xizmatlar birga hisoblanmoqda.');
    form.requestSubmit();
    setTimeout(()=>document.getElementById('resultShell')?.scrollIntoView({behavior:'smooth',block:'start'}),500);
  }

  function resetWithStarter(text){
    state.answers={};
    state.additions=[];
    state.data=null;
    state.started=true;
    $('prompt').value=text;
    qs('[data-chat]').innerHTML='';
    addMessage('assistant','Tushundim','Istagingizni tahlil qilyapman.');
    addMessage('user','',text);
    qs('[data-starters]')?.classList.add('hidden');
    analyze(false);
  }

  function syncLocation(shell=document){
    const target=qs('[data-simple-location]',shell);
    const line=$('locationLine')?.textContent||'Boshlanish: Samarqand markazi';
    if(target)target.textContent=line.replace(/^Boshlanish:\s*/,'')||'Samarqand markazi';
  }

  function bind(shell){
    qs('[data-ai-send]',shell)?.addEventListener('click',submitChat);
    qs('[data-ai-input]',shell)?.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitChat();}
    });
    qsa('[data-starter]',shell).forEach(btn=>btn.addEventListener('click',()=>resetWithStarter(btn.dataset.starter||'')));
    qs('[data-gps-start]',shell)?.addEventListener('click',()=>{
      $('locateBtn')?.click();
      setTimeout(()=>syncLocation(shell),800);
    });
    if($('locationLine'))new MutationObserver(()=>syncLocation(shell)).observe($('locationLine'),{childList:true,subtree:true,characterData:true});
  }

  async function checkStatus(shell){
    const node=qs('[data-ai-status]',shell);
    try{
      const r=await fetch('/api/tourism/status',{headers:{Accept:'application/json'}});
      const data=await r.json();
      node.textContent=data.openai_configured?'AI online':'AI yordamchi';
      node.classList.toggle('online',Boolean(data.openai_configured));
    }catch{node.textContent='AI yordamchi';}
  }

  ready(()=>setTimeout(build,40));
})();
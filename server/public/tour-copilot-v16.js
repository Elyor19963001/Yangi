(() => {
  const $ = (id) => document.getElementById(id);
  const qs = (s,r=document) => r.querySelector(s);
  const qsa = (s,r=document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { answers:{}, additions:[], data:null, busy:false, history:[] };

  function ready(fn){ if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }
  function fullPrompt(){ return [String($('prompt')?.value||'').trim(), ...state.additions].filter(Boolean).join('. '); }
  function formatMoney(n){ return new Intl.NumberFormat('uz-UZ').format(Number(n)||0); }

  function build(){
    const form=$('plannerForm'), prompt=$('prompt');
    if(!form||!prompt||qs('.ai-copilot-v16'))return;
    const shell=document.createElement('section');
    shell.className='ai-copilot-v16';
    shell.innerHTML=`
      <div class="copilot-main">
        <div class="copilot-head">
          <div><span class="copilot-kicker">✨ AI SAYOHAT YORDAMCHISI</span><h3>Rejangizni suhbat orqali aniqlashtiramiz</h3><p>Formalarni bittalab tanlash shart emas. Istagingizni yozing — AI tushunganini ko‘rsatadi va faqat yetishmayotgan savollarni beradi.</p></div>
          <span class="copilot-status" data-copilot-status>AI tayyorlanmoqda…</span>
        </div>
        <div class="copilot-starters">
          <button type="button" data-copilot-starter="Samarqandga birinchi marta kelyapman. 2 kunlik klassik tur kerak.">✨ Birinchi tashrif</button>
          <button type="button" data-copilot-starter="Samarqand ziyoratgohlari bo‘yicha 2 kunlik tur kerak. Ko‘p yurishni xohlamayman.">🕌 Ziyorat</button>
          <button type="button" data-copilot-starter="Oila bilan 2 kunlik qulay tur kerak. Bolalar bilan ko‘p yurmasin.">👨‍👩‍👧 Oila</button>
          <button type="button" data-copilot-starter="1 kunlik tarixiy va gastronomik tur kerak. Milliy taomlar ham bo‘lsin.">🍽 Tarix + taom</button>
        </div>
        <div class="copilot-chat" data-copilot-chat>
          <div class="copilot-msg assistant"><span class="avatar">AI</span><div><strong>Safaringizni ayting.</strong><p>Men kun, qiziqish, yurish darajasi va boshqa istaklarni matndan tushunishga harakat qilaman.</p></div></div>
        </div>
        <div class="copilot-question hidden" data-copilot-question></div>
        <div class="copilot-composer">
          <input type="text" data-copilot-reply maxlength="220" placeholder="Javob yozing yoki yuqoridagi variantlardan birini tanlang" />
          <button type="button" data-copilot-send aria-label="Javob yuborish">➤</button>
        </div>
      </div>
      <aside class="copilot-brief">
        <div class="brief-head"><div><span>AI tushungan reja</span><strong data-brief-title>Hali tahlil qilinmagan</strong></div><span class="brief-ready" data-brief-ready>0%</span></div>
        <div class="brief-facts" data-brief-facts><div class="brief-empty">So‘rovingizni tahlil qilganimdan keyin asosiy parametrlar shu yerda ko‘rinadi.</div></div>
        <div class="brief-row">
          <label><span>📅 Safar sanasi</span><input type="date" data-copilot-date></label>
          <label><span>👥 Sayohatchi</span><input type="number" min="1" max="20" inputmode="numeric" data-copilot-party placeholder="—"></label>
        </div>
        <label class="brief-budget"><span>💳 Budjet <small>(ixtiyoriy)</small></span><input type="number" min="0" step="50000" inputmode="numeric" data-copilot-budget placeholder="Masalan: 2 000 000"></label>
        <div class="brief-location"><span>◎ Boshlanish</span><strong data-copilot-location>Samarqand markazi</strong><button type="button" data-copilot-location-btn>GPS</button></div>
        <label class="brief-weather"><input type="checkbox" data-copilot-weather checked><span><strong>🌦 Ob-havoga moslashtirish</strong><small>Yomg‘ir, issiq yoki shamolda marshrut tartibi o‘zgaradi.</small></span></label>
        <button type="button" class="copilot-analyze" data-copilot-analyze>✨ AI tushunsin</button>
        <button type="button" class="copilot-create" data-copilot-create disabled>Marshrut yaratish <span>→</span></button>
        <div class="copilot-note" data-copilot-note>Avval AI so‘rovingizni tahlil qiladi.</div>
      </aside>`;
    prompt.insertAdjacentElement('afterend',shell);
    bind(shell);
    syncStatic(shell);
    checkStatus(shell);
  }

  function syncStatic(shell){
    const date=qs('[data-copilot-date]',shell), originalDate=$('startDate');
    if(date&&originalDate){ date.value=originalDate.value; date.min=originalDate.min; date.max=originalDate.max; }
    const weather=qs('[data-copilot-weather]',shell), originalWeather=$('weatherAdaptive');
    if(weather&&originalWeather)weather.checked=originalWeather.checked;
    const budget=qs('[data-copilot-budget]',shell);
    if(budget&&$('budget'))budget.value=$('budget').value;
    syncLocation(shell);
  }

  function syncLocation(shell=document){
    const node=qs('[data-copilot-location]',shell);
    const line=$('locationLine')?.textContent||'Boshlanish: Samarqand markazi';
    if(node)node.textContent=line.replace(/^Boshlanish:\s*/,'')||'Samarqand markazi';
  }

  function appendMessage(role,title,text){
    const chat=qs('[data-copilot-chat]');
    if(!chat)return;
    const row=document.createElement('div');
    row.className='copilot-msg '+role;
    row.innerHTML=`<span class="avatar">${role==='assistant'?'AI':'Siz'}</span><div>${title?`<strong>${esc(title)}</strong>`:''}<p>${esc(text)}</p></div>`;
    chat.appendChild(row);
    chat.scrollTop=chat.scrollHeight;
  }

  function renderFacts(data){
    const box=qs('[data-brief-facts]');
    if(!box)return;
    const facts=data?.facts||[];
    box.innerHTML=facts.length?facts.map(x=>`<div class="brief-fact"><span>${esc(x.icon)} ${esc(x.label)}</span><strong>${esc(x.value)}</strong></div>`).join(''):'<div class="brief-empty">AI hali parametrlarni aniqlamadi.</div>';
    const title=qs('[data-brief-title]');
    if(title)title.textContent=data?.ready?'Marshrut tayyorlash mumkin':data?.message||'Aniqlashtirilmoqda';
    const remaining=Number(data?.remaining_questions||0);
    const pct=data?.ready?100:Math.max(35,Math.min(90,100-remaining*20));
    const ready=qs('[data-brief-ready]');
    if(ready){ready.textContent=pct+'%';ready.classList.toggle('done',Boolean(data?.ready));}
  }

  function renderQuestion(question){
    const box=qs('[data-copilot-question]');
    if(!box)return;
    if(!question){box.classList.add('hidden');box.innerHTML='';return;}
    const options=(question.options||[]).map(o=>`<button type="button" class="copilot-quick" data-q-key="${esc(question.key)}" data-q-value="${esc(typeof o.value==='object'?JSON.stringify(o.value):o.value)}">${esc(o.label)}</button>`).join('');
    box.innerHTML=`<div class="question-copy"><span>AI savoli</span><strong>${esc(question.text)}</strong><small>${esc(question.hint||'')}</small></div><div class="question-options">${options}</div>`;
    box.classList.remove('hidden');
    qsa('.copilot-quick',box).forEach(btn=>btn.addEventListener('click',()=>answerQuick(question,btn.dataset.qValue,btn.textContent.trim())));
  }

  function setAnswer(key,value){
    if(key==='transport'&&value==='own_vehicle'){state.answers.transport='own_vehicle';state.answers.own_vehicle=true;return;}
    if(key==='interests'){state.answers.interests=Array.isArray(value)?value:[value];return;}
    state.answers[key]=value;
  }

  async function answerQuick(question,value,label){
    let parsed=value;
    if(question.key==='days'||question.key==='party_size')parsed=Number(value);
    setAnswer(question.key,parsed);
    appendMessage('user','',label);
    await analyze(false);
  }

  function syncPlanner(data){
    if(!data)return;
    window.tfeAiProfile={...(data.intent||{})};
    if(data.intent?.days&&$('days')){
      $('days').value=String(data.intent.days);
      $('days').dispatchEvent(new Event('change',{bubbles:true}));
    }
    const party=Number(data.party_size||state.answers.party_size||0);
    if(party&&$('partySize'))$('partySize').value=String(party);
    if(Number(data.intent?.budget_uzs)>0&&$('budget'))$('budget').value=String(data.intent.budget_uzs);
    const p=qs('[data-copilot-party]');if(p&&party)p.value=String(party);
  }

  async function analyze(addUser=true){
    if(state.busy)return;
    const prompt=fullPrompt();
    if(prompt.length<4){appendMessage('assistant','Istagingiz yetarli emas','Kamida bir necha so‘z bilan qanday tur xohlayotganingizni yozing.');return;}
    state.busy=true;
    const analyzeBtn=qs('[data-copilot-analyze]');
    if(analyzeBtn){analyzeBtn.disabled=true;analyzeBtn.textContent='AI tahlil qilmoqda…';}
    if(addUser)appendMessage('user','Safar istagim',String($('prompt').value||'').trim());
    try{
      const response=await fetch('/api/tourism/clarify',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({prompt,answers:state.answers})});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||'AI javobi olinmadi');
      state.data=data;
      syncPlanner(data);
      renderFacts(data);
      renderQuestion(data.next_question);
      const create=qs('[data-copilot-create]');
      if(create)create.disabled=!data.ready;
      const note=qs('[data-copilot-note]');
      if(note)note.textContent=data.ready?'Yetarli ma’lumot olindi. Endi marshrutni yaratishingiz mumkin.':data.message;
      appendMessage('assistant',data.ready?'Tushundim — reja tayyor.':'Yana bir narsani aniqlashtiraylik',data.ready?'Istaklaringizni jamladim. Xohlasangiz hozir marshrutni yarataman.':data.next_question?.text||data.message);
    }catch(err){
      appendMessage('assistant','Xatolik',err.message||'AI tahlili bajarilmadi.');
    }finally{
      state.busy=false;
      if(analyzeBtn){analyzeBtn.disabled=false;analyzeBtn.textContent=state.data?'↻ Qayta tahlil qilish':'✨ AI tushunsin';}
    }
  }

  function freeReply(){
    const input=qs('[data-copilot-reply]');
    const value=String(input?.value||'').trim();
    if(!value)return;
    const q=state.data?.next_question;
    appendMessage('user','',value);
    if(q){
      if(q.key==='days'||q.key==='party_size'){
        const n=Number((value.match(/\d+/)||[])[0]);
        if(Number.isFinite(n)&&n>0)setAnswer(q.key,n);
        else state.additions.push(value);
      }else if(q.key==='transport'){
        const v=value.toLowerCase();
        if(/taksi|taxi|такси/.test(v))setAnswer('transport','taxi');
        else if(/piyoda|walk|пеш/.test(v))setAnswer('transport','walking');
        else if(/avtomobil|mashina|car|авто|машин/.test(v))setAnswer('transport','own_vehicle');
        else state.additions.push(value);
      }else if(q.key==='interests'){
        state.additions.push(value);
      }else state.additions.push(value);
    }else state.additions.push(value);
    input.value='';
    analyze(false);
  }

  function bind(shell){
    qs('[data-copilot-analyze]',shell)?.addEventListener('click',()=>analyze(true));
    qs('[data-copilot-create]',shell)?.addEventListener('click',()=>{
      if(!state.data?.ready)return;
      syncPlanner(state.data);
      $('plannerForm')?.requestSubmit();
    });
    qs('[data-copilot-send]',shell)?.addEventListener('click',freeReply);
    qs('[data-copilot-reply]',shell)?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();freeReply();}});
    qsa('[data-copilot-starter]',shell).forEach(btn=>btn.addEventListener('click',()=>{
      $('prompt').value=btn.dataset.copilotStarter||'';
      state.answers={};state.additions=[];state.data=null;
      analyze(true);
    }));
    qs('[data-copilot-date]',shell)?.addEventListener('change',e=>{
      if($('startDate')){$('startDate').value=e.target.value;$('startDate').dispatchEvent(new Event('change',{bubbles:true}));}
    });
    qs('[data-copilot-party]',shell)?.addEventListener('change',e=>{
      const n=Math.max(1,Math.min(20,Number(e.target.value)||1));
      state.answers.party_size=n;if($('partySize'))$('partySize').value=String(n);
      if(state.data)analyze(false);
    });
    qs('[data-copilot-budget]',shell)?.addEventListener('change',e=>{
      const n=Math.max(0,Number(e.target.value)||0);
      if($('budget'))$('budget').value=n?String(n):'';
      if(n){state.answers.budget_uzs=n;window.tfeAiProfile={...(window.tfeAiProfile||{}),budget_uzs:n};}
      else delete state.answers.budget_uzs;
    });
    qs('[data-copilot-weather]',shell)?.addEventListener('change',e=>{if($('weatherAdaptive'))$('weatherAdaptive').checked=e.target.checked;});
    qs('[data-copilot-location-btn]',shell)?.addEventListener('click',()=>{$('locateBtn')?.click();setTimeout(()=>syncLocation(shell),900);});
    if($('locationLine'))new MutationObserver(()=>syncLocation(shell)).observe($('locationLine'),{childList:true,subtree:true,characterData:true});
    $('prompt')?.addEventListener('input',()=>{
      state.answers={};state.additions=[];state.data=null;
      qs('[data-copilot-create]',shell).disabled=true;
      qs('[data-copilot-note]',shell).textContent='So‘rov o‘zgardi. AI qayta tahlil qilishi kerak.';
      qs('[data-brief-title]',shell).textContent='Qayta tahlil kerak';
      qs('[data-brief-ready]',shell).textContent='0%';
    });
  }

  async function checkStatus(shell){
    const node=qs('[data-copilot-status]',shell);
    try{
      const r=await fetch('/api/tourism/status',{headers:{Accept:'application/json'}});
      const data=await r.json();
      node.textContent=data.openai_configured?'AI online · '+(data.openai_model||'OpenAI'):'AI yordamchi · Smart parser';
      node.classList.toggle('online',Boolean(data.openai_configured));
    }catch{node.textContent='AI yordamchi tayyor';}
  }

  ready(()=>setTimeout(build,30));
})();
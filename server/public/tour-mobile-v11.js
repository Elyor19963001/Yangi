(() => {
  const mobile = () => window.matchMedia('(max-width:760px)').matches;
  const get = (id) => document.getElementById(id);
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}

  function addAdvancedToggle(){
    const box=document.querySelector('.ai-console');
    if(!box||box.querySelector('.mobile-advanced-toggle'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='mobile-advanced-toggle';
    btn.textContent='⚙ Qo‘shimcha sozlamalar';
    const profile=box.querySelector('.traveler-profile');
    if(profile)profile.insertAdjacentElement('beforebegin',btn);else box.appendChild(btn);
    btn.addEventListener('click',()=>{
      const open=box.classList.toggle('mobile-advanced-open');
      btn.textContent=open?'✕ Qo‘shimcha sozlamalarni yopish':'⚙ Qo‘shimcha sozlamalar';
    });
  }

  function ensureBottomNav(){
    let nav=document.querySelector('.mobile-tour-nav');
    if(nav)return nav;
    nav=document.createElement('nav');
    nav.className='mobile-tour-nav hidden';
    nav.setAttribute('aria-label','Mobil sayohat navigatsiyasi');
    nav.innerHTML='<button type="button" data-mobile-tab="plan"><b>☷</b><span>Reja</span></button><button type="button" data-mobile-tab="map"><b>🗺</b><span>Xarita</span></button><button type="button" data-mobile-tab="gps"><b>◎</b><span>GPS</span></button><button type="button" data-mobile-tab="audio"><b>🎧</b><span>Audio</span></button>';
    document.body.appendChild(nav);
    nav.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-mobile-tab]');if(!btn)return;
      nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
      const tab=btn.dataset.mobileTab;
      if(tab==='plan')document.querySelector('.itinerary-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
      if(tab==='map')document.querySelector('.map-panel')?.scrollIntoView({behavior:'smooth',block:'center'});
      if(tab==='gps'){get('livePanel')?.scrollIntoView({behavior:'smooth',block:'center'});if(!document.body.classList.contains('tfe-gps-started')){get('startLiveBtn')?.click();document.body.classList.add('tfe-gps-started')}}
      if(tab==='audio'){const audio=document.querySelector('.itinerary-panel .audio-guide');if(audio)audio.scrollIntoView({behavior:'smooth',block:'center'});else if(typeof toast==='function')toast('Audio gid marshrut yaratilgach chiqadi')}
    });
    return nav;
  }

  function syncResultState(){
    const shell=get('resultShell');
    const nav=ensureBottomNav();
    const visible=Boolean(shell&&!shell.classList.contains('hidden')&&mobile());
    nav?.classList.toggle('hidden',!visible);
    document.body.classList.toggle('mobile-result-ready',visible);
    if(visible)nav?.querySelector('[data-mobile-tab="plan"]')?.classList.add('active');
  }

  function observeResults(){
    const shell=get('resultShell');if(!shell)return;
    const observer=new MutationObserver(()=>{syncResultState();setTimeout(()=>{try{state?.map?.invalidateSize?.()}catch{}},120)});
    observer.observe(shell,{attributes:true,attributeFilter:['class']});
    syncResultState();
  }

  function compactHeader(){
    const brand=document.querySelector('.topbar .brand h1');
    if(brand&&mobile())brand.textContent='Samarqand AI Tour';
  }

  function init(){
    addAdvancedToggle();
    ensureBottomNav();
    observeResults();
    compactHeader();
    window.addEventListener('resize',()=>{syncResultState();compactHeader();try{state?.map?.invalidateSize?.()}catch{}});
  }
  ready(()=>setTimeout(init,0));
})();
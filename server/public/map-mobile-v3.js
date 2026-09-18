(() => {
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
  function init(){
    const panel=document.getElementById('servicesPanel');
    const stage=document.querySelector('.map-stage');
    if(!panel||!stage)return;
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='map-sheet-toggle';toggle.setAttribute('aria-label','Xizmatlar panelini kengaytirish');
    panel.prepend(toggle);
    const nav=document.createElement('div');
    nav.className='map-mobile-nav';
    nav.innerHTML='<a href="/tour.html" aria-label="AI tur">✨</a><button type="button" data-map-mobile-locate aria-label="Mening joylashuvim">◎</button>';
    stage.appendChild(nav);
    const sync=()=>{try{state?.map?.invalidateSize?.()}catch{}};
    toggle.addEventListener('click',()=>{panel.classList.toggle('sheet-expanded');setTimeout(sync,260)});
    let y0=null;
    panel.addEventListener('touchstart',e=>{if(e.touches?.length===1)y0=e.touches[0].clientY},{passive:true});
    panel.addEventListener('touchend',e=>{if(y0===null)return;const y=e.changedTouches?.[0]?.clientY??y0;const delta=y-y0;if(Math.abs(delta)>45){panel.classList.toggle('sheet-expanded',delta<0);setTimeout(sync,260)}y0=null},{passive:true});
    nav.querySelector('[data-map-mobile-locate]').addEventListener('click',()=>document.getElementById('locateBtn')?.click());
    window.addEventListener('resize',sync);
  }
  ready(init);
})();
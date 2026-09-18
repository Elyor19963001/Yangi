(() => {
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
  ready(() => {
    const panel=document.getElementById('servicesPanel');
    const title=panel?.querySelector('.panel-title');
    if(panel && title && !panel.querySelector('.tfe-tour-entry')){
      const link=document.createElement('a');
      link.className='tfe-tour-entry';
      link.href='/tour.html';
      link.innerHTML='<div>✨</div><div><b>AI tur rejalashtirish</b><span>Kun, qiziqish va budjet bo‘yicha marshrut tuzing</span></div><i>→</i>';
      title.insertAdjacentElement('afterend',link);
    }

    const stage=document.querySelector('.map-stage');
    if(!stage || stage.querySelector('.tfe-map-tools')) return;
    const tools=document.createElement('div');
    tools.className='tfe-map-tools';
    tools.innerHTML='<button type="button" title="Mening joylashuvim" aria-label="Mening joylashuvim" data-tfe-locate>◎</button><button type="button" title="Samarqand markazi" aria-label="Samarqand markazi" data-tfe-home>⌂</button><button type="button" title="To‘liq ekran" aria-label="To‘liq ekran" data-tfe-full>⛶</button>';
    stage.appendChild(tools);
    tools.querySelector('[data-tfe-locate]').addEventListener('click',()=>document.getElementById('locateBtn')?.click());
    tools.querySelector('[data-tfe-home]').addEventListener('click',()=>{try{state?.map?.setView([39.6542,66.9597],13,{animate:true});}catch{}});
    tools.querySelector('[data-tfe-full]').addEventListener('click',()=>{
      const opening=!stage.classList.contains('tfe-map-stage-full');
      stage.classList.toggle('tfe-map-stage-full',opening);
      document.body.classList.toggle('tfe-map-open',opening);
      setTimeout(()=>{try{state?.map?.invalidateSize();}catch{}},80);
    });
  });
})();
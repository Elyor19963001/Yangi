(() => {
  'use strict';

  const HORSE_SRC = 'data:image/webp;base64,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';

  function runHorse(button) {
    if (!button) return;
    button.classList.remove('horse-running');
    void button.offsetWidth;
    button.classList.add('horse-running');
    if (button.__horseRunTimer) clearTimeout(button.__horseRunTimer);
    button.__horseRunTimer = setTimeout(() => button.classList.remove('horse-running'), 1150);
  }

  function upgradeHorseCart(root = document) {
    root.querySelectorAll?.('.arava-cart-icon:not([data-horse-v218])').forEach((node) => {
      let img = node;
      if (node.tagName?.toLowerCase() !== 'img') {
        img = document.createElement('img');
        img.className = 'arava-cart-icon arava-real-horse';
        node.replaceWith(img);
      }
      img.src = HORSE_SRC;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.setAttribute('data-horse-v218', 'true');

      const button = img.closest('.arava-send');
      if (button) {
        button.setAttribute('aria-label', 'Yuborish — o‘zbek ot aravasi');
        button.setAttribute('title', 'Ot arava — bosilganda yuguradi');
        if (!button.dataset.horseClickBound218) {
          button.dataset.horseClickBound218 = 'true';
          button.addEventListener('click', () => runHorse(button));
        }
      }
    });
  }

  const start = () => {
    upgradeHorseCart();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('.arava-cart-icon')) upgradeHorseCart(node.parentElement || document);
          else if (node.querySelector?.('.arava-cart-icon')) upgradeHorseCart(node);
        }
      }
    });
    observer.observe(document.body, {childList:true, subtree:true});
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
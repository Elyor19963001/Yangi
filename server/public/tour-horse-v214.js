(() => {
  'use strict';

  const HORSE_INNER = `
    <g class="arava-wagon">
      <path d="M4 17H52L49 38H9L4 17Z" fill="none" stroke="currentColor" stroke-width="3.7" stroke-linejoin="round"/>
      <path d="M9 22H50M10 28H49M11 34H48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 16L5 10M49 16L53 10" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M50 29L82 31M49 35L80 37" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    </g>

    <g class="arava-wheel wheel-one">
      <circle cx="17" cy="48" r="10.5" fill="none" stroke="currentColor" stroke-width="3.2"/>
      <path d="M17 37.5V58.5M6.5 48H27.5M9.5 40.5L24.5 55.5M24.5 40.5L9.5 55.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="17" cy="48" r="2.1" fill="currentColor"/>
    </g>

    <g class="arava-wheel wheel-two">
      <circle cx="43" cy="48" r="10.5" fill="none" stroke="currentColor" stroke-width="3.2"/>
      <path d="M43 37.5V58.5M32.5 48H53.5M35.5 40.5L50.5 55.5M50.5 40.5L35.5 55.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="43" cy="48" r="2.1" fill="currentColor"/>
    </g>

    <g class="arava-horse-body">
      <path d="M80 27
               C86 21 96 19 108 21
               C113 22 117 24 121 25
               C123 20 124 15 127 11
               C130 7 134 6 138 8
               C141 9 142 12 142 14
               C146 14 148 16 148 19
               C148 22 146 24 143 25
               L137 25
               C134 29 132 34 130 38
               C124 39 118 38 113 35
               C107 33 103 32 99 33
               C93 35 87 36 82 34
               C79 33 77 30 80 27Z" fill="currentColor"/>
      <path d="M128 11L127 3L132 9Z" fill="currentColor"/>
      <path d="M135 9L138 2L139 12Z" fill="currentColor"/>
      <path d="M81 29
               C75 27 72 23 69 19
               C72 27 72 34 69 41
               C74 38 78 35 83 33Z" fill="currentColor"/>
      <circle cx="139.5" cy="15.5" r="1.25" fill="#176b4d"/>
      <path d="M144 21.5L147 21.7" fill="none" stroke="#176b4d" stroke-width="1.4" stroke-linecap="round"/>
    </g>

    <g class="arava-horse-leg arava-horse-leg-back">
      <path d="M89 34L87 45L83 58" fill="none" stroke="currentColor" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M98 34L97 46L101 58" fill="none" stroke="currentColor" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <g class="arava-horse-leg arava-horse-leg-front">
      <path d="M117 35L118 46L115 59" fill="none" stroke="currentColor" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M126 36L128 47L133 58" fill="none" stroke="currentColor" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <path class="arava-harness" d="M79 30L128 23M79 37L121 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".95"/>
  `;

  function upgradeHorseCart(root = document) {
    root.querySelectorAll?.('.arava-cart-icon:not([data-horse-v214])').forEach((svg) => {
      svg.setAttribute('viewBox', '0 0 148 66');
      svg.setAttribute('data-horse-v214', 'true');
      svg.innerHTML = HORSE_INNER;
      const button = svg.closest('.arava-send');
      if (button) button.setAttribute('aria-label', 'Yuborish — ot arava');
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
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
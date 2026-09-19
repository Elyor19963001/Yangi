(() => {
  'use strict';

  // v21.6 — clearer horse silhouette + click-to-run animation hook.
  const HORSE_INNER = `
    <g class="arava-wagon">
      <path d="M5 20H58L54 40H10L5 20Z"
            fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M10 25H54M11 32H53"
            fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
      <path d="M9 18L6 11M54 18L59 11"
            fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M54 31L88 33M54 38L86 40"
            fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M18 29l5-4 5 4-5 4zM33 29l5-4 5 4-5 4z"
            fill="none" stroke="currentColor" stroke-width="1.25" opacity=".9"/>
    </g>

    <g class="arava-wheel wheel-one">
      <circle cx="19" cy="51" r="11.5" fill="none" stroke="currentColor" stroke-width="3.4"/>
      <circle cx="19" cy="51" r="2.2" fill="currentColor"/>
      <path d="M19 39.5V62.5M7.5 51H30.5M11 43L27 59M27 43L11 59"
            fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    </g>
    <g class="arava-wheel wheel-two">
      <circle cx="47" cy="51" r="11.5" fill="none" stroke="currentColor" stroke-width="3.4"/>
      <circle cx="47" cy="51" r="2.2" fill="currentColor"/>
      <path d="M47 39.5V62.5M35.5 51H58.5M39 43L55 59M55 43L39 59"
            fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    </g>

    <!-- unmistakable horse body: long muzzle, arched neck, deep chest -->
    <g class="arava-horse-body">
      <path d="
        M88 31
        C97 25 109 23 121 25
        C128 26 134 29 139 31
        C141 24 144 17 149 12
        C153 8 158 7 162 10
        L171 16
        C176 18 179 21 178 25
        C177 29 173 31 168 30
        L160 28
        C157 33 155 38 153 43
        C147 44 141 42 136 39
        C131 36 126 35 121 36
        C112 39 102 41 94 39
        C89 38 85 35 88 31Z"
        fill="currentColor"/>

      <!-- horse ears -->
      <path d="M151 12L150 3L156 10Z" fill="currentColor"/>
      <path d="M159 10L163 2L164 13Z" fill="currentColor"/>

      <!-- flowing mane -->
      <path d="M148 15
               C144 16 141 18 137 18
               C141 21 143 22 139 24
               C143 26 144 28 140 30
               C144 31 145 33 141 35"
            fill="none" stroke="#176b4d" stroke-width="2" stroke-linecap="round"/>

      <!-- flowing horse tail -->
      <path d="
        M91 31
        C84 27 80 22 77 17
        C78 24 75 30 70 35
        C76 33 80 34 82 37
        C78 40 74 44 70 47
        C79 45 86 41 93 36Z"
        fill="currentColor"/>

      <!-- eye, nostril, simple bridle -->
      <circle cx="165" cy="17.5" r="1.3" fill="#176b4d"/>
      <ellipse cx="173" cy="24.5" rx="1.6" ry="1.05" fill="#176b4d"/>
      <path d="M160 12.5C164 18 164 23 161 29M161 26L173 28"
            fill="none" stroke="#176b4d" stroke-width="1.35" stroke-linecap="round"/>
    </g>

    <!-- articulated horse legs -->
    <g class="arava-horse-legs">
      <path class="arava-leg leg-rear-a"
            d="M99 37L97 48L91 56L89 65M89 65H96"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="arava-leg leg-rear-b"
            d="M111 37L112 48L117 55L119 64M118 64H125"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="arava-leg leg-front-a"
            d="M137 39L138 49L133 57L132 65M131 65H138"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="arava-leg leg-front-b"
            d="M149 41L151 51L157 57L160 64M159 64H166"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <path class="arava-harness"
          d="M84 32L160 26M85 40L138 41"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" opacity=".95"/>
  `;

  function runHorse(button) {
    if (!button) return;
    button.classList.remove('horse-running');
    void button.offsetWidth;
    button.classList.add('horse-running');
    if (button.__horseRunTimer) clearTimeout(button.__horseRunTimer);
    button.__horseRunTimer = setTimeout(() => {
      button.classList.remove('horse-running');
    }, 1250);
  }

  function upgradeHorseCart(root = document) {
    root.querySelectorAll?.('.arava-cart-icon:not([data-horse-v216])').forEach((svg) => {
      svg.setAttribute('viewBox', '0 0 182 70');
      svg.setAttribute('data-horse-v216', 'true');
      svg.removeAttribute('data-horse-v215');
      svg.removeAttribute('data-horse-v214');
      svg.innerHTML = HORSE_INNER;

      const button = svg.closest('.arava-send');
      if (button) {
        button.setAttribute('aria-label', 'Yuborish — o‘zbek ot aravasi');
        button.setAttribute('title', 'Ot arava — bosilganda harakatlanadi');
        if (!button.dataset.horseClickBound) {
          button.dataset.horseClickBound = 'true';
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
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
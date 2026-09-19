(() => {
  'use strict';

  // v21.7 — unmistakable horse silhouette: shorter ears, long equine muzzle,
  // arched neck, mane, deep chest, horse tail and distinct hooves.
  const HORSE_INNER = `
    <g class="arava-wagon">
      <path d="M5 20H58L54 40H10L5 20Z"
            fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M10 25H54M11 32H53"
            fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
      <path d="M9 18L6 11M54 18L59 11"
            fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M54 31L87 34M54 38L86 41"
            fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M18 29l5-4 5 4-5 4zM33 29l5-4 5 4-5 4z"
            fill="none" stroke="currentColor" stroke-width="1.2" opacity=".9"/>
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

    <g class="arava-horse-body">
      <!-- body + deep chest -->
      <path d="
        M88 31
        C98 25 112 24 124 27
        C131 29 136 31 141 34
        C144 33 147 31 150 28
        C154 24 156 20 158 16
        C161 11 165 9 169 10
        C173 11 175 14 176 17
        L184 20
        C188 21 190 24 189 27
        C188 30 185 32 181 32
        L173 31
        C169 34 166 38 164 43
        C159 46 153 46 147 43
        C139 39 133 37 126 38
        C117 40 108 42 99 41
        C93 40 88 37 86 34
        C85 33 86 32 88 31Z"
        fill="currentColor"/>

      <!-- compact horse ears: deliberately shorter than donkey ears -->
      <path d="M161 12L161 5L165 11Z" fill="currentColor"/>
      <path d="M168 11L171 5L171 13Z" fill="currentColor"/>

      <!-- flowing mane on the outside of the neck -->
      <path d="
        M158 16
        C153 16 149 18 145 18
        C149 20 150 22 146 23
        C150 25 151 27 147 29
        C151 31 152 33 148 35"
        fill="none" stroke="#176b4d" stroke-width="2" stroke-linecap="round"/>

      <!-- long flowing horse tail -->
      <path d="
        M91 31
        C83 27 80 21 77 17
        C77 25 74 30 69 35
        C75 33 80 34 82 37
        C78 41 74 44 69 47
        C79 46 87 42 94 36Z"
        fill="currentColor"/>

      <!-- eye + nostril -->
      <circle cx="175" cy="18.2" r="1.25" fill="#176b4d"/>
      <ellipse cx="185" cy="26.2" rx="1.6" ry="1" fill="#176b4d"/>

      <!-- simple bridle only on head -->
      <path d="M171 13.5C175 18 176 23 173 31M173 27L185 30"
            fill="none" stroke="#176b4d" stroke-width="1.25" stroke-linecap="round"/>
    </g>

    <!-- four unmistakably equine legs: knee, fetlock, hoof -->
    <g class="arava-horse-legs">
      <path class="arava-leg leg-rear-a"
            d="M99 39L97 49L92 56L90 65M90 65L97 65"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="arava-leg leg-rear-b"
            d="M112 39L113 49L118 56L120 64M120 64L127 64"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="arava-leg leg-front-a"
            d="M145 42L144 51L139 58L138 66M138 66L145 66"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="arava-leg leg-front-b"
            d="M158 43L160 52L165 58L168 65M168 65L175 65"
            fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <!-- harness goes to chest/shoulder, not the muzzle -->
    <path class="arava-harness"
          d="M84 34L151 34M85 41L145 43"
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
    root.querySelectorAll?.('.arava-cart-icon:not([data-horse-v217])').forEach((svg) => {
      svg.setAttribute('viewBox', '0 0 194 72');
      svg.setAttribute('data-horse-v217', 'true');
      svg.removeAttribute('data-horse-v216');
      svg.removeAttribute('data-horse-v215');
      svg.removeAttribute('data-horse-v214');
      svg.innerHTML = HORSE_INNER;

      const button = svg.closest('.arava-send');
      if (button) {
        button.setAttribute('aria-label', 'Yuborish — o‘zbek ot aravasi');
        button.setAttribute('title', 'Ot arava — bosilganda yuguradi');
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
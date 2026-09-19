(() => {
  'use strict';

  // v21.5 — traditional Uzbek arava + unmistakable horse silhouette.
  // Large wooden spoked wheels and a simple geometric cart-side motif evoke
  // the historic Central Asian/Uzbek arava without turning the small UI icon
  // into a detailed illustration.
  const HORSE_INNER = `
    <g class="arava-wagon">
      <!-- traditional wooden arava bed -->
      <path d="M5 18H55L52 38H10L5 18Z"
            fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M9 16L6 9M52 16L56 9"
            fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <!-- slatted / carved side treatment -->
      <path d="M12 23H49M13 30H48"
            fill="none" stroke="#176b4d" stroke-width="2" stroke-linecap="round"/>
      <path d="M18 26L22 22L26 26L22 30ZM30 26L34 22L38 26L34 30ZM42 26L46 22L50 26L46 30Z"
            fill="none" stroke="#176b4d" stroke-width="1.45" stroke-linejoin="round"/>
      <!-- wooden shafts -->
      <path d="M53 29L86 31M52 36L84 38"
            fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
    </g>

    <!-- two large wooden spoked wheels -->
    <g class="arava-wheel wheel-one">
      <circle cx="18" cy="49" r="11.2" fill="none" stroke="currentColor" stroke-width="3.4"/>
      <circle cx="18" cy="49" r="2.2" fill="currentColor"/>
      <path d="M18 38V60M7 49H29M10 41L26 57M26 41L10 57"
            fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    </g>
    <g class="arava-wheel wheel-two">
      <circle cx="45" cy="49" r="11.2" fill="none" stroke="currentColor" stroke-width="3.4"/>
      <circle cx="45" cy="49" r="2.2" fill="currentColor"/>
      <path d="M45 38V60M34 49H56M37 41L53 57M53 41L37 57"
            fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    </g>

    <!-- HORSE: deep chest, arched neck, long equine face, mane, tail -->
    <g class="arava-horse-body">
      <!-- torso + chest + neck + head -->
      <path d="
        M84 27
        C91 21 101 19 112 20
        C120 21 125 23 130 27
        C132 22 134 16 138 11
        C141 7 145 5 149 6
        C153 7 156 10 157 13
        L163 14
        C168 15 171 18 171 21
        C171 25 168 28 164 29
        L156 29
        C152 33 150 39 147 43
        C141 44 135 42 131 39
        C126 36 122 34 117 34
        C110 34 105 37 98 37
        C91 37 86 35 82 32
        C80 30 81 28 84 27Z"
        fill="currentColor"/>

      <!-- distinct horse ears -->
      <path d="M140 10L139 1L145 8Z" fill="currentColor"/>
      <path d="M148 7L152 0L152 11Z" fill="currentColor"/>

      <!-- mane, cut as green notches -->
      <path d="M135 14L139 17L135 19L139 22L134 25L138 28L133 31"
            fill="none" stroke="#176b4d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- long flowing tail -->
      <path d="
        M85 27
        C79 24 75 19 72 14
        C73 21 71 27 67 33
        C72 31 75 31 77 34
        C74 38 71 42 68 45
        C75 43 81 39 86 34Z"
        fill="currentColor"/>

      <!-- eye + nostril in background green -->
      <circle cx="158" cy="17" r="1.35" fill="#176b4d"/>
      <ellipse cx="166" cy="23" rx="1.7" ry="1.05" fill="#176b4d"/>

      <!-- simple bridle -->
      <path d="M153 14C156 19 157 24 155 29M155 25L167 26"
            fill="none" stroke="#176b4d" stroke-width="1.35" stroke-linecap="round"/>
    </g>

    <!-- equine legs with knees, fetlocks and visible hooves -->
    <g class="arava-horse-leg arava-horse-leg-back">
      <path d="M94 34L93 44L89 52L87 60L93 60L96 53L100 45L102 35Z"
            fill="currentColor"/>
      <path d="M106 35L107 45L111 52L112 60L118 60L116 51L114 44L114 34Z"
            fill="currentColor"/>
      <path d="M86 59H94L93 63H85Z M111 59H119L119 63H111Z"
            fill="currentColor"/>
    </g>

    <g class="arava-horse-leg arava-horse-leg-front">
      <path d="M130 37L130 46L126 53L125 61L131 61L133 54L137 47L138 38Z"
            fill="currentColor"/>
      <path d="M142 39L144 48L149 54L151 61L157 61L153 52L151 45L150 40Z"
            fill="currentColor"/>
      <path d="M124 60H132L131 64H123Z M150 60H158L158 64H150Z"
            fill="currentColor"/>
    </g>

    <!-- harness traces from cart to horse -->
    <path class="arava-harness"
          d="M82 30L151 24M83 38L132 39"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" opacity=".96"/>
  `;

  function upgradeHorseCart(root = document) {
    root.querySelectorAll?.('.arava-cart-icon:not([data-horse-v215])').forEach((svg) => {
      svg.setAttribute('viewBox', '0 0 176 68');
      svg.setAttribute('data-horse-v215', 'true');
      svg.removeAttribute('data-horse-v214');
      svg.innerHTML = HORSE_INNER;
      const button = svg.closest('.arava-send');
      if (button) {
        button.setAttribute('aria-label', 'Yuborish — an’anaviy o‘zbek ot aravasi');
        button.setAttribute('title', 'An’anaviy o‘zbek ot aravasi');
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
(() => {
  const labels = {
    uz: {
      home: '← Bosh sahifa', brand: 'Samarqand · sayohat xaritasi', language: 'Til', services: '📍 Xizmatlar xaritasi',
      planEyebrow: 'SAYOHATNI REJALASH', planTitle: 'Samarqandni qanday ko‘rmoqchisiz?',
      planHelp: 'Safaringizni yozing: masalan, “2 kunlik tarixiy tur, kamroq piyoda yurish”. Sana va kishi sonini tanlang, so‘ng xaritadan marshrutni ko‘ring.',
      locate: '⌖ Joylashuvimdan boshlash', create: '✨ Marshrut yaratish', dashboardEyebrow: 'INTERAKTIV SAYOHAT XARITASI',
      startDate: 'Boshlanish sanasi', days: 'Kun', travelers: 'Sayohatchi', budget: 'Umumiy budjet, so‘m', weather: 'Ob-havoga avtomatik moslashtirish', weatherHelp: 'Yomg‘ir, kuchli shamol, issiq yoki sovuq bo‘lsa tashrif tartibi o‘zgaradi.', optionalBudget: 'Ixtiyoriy xarajatlar',
      dashboardTitle: 'Marshrut va obidalar', dashboardHelp: 'Kunni tanlang, xaritadagi manzilni bosing va 3D obidani oching.',
      stepOne: '1 · Kunni tanlang', stepTwo: '2 · Joyni bosing', stepThree: '3 · 3D ni ko‘ring', itinerary: 'SAYOHAT REJASI',
      gpsToggle: '◎ GPS navigatsiya sozlamalari', mapCaption: 'Xaritadan foydalanish',
      mapInstructions: 'Joy belgisini bosing · 3D tugmasi obida modelini xaritaning ichida ochadi',
      '3dButton': '🏛 Xaritada 3D ko‘rish →',
    },
    en: {
      home: '← Home', brand: 'Samarkand · travel map', language: 'Language', services: '📍 Services map',
      planEyebrow: 'PLAN YOUR VISIT', planTitle: 'How would you like to explore Samarkand?',
      planHelp: 'Describe your trip, e.g. “Two days of heritage sites with less walking”. Choose a date and group size, then view your route on the map.',
      locate: '⌖ Start from my location', create: '✨ Create route', dashboardEyebrow: 'INTERACTIVE TRAVEL MAP',
      startDate: 'Start date', days: 'Days', travelers: 'Travelers', budget: 'Total budget · UZS', weather: 'Adjust for weather', weatherHelp: 'The visit order may change in rain, heat or strong wind.', optionalBudget: 'Optional daily costs',
      dashboardTitle: 'Route and landmarks', dashboardHelp: 'Choose a day, select a place on the map and explore its 3D model.',
      stepOne: '1 · Choose a day', stepTwo: '2 · Select a place', stepThree: '3 · Explore in 3D', itinerary: 'YOUR ITINERARY',
      gpsToggle: '◎ GPS navigation settings', mapCaption: 'How to use the map',
      mapInstructions: 'Tap a place marker · Use 3D to see the landmark model on the map',
      '3dButton': '🏛 View in 3D on map →',
    },
    ru: {
      home: '← Главная', brand: 'Самарканд · карта путешествия', language: 'Язык', services: '📍 Карта услуг',
      planEyebrow: 'ПЛАНИРОВАНИЕ ПОЕЗДКИ', planTitle: 'Как вы хотите исследовать Самарканд?',
      planHelp: 'Опишите поездку, например: «Два дня по историческим местам, меньше ходьбы». Выберите дату и число людей, затем откройте маршрут на карте.',
      locate: '⌖ Начать с моего местоположения', create: '✨ Создать маршрут', dashboardEyebrow: 'ИНТЕРАКТИВНАЯ КАРТА',
      startDate: 'Дата начала', days: 'Дней', travelers: 'Путешественники', budget: 'Общий бюджет · UZS', weather: 'Учитывать погоду', weatherHelp: 'Порядок посещения может измениться при дожде, жаре или сильном ветре.', optionalBudget: 'Дополнительные расходы',
      dashboardTitle: 'Маршрут и памятники', dashboardHelp: 'Выберите день, нажмите на место на карте и откройте его 3D-модель.',
      stepOne: '1 · Выберите день', stepTwo: '2 · Выберите место', stepThree: '3 · Откройте 3D', itinerary: 'ПЛАН ПОЕЗДКИ',
      gpsToggle: '◎ Настройки GPS-навигации', mapCaption: 'Как пользоваться картой',
      mapInstructions: 'Нажмите на метку · Кнопка 3D откроет модель памятника прямо на карте',
      '3dButton': '🏛 Посмотреть в 3D на карте →',
    },
  };
  const selector = document.getElementById('dashboardLanguage');
  const gpsToggle = document.getElementById('dashboardGpsToggle');
  const panel = document.getElementById('livePanel');
  const mobileTranslations = {
    en: {
      'Samarqand safaringizni yarating': 'Plan your Samarkand visit',
      'Istagingizni yozing yoki tayyor variantni tanlang. AI kun, budjet, ob-havo va GPS boshlanish nuqtasiga mos reja tuzadi.': 'Describe your trip or choose a suggested plan. Pick your dates and see the route on the map.',
      'AI’ga nimani xohlashingizni ayting': 'Describe your ideal trip', '1-qadam': 'Step 1', '2-qadam': 'Step 2',
      'Tez tayyor variant': 'Suggested routes', 'Safar tafsilotlari': 'Trip details', 'Sana': 'Date', 'Davomiyligi': 'Days',
      'Sayohatchi': 'Travelers', 'Budjet': 'Budget', 'Qiziqish': 'Interests', 'Harakat usuli': 'Transport',
      'Boshlanish nuqtasi': 'Starting point', '🌦 Ob-havoga moslashtirish': '🌦 Adjust for weather',
      'Yomg‘ir, issiq va shamolda tartibni o‘zgartiradi': 'Adapts the route for rain, heat and wind',
      'Qo‘shimcha sozlamalar': 'More options', '✨ AI marshrut yaratish': '✨ Create my route',
      'Tozalash': 'Clear', '🏛 Klassik': '🏛 Classic', '🕌 Ziyorat': '🕌 Pilgrimage',
      '👨‍👩‍👧 Oila': '👨‍👩‍👧 Family', '✨ Birinchi tashrif': '✨ First visit',
      '🏛 Tarix': '🏛 History', '🍽 Taom': '🍽 Food', '🏺 Muzey': '🏺 Museums',
      '✨ Arxitektura': '✨ Architecture', '🧭 Aralash': '🧭 Mixed', '🚶 Piyoda': '🚶 Walk', '🚕 Taksi': '🚕 Taxi',
    },
    ru: {
      'Samarqand safaringizni yarating': 'Спланируйте поездку в Самарканд',
      'Istagingizni yozing yoki tayyor variantni tanlang. AI kun, budjet, ob-havo va GPS boshlanish nuqtasiga mos reja tuzadi.': 'Опишите поездку или выберите готовый вариант. Укажите дату и откройте маршрут на карте.',
      'AI’ga nimani xohlashingizni ayting': 'Опишите желаемую поездку', '1-qadam': 'Шаг 1', '2-qadam': 'Шаг 2',
      'Tez tayyor variant': 'Готовые варианты', 'Safar tafsilotlari': 'Детали поездки', 'Sana': 'Дата', 'Davomiyligi': 'Дней',
      'Sayohatchi': 'Путешественники', 'Budjet': 'Бюджет', 'Qiziqish': 'Интересы', 'Harakat usuli': 'Транспорт',
      'Boshlanish nuqtasi': 'Точка отправления', '🌦 Ob-havoga moslashtirish': '🌦 Учитывать погоду',
      'Yomg‘ir, issiq va shamolda tartibni o‘zgartiradi': 'Меняет маршрут при дожде, жаре и ветре',
      'Qo‘shimcha sozlamalar': 'Дополнительные настройки', '✨ AI marshrut yaratish': '✨ Создать маршрут',
      'Tozalash': 'Очистить', '🏛 Klassik': '🏛 Классика', '🕌 Ziyorat': '🕌 Святыни',
      '👨‍👩‍👧 Oila': '👨‍👩‍👧 Семья', '✨ Birinchi tashrif': '✨ Первый визит',
      '🏛 Tarix': '🏛 История', '🍽 Taom': '🍽 Еда', '🏺 Muzey': '🏺 Музеи',
      '✨ Arxitektura': '✨ Архитектура', '🧭 Aralash': '🧭 Смешанный', '🚶 Piyoda': '🚶 Пешком', '🚕 Taksi': '🚕 Такси',
    },
  };
  const mobileNodes = () => [...document.querySelectorAll('.mobile-ai-planner h2, .mobile-ai-planner p, .mobile-ai-planner strong, .mobile-ai-planner span, .mobile-ai-planner button, .mobile-ai-planner summary, .mobile-ai-planner .mobile-pref-label')]
    .filter((node) => !node.children.length && node.textContent.trim())
    .map((node) => { node.dataset.originalText ||= node.textContent.trim(); return { node, original: node.dataset.originalText }; });
  let current = 'uz';
  const translate = (language) => {
    current = labels[language] ? language : 'uz';
    document.documentElement.lang = current;
    document.body.classList.toggle('dashboard-international', current !== 'uz');
    selector.value = current;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const value = labels[current][el.dataset.i18n];
      if (value) el.textContent = value;
    });
    mobileNodes().forEach(({ node, original }) => { node.textContent = mobileTranslations[current]?.[original] || original; });
    const mobilePrompt = document.querySelector('.mobile-ai-prompt');
    if (mobilePrompt) mobilePrompt.placeholder = current === 'en' ? 'For example: two days of heritage sites and local food.' : current === 'ru' ? 'Например: два дня исторических мест и местная кухня.' : 'Masalan: 2 kunlik ziyorat turi, ko‘p yurmasin, milliy taomlar ham bo‘lsin.';
    document.getElementById('prompt').placeholder = current === 'en' ? 'For example: two days of historical sites, less walking, local food…' : current === 'ru' ? 'Например: два дня исторических мест, меньше ходьбы, местная кухня…' : 'Masalan: 2 kunlik tarixiy tur, kamroq yurish…';
    document.querySelectorAll('#days option').forEach((option) => { option.textContent = option.value + (current === 'en' ? (option.value === '1' ? ' day' : ' days') : current === 'ru' ? (option.value === '1' ? ' день' : option.value === '2' || option.value === '3' || option.value === '4' ? ' дня' : ' дней') : ' kun'); });
    document.querySelectorAll('[data-poi-3d]').forEach((button) => {
      if (current !== 'uz') button.textContent = labels[current]['3dButton'];
    });
    const nav = document.getElementById('navLanguage');
    if (nav && nav.value !== current) {
      nav.value = current;
      nav.dispatchEvent(new Event('change', { bubbles: true }));
    }
    try { localStorage.setItem('qrp_dashboard_language', current); } catch {}
  };
  try { translate(localStorage.getItem('qrp_dashboard_language') || navigator.language?.slice(0, 2) || 'uz'); }
  catch { translate('uz'); }
  selector.addEventListener('change', () => translate(selector.value));
  window.addEventListener('load', () => setTimeout(() => translate(current), 80));
  gpsToggle.addEventListener('click', () => {
    const expanded = gpsToggle.getAttribute('aria-expanded') === 'true';
    gpsToggle.setAttribute('aria-expanded', String(!expanded));
    panel.classList.toggle('dashboard-live-collapsed', expanded);
  });
  // If navigation starts from a place card, reveal the controls automatically.
  document.getElementById('startLiveBtn')?.addEventListener('click', () => {
    gpsToggle.setAttribute('aria-expanded', 'true');
    panel.classList.remove('dashboard-live-collapsed');
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-poi-3d]');
    if (button && current !== 'uz') button.textContent = labels[current]['3dButton'];
  });
  const mapPanel = document.querySelector('.map-panel');
  if (mapPanel) {
    const observer = new MutationObserver((records) => {
      if (current === 'uz') return;
      records.forEach(({ addedNodes }) => addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const buttons = node.matches?.('[data-poi-3d]') ? [node] : node.querySelectorAll?.('[data-poi-3d]');
        buttons?.forEach((button) => { button.textContent = labels[current]['3dButton']; });
      }));
    });
    observer.observe(mapPanel, { childList: true, subtree: true });
  }
})();

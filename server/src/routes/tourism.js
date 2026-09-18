const express = require('express');
const axios = require('axios');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const CENTER = { latitude: 39.6542, longitude: 66.9597, name: 'Samarqand markazi' };
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OSRM_URL = 'https://router.project-osrm.org';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 30 * 60 * 1000;
const poiCache = new Map();

const CURATED_POIS = [
  { id:'wikidata/Q1373583', name:'Registon maydoni', latitude:39.654722, longitude:66.975556, category:'historic', weather_resilience:0, wikidata:'Q1373583', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q1373583' },
  { id:'wikidata/Q1256223', name:'Go‘ri Amir maqbarasi', latitude:39.648333, longitude:66.968889, category:'historic', weather_resilience:2, wikidata:'Q1256223', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q1256223' },
  { id:'wikidata/Q679218', name:'Bibixonim masjidi', latitude:39.660556, longitude:66.979722, category:'pilgrimage', weather_resilience:1, wikidata:'Q679218', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q679218' },
  { id:'wikidata/Q671935', name:'Shohi Zinda majmuasi', latitude:39.662620, longitude:66.987878, category:'pilgrimage', weather_resilience:1, wikidata:'Q671935', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q671935' },
  { id:'unesco/ulugh-beg-observatory', name:'Ulug‘bek rasadxonasi', latitude:39.674722, longitude:67.005556, category:'historic', weather_resilience:1, wikidata:null, source:'UNESCO', source_url:'https://www.unesco.org/en/astronomy-and-world-heritage/ulugh-beg-observatory' },
  { id:'wikidata/Q4306302', name:'Afrosiyob muzeyi', latitude:39.669339, longitude:66.993350, category:'museum', weather_resilience:3, wikidata:'Q4306302', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q4306302' },
  { id:'wikidata/Q13534449', name:'Siyob bozori', latitude:39.661893, longitude:66.979915, category:'market', weather_resilience:0, wikidata:'Q13534449', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q13534449' },
  { id:'wikidata/Q4273779', name:'Ruhobod maqbarasi', latitude:39.650861, longitude:66.968208, category:'historic', weather_resilience:2, wikidata:'Q4273779', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q4273779' },
  { id:'wikidata/Q13201584', name:'Hazrati Xizr masjidi', latitude:39.663453, longitude:66.983256, category:'pilgrimage', weather_resilience:1, wikidata:'Q13201584', source:'Wikidata', source_url:'https://www.wikidata.org/wiki/Q13201584' },
];

const OFFICIAL_POI_CATALOG = [
  {
    id: 'registan',
    id: 'registan',
    match: /registan|registon/i,
    canonical_name: 'Registon ansambli',
    authority: 'Registon Ansambli direksiyasi',
    source_url: 'https://registon.uz/uz/media-center-uz/mass-media-uz/item/252-registon-qaysi-kun-bepul',
    ticket_url: 'https://tickets.registon.uz/',
    checked_on: '2026-09-18',
    hours: {
      type: 'seasonal',
      season: { from: '02-20', to: '11-20', open: '07:00', close: '24:00' },
      off_season: { open: '08:00', close: '20:00' },
      note: 'Direksiya sahifasida dam olish kunlarisiz ishlashi ko‘rsatilgan.',
    },
    tariff: {
      currency: 'UZS',
      rows: [
        { audience: 'O‘zbekiston fuqarosi', fixed: 15000, note: 'Kirish bileti' },
        { audience: 'Xorijiy mehmon', fixed: 100000, note: 'Kirish bileti' },
        { audience: 'Maktab o‘quvchisi', fixed: 10000, note: 'O‘zbekiston maktab o‘quvchilari uchun' },
      ],
      note: 'Narxlar Registon direksiyasining 2025-yil 2-oktabrdagi rasmiy sahifasida e’lon qilingan; xarid oldidan onlayn chipta portalida qayta tekshiring.',
    },
  },
  {
    id: 'gur-amir',
    id: 'gur-amir',
    match: /go.?ri.?amir|gur.?e.?amir|guri.?amir|amir temur maqbarasi/i,
    canonical_name: 'Amir Temur maqbarasi (Go‘ri Amir)',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://samarkandmuseum.uz/uz/muzei-dlya-menyu/mavzolei-amira-temura',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '18:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist. Mahalliy tarifda 20-fevral–20-noyabr mavsum, qolgan davr mavsumdan tashqari.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
  {
    id: 'bibi-khanum',
    id: 'bibi-khanum',
    match: /bibi.?khan|bibi.?xon|bibixonim/i,
    canonical_name: 'Bibixonim masjidi',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://samarkandmuseum.uz/uz/muzei-dlya-menyu/mecet-bibi-xanym',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '18:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
  {
    id: 'ulugbek-observatory',
    id: 'ulugbek-observatory',
    match: /ulugh.?beg.*observ|ulug.?bek.*rasad|observ.*ulug.?bek/i,
    canonical_name: 'Mirzo Ulug‘bek rasadxonasi muzey majmuasi',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://www.samarkandmuseum.uz/muzei-dlya-menyu/memorialnyi-muzei-i-observatoriya-mirzo-ulugbeka',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '17:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
  {
    id: 'afrosiyob-museum',
    id: 'afrosiyob-museum',
    match: /afrasiyab.*museum|museum.*afrasiyab|afrosiyob.*muzey|muzey.*afrosiyob/i,
    canonical_name: 'Samarqand tarixi Afrosiyob muzeyi',
    authority: 'Samarqand davlat muzey-qo‘riqxonasi',
    source_url: 'https://samarkandmuseum.uz/en/muzei-dlya-menyu/museum-of-the-history-of-samarkand-and-the-city-of-afrosiab',
    checked_on: '2026-09-18',
    hours: { type: 'daily', open: '09:00', close: '18:00' },
    tariff: {
      currency: 'UZS',
      seasonal_local: true,
      rows: [
        { audience: 'O‘zbekiston fuqarosi · katta', season: 3000, off_season: 1500 },
        { audience: 'O‘zbekiston fuqarosi · 18 yoshgacha', season: 2000, off_season: 1000 },
        { audience: 'MDH/xorijiy · katta', fixed: 20000 },
        { audience: 'MDH/xorijiy · 18 yoshgacha', fixed: 10000 },
      ],
      note: 'Muzey-qo‘riqxona rasmiy sahifasidagi prayslist.',
      free_note: 'Rasmiy sahifada har oyning birinchi yakshanbasi davlat muzeylariga bepul; 18 yoshgacha bolalar va hamrohlari seshanba/juma kunlari bepul ekani ko‘rsatilgan.',
    },
  },
];

const AUDIO_GUIDES = [
  {
    match: /registan|registon/i,
    short: {
      uz: 'Registon Samarqandning eng mashhur tarixiy maydonlaridan biridir. Majmua Ulug‘bek, Sherdor va Tillakori madrasalaridan tashkil topgan. U Temuriylar va keyingi davr Markaziy Osiyo me’morchiligining yirik timsolidir.',
      en: 'Registan is one of Samarkand’s best-known historic squares. The ensemble consists of the Ulugh Beg, Sher-Dor and Tilla-Kori madrasas. It is a major symbol of Timurid and later Central Asian architecture.',
      ru: 'Регистан — одна из самых известных исторических площадей Самарканда. Ансамбль включает медресе Улугбека, Шердор и Тилля-Кари. Это один из главных символов тимуридской и последующей архитектуры Центральной Азии.',
    },
    detailed: {
      uz: 'Registon Samarqandning markaziy tarixiy maydoni bo‘lib, uning hozirgi ansambli uch yirik madrasa — Ulug‘bek, Sherdor va Tillakori madrasalaridan iborat. Ulug‘bek madrasasi XV asr boshlarida qurilgan va ilm-fan markazi sifatida mashhur bo‘lgan. Sherdor va Tillakori madrasalari esa XVII asrda maydonning me’moriy qiyofasini yakunlagan. Fasadlardagi koshinkor naqshlar, geometrik kompozitsiyalar va yozuvlar Markaziy Osiyo bezak san’atining yuqori darajasini ko‘rsatadi. Registon asrlar davomida shahar hayotining muhim markazi bo‘lib kelgan. Tashrif paytida har bir madrasa fasadini alohida kuzatish va ichki hovlilardagi bezaklarga e’tibor berish tavsiya etiladi.',
      en: 'Registan is the historic central square of Samarkand, and its present ensemble is formed by three major madrasas: Ulugh Beg, Sher-Dor and Tilla-Kori. The Ulugh Beg Madrasa was built in the early fifteenth century and became an important center of learning. Sher-Dor and Tilla-Kori were added in the seventeenth century and completed the square’s monumental composition. The façades display elaborate glazed tiles, geometric patterns and calligraphic decoration that represent some of the finest traditions of Central Asian architecture. For centuries, Registan also served as an important civic center. When visiting, it is worth examining each façade separately and then comparing the different decorative styles inside the courtyards.',
      ru: 'Регистан — историческая центральная площадь Самарканда. Современный ансамбль образуют три крупных медресе: Улугбека, Шердор и Тилля-Кари. Медресе Улугбека было построено в начале XV века и стало важным центром образования. Шердор и Тилля-Кари появились в XVII веке и завершили монументальную композицию площади. Фасады украшены сложной мозаикой, геометрическими орнаментами и каллиграфией, отражающими высокий уровень архитектурного искусства Центральной Азии. На протяжении веков Регистан был важным общественным центром города. Во время посещения стоит отдельно рассмотреть каждый фасад, а затем сравнить оформление внутренних дворов.',
    },
  },
  {
    match: /go.?ri.?amir|gur.?e.?amir|guri.?amir|amir temur maqbarasi/i,
    short: {
      uz: 'Go‘ri Amir — Amir Temur va Temuriylar sulolasi vakillari dafn etilgan mashhur maqbara. U moviy qovurg‘ali gumbazi va nafis ichki bezaklari bilan ajralib turadi.',
      en: 'Gur-e Amir is the famous mausoleum associated with Amir Timur and members of the Timurid dynasty. It is distinguished by its blue ribbed dome and richly decorated interior.',
      ru: 'Гур-Эмир — знаменитый мавзолей, связанный с Амиром Темуром и представителями династии Тимуридов. Он известен голубым ребристым куполом и богато украшенным интерьером.',
    },
    detailed: {
      uz: 'Go‘ri Amir maqbarasi Samarqanddagi eng muhim Temuriylar davri yodgorliklaridan biridir. Majmua dastlab Amir Temurning nabirasi Muhammad Sulton bilan bog‘liq ansambl sifatida shakllangan, keyinchalik esa Temuriylar sulolasining mashhur dafn maskaniga aylangan. Bu yerda Amir Temur, Mirzo Ulug‘bek va sulolaning boshqa vakillari bilan bog‘liq qabrlar mavjud. Maqbaraning baland, qovurg‘ali moviy gumbazi tashqi ko‘rinishning asosiy belgisi hisoblanadi. Ichki qismida zarhal, naqshinkor va yozuvli bezaklar ko‘p uchraydi. Ziyorat paytida sokinlikni saqlash, qabrlar atrofida hurmat bilan harakat qilish va ichki bezaklarni yaqindan kuzatish maqsadga muvofiq.',
      en: 'Gur-e Amir is one of the most important Timurid monuments in Samarkand. The complex originally developed around a foundation associated with Muhammad Sultan, a grandson of Amir Timur, and later became a celebrated dynastic burial place. The site is connected with the tombs of Amir Timur, Mirzo Ulugh Beg and other members of the Timurid family. Its tall ribbed blue dome is the dominant exterior feature, while the interior is richly decorated with gilding, geometric ornament and calligraphy. Visitors should remember that the monument is both a major historical site and a place of reverence. A quiet, respectful visit also gives more time to appreciate the fine decorative details inside the chamber.',
      ru: 'Гур-Эмир — один из важнейших памятников эпохи Тимуридов в Самарканде. Комплекс первоначально формировался вокруг сооружений, связанных с Мухаммадом Султаном, внуком Амира Темура, а позднее стал известным династическим местом погребения. Здесь находятся захоронения, связанные с Амиром Темуром, Мирзо Улугбеком и другими представителями династии. Главная внешняя особенность мавзолея — высокий ребристый голубой купол. В интерьере широко представлены позолота, орнамент и каллиграфия. Посетителям важно помнить, что это не только исторический памятник, но и почитаемое место, поэтому рекомендуется соблюдать тишину и уважительное поведение.',
    },
  },
  {
    match: /bibi.?khan|bibi.?xon|bibixonim/i,
    short: {
      uz: 'Bibixonim masjidi XV asr boshida Amir Temur davrida bunyod etilgan ulkan jome masjididir. U o‘z davrining eng yirik me’moriy loyihalaridan biri bo‘lgan.',
      en: 'Bibi-Khanum Mosque was built at the beginning of the fifteenth century during the reign of Amir Timur. It was one of the most ambitious architectural projects of its time.',
      ru: 'Мечеть Биби-Ханым была возведена в начале XV века при Амире Темуре. Для своего времени это был один из самых масштабных архитектурных проектов.',
    },
    detailed: {
      uz: 'Bibixonim masjidi Amir Temur davrida Samarqandning ulkan jome masjidi sifatida bunyod etilgan. Qurilish XIV asr oxiri va XV asr boshlaridagi Temuriylar me’moriy ambitsiyasini yaqqol namoyon etadi. Majmuada katta peshtoq, keng hovli, gumbazli inshootlar va koshinkor bezaklar muhim o‘rin tutadi. Masjid tarix davomida tabiiy ofatlar va vaqt ta’sirida jiddiy zarar ko‘rgan, keyinchalik katta hajmdagi restavratsiya ishlari amalga oshirilgan. Bugungi kunda u Samarqand siluetining eng taniqli qismlaridan biridir. Tashrifda ulkan peshtoqning masshtabini, gumbazlar nisbatini va bezaklarda ishlatilgan ko‘k ranglar uyg‘unligini kuzatish ayniqsa qiziqarli.',
      en: 'Bibi-Khanum Mosque was commissioned in the era of Amir Timur as a monumental congregational mosque for Samarkand. Its scale reflects the architectural ambitions of the late fourteenth and early fifteenth centuries. The complex is characterized by a vast entrance portal, a large courtyard, domed structures and extensive glazed-tile decoration. Over the centuries, the monument suffered serious damage from time and natural forces, and substantial restoration work was later carried out. Today it remains one of the most recognizable features of Samarkand’s skyline. Visitors can best appreciate the monument by observing the enormous scale of the entrance portal, the relationship between the domes and the courtyard, and the layered use of blue ceramic decoration.',
      ru: 'Мечеть Биби-Ханым была задумана в эпоху Амира Темура как грандиозная соборная мечеть Самарканда. Ее масштаб отражает архитектурные амбиции конца XIV — начала XV века. Комплекс включает огромный входной портал, просторный двор, купольные сооружения и богатую изразцовую отделку. На протяжении веков памятник серьезно пострадал от времени и природных воздействий, а позднее здесь проводились масштабные реставрационные работы. Сегодня мечеть остается одной из самых узнаваемых доминант Самарканда. Особенно интересно обратить внимание на размеры главного портала, соотношение куполов и двора, а также на разнообразие оттенков синей керамики.',
    },
  },
  {
    id: 'shah-i-zinda',
    match: /shah.?i.?zinda|shohi zinda/i,
    short: {
      uz: 'Shohi Zinda — Samarqanddagi mashhur maqbaralar va ziyorat inshootlari majmuasi. Ansambl koshinkor bezaklari bilan mashhur va ziyorat an’analarida Qusam ibn Abbos nomi bilan bog‘lanadi.',
      en: 'Shah-i-Zinda is a celebrated ensemble of mausoleums and pilgrimage structures in Samarkand. It is famous for glazed tile decoration and is associated in pilgrimage tradition with Qutham ibn Abbas.',
      ru: 'Шахи-Зинда — знаменитый ансамбль мавзолеев и паломнических сооружений Самарканда. Он известен изразцовой отделкой и в паломнической традиции связан с Кусамом ибн Аббасом.',
    },
    detailed: {
      uz: 'Shohi Zinda Samarqandning eng muhim ziyorat va me’moriy majmualaridan biridir. Ansambl Afrosiyob hududi yonbag‘rida joylashgan bo‘lib, turli asrlarda barpo etilgan maqbara va diniy inshootlardan tashkil topgan. Majmua ziyorat an’analarida Payg‘ambar Muhammad alayhissalomning amakivachchasi sifatida e’tirof etiladigan Qusam ibn Abbos nomi bilan bog‘lanadi. Shohi Zindaning eng katta badiiy boyligi — sirlangan koshinlar, murakkab geometrik naqshlar, o‘simliksimon bezaklar va yozuvlardir. Inshootlar bir davrda emas, bosqichma-bosqich yaratilgani uchun bezak uslublarini solishtirish mumkin. Bu muqaddas hudud bo‘lgani sababli sokinlik, kamtarona kiyinish va ziyoratchilarga hurmat bilan munosabat tavsiya etiladi.',
      en: 'Shah-i-Zinda is one of Samarkand’s most important pilgrimage and architectural ensembles. Located on the edge of the ancient Afrasiab area, it consists of mausoleums and religious structures built over several centuries. In local Islamic pilgrimage tradition, the site is associated with Qutham ibn Abbas, traditionally regarded as a cousin of the Prophet Muhammad. The artistic richness of Shah-i-Zinda is especially visible in its glazed tiles, complex geometric patterns, floral ornament and calligraphic inscriptions. Because the monuments were created in different periods, visitors can compare changing decorative styles within a single complex. As this is an active sacred and commemorative space, respectful behavior, modest clothing and sensitivity toward worshippers and pilgrims are recommended.',
      ru: 'Шахи-Зинда — один из важнейших паломнических и архитектурных ансамблей Самарканда. Он расположен у древнего Афросиаба и состоит из мавзолеев и религиозных сооружений, построенных в разные века. В исламской паломнической традиции место связано с Кусамом ибн Аббасом, которого традиционно считают двоюродным братом пророка Мухаммада. Главная художественная ценность комплекса — глазурованные изразцы, сложные геометрические узоры, растительный орнамент и каллиграфические надписи. Поскольку памятники создавались в разные периоды, здесь удобно сравнивать развитие декоративных стилей. Это действующее священное и мемориальное пространство, поэтому рекомендуется соблюдать тишину, скромный стиль одежды и уважение к паломникам.',
    },
  },
  {
    match: /ulugh.?beg.*observ|ulug.?bek.*rasad|observ.*ulug.?bek/i,
    short: {
      uz: 'Ulug‘bek rasadxonasi XV asrda olim va hukmdor Mirzo Ulug‘bek tashabbusi bilan barpo etilgan. Bu yer Samarqandning ilm-fan tarixidagi alohida o‘rnini ko‘rsatadi.',
      en: 'Ulugh Beg Observatory was established in the fifteenth century by the scholar and ruler Mirzo Ulugh Beg. The site reflects Samarkand’s exceptional place in the history of science.',
      ru: 'Обсерватория Улугбека была создана в XV веке ученым и правителем Мирзо Улугбеком. Этот памятник показывает особое место Самарканда в истории науки.',
    },
    detailed: {
      uz: 'Mirzo Ulug‘bek rasadxonasi XV asrda Samarqandda astronomik kuzatuvlar olib borish uchun barpo etilgan. Ulug‘bek hukmdor bo‘lish bilan birga matematika va astronomiyaga chuqur qiziqqan olim edi. Rasadxonada juda katta radiusli astronomik o‘lchov asbobining bir qismi yer ostida saqlanib qolgan. Shu ilmiy muhitda yulduzlarning koordinatalari va astronomik kuzatuvlarga asoslangan mashhur jadvallar tuzilgan. Rasadxona keyinchalik vayron bo‘lgan bo‘lsa-da, XX asrdagi arxeologik tadqiqotlar uning asosiy qismlarini aniqlashga yordam berdi. Bugungi muzey va saqlanib qolgan sekstant qismi Samarqandning faqat me’moriy emas, balki yirik ilmiy markaz bo‘lganini ham ko‘rsatadi.',
      en: 'Ulugh Beg Observatory was built in fifteenth-century Samarkand for advanced astronomical observation. Mirzo Ulugh Beg was not only a ruler but also a scholar deeply interested in mathematics and astronomy. Part of the observatory’s enormous measuring instrument survives below ground, demonstrating the scale of the scientific work carried out here. The scholarly circle around Ulugh Beg produced highly important astronomical observations and star tables. Although the observatory was later destroyed, archaeological investigations in the twentieth century revealed key structural remains. Today, the museum and the surviving section of the instrument show that Samarkand was not only a center of monumental architecture, but also one of the major scientific centers of its age.',
      ru: 'Обсерватория Улугбека была построена в Самарканде в XV веке для точных астрономических наблюдений. Мирзо Улугбек был не только правителем, но и ученым, глубоко интересовавшимся математикой и астрономией. Часть огромного измерительного инструмента обсерватории сохранилась под землей и показывает масштаб научной работы, проводившейся здесь. Научный круг Улугбека создал важные астрономические наблюдения и звездные таблицы. Позднее обсерватория была разрушена, однако археологические исследования XX века позволили обнаружить ее основные элементы. Современный музей и сохранившаяся часть инструмента напоминают, что Самарканд был не только архитектурным, но и крупным научным центром.',
    },
  },
  {
    match: /afrasiyab.*museum|museum.*afrasiyab|afrosiyob.*muzey|muzey.*afrosiyob/i,
    short: {
      uz: 'Afrosiyob muzeyi qadimgi Samarqandning arxeologik tarixiga bag‘ishlangan. Muzeyda Afrosiyob shahristonidan topilgan buyumlar va mashhur devoriy suratlar namoyish etiladi.',
      en: 'The Afrosiyob Museum presents the archaeological history of ancient Samarkand. Its collections include finds from Afrasiab and the celebrated wall paintings discovered there.',
      ru: 'Музей Афросиаба посвящен археологической истории древнего Самарканда. Здесь представлены находки с городища Афросиаб и знаменитые настенные росписи.',
    },
    detailed: {
      uz: 'Afrosiyob muzeyi qadimgi Samarqand shahristoni — Afrosiyob yodgorligi hududidan topilgan arxeologik materiallarga bag‘ishlangan. Muzey ekspozitsiyasida sopol buyumlar, tangalar, maishiy topilmalar va qadimgi shahar madaniyatini tushuntiruvchi boshqa ashyolar mavjud. Eng mashhur eksponatlar orasida VII asrga oid Afrosiyob devoriy suratlari alohida o‘rin tutadi. Ular marosimlar, elchilar va saroy hayotiga oid sahnalarni aks ettirib, qadimgi Samarqandning xalqaro aloqalari haqida muhim ma’lumot beradi. Muzeyga tashrif Shohi Zinda va Afrosiyob tepaligi bilan birgalikda rejalashtirilsa, shaharning qadimgi davrdan keyingi tarixiy bosqichlarga o‘tishini yaxshiroq anglash mumkin.',
      en: 'The Afrosiyob Museum is devoted to archaeological material from Afrasiab, the ancient urban site of Samarkand. Its displays include pottery, coins, everyday objects and other finds that help explain the life of the early city. The museum’s most celebrated exhibits are the seventh-century Afrasiab wall paintings. These murals depict ceremonial scenes, envoys and courtly life, providing valuable evidence about ancient Samarkand’s international connections. A visit is especially useful when combined with Shah-i-Zinda and the Afrasiab archaeological landscape, because it helps place later monuments within the much longer history of the city. The museum therefore provides an important historical introduction to Samarkand before the Islamic and Timurid periods.',
      ru: 'Музей Афросиаба посвящен археологическим материалам древнего городища Самарканда — Афросиаба. В экспозиции представлены керамика, монеты, предметы быта и другие находки, раскрывающие жизнь раннего города. Самые знаменитые экспонаты — настенные росписи VII века. На них изображены церемониальные сцены, послы и придворная жизнь, что дает важные сведения о международных связях древнего Самарканда. Посещение особенно полезно сочетать с Шахи-Зиндой и археологической территорией Афросиаба: так легче увидеть, как развивался город от древности к более поздним историческим эпохам.',
    },
  },
  {
    id: 'siyob-bazaar',
    match: /siyob|siab/i,
    short: {
      uz: 'Siyob bozori Samarqandning mashhur an’anaviy bozorlaridan biridir. Bu yerda non, meva, ziravorlar, shirinliklar va boshqa mahalliy mahsulotlarni ko‘rish mumkin.',
      en: 'Siyob Bazaar is one of Samarkand’s best-known traditional markets. Visitors can find bread, fruit, spices, sweets and many other local products here.',
      ru: 'Сиабский базар — один из самых известных традиционных рынков Самарканда. Здесь можно увидеть хлеб, фрукты, специи, сладости и другие местные продукты.',
    },
    detailed: {
      uz: 'Siyob bozori Bibixonim masjidi yaqinida joylashgan va Samarqandning kundalik savdo hayotini ko‘rish uchun eng qulay joylardan biridir. Bozorda Samarqand noni, yangi va quritilgan mevalar, yong‘oq, ziravorlar, shirinliklar va boshqa mahalliy mahsulotlar sotiladi. Bu yer sayyoh uchun faqat xarid qilish joyi emas, balki mahalliy oziq-ovqat madaniyati va kundalik muloqotni kuzatish imkonini ham beradi. Narxlar mahsulot va mavsumga qarab farq qilishi mumkin. Tashrifni ertaroq vaqtda amalga oshirish ko‘pincha qulayroq bo‘ladi, chunki bozor faolroq va mahsulot tanlovi kengroq bo‘lishi mumkin.',
      en: 'Siyob Bazaar is located close to Bibi-Khanum Mosque and is one of the best places to observe everyday commercial life in Samarkand. Stalls commonly sell Samarkand bread, fresh and dried fruit, nuts, spices, sweets and many other local products. For visitors, the bazaar is not only a shopping place but also an opportunity to experience local food culture and daily social interaction. Prices can vary by product and season. Visiting earlier in the day can often provide a livelier atmosphere and a wider selection of produce. The bazaar also fits naturally into a walking route that includes Bibi-Khanum Mosque and the Registan area.',
      ru: 'Сиабский базар расположен рядом с мечетью Биби-Ханым и является одним из лучших мест для знакомства с повседневной торговой жизнью Самарканда. Здесь продают самаркандский хлеб, свежие и сушеные фрукты, орехи, специи, сладости и другие местные продукты. Для туриста базар — это не только место покупок, но и возможность увидеть местную гастрономическую культуру и повседневное общение. Цены зависят от товара и сезона. Утреннее посещение часто бывает более удобным: рынок активнее, а выбор продуктов шире. Базар легко включить в пеший маршрут вместе с Биби-Ханым и Регистаном.',
    },
  },
  {
    id: 'ruhabad',
    match: /ruhabad|ruhobod/i,
    short: {
      uz: 'Ruhobod maqbarasi Samarqanddagi qadimiy ziyorat maskanlaridan biri. U shayx Burhoniddin Sog‘arjiy nomi bilan bog‘liq va XIV asr me’moriy merosiga kiradi.',
      en: 'Ruhabad Mausoleum is one of Samarkand’s historic pilgrimage sites. It is associated with the Sufi scholar Burhan al-Din Sagarji and belongs to the city’s fourteenth-century heritage.',
      ru: 'Мавзолей Рухабад — одно из исторических мест паломничества Самарканда. Он связан с суфийским ученым Бурхан ад-Дином Сагарджи и относится к наследию XIV века.',
    },
    detailed: {
      uz: 'Ruhobod maqbarasi Samarqandning tarixiy markazidagi muhim ziyorat yodgorliklaridan biridir. U shayx Burhoniddin Sog‘arjiy nomi bilan bog‘lanadi va XIV asrga oid me’moriy an’anani aks ettiradi. Inshootning tashqi qiyofasi Samarqanddagi ayrim keyingi davr maqbaralariga nisbatan ancha sodda va salobatli ko‘rinadi. Shu soddalik uning ziyoratgoh sifatidagi ruhiy muhitini kuchaytiradi. Maqbara Go‘ri Amirga juda yaqin joylashgani uchun ikki obyektni bir marshrutda ko‘rish qulay. Ziyorat vaqtida ovozni pasaytirish, ichkaridagi ibodat qilayotgan odamlarga xalaqit bermaslik va yodgorlikka hurmat bilan munosabatda bo‘lish tavsiya etiladi.',
      en: 'Ruhabad Mausoleum is an important historic pilgrimage monument in central Samarkand. It is associated with the Sufi scholar Burhan al-Din Sagarji and reflects the architectural traditions of the fourteenth century. Compared with some later monuments in the city, its exterior is relatively restrained and monumental. This simplicity contributes to the contemplative atmosphere of the site. Ruhabad stands very close to Gur-e Amir, so the two monuments can easily be visited within the same walking itinerary. As the mausoleum is also a place of reverence, visitors are encouraged to speak quietly, avoid disturbing people who may be praying, and treat the interior space with respect.',
      ru: 'Мавзолей Рухабад — важный исторический паломнический памятник в центре Самарканда. Он связан с суфийским ученым Бурхан ад-Дином Сагарджи и отражает архитектурные традиции XIV века. По сравнению с некоторыми более поздними памятниками города его внешний облик выглядит более сдержанно и монументально. Такая простота усиливает созерцательную атмосферу места. Рухабад находится совсем рядом с Гур-Эмиром, поэтому оба объекта удобно включить в один пешеходный маршрут. Поскольку мавзолей остается почитаемым местом, рекомендуется говорить тихо, не мешать молящимся и уважительно относиться к внутреннему пространству.',
    },
  },
  {
    id: 'hazrati-khizr',
    match: /hazrat.?khizr|hazrati.?xizr/i,
    short: {
      uz: 'Hazrati Xizr masjidi Afrosiyob tepaligi yaqinidagi qadimiy muqaddas hududda joylashgan. Masjid uzoq ziyorat an’anasi bilan bog‘liq va shaharga chiroyli manzara ochiladi.',
      en: 'Hazrati Khizr Mosque stands in a historic sacred area near the Afrasiab hill. The site has a long pilgrimage tradition and offers attractive views over Samarkand.',
      ru: 'Мечеть Хазрати Хызр расположена в историческом священном районе рядом с холмом Афросиаб. Место связано с давней паломнической традицией и открывает красивые виды на Самарканд.',
    },
    detailed: {
      uz: 'Hazrati Xizr masjidi Afrosiyob tepaligi va Shohi Zinda yaqinidagi baland hududda joylashgan tarixiy ziyorat maskanidir. Bu joy ko‘p asrlik muqaddaslik va ziyorat an’analari bilan bog‘lanadi. Hozirgi masjidning me’moriy qiyofasida XIX asr oxiri va XX asr boshlariga xos unsurlar ko‘rinadi. Ayvon, ustunlar va bezaklarda mahalliy me’moriy an’analar seziladi. Masjid joylashgan nuqtadan Samarqandning tarixiy qismi tomon keng manzara ochiladi. Bu faol diniy makon bo‘lgani sababli tashrif buyuruvchilarga kamtarona kiyinish, namoz vaqtida xalaqit bermaslik, ruxsatsiz yaqin masofadan odamlarni suratga olmaslik va umumiy ziyorat odobiga rioya qilish tavsiya etiladi.',
      en: 'Hazrati Khizr Mosque occupies an elevated historic sacred area near Afrasiab and Shah-i-Zinda. The site is connected with a long tradition of pilgrimage and local religious memory. Much of the mosque’s present architectural appearance reflects features from the late nineteenth and early twentieth centuries. Its veranda, columns and decorative details show strong local architectural traditions. The elevated position also provides broad views toward the historic parts of Samarkand. Because this remains an active religious space, visitors should dress modestly, avoid disturbing worship during prayer times, refrain from intrusive photography of people, and follow normal etiquette for sacred sites.',
      ru: 'Мечеть Хазрати Хызр находится на возвышенном историческом священном участке рядом с Афросиабом и Шахи-Зиндой. Место связано с давней паломнической традицией и религиозной памятью города. Значительная часть современного архитектурного облика относится к концу XIX — началу XX века. Айван, колонны и декоративные элементы отражают местные архитектурные традиции. С возвышенности открывается широкий вид на историческую часть Самарканда. Поскольку мечеть остается действующим религиозным пространством, рекомендуется скромная одежда, уважение к времени молитвы, отказ от навязчивой съемки людей и соблюдение обычных правил поведения в священных местах.',
    },
  },
];

function audioGuideFor(poi = {}) {
  const name = String(poi.name || '');
  const guide = AUDIO_GUIDES.find((row) => row.match.test(name));
  return guide ? {
    id: guide.id,
    short: { ...guide.short },
    detailed: { ...guide.detailed },
    audio: {
      engine: process.env.OPENAI_API_KEY ? 'openai-tts' : 'browser-fallback',
      endpoint: `/api/tourism/audio-guide/${encodeURIComponent(guide.id)}`,
    },
  } : null;
}

const TTS_CACHE_MAX = 80;
const ttsCache = new Map();
const ttsInFlight = new Map();
const ttsRate = new Map();

function ttsConfig(lang) {
  const configs = {
    uz: {
      voice: process.env.TOUR_TTS_VOICE_UZ || 'cedar',
      instructions: 'Speak in clear, natural Uzbek. Use a warm professional museum audio-guide tone. Pronounce Uzbek names carefully, with natural pauses and confident but calm pacing.',
    },
    en: {
      voice: process.env.TOUR_TTS_VOICE_EN || 'marin',
      instructions: 'Speak in natural English with a warm, polished museum audio-guide tone. Use clear pronunciation, measured pacing, and subtle expressive emphasis.',
    },
    ru: {
      voice: process.env.TOUR_TTS_VOICE_RU || 'cedar',
      instructions: 'Speak in natural Russian with a warm professional museum audio-guide tone. Use clear Russian pronunciation, measured pacing, and respectful intonation.',
    },
  };
  return configs[lang] || null;
}

function limitedTtsRequest(req) {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = ttsRate.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count += 1;
  ttsRate.set(ip, entry);
  return entry.count > 30;
}

function rememberTts(key, buffer) {
  if (ttsCache.size >= TTS_CACHE_MAX) {
    const oldest = ttsCache.keys().next().value;
    if (oldest) ttsCache.delete(oldest);
  }
  ttsCache.set(key, buffer);
}

async function generateTtsMp3(guide, lang, mode) {
  const cfg = ttsConfig(lang);
  const input = guide?.[mode]?.[lang];
  if (!cfg || !input) {
    const error = new Error('Audio gid matni topilmadi.');
    error.statusCode = 404;
    throw error;
  }
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Server AI audio hali sozlanmagan.');
    error.statusCode = 503;
    throw error;
  }
  const model = process.env.TOUR_TTS_MODEL || 'gpt-4o-mini-tts';
  const response = await axios.post('https://api.openai.com/v1/audio/speech', {
    model,
    voice: cfg.voice,
    input,
    instructions: cfg.instructions,
    response_format: 'mp3',
    speed: mode === 'detailed' ? 0.95 : 1.0,
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    responseType: 'arraybuffer',
    timeout: 45_000,
    maxContentLength: 15 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

const PRIORITY_PATTERNS = [
  /registan|registon/i,
  /gur.?e.?amir|go.?ri.?amir|guri.?amir|amir temur/i,
  /shah.?i.?zinda|shohi zinda/i,
  /bibi.?khan|bibi.?xon|bibixon/i,
  /ulugh.?beg|ulug.?bek|ulug.?bek.*observ/i,
  /afrasiyab|afrosiyob/i,
  /siab|siyob/i,
  /ruhabad|ruhobod/i,
  /hazrat.?khizr|hazrati.?xizr/i,
];

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => v * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function detectLanguage(prompt) {
  if (/[а-яё]/i.test(prompt)) return 'ru';
  if (/\b(the|day|days|trip|tour|walking|family|history|food)\b/i.test(prompt)) return 'en';
  return 'uz';
}

function parseBudget(prompt) {
  const normalized = prompt.replace(/,/g, '.');
  const mln = normalized.match(/(\d+(?:\.\d+)?)\s*(?:mln|million|млн)/i);
  if (mln) return Math.round(Number(mln[1]) * 1_000_000);
  const uzs = normalized.match(/(\d[\d\s]{3,})\s*(?:so['‘’`]?m|uzs|сум)/i);
  if (uzs) return Number(uzs[1].replace(/\s/g, '')) || null;
  return null;
}

function promptCount(prompt, pattern) {
  const match = String(prompt || '').match(pattern);
  return match ? clamp(Number(match[1]) || 0, 0, 10) : 0;
}

function profileTime(prompt, kind) {
  const p = String(prompt || '');
  const patterns = kind === 'start'
    ? [/kunni\s*([01]?\d|2[0-3]):([0-5]\d)\s*da\s*boshlash/i, /(?:start|begin|boshlash)\D{0,12}([01]?\d|2[0-3]):([0-5]\d)/i]
    : [/kunni\s*([01]?\d|2[0-3]):([0-5]\d)\s*gacha\s*yakunlash/i, /(?:end|finish|yakun)\D{0,12}([01]?\d|2[0-3]):([0-5]\d)/i];
  for (const rx of patterns) {
    const match = p.match(rx);
    if (match) return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
  }
  return null;
}

function profileCountry(prompt) {
  const match = String(prompt || '').match(/kelish mamlakati:\s*([^;\n.]{2,60})/i);
  return match ? text(match[1], 60) : null;
}

function normalizeIntentProfile(raw = {}) {
  const children = clamp(Number(raw.children_count || 0), 0, 10);
  const seniors = clamp(Number(raw.seniors_count || 0), 0, 10);
  const wheelchair = Boolean(raw.wheelchair_accessible);
  const lowWalking = Boolean(raw.low_walking || wheelchair || seniors > 0);
  let pace = ['relaxed','normal','active'].includes(raw.pace) ? raw.pace : 'normal';
  if ((wheelchair || seniors > 0) && pace === 'active') pace = 'normal';
  return {
    ...raw,
    children_count: children,
    seniors_count: seniors,
    wheelchair_accessible: wheelchair,
    own_vehicle: Boolean(raw.own_vehicle),
    low_walking: lowWalking,
    family: Boolean(raw.family || children > 0),
    pace,
    preferred_start_time: /^\d{2}:\d{2}$/.test(String(raw.preferred_start_time || '')) ? raw.preferred_start_time : null,
    preferred_end_time: /^\d{2}:\d{2}$/.test(String(raw.preferred_end_time || '')) ? raw.preferred_end_time : null,
    origin_country: raw.origin_country ? text(raw.origin_country, 60) : null,
  };
}

function mergeExplicitProfile(intent, raw = {}) {
  const allowedInterests = new Set(['history','pilgrimage','gastronomy','museum','family','architecture']);
  const interests = Array.isArray(raw.interests)
    ? raw.interests.map((v) => text(v, 30)).filter((v) => allowedInterests.has(v)).slice(0, 6)
    : [];
  const merged = { ...intent };
  if (interests.length) merged.interests = [...new Set(interests)];
  if (['relaxed','normal','active'].includes(raw.pace)) merged.pace = raw.pace;
  if (['walking','taxi','mixed'].includes(raw.transport)) merged.transport = raw.transport;
  if (typeof raw.low_walking === 'boolean') merged.low_walking = raw.low_walking;
  if (typeof raw.wheelchair_accessible === 'boolean') merged.wheelchair_accessible = raw.wheelchair_accessible;
  if (typeof raw.own_vehicle === 'boolean') merged.own_vehicle = raw.own_vehicle;
  if (raw.children_count !== undefined) merged.children_count = clamp(Number(raw.children_count) || 0, 0, 10);
  if (raw.seniors_count !== undefined) merged.seniors_count = clamp(Number(raw.seniors_count) || 0, 0, 10);
  if (/^\d{2}:\d{2}$/.test(String(raw.preferred_start_time || ''))) merged.preferred_start_time = String(raw.preferred_start_time);
  if (/^\d{2}:\d{2}$/.test(String(raw.preferred_end_time || ''))) merged.preferred_end_time = String(raw.preferred_end_time);
  if (raw.origin_country) merged.origin_country = text(raw.origin_country, 60);
  const budget = number(raw.budget_uzs);
  if (budget !== null && budget >= 0) merged.budget_uzs = Math.round(budget);
  return merged;
}

function fallbackIntent(prompt, explicitDays) {
  const p = prompt.toLocaleLowerCase('uz-UZ');
  const dayMatch = p.match(/\b([1-5])\s*(?:kun|day|days|дн(?:я|ей)?)/i);
  const days = clamp(Number(explicitDays || dayMatch?.[1] || 2), 1, 5);
  const lowWalking = /(kam yur|ko.?p yur.*xohlam|ko.?p piyoda.*emas|less walk|not much walk|меньше ход|мало ход)/i.test(p);
  const family = /(bola|bolalar|oila|family|kid|child|ребен|семь)/i.test(p);
  const pilgrimage = /(ziyorat|maqbara|masjid|mosque|mausoleum|pilgrim|зиёрат|мечет|мавзол)/i.test(p);
  const gastronomy = /(milliy taom|osh|palov|plov|food|gastronom|restaurant|restoran|еда|кухн)/i.test(p);
  const museum = /(muzey|museum|музей)/i.test(p);
  const childrenCount = promptCount(prompt, /(\d+)\s*(?:bola|bolalar|child(?:ren)?|реб(?:енок|енка|ёнок|ёнка|детей))/i);
  const seniorsCount = promptCount(prompt, /(\d+)\s*(?:kishi\s*)?65\+\s*(?:yoshda|yosh|age)?/i);
  const wheelchairAccessible = /(nogironlar aravachasi|wheelchair|инвалидн.*коляск)/i.test(p);
  const ownVehicle = /(shaxsiy avtomobil|o.?z avtomobil|own car|private car|своя машин|личн.*авто)/i.test(p);
  let transport = 'mixed';
  if (/(faqat piyoda|walking only|пешком)/i.test(p)) transport = 'walking';
  if (/(taksi|taxi|машин|авто)/i.test(p) && !ownVehicle) transport = 'taxi';
  if (ownVehicle) transport = 'mixed';
  let pace = 'normal';
  if (lowWalking || seniorsCount > 0 || wheelchairAccessible || /(sekin|xotirjam|relax|спокой)/i.test(p)) pace = 'relaxed';
  if (/(ko.?proq joy|maksimal|active|intensive|больше мест)/i.test(p)) pace = 'active';
  const interests = ['history'];
  if (pilgrimage) interests.push('pilgrimage');
  if (gastronomy) interests.push('gastronomy');
  if (museum) interests.push('museum');
  if (family) interests.push('family');
  return {
    days,
    interests: [...new Set(interests)],
    low_walking: lowWalking,
    family,
    transport,
    pace,
    language: detectLanguage(prompt),
    budget_uzs: parseBudget(prompt),
    children_count: childrenCount,
    seniors_count: seniorsCount,
    wheelchair_accessible: wheelchairAccessible,
    own_vehicle: ownVehicle,
    preferred_start_time: profileTime(prompt, 'start'),
    preferred_end_time: profileTime(prompt, 'end'),
    origin_country: profileCountry(prompt),
  };
}

async function parseIntentWithOpenAI(prompt, fallback) {
  if (!process.env.OPENAI_API_KEY) return { ...fallback, engine: 'smart-rules' };
  const schema = {
    type: 'object',
    properties: {
      days: { type: 'integer', minimum: 1, maximum: 5 },
      interests: { type: 'array', items: { type: 'string', enum: ['history','pilgrimage','gastronomy','museum','family','architecture'] } },
      low_walking: { type: 'boolean' },
      family: { type: 'boolean' },
      transport: { type: 'string', enum: ['walking','taxi','mixed'] },
      pace: { type: 'string', enum: ['relaxed','normal','active'] },
      language: { type: 'string', enum: ['uz','ru','en'] },
      budget_uzs: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
      children_count: { type: 'integer', minimum: 0, maximum: 10 },
      seniors_count: { type: 'integer', minimum: 0, maximum: 10 },
      wheelchair_accessible: { type: 'boolean' },
      own_vehicle: { type: 'boolean' },
      preferred_start_time: { anyOf: [{ type: 'string', maxLength: 5 }, { type: 'null' }] },
      preferred_end_time: { anyOf: [{ type: 'string', maxLength: 5 }, { type: 'null' }] },
      origin_country: { anyOf: [{ type: 'string', maxLength: 60 }, { type: 'null' }] },
    },
    required: ['days','interests','low_walking','family','transport','pace','language','budget_uzs','children_count','seniors_count','wheelchair_accessible','own_vehicle','preferred_start_time','preferred_end_time','origin_country'],
    additionalProperties: false,
  };
  try {
    const response = await axios.post('https://api.openai.com/v1/responses', {
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      input: [
        { role: 'system', content: 'You extract travel-planning preferences for a Samarqand itinerary. Do not invent places. Return only the requested structured fields. Preserve explicit traveler-profile facts such as children, seniors, mobility needs, vehicle availability, origin country, and preferred daily start/end times. Default interest is history and default trip length is 2 days when unclear.' },
        { role: 'user', content: prompt },
      ],
      text: { format: { type: 'json_schema', name: 'samarkand_tour_intent', strict: true, schema } },
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 18000,
    });
    const outputText = response.data?.output_text || response.data?.output
      ?.flatMap((item) => item.content || [])
      ?.find((item) => item.type === 'output_text')?.text;
    const parsed = JSON.parse(outputText || '{}');
    return {
      ...fallback,
      ...parsed,
      days: clamp(Number(parsed.days || fallback.days), 1, 5),
      interests: Array.isArray(parsed.interests) && parsed.interests.length ? parsed.interests : fallback.interests,
      children_count: Math.max(Number(parsed.children_count || 0), Number(fallback.children_count || 0)),
      seniors_count: Math.max(Number(parsed.seniors_count || 0), Number(fallback.seniors_count || 0)),
      wheelchair_accessible: Boolean(parsed.wheelchair_accessible || fallback.wheelchair_accessible),
      own_vehicle: Boolean(parsed.own_vehicle || fallback.own_vehicle),
      preferred_start_time: parsed.preferred_start_time || fallback.preferred_start_time || null,
      preferred_end_time: parsed.preferred_end_time || fallback.preferred_end_time || null,
      origin_country: parsed.origin_country || fallback.origin_country || null,
      engine: 'openai',
      model: response.data?.model || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    };
  } catch (error) {
    console.warn('OpenAI tour intent fallback:', error.response?.status || error.message);
    return { ...fallback, engine: 'smart-rules-fallback' };
  }
}

function osmName(tags = {}) {
  return tags['name:uz'] || tags.name || tags['name:en'] || tags['name:ru'] || null;
}

function categoryFor(tags = {}) {
  if (tags.amenity === 'marketplace') return 'market';
  if (tags.tourism === 'museum') return 'museum';
  if (tags.amenity === 'place_of_worship') return 'pilgrimage';
  if (tags.historic) return 'historic';
  if (tags.tourism === 'attraction') return 'attraction';
  return 'heritage';
}

function resilienceFor(tags = {}, category) {
  if (category === 'museum' || tags.indoor === 'yes') return 3;
  if (tags.building && category !== 'market') return 2;
  if (category === 'pilgrimage') return 1;
  return 0;
}

function normalizePoiKey(name) {
  return String(name || '').toLocaleLowerCase('uz-UZ').replace(/[ʻʼ’`´]/g, "'").replace(/[^a-zа-я0-9']/gi, '');
}

function poiScore(poi, intent) {
  let score = 0;
  if (poi.wikidata || poi.wikipedia) score += 10;
  if (poi.category === 'historic') score += 10;
  if (poi.category === 'museum') score += intent.interests.includes('museum') ? 13 : 7;
  if (poi.category === 'pilgrimage') score += intent.interests.includes('pilgrimage') ? 16 : 5;
  if (poi.category === 'attraction') score += 6;
  if (poi.category === 'market' && intent.interests.includes('gastronomy')) score += 12;
  if (PRIORITY_PATTERNS.some((rx) => rx.test(poi.name))) score += 28;
  if (intent.family && poi.category === 'museum') score += 4;
  if (Number(intent.children_count || 0) > 0 && poi.category === 'museum') score += 3;
  if (Number(intent.seniors_count || 0) > 0 && ['historic','pilgrimage','museum'].includes(poi.category)) score += 2;
  if (intent.wheelchair_accessible && Number(poi.weather_resilience || 0) >= 2) score += 2;
  return score;
}

function parseOverpassElements(elements = []) {
  const rows = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const name = osmName(tags);
    const latitude = number(el.lat ?? el.center?.lat);
    const longitude = number(el.lon ?? el.center?.lon);
    if (!name || !validCoord(latitude, longitude)) continue;
    const category = categoryFor(tags);
    rows.push({
      id: `${el.type}/${el.id}`,
      osm_type: el.type,
      osm_id: el.id,
      name,
      latitude,
      longitude,
      category,
      weather_resilience: resilienceFor(tags, category),
      historic: tags.historic || null,
      tourism: tags.tourism || null,
      religion: tags.religion || null,
      opening_hours: tags.opening_hours || null,
      fee: tags.fee || null,
      charge: tags.charge || tags.admission || tags['entrance:fee'] || null,
      website: tags.website || tags['contact:website'] || null,
      phone: tags.phone || tags['contact:phone'] || null,
      wikipedia: tags.wikipedia || null,
      wikidata: tags.wikidata || null,
      source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source: 'OpenStreetMap',
    });
  }
  return rows;
}

function mergeWithCurated(external = []) {
  const merged = new Map(CURATED_POIS.map((poi) => [normalizePoiKey(poi.name), { ...poi, curated: true }]));
  for (const poi of external) {
    const key = normalizePoiKey(poi.name);
    if (!key) continue;
    if (!merged.has(key)) {
      merged.set(key, poi);
      continue;
    }
    const base = merged.get(key);
    merged.set(key, {
      ...poi,
      ...base,
      opening_hours: poi.opening_hours || base.opening_hours || null,
      fee: poi.fee || base.fee || null,
      charge: poi.charge || base.charge || null,
      website: poi.website || base.website || null,
      phone: poi.phone || base.phone || null,
      osm_source_url: poi.source_url || null,
      osm_id: poi.osm_id || null,
      osm_type: poi.osm_type || null,
    });
  }
  return [...merged.values()];
}

async function discoverHeritagePois() {
  const key = 'samarkand-heritage-v4';
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;
  const radius = 16000;
  const query = `[out:json][timeout:18];(
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["historic"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["tourism"~"attraction|museum"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="place_of_worship"]["historic"]["name"];
    nwr(around:${radius},${CENTER.latitude},${CENTER.longitude})["amenity"="marketplace"]["name"];
  );out center tags;`;
  const requestBody = new URLSearchParams({ data: query }).toString();
  const requests = OVERPASS_URLS.map((endpoint) => axios.post(endpoint, requestBody, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'QishloqRaqamliPlatformasi-TourPlanner/1.2 (+https://phd-api-production-d2e5.up.railway.app)',
    },
    timeout: 9000,
    maxContentLength: 6 * 1024 * 1024,
  }).then((response) => ({ endpoint, rows: parseOverpassElements(response.data?.elements || []) })));

  let result;
  try {
    const winner = await Promise.any(requests);
    result = {
      provider: 'osm+curated',
      external_provider: winner.endpoint,
      external_count: winner.rows.length,
      rows: mergeWithCurated(winner.rows),
    };
  } catch {
    console.warn('Overpass unavailable; curated fallback active');
    result = {
      provider: 'curated-fallback',
      external_provider: null,
      external_count: 0,
      rows: mergeWithCurated([]),
    };
  }
  poiCache.set(key, { at: Date.now(), result });
  return result;
}

function dateStringTashkent() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDate(dateText, days) {
  const [y, m, d] = String(dateText).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function normalizeTripStart(raw) {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '')) ? String(raw) : dateStringTashkent();
  const today = dateStringTashkent();
  const diff = dayDiff(today, value);
  if (!Number.isFinite(diff) || diff < 0 || diff > 14) return { date: value, forecastable: false, warning: 'Ob-havo asosida moslashtirish uchun sana bugundan 14 kun ichida bo‘lishi kerak.' };
  return { date: value, forecastable: true, warning: null };
}

function weatherRisk(row = {}) {
  const code = Number(row.weather_code);
  const rain = Number(row.precipitation_probability_max_pct || 0);
  const max = Number(row.temperature_max_c);
  const min = Number(row.temperature_min_c);
  const wind = Number(row.wind_speed_max_kmh || 0);
  if (code >= 95) return { type: 'storm', severity: 5, label: 'Momaqaldiroq', advice: 'Yopiq obyektlarni ustuvor qiling va tashqi nuqtalarni qisqartiring.' };
  if ((code >= 51 && code <= 82) || rain >= 60) return { type: 'rain', severity: 4, label: 'Yomg‘ir xavfi', advice: 'Muzey va yopiqroq obyektlar oldinga surildi.' };
  if (wind >= 40) return { type: 'wind', severity: 3, label: 'Kuchli shamol', advice: 'Ochiq maydonlarda vaqt qisqartirildi.' };
  if (max >= 34) return { type: 'hot', severity: 3, label: 'Issiq', advice: 'Ochiq obyektlar ertaroq vaqtga surildi.' };
  if (min <= 2) return { type: 'cold', severity: 2, label: 'Sovuq', advice: 'Yopiqroq obyektlar ustuvorlashtirildi.' };
  return { type: 'normal', severity: 0, label: 'Qulay', advice: 'Standart masofa optimizatsiyasi ishlatildi.' };
}

async function getTripWeather(startMeta, days) {
  if (!startMeta.forecastable) return { rows: [], source: 'unavailable', warning: startMeta.warning };
  try {
    const endDate = addDate(startMeta.date, days - 1);
    const response = await axios.get(OPEN_METEO_URL, {
      params: {
        latitude: CENTER.latitude,
        longitude: CENTER.longitude,
        timezone: 'Asia/Tashkent',
        start_date: startMeta.date,
        end_date: endDate,
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      },
      timeout: 9000,
    });
    const d = response.data?.daily || {};
    const rows = Array.from({ length: Math.min(days, d.time?.length || 0) }, (_, index) => {
      const row = {
        day_number: index + 1,
        date: d.time?.[index] || addDate(startMeta.date, index),
        weather_code: d.weather_code?.[index] ?? null,
        temperature_max_c: d.temperature_2m_max?.[index] ?? null,
        temperature_min_c: d.temperature_2m_min?.[index] ?? null,
        precipitation_probability_max_pct: d.precipitation_probability_max?.[index] ?? null,
        wind_speed_max_kmh: d.wind_speed_10m_max?.[index] ?? null,
        source: 'Open-Meteo',
      };
      return { ...row, risk: weatherRisk(row) };
    });
    return { rows, source: rows.length ? 'Open-Meteo' : 'unavailable', warning: rows.length ? null : 'Tanlangan sanalar uchun prognoz topilmadi.' };
  } catch (error) {
    console.warn('Tour weather unavailable:', error.response?.status || error.message);
    return { rows: [], source: 'unavailable', warning: 'Ob-havo xizmati hozir javob bermadi; marshrut ob-havosiz tuzildi.' };
  }
}

function nearestOrder(rows, start) {
  const remaining = [...rows];
  const ordered = [];
  let current = start;
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((row, index) => {
      const d = haversine(current.latitude, current.longitude, row.latitude, row.longitude);
      if (d < bestDistance) { bestDistance = d; bestIndex = index; }
    });
    const next = remaining.splice(bestIndex, 1)[0];
    ordered.push(next);
    current = next;
  }
  return ordered;
}

function clockMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function availableDayMinutes(intent) {
  const start = clockMinutes(intent.preferred_start_time);
  const end = clockMinutes(intent.preferred_end_time);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function selectPois(pois, intent, start) {
  let perDay = intent.pace === 'relaxed' || intent.low_walking ? 4 : intent.pace === 'active' ? 6 : 5;
  if (intent.wheelchair_accessible || Number(intent.seniors_count || 0) > 0) perDay = Math.min(perDay, 4);
  const windowMinutes = availableDayMinutes(intent);
  if (windowMinutes !== null && windowMinutes <= 360) perDay = Math.min(perDay, 3);
  else if (windowMinutes !== null && windowMinutes <= 480) perDay = Math.min(perDay, 4);
  const target = clamp(intent.days * perDay, intent.days * 2, 26);
  const scored = pois
    .map((poi) => ({
      ...poi,
      score: poiScore(poi, intent),
      distance_from_center_m: Math.round(haversine(CENTER.latitude, CENTER.longitude, poi.latitude, poi.longitude)),
      distance_from_start_m: Math.round(haversine(start.latitude, start.longitude, poi.latitude, poi.longitude)),
    }))
    .filter((poi) => poi.distance_from_center_m <= 22000)
    .sort((a, b) => b.score - a.score || a.distance_from_start_m - b.distance_from_start_m);
  const selected = [];
  const seen = new Set();
  for (const poi of scored) {
    const key = normalizePoiKey(poi.name);
    if (!key || seen.has(key)) continue;
    selected.push(poi);
    seen.add(key);
    if (selected.length >= target) break;
  }
  return nearestOrder(selected, start);
}

function splitDays(ordered, days) {
  const groups = Array.from({ length: days }, () => []);
  ordered.forEach((poi, index) => {
    const day = Math.min(days - 1, Math.floor(index * days / Math.max(1, ordered.length)));
    groups[day].push(poi);
  });
  return groups;
}

function pathDistanceM(start, stops) {
  let total = 0;
  let previous = start;
  for (const stop of stops) {
    total += haversine(previous.latitude, previous.longitude, stop.latitude, stop.longitude);
    previous = stop;
  }
  return total;
}

function twoOptOpenPath(start, rows, maxPasses = 6) {
  if (!Array.isArray(rows) || rows.length < 3) return [...rows];
  let best = nearestOrder(rows, start);
  let bestDistance = pathDistanceM(start, best);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const candidateDistance = pathDistanceM(start, candidate);
        if (candidateDistance + 25 < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

function optimizeDayOrder(rows, start, weather, adaptive) {
  const baseline = nearestOrder(rows, start);
  const before = pathDistanceM(start, baseline);
  const riskSeverity = Number(weather?.risk?.severity || 0);
  const optimized = adaptive && riskSeverity >= 3
    ? weatherAwareOrder(rows, start, weather, true)
    : twoOptOpenPath(start, rows);
  const after = pathDistanceM(start, optimized);
  return {
    stops: optimized,
    meta: {
      method: adaptive && riskSeverity >= 3 ? 'weather-priority' : 'nearest-neighbor+2-opt',
      origin: start.name || 'Boshlanish nuqtasi',
      before_distance_m: Math.round(before),
      after_distance_m: Math.round(after),
      saved_distance_m: Math.max(0, Math.round(before - after)),
    },
  };
}

function rebalanceForWeather(groups, weatherRows, enabled) {
  const result = groups.map((group) => [...group]);
  if (!enabled || !weatherRows.length || result.length < 2) return result;
  const risky = weatherRows
    .map((weather, index) => ({ index, severity: weather.risk?.severity || 0 }))
    .filter((row) => row.severity >= 3)
    .sort((a, b) => b.severity - a.severity);
  for (const target of risky) {
    const targetGroup = result[target.index] || [];
    if (!targetGroup.length) continue;
    let weakestIndex = 0;
    targetGroup.forEach((poi, index) => {
      if ((poi.weather_resilience || 0) < (targetGroup[weakestIndex]?.weather_resilience || 0)) weakestIndex = index;
    });
    let donor = null;
    result.forEach((group, groupIndex) => {
      if (groupIndex === target.index) return;
      group.forEach((poi, poiIndex) => {
        const score = Number(poi.weather_resilience || 0);
        if (!donor || score > donor.score) donor = { groupIndex, poiIndex, score };
      });
    });
    const weakest = Number(targetGroup[weakestIndex]?.weather_resilience || 0);
    if (donor && donor.score - weakest >= 2) {
      const incoming = result[donor.groupIndex][donor.poiIndex];
      const outgoing = result[target.index][weakestIndex];
      result[target.index][weakestIndex] = incoming;
      result[donor.groupIndex][donor.poiIndex] = outgoing;
    }
  }
  return result;
}

function weatherAwareOrder(rows, start, weather, enabled) {
  const base = nearestOrder(rows, start);
  if (!enabled || !weather?.risk || weather.risk.type === 'normal') return base;
  const type = weather.risk.type;
  return base
    .map((poi, index) => ({ poi, index }))
    .sort((a, b) => {
      const ar = Number(a.poi.weather_resilience || 0);
      const br = Number(b.poi.weather_resilience || 0);
      if (type === 'hot') return ar - br || a.index - b.index;
      return br - ar || a.index - b.index;
    })
    .map((row) => row.poi);
}

async function routeDriving(start, stops) {
  const points = [start, ...stops];
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  try {
    const response = await axios.get(`${OSRM_URL}/route/v1/driving/${coords}`, {
      params: { overview: 'full', geometries: 'geojson', steps: false },
      timeout: 10000,
    });
    const route = response.data?.routes?.[0];
    if (!route) return null;
    return {
      geometry: route.geometry,
      distance_m: Math.round(route.distance),
      duration_min: Math.round(route.duration / 60),
      source: 'OSRM',
      profile: 'driving',
    };
  } catch (error) {
    console.warn('OSRM route fallback:', error.response?.status || error.message);
    return null;
  }
}

function routeFallback(start, stops, walking) {
  const coords = [[start.longitude, start.latitude], ...stops.map((p) => [p.longitude, p.latitude])];
  let distance = 0;
  let prev = start;
  for (const stop of stops) {
    distance += haversine(prev.latitude, prev.longitude, stop.latitude, stop.longitude);
    prev = stop;
  }
  const speedKmh = walking ? 4.5 : 25;
  return {
    geometry: { type: 'LineString', coordinates: coords },
    distance_m: Math.round(distance),
    duration_min: Math.round((distance / 1000) / speedKmh * 60),
    source: 'geodesic-fallback',
    profile: walking ? 'walking-estimate' : 'vehicle-estimate',
  };
}

function officialPoiRecord(poi = {}) {
  const name = String(poi.name || '');
  return OFFICIAL_POI_CATALOG.find((row) => row.match.test(name)) || null;
}

function inMuseumSeason(dateText) {
  const md = String(dateText || '').slice(5);
  return /^\d{2}-\d{2}$/.test(md) && md >= '02-20' && md < '11-20';
}

function officialHoursWindow(record, dateText) {
  if (!record?.hours) return null;
  if (record.hours.type === 'daily') {
    return { open: record.hours.open, close: record.hours.close, label: `${record.hours.open}–${record.hours.close}` };
  }
  if (record.hours.type === 'seasonal') {
    const md = String(dateText || '').slice(5);
    const seasonal = /^\d{2}-\d{2}$/.test(md) && md >= record.hours.season.from && md < record.hours.season.to;
    const hours = seasonal ? record.hours.season : record.hours.off_season;
    return { open: hours.open, close: hours.close, label: `${hours.open}–${hours.close}` };
  }
  return null;
}

function evaluateOfficialHours(record, dateText, timeText) {
  const window = officialHoursWindow(record, dateText);
  const visit = minutesOfClock(timeText);
  if (!window || visit === null) return { status: 'unknown', label: window?.label || 'Ish vaqti noma’lum', source: record?.authority || null };
  const start = minutesOfClock(window.open);
  const end = minutesOfClock(window.close);
  if (start === null || end === null) return { status: 'unknown', label: window.label, source: record.authority };
  const normalizedEnd = end === 24 * 60 ? 24 * 60 : end;
  const isOpen = visit >= start && visit < normalizedEnd;
  return {
    status: isOpen ? 'open' : 'closed',
    label: `${isOpen ? 'Ochiq' : 'Yopiq'} · ${window.label}`,
    source: record.authority,
  };
}

function officialTariff(record, dateText) {
  if (!record?.tariff) return null;
  const season = inMuseumSeason(dateText);
  const rows = record.tariff.rows.map((row) => {
    const amount = Number.isFinite(row.fixed) ? row.fixed : season ? row.season : row.off_season;
    return {
      audience: row.audience,
      amount_uzs: Number.isFinite(amount) ? amount : null,
      note: row.note || null,
    };
  });
  return {
    status: 'official-published',
    currency: record.tariff.currency || 'UZS',
    rows,
    season: record.tariff.seasonal_local ? (season ? 'mavsum' : 'mavsumdan tashqari') : null,
    note: record.tariff.note || null,
    free_note: record.tariff.free_note || null,
    authority: record.authority,
    source_url: record.source_url,
    ticket_url: record.ticket_url || null,
    checked_on: record.checked_on,
  };
}

const OSM_DAY_CODES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function minutesOfClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return hour * 60 + minute;
}

function daySelectorMatches(selector, dayCode) {
  const clean = String(selector || '').trim();
  if (!clean) return true;
  const tokens = clean.split(',').map((x) => x.trim()).filter(Boolean);
  for (const token of tokens) {
    if (/^(Mo|Tu|We|Th|Fr|Sa|Su)$/.test(token) && token === dayCode) return true;
    const range = token.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    if (range) {
      const start = OSM_DAY_CODES.indexOf(range[1]);
      const end = OSM_DAY_CODES.indexOf(range[2]);
      const current = OSM_DAY_CODES.indexOf(dayCode);
      if (start <= end ? current >= start && current <= end : current >= start || current <= end) return true;
    }
  }
  return false;
}

function evaluateSimpleOpeningHours(openingHours, dateText, timeText) {
  const raw = text(openingHours, 300);
  if (!raw) return { status: 'unknown', label: 'Ish vaqti noma’lum', source: null };
  if (raw === '24/7') return { status: 'open', label: 'Ochiq · 24/7', source: 'OpenStreetMap opening_hours' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || '')) || !/^\d{2}:\d{2}$/.test(String(timeText || ''))) {
    return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };
  }
  if (/[+"']|PH|SH|sunrise|sunset|week|easter|month|year/i.test(raw)) {
    return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };
  }
  const date = new Date(`${dateText}T12:00:00Z`);
  const dayCode = OSM_DAY_CODES[date.getUTCDay()];
  const visit = minutesOfClock(timeText);
  if (visit === null) return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };

  let matchedDayRule = false;
  let explicitClosed = false;
  for (const segmentRaw of raw.split(';')) {
    const segment = segmentRaw.trim();
    if (!segment) continue;
    const match = segment.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+)?(.+)$/);
    if (!match) continue;
    const selector = (match[1] || '').trim();
    const body = (match[2] || '').trim();
    if (!daySelectorMatches(selector, dayCode)) continue;
    matchedDayRule = true;
    if (/\boff\b|\bclosed\b/i.test(body)) {
      explicitClosed = true;
      continue;
    }
    const ranges = [...body.matchAll(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g)];
    for (const range of ranges) {
      const start = minutesOfClock(range[1]);
      const end = minutesOfClock(range[2]);
      if (start === null || end === null) continue;
      const open = end >= start ? visit >= start && visit < end : visit >= start || visit < end;
      if (open) return { status: 'open', label: `Ochiq · ${range[1]}–${range[2]}`, source: 'OpenStreetMap opening_hours' };
    }
  }
  if (matchedDayRule || explicitClosed) return { status: 'closed', label: 'Yopiq bo‘lishi mumkin', source: 'OpenStreetMap opening_hours' };
  return { status: 'unknown', label: raw, source: 'OpenStreetMap opening_hours' };
}

function tashkentNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const getPart = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    time: `${getPart('hour')}:${getPart('minute')}`,
  };
}

function ticketInfo(poi = {}) {
  const fee = String(poi.fee || '').toLowerCase();
  const charge = text(poi.charge, 120);
  if (charge) return { status: 'known', label: charge, source: 'OpenStreetMap fee/charge tag' };
  if (fee === 'no') return { status: 'free', label: 'Bepul deb ko‘rsatilgan', source: 'OpenStreetMap fee tag' };
  if (fee === 'yes') return { status: 'paid-unknown', label: 'Pullik · narx ko‘rsatilmagan', source: 'OpenStreetMap fee tag' };
  return { status: 'unknown', label: 'Chipta narxi ma’lum emas', source: null };
}

function enrichOperationalStatus(poi, visitDate, visitTime) {
  const official = officialPoiRecord(poi);
  const nowParts = tashkentNowParts();
  if (official) {
    return {
      ...poi,
      operational: {
        planned: evaluateOfficialHours(official, visitDate, visitTime),
        now: evaluateOfficialHours(official, nowParts.date, nowParts.time),
        ticket: officialTariff(official, visitDate),
        website: official.source_url || poi.website || null,
        phone: poi.phone || null,
        official: {
          id: official.id,
          canonical_name: official.canonical_name,
          authority: official.authority,
          source_url: official.source_url,
          ticket_url: official.ticket_url || null,
          checked_on: official.checked_on,
          hours_note: official.hours?.note || null,
        },
        data_note: 'Rasmiy tashkilot sahifasidagi ish vaqti va tarif katalogi ustuvor ishlatildi. Narx va rejim o‘zgarishi mumkin; xarid/tashrif oldidan manbani tekshiring.',
      },
    };
  }
  const planned = evaluateSimpleOpeningHours(poi.opening_hours, visitDate, visitTime);
  const now = evaluateSimpleOpeningHours(poi.opening_hours, nowParts.date, nowParts.time);
  return {
    ...poi,
    operational: {
      planned,
      now,
      ticket: ticketInfo(poi),
      website: poi.website || null,
      phone: poi.phone || null,
      official: null,
      data_note: 'Ish vaqti va to‘lov OpenStreetMap metadata asosida. Rasmiy manbada tekshirish tavsiya etiladi.',
    },
  };
}

function visitMinutes(poi, intent, weather, adaptive) {
  let minutes = poi.category === 'museum' ? (intent.pace === 'relaxed' ? 90 : 75)
    : PRIORITY_PATTERNS.some((rx) => rx.test(poi.name)) ? (intent.pace === 'active' ? 60 : 80)
      : intent.pace === 'relaxed' ? 65 : 50;
  if (Number(intent.children_count || 0) > 0 && minutes > 75) minutes = 75;
  if (intent.wheelchair_accessible) minutes += 10;
  if (adaptive && weather?.risk?.severity >= 3) {
    if ((poi.weather_resilience || 0) >= 2) minutes += 10;
    else minutes = Math.max(35, minutes - 15);
  }
  return minutes;
}

function daySchedule(dayStops, route, intent, dayIndex, weather, adaptive, visitDate = null) {
  const risk = weather?.risk || { type: 'normal', advice: null };
  const requestedStart = clockMinutes(intent.preferred_start_time);
  const requestedEnd = clockMinutes(intent.preferred_end_time);
  let cursor = requestedStart ?? (risk.type === 'hot' && adaptive ? 8 * 60 : risk.severity >= 3 && adaptive ? 9 * 60 + 30 : 9 * 60);
  const mobilityBuffer = (intent.low_walking || intent.wheelchair_accessible || Number(intent.seniors_count || 0) > 0) ? 5 : 0;
  const rows = dayStops.map((poi, index) => {
    if (index > 0) cursor += Math.max(8, Math.round((route?.duration_min || 45) / Math.max(1, dayStops.length))) + mobilityBuffer;
    if (index === Math.ceil(dayStops.length / 2) && intent.interests.includes('gastronomy')) cursor += risk.type === 'hot' && adaptive ? 90 : 60;
    const visit = visitMinutes(poi, intent, weather, adaptive);
    const startMinutes = cursor;
    cursor += visit;
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const startText = fmt(startMinutes);
    const endText = fmt(cursor);
    const dated = visitDate || weather?.date || null;
    const enriched = enrichOperationalStatus(poi, dated, startText);
    return { ...enriched, audio_guide: audioGuideFor(enriched), order: index + 1, visit_minutes: visit, time_start: startText, time_end: endText };
  });
  return {
    day: dayIndex + 1,
    date: visitDate || weather?.date || null,
    title: `${dayIndex + 1}-kun`,
    stops: rows,
    route,
    weather: weather || null,
    weather_adapted: Boolean(adaptive && risk.severity > 0),
    adaptation_note: adaptive && risk.severity > 0 ? risk.advice : null,
    distance_km: Number(((route?.distance_m || 0) / 1000).toFixed(1)),
    transfer_minutes: route?.duration_min || 0,
    preferred_window: {
      start: intent.preferred_start_time || null,
      end: intent.preferred_end_time || null,
      overrun_minutes: requestedEnd !== null ? Math.max(0, cursor - requestedEnd) : 0,
    },
    meal_break: intent.interests.includes('gastronomy') ? (risk.type === 'hot' && adaptive ? 'Issiq vaqt oralig‘ida 90 daqiqalik tushlik va dam olish tanaffusi rejalashtirildi.' : 'Kun o‘rtasida milliy taomlar uchun 60 daqiqalik tanaffus rejalashtirilgan.') : null,
  };
}

function localizedSummary(intent, count, adaptedDays) {
  if (intent.language === 'ru') return `${intent.days}-дневный маршрут по Самарканду: ${count} достопримечательностей.${adaptedDays ? ` ${adaptedDays} дн. скорректировано по погоде.` : ''}`;
  if (intent.language === 'en') return `${intent.days}-day Samarkand itinerary with ${count} heritage stops.${adaptedDays ? ` ${adaptedDays} day(s) weather-adapted.` : ''}`;
  return `Samarqand bo‘yicha ${intent.days} kunlik marshrut: ${count} ta tarixiy/turistik nuqta.${adaptedDays ? ` ${adaptedDays} kun ob-havoga moslashtirildi.` : ''}`;
}

router.get('/status', (_req, res) => {
  res.json({
    version: '1.9.0',
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    openai_model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5.6-luna') : null,
    poi_source: 'Verified curated Samarkand anchors + OpenStreetMap/Overpass enrichment',
    routing_source: 'Fixed-origin route ordering + OSRM driving + geodesic fallback',
    route_optimization: 'Nearest-neighbor + 2-opt when weather is normal; weather-priority ordering in severe weather',
    weather_source: 'Open-Meteo',
    operational_metadata: 'Official Registan and Samarkand Museum-Reserve catalog where verified; OpenStreetMap fallback elsewhere',
    weather_adaptive_routing: true,
    forecast_window_days: 14,
    curated_poi_count: CURATED_POIS.length,
    official_catalog_count: OFFICIAL_POI_CATALOG.length,
    official_catalog_checked_on: '2026-09-18',
    audio_guide_languages: ['uz-UZ','en-US','ru-RU'],
    audio_guide_poi_count: AUDIO_GUIDES.length,
    professional_audio_configured: Boolean(process.env.OPENAI_API_KEY),
    professional_audio_model: process.env.OPENAI_API_KEY ? (process.env.TOUR_TTS_MODEL || 'gpt-4o-mini-tts') : null,
    professional_audio_format: 'mp3',
    professional_audio_voices: process.env.OPENAI_API_KEY ? {
      uz: process.env.TOUR_TTS_VOICE_UZ || 'cedar',
      en: process.env.TOUR_TTS_VOICE_EN || 'marin',
      ru: process.env.TOUR_TTS_VOICE_RU || 'cedar',
    } : null,
    note: 'Registon va ayrim Samarqand davlat muzey-qo‘riqxonasi obyektlari uchun rasmiy sahifalarda e’lon qilingan ish vaqti/tariflar katalogi ishlatiladi; qolgan joylarda OSM fallback. Narxlar o‘zgarishi mumkin, xarid oldidan manbani tekshiring.',
  });
});

router.get('/audio-guide/:guideId', asyncHandler(async (req, res) => {
  if (limitedTtsRequest(req)) return res.status(429).json({ error: 'Audio so‘rovlar juda ko‘p. Bir ozdan keyin qayta urinib ko‘ring.' });
  const guideId = text(req.params.guideId, 80);
  const lang = ['uz','en','ru'].includes(String(req.query.lang)) ? String(req.query.lang) : 'uz';
  const mode = req.query.mode === 'detailed' ? 'detailed' : 'short';
  const guide = AUDIO_GUIDES.find((row) => row.id === guideId);
  if (!guide) return res.status(404).json({ error: 'Audio gid topilmadi.' });

  const model = process.env.TOUR_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = ttsConfig(lang)?.voice || 'cedar';
  const cacheKey = `${guideId}:${lang}:${mode}:${model}:${voice}`;
  let audio = ttsCache.get(cacheKey);
  if (!audio) {
    let pending = ttsInFlight.get(cacheKey);
    if (!pending) {
      pending = generateTtsMp3(guide, lang, mode)
        .then((buffer) => {
          rememberTts(cacheKey, buffer);
          return buffer;
        })
        .finally(() => ttsInFlight.delete(cacheKey));
      ttsInFlight.set(cacheKey, pending);
    }
    try {
      audio = await pending;
    } catch (error) {
      const status = Number(error.statusCode || error.response?.status || 502);
      if (status === 401) return res.status(503).json({ error: 'AI audio kaliti ishlamayapti.' });
      if (status === 429) return res.status(503).json({ error: 'AI audio xizmati vaqtincha band.' });
      return res.status(status >= 400 && status < 600 ? status : 502).json({ error: error.message || 'AI audio yaratilmadi.' });
    }
  }

  res.set({
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.length),
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Audio-Engine': 'OpenAI',
    'X-Audio-Model': model,
    'X-Audio-Voice': voice,
    'X-Audio-Mode': mode,
    'X-Audio-Language': lang,
  });
  res.send(audio);
}));

router.post('/plan', asyncHandler(async (req, res) => {
  const prompt = text(req.body.prompt, 1500);
  if (prompt.length < 4) return res.status(400).json({ error: 'Sayohat istagingizni yozing.' });
  const fallback = fallbackIntent(prompt, req.body.days);
  const parsedIntent = await parseIntentWithOpenAI(prompt, fallback);
  const explicitIntent = mergeExplicitProfile(parsedIntent, req.body.profile || {});
  const intent = normalizeIntentProfile(explicitIntent);
  const startLat = number(req.body.start_latitude);
  const startLon = number(req.body.start_longitude);
  const requestedStart = validCoord(startLat, startLon)
    ? { latitude: startLat, longitude: startLon, name: text(req.body.start_name, 120) || 'Boshlanish nuqtasi' }
    : null;
  const startOutsideSamarkand = requestedStart
    ? haversine(requestedStart.latitude, requestedStart.longitude, CENTER.latitude, CENTER.longitude) > 30000
    : false;
  const start = requestedStart && !startOutsideSamarkand ? requestedStart : CENTER;
  const tripStart = normalizeTripStart(req.body.start_date);
  const weatherAdaptive = req.body.weather_adaptive !== false;

  const [discovered, weatherBundle] = await Promise.all([
    discoverHeritagePois(),
    getTripWeather(tripStart, intent.days),
  ]);
  const ordered = selectPois(discovered.rows, intent, start);
  if (ordered.length < intent.days * 2) return res.status(422).json({ error: 'Marshrut uchun yetarli xarita obyektlari topilmadi.' });
  const rawGroups = splitDays(ordered, intent.days);
  const groups = rebalanceForWeather(rawGroups, weatherBundle.rows, weatherAdaptive);
  const days = [];
  for (let i = 0; i < groups.length; i += 1) {
    const weather = weatherBundle.rows[i] || null;
    const optimized = optimizeDayOrder(groups[i], start, weather, weatherAdaptive);
    const stops = optimized.stops;
    let route = null;
    if (intent.transport !== 'walking') route = await routeDriving(start, stops);
    if (!route) route = routeFallback(start, stops, intent.transport === 'walking');
    const visitDate = weather?.date || addDate(tripStart.date, i);
    const scheduled = daySchedule(stops, route, intent, i, weather, weatherAdaptive, visitDate);
    scheduled.optimization = optimized.meta;
    days.push(scheduled);
  }

  const totalStops = days.reduce((sum, day) => sum + day.stops.length, 0);
  const adaptedDays = days.filter((day) => day.weather_adapted).length;
  const knownClosedVisits = days.flatMap((day) => day.stops || []).filter((stop) => stop.operational?.planned?.status === 'closed');
  const pricedStops = days.flatMap((day) => day.stops || []).filter((stop) => stop.operational?.ticket?.status !== 'unknown');
  res.json({
    version: '1.9.0',
    prompt,
    intent,
    start,
    trip_start_date: tripStart.date,
    weather_adaptive: weatherAdaptive,
    summary: localizedSummary(intent, totalStops, adaptedDays),
    days,
    sources: {
      places: discovered.provider === 'curated-fallback' ? 'Verified curated Samarkand reference catalog' : 'Curated Samarkand references + OpenStreetMap contributors via Overpass API',
      places_provider: discovered.provider,
      external_poi_count: discovered.external_count,
      routing: [...new Set(days.map((d) => d.route?.source).filter(Boolean))],
      optimization: [...new Set(days.map((d) => d.optimization?.method).filter(Boolean))],
      weather: weatherBundle.source,
      operational: 'Official Registan/Samarkand Museum-Reserve catalog + OpenStreetMap fallback',
      audio_guide: process.env.OPENAI_API_KEY ? 'Server-generated MP3 via OpenAI TTS with browser fallback' : 'Browser Speech Synthesis fallback until server AI audio is configured',
      ai: intent.engine === 'openai' ? `OpenAI ${intent.model || ''}`.trim() : 'Local multilingual preference parser',
    },
    warnings: [
      startOutsideSamarkand ? 'Sizning geolokatsiyangiz Samarqand markazidan 30 km dan uzoq bo‘lgani uchun tur Samarqand markazidan boshlandi.' : null,
      weatherBundle.warning,
      discovered.provider === 'curated-fallback' ? 'OpenStreetMap real-vaqt katalogi sekin javob berdi; marshrut tasdiqlangan tayanch obyektlar katalogidan tuzildi.' : null,
      weatherAdaptive && weatherBundle.rows.length ? 'Yomg‘ir, kuchli shamol, keskin issiq yoki sovuq aniqlansa, obyektlarning kunlar va kun ichidagi tartibi avtomatik qayta optimallashtiriladi.' : null,
      intent.wheelchair_accessible ? 'Accessibility talabi hisobga olindi, ammo obyektlarning pandus, lift va kirish sharoiti bo‘yicha ma’lumot to‘liq emas; tashrifdan oldin rasmiy manbadan tasdiqlang.' : null,
      days.some((day) => Number(day.preferred_window?.overrun_minutes || 0) > 0) ? 'Tanlangan kun yakuni vaqtiga sig‘magan kun bor; tashrif sonini kamaytirish yoki yakun vaqtini uzaytirish tavsiya etiladi.' : null,
      knownClosedVisits.length ? `${knownClosedVisits.length} ta tashrifda OSM opening_hours bo‘yicha yopiq bo‘lish ehtimoli aniqlandi; tashrif vaqtini o‘zgartirish yoki rasmiy manbani tekshiring.` : null,
      pricedStops.length ? null : 'Tanlangan obyektlarda rasmiy yoki ishonchli chipta tarifi topilmadi; tizim narxni taxmin qilmadi.',
      'Marshrut tavsiya xarakterida. Ish vaqti, chipta narxi, vaqtinchalik yopilish va kirish qoidalarini rasmiy manbalardan tekshiring.',
      intent.transport === 'walking' ? 'Piyoda rejimida yo‘l chizig‘i geodezik taxmin; piyodalar yo‘laklari bo‘yicha professional routing keyingi bosqichda ulanadi.' : null,
    ].filter(Boolean),
  });
}));

async function runStartupSmoke() {
  try {
    const intent = fallbackIntent('Samarqand tarixiy qadamjolari bo‘yicha 2 kun, ko‘p yurmay, milliy taomlar bilan', 2);
    const discovered = await discoverHeritagePois();
    const selected = selectPois(discovered.rows, intent, CENTER).slice(0, 4);
    const route = selected.length ? (await routeDriving(CENTER, selected) || routeFallback(CENTER, selected, false)) : null;
    const names = selected.map((p) => p.name).join(' | ');
    console.log(`[tour-smoke] v=1.9 provider=${discovered.provider} pois=${discovered.rows.length} external=${discovered.external_count} sample=${names || 'none'} route=${route?.source || 'none'} geometry=${route?.geometry?.type || 'none'}`);
  } catch (error) {
    console.warn(`[tour-smoke] failed=${error.response?.status || error.message}`);
  }
}

if (process.env.TOUR_STARTUP_SMOKE !== 'false') {
  const timer = setTimeout(runStartupSmoke, 2500);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = router;

'use strict';

// Edition 13 adds new records; editions 3–12 and the two RC1 audio tasks stay intact.
// The app concatenates this array into GTAExam.prepareBank's extra questions.
window.GTAExamRC2Questions = [
  {
    id: 'v13-a-homecoming', type: 'mcq', section: 'theory', points: 6,
    title: 'Возвращение домой',
    prompt: 'Почему Си-Джей возвращается в Лос-Сантос в начале San Andreas?',
    game: 'GTA: San Andreas', era: '3d', difficulty: 'easy',
    image: 'assets/scene-03.jpg',
    alt: 'Си-Джей перепрыгивает препятствие на BMX на улице Лос-Сантоса.',
    mediaKind: 'screenshot', imageCaption: 'Официальный кадр из San Andreas.',
    options: [
      { id: 'mother', text: 'Из-за смерти матери' },
      { id: 'wedding', text: 'На свадьбу Свита' },
      { id: 'studio', text: 'Открыть музыкальную студию' },
      { id: 'race', text: 'Участвовать в больших гонках' }
    ],
    answer: 'mother',
    explanation: 'После пяти лет вдали от Лос-Сантоса Карл возвращается домой: его мать убита, а семья распадается. Это завязка истории San Andreas.',
    sources: [
      { title: 'Rockstar Games в Steam — сюжет и кадры San Andreas', url: 'https://store.steampowered.com/app/12120/Grand_Theft_Auto_San_Andreas/' }
    ], spoiler: false
  },
  {
    id: 'v13-a-vice-era', type: 'mcq', section: 'theory', points: 6,
    title: 'Неон, музыка и Томми',
    prompt: 'В каком десятилетии Томми строит свою криминальную империю в Vice City?',
    game: 'GTA: Vice City', era: '3d', difficulty: 'easy',
    image: 'assets/scene-02.jpg',
    alt: 'Томми Версетти рядом с мотоциклом на улице с пальмами.',
    mediaKind: 'screenshot', imageCaption: 'Официальный кадр из Vice City.',
    options: [
      { id: 'seventies', text: 'В 1970-х' },
      { id: 'eighties', text: 'В 1980-х' },
      { id: 'nineties', text: 'В 1990-х' },
      { id: 'noughties', text: 'В 2000-х' }
    ],
    answer: 'eighties',
    explanation: 'Vice City переносит игрока в 1980-е. Музыка, мода и неоновые улицы — часть этой эпохи, а не времени выхода игры.',
    sources: [
      { title: 'Rockstar Games — Vice City: Welcome to the 1980s', url: 'https://www.rockstargames.com/games/vicecity' },
      { title: 'Rockstar Games в Steam — официальный кадр Vice City', url: 'https://store.steampowered.com/app/12110/' }
    ], spoiler: false
  },
  {
    id: 'v13-a-bellics', type: 'mcq', section: 'theory', points: 6,
    title: 'Семейные связи',
    prompt: 'Роман зовёт Нико в Либерти-Сити. Кем они друг другу приходятся?',
    game: 'GTA IV', era: 'hd', difficulty: 'easy',
    image: 'assets/scene-04.jpg',
    alt: 'Нико Беллик в коричневой куртке во время уличной перестрелки.',
    mediaKind: 'screenshot', imageCaption: 'Официальный кадр из GTA IV.',
    options: [
      { id: 'cousins', text: 'Двоюродные братья' },
      { id: 'brothers', text: 'Родные братья' },
      { id: 'uncle', text: 'Дядя и племянник' },
      { id: 'friends', text: 'Друзья детства' }
    ],
    answer: 'cousins',
    explanation: 'Нико и Роман Беллики — двоюродные братья. В официальном описании GTA IV Роман прямо назван кузеном Нико.',
    sources: [
      { title: 'Rockstar Games — Grand Theft Auto IV', url: 'https://www.rockstargames.com/games/IV' },
      { title: 'Rockstar Games в Steam — официальный кадр GTA IV', url: 'https://store.steampowered.com/app/12210/' }
    ], spoiler: false
  },
  {
    id: 'v13-a-franklin-skill', type: 'mcq', section: 'theory', points: 6,
    title: 'Свой талант',
    prompt: 'Какая спецспособность есть у Франклина в сюжетном режиме GTA V?',
    game: 'GTA V', era: 'hd', difficulty: 'easy',
    image: 'assets/scene-05.jpg',
    alt: 'Франклин Клинтон с бейсбольной битой на фоне жилого района.',
    mediaKind: 'screenshot', imageCaption: 'Официальный кадр из GTA V.',
    options: [
      { id: 'driving', text: 'Замедлять время за рулём' },
      { id: 'shooting', text: 'Замедлять время в перестрелке' },
      { id: 'rage', text: 'Впадать в ярость и наносить больше урона' },
      { id: 'wanted', text: 'Мгновенно снимать весь розыск' }
    ],
    answer: 'driving',
    explanation: 'Франклин замедляет время, управляя наземным транспортом. Замедление в перестрелке принадлежит Майклу, а ярость с повышенным уроном — Тревору.',
    sources: [
      { title: 'Официальное руководство GTA V — Special Ability', url: 'https://dlassets-ssl.xboxlive.com/public/content/4f0a3089-ba2c-4f3d-9e38-102a41cbd885/GameManual/9dfeb637-1cb0-46c8-b7d7-0c58cf990494/en-GB/index.html' },
      { title: 'Rockstar Games в Steam — официальный кадр GTA V', url: 'https://store.steampowered.com/app/271590/' }
    ], spoiler: false
  },
  {
    id: 'v13-b-city-return', type: 'image', section: 'field', points: 8,
    title: 'Знакомый город, новая история',
    prompt: 'Этот город из GTA III вернулся в GTA IV в новой версии. Как он называется?',
    game: 'GTA III / GTA IV', era: 'mixed', difficulty: 'easy',
    image: 'assets/scene-01.jpg',
    alt: 'Ночная улица GTA III с неоновой башней и рекламой Flashback FM.',
    mediaKind: 'screenshot', imageCaption: 'Официальный кадр из GTA III.',
    options: [
      { id: 'liberty', text: 'Либерти-Сити' },
      { id: 'vice', text: 'Вайс-Сити' },
      { id: 'santos', text: 'Лос-Сантос' },
      { id: 'fierro', text: 'Сан-Фиерро' }
    ],
    answer: 'liberty',
    explanation: 'И GTA III, и GTA IV происходят в Либерти-Сити. На изображении показан город из GTA III.',
    sources: [
      { title: 'Rockstar Games — Grand Theft Auto III', url: 'https://www.rockstargames.com/games/grandtheftauto3' },
      { title: 'Rockstar Games — Grand Theft Auto IV', url: 'https://www.rockstargames.com/games/IV' },
      { title: 'Rockstar Games в Steam — официальный кадр GTA III', url: 'https://store.steampowered.com/app/12100/' }
    ], spoiler: false
  },
  {
    id: 'v13-b-leonida', type: 'image', section: 'field', points: 8,
    title: 'Следующая остановка',
    prompt: 'Вайс-Сити возвращается в GTA VI. Как называется штат вокруг него?',
    game: 'GTA VI', era: 'hd', difficulty: 'easy',
    image: 'assets/rc2/vi-vice-city.jpg',
    alt: 'Официальная панорама Вайс-Сити: небоскрёбы, яхты и бирюзовая вода.',
    mediaKind: 'screenshot', imageCaption: 'Официальный кадр GTA VI — Vice City.',
    options: [
      { id: 'leonida', text: 'Леонида' },
      { id: 'sanandreas', text: 'Сан-Андреас' },
      { id: 'liberty', text: 'Либерти' },
      { id: 'alderney', text: 'Олдерни' }
    ],
    answer: 'leonida',
    explanation: 'Rockstar представляет мир GTA VI как штат Леонида: Вайс-Сити и территории за его пределами. Это информация с официального сайта, без догадок о сюжете.',
    sources: [
      { title: 'Rockstar Games — GTA VI: Only in Leonida', url: 'https://www.rockstargames.com/VI/only-in-leonida/vice-city' }
    ], spoiler: false
  },
  {
    id: 'v13-b-release-order', type: 'order', section: 'field', points: 8,
    title: 'Пять шагов до новой эпохи',
    prompt: 'Расположите игры по первому выходу: от самой ранней к самой поздней. Учитывайте релизы оригинальных игр, а не годы их сюжета.',
    game: 'GTA III / Vice City / San Andreas / IV / V', era: 'mixed', difficulty: 'medium',
    mediaKind: 'logo-order',
    instruction: 'Перемещайте карточки стрелками вверх и вниз. За каждую верную позицию — 1 балл, за весь порядок — ещё 3.',
    items: [
      { id: 'iii', text: 'GTA III', image: 'assets/rc2/logo-iii.jpg', alt: 'Логотип Grand Theft Auto III' },
      { id: 'vicecity', text: 'GTA: Vice City', image: 'assets/rc2/logo-vice-city.jpg', alt: 'Логотип Grand Theft Auto: Vice City' },
      { id: 'sanandreas', text: 'GTA: San Andreas', image: 'assets/rc2/logo-san-andreas.jpg', alt: 'Логотип Grand Theft Auto: San Andreas' },
      { id: 'iv', text: 'GTA IV', image: 'assets/rc2/logo-iv-original.png', alt: 'Логотип Grand Theft Auto IV' },
      { id: 'v', text: 'GTA V', image: 'assets/rc2/logo-v.jpg', alt: 'Логотип Grand Theft Auto V' }
    ],
    answerIds: ['iii', 'vicecity', 'sanandreas', 'iv', 'v'], pointsPerItem: 1, perfectBonus: 3,
    explanation: 'Порядок первых релизов: GTA III — 2001; Vice City — 2002; San Andreas — 2004; GTA IV — 2008; GTA V — 2013. Даты портов и переизданий здесь не учитываются.',
    sources: [
      { title: 'Rockstar Games — первый выпуск GTA III', url: 'https://media.rockstargames.com/broadcast/20111020/en_US_web.html' },
      { title: 'Rockstar Games — Vice City', url: 'https://www.rockstargames.com/games/vicecity' },
      { title: 'Rockstar Games — десятилетие San Andreas', url: 'https://www.rockstargames.com/newswire/article/ak14o88384o97o/san-andreas-anniversary-gta-trilogy-titles-now-on-sale-for' },
      { title: 'Take-Two — первый выпуск GTA IV', url: 'https://ir.take2games.com/static-files/a30ac581-38d0-4841-8753-0f7015521faf' },
      { title: 'Take-Two — релиз GTA V в отчёте за 2014 год', url: 'https://ir.take2games.com/static-files/14996949-bb1b-44a8-8089-efb0c54f9415' }
    ], spoiler: false
  }
];

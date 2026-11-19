'use strict';

// Editorial questions for the final section and the Russia × GTA additions.
// Sources combine Rockstar publications and independent game references.
window.GTAExamContent = {
  schemaVersion: 2,
  finalQuestions: [
    {
      id: 'c02-universes',
      type: 'classify',
      section: 'final',
      title: 'Разные вселенные',
      stageTitle: 'C2 · Проверка канона',
      prompt: 'Распределите игры по сюжетным вселенным GTA: 2D, 3D и HD. Здесь важен канон, а не положение камеры.',
      game: 'Grand Theft Auto: 2D / 3D / HD',
      era: 'mixed',
      eras: ['2d', '3d', 'hd'],
      difficulty: 'hard',
      points: 12,
      pointsPerItem: 2,
      categories: [
        { id: '2d', text: '2D' },
        { id: '3d', text: '3D' },
        { id: 'hd', text: 'HD' }
      ],
      items: [
        { id: 'gta-1997', text: 'GTA (1997)', answer: '2d' },
        { id: 'advance', text: 'GTA Advance', answer: '3d' },
        { id: 'chinatown', text: 'GTA: Chinatown Wars', answer: 'hd' },
        { id: 'gta-2', text: 'GTA 2', answer: '2d' },
        { id: 'san-andreas', text: 'GTA: San Andreas', answer: '3d' },
        { id: 'gta-iv', text: 'GTA IV', answer: 'hd' }
      ],
      explanation: 'GTA (1997) и GTA 2 относятся к 2D-вселенной. San Andreas и Advance — к 3D-вселенной. GTA IV и Chinatown Wars — к HD-вселенной. Вид сверху сам по себе не определяет сюжетную вселенную: именно Advance и Chinatown Wars здесь проверяют внимательность к канону.',
      sources: [
        {
          title: 'Grand Theft Wiki — Universes',
          url: 'https://www.grandtheftwiki.com/Universes'
        }
      ],
      spoiler: false
    },
    {
      id: 'c03-museum',
      type: 'case',
      section: 'final',
      title: 'Три стороны одной сделки',
      stageTitle: 'C3 · Финальное дело',
      prompt: 'В музее Либертониан пересекаются истории Нико, Джонни и Луиса. Восстановите дело в трёх шагах: предмет сделки, игры участников и названия миссий.',
      game: 'GTA IV / The Lost and Damned / The Ballad of Gay Tony',
      era: 'hd',
      difficulty: 'hard',
      points: 14,
      steps: [
        {
          id: 'object',
          type: 'mcq',
          presentation: 'evidence-scope',
          title: 'Улика',
          stageTitle: 'Улика',
          prompt: 'Что собирались продать во время сделки в музее?',
          points: 2,
          options: [
            { id: 'diamonds', text: 'Бриллианты' },
            { id: 'sword', text: 'Старинный меч' },
            { id: 'film', text: 'Плёнку с компроматом' },
            { id: 'gold', text: 'Золотые слитки' }
          ],
          answer: 'diamonds',
          explanation: 'В музее происходит сделка с бриллиантами. Эта встреча показана в трёх историях с разных точек зрения.'
        },
        {
          id: 'games',
          type: 'match',
          title: 'Участники',
          stageTitle: 'Участники',
          prompt: 'Сопоставьте каждого героя с историей, в которой мы играем за него.',
          points: 6,
          pointsPerItem: 2,
          pairs: [
            { id: 'niko', left: 'Нико Беллик', right: 'GTA IV' },
            { id: 'johnny', left: 'Джонни Клебиц', right: 'The Lost and Damned' },
            { id: 'luis', left: 'Луис Лопес', right: 'The Ballad of Gay Tony' }
          ],
          explanation: 'Нико — главный герой GTA IV, Джонни — The Lost and Damned, Луис — The Ballad of Gay Tony.'
        },
        {
          id: 'missions',
          type: 'match',
          title: 'Три перспективы',
          stageTitle: 'Три перспективы',
          prompt: 'Одно событие — три миссии. Укажите, как называется эта миссия в истории каждого героя.',
          points: 6,
          pointsPerItem: 2,
          pairs: [
            { id: 'niko', left: 'Нико Беллик', right: 'Museum Piece' },
            { id: 'johnny', left: 'Джонни Клебиц', right: 'Collector’s Item' },
            { id: 'luis', left: 'Луис Лопес', right: 'Not So Fast' }
          ],
          explanation: 'Нико участвует в Museum Piece, Джонни — в Collector’s Item, Луис — в Not So Fast. Это разные перспективы одной встречи, а не три события, которые нужно поставить по времени.'
        }
      ],
      explanation: 'В Либертониане пересекаются три истории вокруг сделки с бриллиантами. GTA IV показывает её со стороны Нико в Museum Piece; The Lost and Damned — со стороны Джонни в Collector’s Item; The Ballad of Gay Tony — со стороны Луиса в Not So Fast.',
      sources: [
        {
          title: 'GTA Base — Museum Piece',
          url: 'https://www.gtabase.com/grand-theft-auto-iv/missions/museum-piece'
        },
        {
          title: 'GTA Base — Collector’s Item',
          url: 'https://www.gtabase.com/grand-theft-auto-iv/missions-tlad/collector-s-item'
        },
        {
          title: 'GTA Base — Not So Fast',
          url: 'https://www.gtabase.com/grand-theft-auto-iv/missions-tbogt/not-so-fast'
        }
      ],
      spoiler: true
    }
  ],
  russiaQuestions: [
    {
      id: 'b-logo-archive',
      type: 'image',
      section: 'field',
      title: 'История за логотипом',
      prompt: 'После убийства отца Хуан Ли (Huang Lee) везёт старинный меч дяде в Либерти-Сити. Какой игре на плакате соответствует эта завязка?',
      game: 'Grand Theft Auto: Chinatown Wars',
      era: 'hd',
      difficulty: 'medium',
      points: 8,
      image: 'assets/series-logo-archive.png',
      alt: 'Архивный плакат: логотипы игр Grand Theft Auto в сетке четыре на четыре с подписями лет.',
      mediaKind: 'archive',
      caption: 'Архив логотипов серии',
      imageCaption: 'Архивный плакат. Подпись «2025» у GTA VI устарела; даты на изображении не входят в задание.',
      options: [
        { id: 'advance', text: 'GTA Advance' },
        { id: 'chinatown', text: 'GTA: Chinatown Wars' },
        { id: 'liberty-stories', text: 'GTA: Liberty City Stories' },
        { id: 'vice-stories', text: 'GTA: Vice City Stories' }
      ],
      answer: 'chinatown',
      explanation: 'Это GTA: Chinatown Wars. В официальном описании Rockstar Хуан Ли после убийства отца должен доставить старинный меч своему дяде Кенни в Либерти-Сити.',
      sources: [
        {
          title: 'Rockstar Games — описание Chinatown Wars',
          url: 'https://www.rockstargames.com/games/chinatownwars'
        },
        {
          title: 'Rockstar Games в App Store — завязка Chinatown Wars',
          url: 'https://apps.apple.com/us/app/gta-chinatown-wars/id344186162'
        },
        {
          title: 'Rockstar Games — актуальная GTA VI (проверено 11.11.2026)',
          url: 'https://www.rockstargames.com/VI'
        }
      ],
      spoiler: false
    },
    {
      id: 'a-rune-cheburek',
      type: 'mcq',
      section: 'theory',
      title: 'Тюнинг по-домашнему',
      prompt: 'Какой необычный тюнинг действительно доступен для RUNE Cheburek в GTA Online?',
      game: 'Grand Theft Auto Online',
      era: 'hd',
      difficulty: 'easy',
      points: 3,
      options: [
        { id: 'cardboard', text: 'Картонные бамперы и спойлер' },
        { id: 'steam', text: 'Паровой двигатель' },
        { id: 'wood', text: 'Деревянные колёса' },
        { id: 'skis', text: 'Лыжи вместо передних колёс' }
      ],
      answer: 'cardboard',
      explanation: 'У RUNE Cheburek действительно есть картонные бамперы, пороги и спойлер. Эти детали доступны в самой GTA Online. В облике машины узнаётся семейство классических ВАЗ.',
      sources: [
        {
          title: 'Rockstar — RUNE Cheburek в GTA Online',
          url: 'https://support.rockstargames.com/articles/1pWpozxm5YGosarsRoJGN6/gtav-title-update-1-43-notes-ps4-xbox-one-pc'
        },
        {
          title: 'GTA Base — модификации Cheburek',
          url: 'https://www.gtabase.com/grand-theft-auto-v/vehicles/rune-cheburek'
        }
      ],
      spoiler: false
    },
    {
      id: 'b-basta-mama',
      type: 'audio',
      section: 'field',
      title: 'Знакомая частота',
      prompt: 'В какой части GTA песня Басты «Мама» входила в первоначальный радиосаундтрек?',
      game: 'Grand Theft Auto IV',
      era: 'hd',
      difficulty: 'medium',
      points: 8,
      audio: 'assets/audio/radio-fragment-01.mp3',
      audioDuration: 20,
      audioTitle: 'Баста — «Мама»',
      audioWaveform: [
        0.415, 0.795, 0.528, 0.706, 0.553, 0.54, 0.89, 0.677,
        0.586, 0.475, 0.234, 0.959, 0.721, 0.501, 0.839, 0.679,
        0.705, 0.535, 0.412, 0.776, 0.704, 0.616, 0.32, 0.886,
        0.701, 0.818, 0.462, 0.277, 0.49, 0.93, 0.581, 0.571,
        0.958, 0.722, 0.696, 0.47, 0.855, 0.552, 0.753, 0.391,
        0.478, 1, 0.711, 0.589, 0.385, 0.569, 0.866, 0.643,
        0.276, 0.818, 0.644, 0.709, 0.463, 0.429, 0.806, 0.58,
        0.551, 0.385, 0.915, 0.644, 0.602, 0.36, 0.247, 0.077
      ],
      options: [
        { id: 'vicecity', text: 'GTA: Vice City' },
        { id: 'sanandreas', text: 'GTA: San Andreas' },
        { id: 'iv', text: 'GTA IV' },
        { id: 'v', text: 'GTA V' }
      ],
      answer: 'iv',
      explanation: '«Мама» Басты звучала на Vladivostok FM в исходном плейлисте GTA IV. В апреле 2018 года часть музыки из игры удалили из-за лицензионных ограничений. «Мама» тоже покинула обновлённый плейлист, поэтому вопрос относится к первоначальному радиосаундтреку.',
      sources: [
        {
          title: 'GTA Base — исходный плейлист Vladivostok FM',
          url: 'https://www.gtabase.com/grand-theft-auto-iv/radio-stations/'
        },
        {
          title: 'Rockstar — изменения музыки в GTA IV',
          url: 'https://support.rockstargames.com/articles/74vCpWsDvBmzIMFAlutqY6/music-updates-in-grand-theft-auto-iv-the-lost-and-damned-and-the-ballad-of-gay-tony'
        }
      ],
      spoiler: false
    }
  ],
  // Edition 6 is deliberately easier. Legacy question objects above remain unchanged.
  easyQuestions: [
    {
      id: 'v6-a-cj', type: 'mcq', section: 'theory', points: 3,
      title: 'Свой на районе',
      prompt: 'Как зовут героя на велосипеде?',
      game: 'GTA: San Andreas', era: '3d', difficulty: 'easy',
      image: 'assets/scene-03.jpg',
      alt: 'Герой в тёмной куртке делает прыжок на велосипеде у городской стены.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      options: [
        { id: 'cj', text: 'Си-Джей' },
        { id: 'niko', text: 'Нико Беллик' },
        { id: 'tommy', text: 'Томми Версетти' },
        { id: 'claude', text: 'Клод' }
      ],
      answer: 'cj',
      explanation: 'Это Карл Джонсон, он же Си-Джей — главный герой GTA: San Andreas.',
      sources: [
        { title: 'Rockstar Games в App Store — San Andreas', url: 'https://apps.apple.com/us/app/grand-theft-auto-san-andreas/id763692274' },
        { title: 'Rockstar Games в Steam — официальный кадр San Andreas', url: 'https://store.steampowered.com/app/12120/' }
      ], spoiler: false
    },
    {
      id: 'v6-a-tommy', type: 'mcq', section: 'theory', points: 3,
      title: 'Гость из восьмидесятых',
      prompt: 'Кто стоит рядом с мотоциклом?',
      game: 'GTA: Vice City', era: '3d', difficulty: 'easy',
      image: 'assets/scene-02.jpg',
      alt: 'Мужчина в спортивном костюме стоит рядом с мотоциклом на городской улице.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      options: [
        { id: 'tommy', text: 'Томми Версетти' },
        { id: 'cj', text: 'Си-Джей' },
        { id: 'niko', text: 'Нико Беллик' },
        { id: 'trevor', text: 'Тревор Филипс' }
      ],
      answer: 'tommy',
      explanation: 'На кадре Томми Версетти — главный герой GTA: Vice City.',
      sources: [
        { title: 'Rockstar Games — The Trilogy: The Definitive Edition', url: 'https://www.rockstargames.com/newswire/article/25ak3481oa1384/grand-theft-auto-the-trilogy-the-definitive-edition-now-available' },
        { title: 'Rockstar Games в Steam — официальный кадр Vice City', url: 'https://store.steampowered.com/app/12110/' }
      ], spoiler: false
    },
    {
      id: 'v6-a-niko', type: 'mcq', section: 'theory', points: 3,
      title: 'Знакомое лицо',
      prompt: 'Кто на переднем плане слева?',
      game: 'GTA IV', era: 'hd', difficulty: 'easy',
      image: 'assets/scene-04.jpg',
      alt: 'Уличная перестрелка. Мужчина в коричневой куртке находится на переднем плане слева.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      options: [
        { id: 'niko', text: 'Нико Беллик' },
        { id: 'michael', text: 'Майкл Де Санта' },
        { id: 'tommy', text: 'Томми Версетти' },
        { id: 'franklin', text: 'Франклин Клинтон' }
      ],
      answer: 'niko',
      explanation: 'Это Нико Беллик, главный герой GTA IV.',
      sources: [
        { title: 'Rockstar Games — Grand Theft Auto IV', url: 'https://www.rockstargames.com/games/IV' },
        { title: 'Rockstar Games в Steam — официальный кадр GTA IV', url: 'https://store.steampowered.com/app/12210/' }
      ], spoiler: false
    },
    {
      id: 'v6-a-franklin', type: 'mcq', section: 'theory', points: 3,
      title: 'Без лишних слов',
      prompt: 'Кто держит биту на кадре?',
      game: 'GTA V', era: 'hd', difficulty: 'easy',
      image: 'assets/scene-05.jpg',
      alt: 'Молодой мужчина держит бейсбольную биту на фоне жилого района.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      options: [
        { id: 'franklin', text: 'Франклин Клинтон' },
        { id: 'cj', text: 'Си-Джей' },
        { id: 'michael', text: 'Майкл Де Санта' },
        { id: 'trevor', text: 'Тревор Филипс' }
      ],
      answer: 'franklin',
      explanation: 'Это Франклин Клинтон — один из главных героев GTA V.',
      sources: [
        { title: 'Rockstar Games — Michael, Franklin & Trevor', url: 'https://www.rockstargames.com/newswire/article/25o2411819aok8/original-gtav-artwork-michael-franklin-trevor.html' },
        { title: 'Rockstar Games в Steam — официальный кадр GTA V', url: 'https://store.steampowered.com/app/271590/' }
      ], spoiler: false
    },
    {
      id: 'v6-a-liberty', type: 'mcq', section: 'theory', points: 3,
      title: 'Город первой трёхмерной',
      prompt: 'В каком городе происходит GTA III?',
      game: 'GTA III', era: '3d', difficulty: 'easy',
      image: 'assets/scene-01.jpg',
      alt: 'Ночная городская улица с неоновыми вывесками и автомобилями.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      options: [
        { id: 'liberty', text: 'Либерти-Сити' },
        { id: 'vice', text: 'Вайс-Сити' },
        { id: 'santos', text: 'Лос-Сантос' },
        { id: 'fierro', text: 'Сан-Фиерро' }
      ],
      answer: 'liberty',
      explanation: 'GTA III разворачивается в Либерти-Сити.',
      sources: [
        { title: 'Rockstar Games — Grand Theft Auto: The Trilogy', url: 'https://store.rockstargames.com/game/buy-grand-theft-auto-the-trilogy' },
        { title: 'Rockstar Games в Steam — официальный кадр GTA III', url: 'https://store.steampowered.com/app/12100/' }
      ], spoiler: false
    },
    {
      id: 'v6-a-bmx', type: 'mcq', section: 'theory', points: 3,
      title: 'Первый транспорт',
      prompt: 'На чём едет герой?',
      game: 'GTA: San Andreas', era: '3d', difficulty: 'easy',
      image: 'assets/scene-03.jpg',
      alt: 'Персонаж перепрыгивает препятствие на двухколёсном транспорте.',
      mediaKind: 'screenshot', imageCaption: 'Рассмотри транспорт на официальном кадре.',
      options: [
        { id: 'bmx', text: 'На велосипеде BMX' },
        { id: 'motorbike', text: 'На мотоцикле' },
        { id: 'quad', text: 'На квадроцикле' },
        { id: 'skate', text: 'На скейтборде' }
      ],
      answer: 'bmx',
      explanation: 'На кадре BMX. Для этого ответа достаточно внимательно рассмотреть велосипед.',
      sources: [
        { title: 'Rockstar Games в Steam — официальный кадр San Andreas', url: 'https://store.steampowered.com/app/12120/' }
      ], spoiler: false
    },
    {
      id: 'v6-a-crew', type: 'mcq', section: 'theory', points: 3,
      title: 'Переключить героя',
      prompt: 'Сколько главных героев в сюжетном режиме GTA V?',
      game: 'GTA V', era: 'hd', difficulty: 'easy',
      options: [
        { id: 'one', text: 'Один' },
        { id: 'two', text: 'Два' },
        { id: 'three', text: 'Три' },
        { id: 'four', text: 'Четыре' }
      ],
      answer: 'three',
      explanation: 'В GTA V три главных героя: Майкл, Франклин и Тревор. Между ними можно переключаться по ходу истории.',
      sources: [
        { title: 'Rockstar Games — Michael, Franklin & Trevor', url: 'https://www.rockstargames.com/newswire/article/25o2411819aok8/original-gtav-artwork-michael-franklin-trevor.html' }
      ], spoiler: false
    },
    {
      id: 'v6-a-chop', type: 'mcq', section: 'theory', points: 3,
      title: 'Лучший друг',
      prompt: 'Как зовут пса, с которым Франклин может гулять в GTA V?',
      game: 'GTA V', era: 'hd', difficulty: 'easy',
      options: [
        { id: 'chop', text: 'Чоп' },
        { id: 'rex', text: 'Рэкс' },
        { id: 'bruno', text: 'Бруно' },
        { id: 'spike', text: 'Спайк' }
      ],
      answer: 'chop',
      explanation: 'Пса зовут Чоп. В GTA V Франклин может гулять с ним и играть в мяч.',
      sources: [
        { title: 'Rockstar Games — Franklin & Chop on Guard', url: 'https://www.rockstargames.com/newswire/article/ak14o8838kaoa1/original-grand-theft-auto-v-artwork-franklin-chop-on-guard.html' },
        { title: 'Rockstar Games — The Contract', url: 'https://www.rockstargames.com/newswire/article/ak759k91592728/gta-online-the-contract-out-now' },
        { title: 'GTA Base — прогулка и игра с Чопом', url: 'https://www.gtabase.com/grand-theft-auto-v/weapons/ball' }
      ], spoiler: false
    },
    {
      id: 'v6-b-ride', type: 'image', section: 'field', points: 8,
      title: 'Тест-драйв',
      prompt: 'Что умеет эта бронемашина APC в GTA Online?',
      game: 'GTA Online', era: 'hd', difficulty: 'easy',
      image: 'assets/scene-06.jpg',
      alt: 'Бронированная колёсная машина с установленным вооружением.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр обновления Gunrunning.',
      options: [
        { id: 'land-water', text: 'Ездить по суше и плавать' },
        { id: 'fly', text: 'Взлетать как самолёт' },
        { id: 'rails', text: 'Ездить только по рельсам' },
        { id: 'teleport', text: 'Телепортироваться по карте' }
      ],
      answer: 'land-water',
      explanation: 'APC — амфибия: она передвигается по суше и по воде. Rockstar отдельно отмечает это в описании Gunrunning.',
      sources: [
        { title: 'Rockstar Games — Gunrunning: первые детали и кадры', url: 'https://www.rockstargames.com/newswire/article/51974aa3a553k2/First-Details-and-Screens-for-GTA-Online-Gunrunning' },
        { title: 'Rockstar Games — Gunrunning Now Available', url: 'https://www.rockstargames.com/newswire/article/25o241181331a4/GTA-Online-Gunrunning-Now-Available' },
        { title: 'Rockstar Games в Steam — официальный кадр APC', url: 'https://store.steampowered.com/app/271590/' }
      ], spoiler: false
    },
    {
      id: 'v6-b-map', type: 'image', section: 'field', points: 8,
      title: 'Знакомый горизонт',
      prompt: 'Как называется главный город GTA V?',
      game: 'GTA V', era: 'hd', difficulty: 'easy',
      image: 'assets/v6-los-santos-skyline.jpg',
      alt: 'Панорама большого города на закате с небоскрёбами и вертолётом.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      options: [
        { id: 'santos', text: 'Лос-Сантос' },
        { id: 'liberty', text: 'Либерти-Сити' },
        { id: 'vice', text: 'Вайс-Сити' },
        { id: 'fierro', text: 'Сан-Фиерро' }
      ],
      answer: 'santos',
      explanation: 'Главный город GTA V — Лос-Сантос. За его пределами можно исследовать округ Блэйн.',
      sources: [
        { title: 'Rockstar Games в Steam — описание и кадры GTA V', url: 'https://store.steampowered.com/app/271590/' }
      ], spoiler: false
    },
    {
      id: 'v6-b-grove', type: 'match', section: 'field', points: 8,
      pointsPerItem: 2, perfectBonus: 2,
      title: 'Цвета района',
      prompt: 'Соедини банды San Andreas с их цветами.',
      game: 'GTA: San Andreas', era: '3d', difficulty: 'medium',
      image: 'assets/scene-03.jpg',
      alt: 'Уличная сцена из игры: персонаж едет на велосипеде.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр. Цвета нужно вспомнить по игре.',
      pairs: [
        { id: 'families', left: 'Grove Street Families', right: 'Зелёный' },
        { id: 'ballas', left: 'Ballas', right: 'Фиолетовый' },
        { id: 'vagos', left: 'Los Santos Vagos', right: 'Жёлтый' }
      ],
      explanation: 'Grove Street Families носят зелёное, Ballas — фиолетовое, Los Santos Vagos — жёлтое. За каждую пару — 2 балла, ещё 2 за все три.',
      sources: [
        { title: 'GTA Base — банды и их цвета в San Andreas', url: 'https://www.gtabase.com/gta-san-andreas/gangs/' },
        { title: 'Rockstar Games в Steam — официальный кадр San Andreas', url: 'https://store.steampowered.com/app/12120/' }
      ], spoiler: false
    },
    {
      id: 'v6-b-logo-archive', type: 'image', section: 'field', points: 8,
      title: 'Город за логотипом',
      prompt: 'У части с зелёной римской V главный город — …?',
      game: 'GTA V', era: 'hd', difficulty: 'easy',
      image: 'assets/series-logo-archive.png',
      alt: 'Архивный плакат с шестнадцатью логотипами игр Grand Theft Auto.',
      mediaKind: 'archive', caption: 'Архив логотипов серии',
      imageCaption: 'Архивный плакат. Подпись «2025» у GTA VI устарела; даты на изображении не входят в задание.',
      options: [
        { id: 'santos', text: 'Лос-Сантос' },
        { id: 'liberty', text: 'Либерти-Сити' },
        { id: 'vice', text: 'Вайс-Сити' },
        { id: 'fierro', text: 'Сан-Фиерро' }
      ],
      answer: 'santos',
      explanation: 'Зелёная V с лентой — логотип GTA V. Главный город этой игры — Лос-Сантос.',
      sources: [
        { title: 'Rockstar Games в Steam — GTA V и Лос-Сантос', url: 'https://store.steampowered.com/app/271590/' },
        { title: 'Rockstar Games — актуальная GTA VI (проверено 11.11.2026)', url: 'https://www.rockstargames.com/VI' }
      ], spoiler: false
    },
    {
      id: 'v6-c-timeline', type: 'order', section: 'final', points: 10,
      pointsPerItem: 2, perfectBonus: 2,
      title: 'Порядок выхода', stageTitle: 'C1 · Расставь игры',
      prompt: 'Расставь четыре игры по выходу: от самой ранней к самой поздней.',
      game: 'GTA III / Vice City / San Andreas / GTA IV', era: 'mixed', eras: ['3d', 'hd'], difficulty: 'medium',
      image: 'assets/scene-04.jpg',
      alt: 'Кадр из архива серии: перестрелка на городской улице.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр. В задании важен порядок релизов, а не сюжетные годы.',
      items: [
        { id: 'iii', text: 'GTA III' },
        { id: 'vice', text: 'GTA: Vice City' },
        { id: 'sa', text: 'GTA: San Andreas' },
        { id: 'iv', text: 'GTA IV' }
      ],
      answerIds: ['iii', 'vice', 'sa', 'iv'],
      explanation: 'Порядок такой: GTA III (2001) → Vice City (2002) → San Andreas (2004) → GTA IV (2008). За каждое верное место — 2 балла, ещё 2 за весь порядок.',
      sources: [
        { title: 'Rockstar Games — GTA III', url: 'https://www.rockstargames.com/games/grandtheftauto3' },
        { title: 'Rockstar Games — Vice City', url: 'https://www.rockstargames.com/games/vicecity' },
        { title: 'Rockstar Games — San Andreas', url: 'https://www.rockstargames.com/games/sanandreas' },
        { title: 'Rockstar Games — GTA IV', url: 'https://www.rockstargames.com/games/IV' }
      ], spoiler: false
    },
    {
      id: 'v6-c-street-names', type: 'classify', section: 'final', points: 12,
      pointsPerItem: 2,
      title: 'Кто есть кто', stageTitle: 'C2 · Разложи по полкам',
      prompt: 'Разложи знакомые названия по трём группам.',
      game: 'GTA: San Andreas / GTA V / GTA Online', era: 'mixed', eras: ['3d', 'hd'], difficulty: 'medium',
      image: 'assets/v6-vinewood-street.jpg',
      alt: 'Городская улица с пешеходами, магазинами и яркими вывесками.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр издателя.',
      categoryLabel: 'Выбери группу',
      categories: [
        { id: 'people', text: 'Люди' },
        { id: 'cities', text: 'Города' },
        { id: 'businesses', text: 'Магазины и мастерские' }
      ],
      items: [
        { id: 'lamar', text: 'Ламар Дэвис', answer: 'people' },
        { id: 'lester', text: 'Лестер Крест', answer: 'people' },
        { id: 'fierro', text: 'Сан-Фиерро', answer: 'cities' },
        { id: 'venturas', text: 'Лас-Вентурас', answer: 'cities' },
        { id: 'ammu', text: 'Ammu-Nation', answer: 'businesses' },
        { id: 'customs', text: 'Los Santos Customs', answer: 'businesses' }
      ],
      explanation: 'Ламар и Лестер — персонажи. Сан-Фиерро и Лас-Вентурас — города San Andreas. Ammu-Nation торгует оружием, а Los Santos Customs занимается автомобилями. Каждое верное название приносит 2 балла.',
      sources: [
        { title: 'Rockstar Games — The Contract: Ламар Дэвис', url: 'https://www.rockstargames.com/newswire/article/ak759k91592728/gta-online-the-contract-out-now' },
        { title: 'Rockstar Games — Heists: Лестер Крест', url: 'https://support.rockstargames.com/articles/5enLtosoA4nuxfZ8Y03Fo9/how-to-access-heists-in-gta-online' },
        { title: 'Rockstar Games — три города San Andreas', url: 'https://www.rockstargames.com/newswire/article/9k124883835743/san-andreas-now-available-for-ios.html' },
        { title: 'Официальное руководство GTA V — Ammu-Nation и Los Santos Customs', url: 'https://dlassets-ssl.xboxlive.com/public/content/4f0a3089-ba2c-4f3d-9e38-102a41cbd885/GameManual/9dfeb637-1cb0-46c8-b7d7-0c58cf990494/en-GB/index.html' }
      ], spoiler: false
    },
    {
      id: 'v6-c-rpg', type: 'rpg', section: 'final', points: 14,
      title: 'Воздушная цель', stageTitle: 'C3 · Игровая практика',
      prompt: 'Порази пролетающий вертолёт из РПГ. Три ракеты, две кнопки и два попадания до победы.',
      game: 'GTA 2026 · учебный полигон', era: 'practice', difficulty: 'medium',
      explanation: 'В игровом финале оцениваются попадания: одно — 7 баллов, два — 14. На раунд выданы три ракеты; время не ограничено. Включи прицел, дождись захвата и стреляй. Сцена создана для экзамена на основе нашего WebGL-прототипа GTA 2026.',
      sources: [], spoiler: false
    },
    {
      id: 'v6-c-heist-case', type: 'case', section: 'final', points: 14,
      title: 'Собрать команду', stageTitle: 'C3 · Последнее дело',
      prompt: 'Учебное ограбление в духе GTA V: выбери транспорт, вспомни способности героев и раздай роли команде.',
      game: 'GTA V', era: 'hd', difficulty: 'medium',
      image: 'assets/v6-getaway-pursuit.jpg',
      alt: 'Автомобиль на городской дороге во время полицейской погони.',
      mediaKind: 'screenshot', imageCaption: 'Официальный кадр GTA V. Задание — наш учебный сценарий.',
      steps: [
        {
          id: 'object', type: 'mcq', presentation: 'evidence-scope', points: 2,
          title: 'Транспорт', stageTitle: '1 · Наведи прицел',
          prompt: 'Команде нужно уехать по дороге. Выбери транспорт для отхода.',
          options: [
            { id: 'car', text: 'Автомобиль' },
            { id: 'sword', text: 'Старинный меч' },
            { id: 'film', text: 'Катушка плёнки' },
            { id: 'gold', text: 'Золотые слитки' }
          ],
          answer: 'car',
          explanation: 'Автомобиль подходит для поездки по дороге. Это разогрев: прицел выбирает предмет, ловкость не влияет на баллы.'
        },
        {
          id: 'roles', type: 'match', points: 6, pointsPerItem: 2,
          title: 'Способности', stageTitle: '2 · Вспомни способности',
          prompt: 'У каждого героя GTA V есть особая способность. Соедини героя с его умением.',
          pairs: [
            { id: 'michael', left: 'Майкл', right: 'Замедляет время в перестрелке' },
            { id: 'franklin', left: 'Франклин', right: 'Замедляет время за рулём' },
            { id: 'trevor', left: 'Тревор', right: 'В ярости наносит больше урона и получает меньше' }
          ],
          explanation: 'Майкл замедляет время при стрельбе, Франклин — за рулём. Ярость Тревора увеличивает его урон и снижает получаемый.'
        },
        {
          id: 'gear', type: 'match', points: 6, pointsPerItem: 2,
          title: 'План команды', stageTitle: '3 · Раздай роли',
          prompt: 'Финальный шаг нашего учебного плана: каждому участнику — своё дело.',
          pairs: [
            { id: 'driver', left: 'Водитель', right: 'Машина для отхода' },
            { id: 'hacker', left: 'Хакер', right: 'Компьютерные системы' },
            { id: 'gunman', left: 'Стрелок', right: 'Прикрытие команды' }
          ],
          explanation: 'В нашем плане водитель отвечает за машину, хакер — за компьютерные системы, стрелок — за прикрытие. Это учебное распределение ролей, а не пересказ конкретной миссии.'
        }
      ],
      explanation: 'За транспорт можно получить 2 балла, за способности — 6, за роли — ещё 6. Способности взяты из GTA V; сам короткий план создан для этого экзамена.',
      sources: [
        { title: 'Rockstar Games — специальные способности Майкла, Франклина и Тревора', url: 'https://www.rockstargames.com/newswire/article/ak14o88385k4a8/more-details-and-screens-from-the-grand-theft-auto-v-special-and.html' },
        { title: 'Rockstar Games — подготовка ограблений в GTA V', url: 'https://www.rockstargames.com/newswire/article/o349k552514927/worldwide-grand-theft-auto-v-previews.html' },
        { title: 'Rockstar Games в Steam — официальный кадр погони', url: 'https://store.steampowered.com/app/271590/' }
      ], spoiler: false
    }
  ]
};

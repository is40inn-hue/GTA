'use strict';

// Edition 14 is additive. Earlier questions, answer keys and audio assets are unchanged.
// Load after v6-radio-content.js; concatenate this array in prepareBank's extra argument.
window.GTAExamRC3Questions = [
  {
    id: 'v14-a-first-bmx', type: 'mcq', section: 'theory', points: 6,
    title: 'Снова дома',
    prompt: 'Первые минуты San Andreas: куда игра предлагает доехать на этом BMX?',
    game: 'GTA: San Andreas', era: '3d', difficulty: 'easy',
    image: 'assets/rc3/sa-first-bmx.png',
    alt: 'Си-Джей в переулке рядом с велосипедом и синим маркером в начале San Andreas.',
    mediaKind: 'screenshot', imageCaption: 'San Andreas · начало истории',
    options: [
      { id: 'home', text: 'К дому Джонсонов на Гроув-стрит' },
      { id: 'airport', text: 'Назад в аэропорт' },
      { id: 'mansion', text: 'К особняку Мэдд Догга' },
      { id: 'garage', text: 'К гаражу в Сан-Фиерро' }
    ],
    answer: 'home',
    explanation: 'Синий маркер приглашает взять BMX, а значок CJ ведёт к дому Джонсонов на Гроув-стрит. Можно свернуть с маршрута, но подсказка игры отправляет именно домой.',
    sources: [
      { title: 'San Andreas — начальные цели и маршрут к Johnson House', url: 'https://www.gtabase.com/gta-san-andreas/missions/in-the-beginning' },
      { title: 'GTA Wiki — текст подсказок начального эпизода', url: 'https://gta.fandom.com/wiki/In_the_Beginning' },
      { title: 'LaunchBox Games Database — исходный игровой кадр', url: 'https://gamesdb.launchbox-app.com/games/details/34285-grand-theft-auto-san-andreas' }
    ], spoiler: false
  },
  {
    id: 'v14-a-demolition', type: 'mcq', section: 'theory', points: 6,
    title: 'Тот самый вертолётик',
    prompt: 'Что нужно сделать этим радиовертолётом на стройке в Vice City?',
    game: 'GTA: Vice City', era: '3d', difficulty: 'easy',
    image: 'assets/rc3/vc-demolition-man.jpg',
    alt: 'Маленький красный радиовертолёт летит внутри недостроенного здания в Vice City.',
    mediaKind: 'screenshot', imageCaption: 'Vice City · Demolition Man',
    options: [
      { id: 'bombs', text: 'Разложить взрывчатку в здании' },
      { id: 'race', text: 'Выиграть гонку через контрольные точки' },
      { id: 'follow', text: 'Проследить за машиной прораба' },
      { id: 'cargo', text: 'Унести со стройки чемодан с деньгами' }
    ],
    answer: 'bombs',
    explanation: 'В Demolition Man радиовертолётом нужно доставить четыре заряда к отмеченным местам на стройке. Именно этому полёту Rockstar посвятила отдельные советы по управлению.',
    sources: [
      { title: 'Rockstar Game Tips — Demolition Man и четыре места для взрывчатки', url: 'https://www.rockstargames.com/newswire/article/25o241181k1787/rockstar-game-tips-smooth-sailing-and-steering-and-shooting-in-v.html' },
      { title: 'GRYOnline.pl — исходный кадр Demolition Man', url: 'https://www.gry-online.pl/opinie/nie-jestes-zwyciezca-najtrudniejsze-etapy-i-sceny-w-grach-kompute/gta-vice-city-demolition-man/zb3c5' }
    ], spoiler: false
  },
  {
    id: 'v14-a-cousins-arrival', type: 'mcq', section: 'theory', points: 6,
    title: 'Добро пожаловать в Либерти-Сити',
    prompt: 'Кто встречает Нико на причале в начале GTA IV?',
    game: 'GTA IV', era: 'hd', difficulty: 'easy',
    image: 'assets/rc3/iv-cousins-dock.png',
    alt: 'Нико с прибывшим встречать его мужчиной возле корабля Platypus.',
    mediaKind: 'screenshot', imageCaption: 'GTA IV · The Cousins Bellic',
    options: [
      { id: 'roman', text: 'Роман Беллик' },
      { id: 'brucie', text: 'Брюси Киббуц' },
      { id: 'vlad', text: 'Влад Глебов' },
      { id: 'dimitri', text: 'Дмитрий Раскалов' }
    ],
    answer: 'roman',
    explanation: 'Нико встречает его двоюродный брат Роман. Вместо обещанной роскоши — такси и поездка в квартиру Романа.',
    sources: [
      { title: 'Официальный гайд GTA IV — The Cousins Bellic, страницы 10–11', url: 'https://ptgmedia.pearsoncmg.com/images/9780744009330/samplechapter/933-2_gta_iv.pdf' },
      { title: 'iGrandTheftAuto — исходный кадр встречи Белликов', url: 'https://www.igrandtheftauto.com/gta4/images/1741-gtaiv-the-cousins-bellic' }
    ], spoiler: false
  },
  {
    id: 'v14-a-ocean-view', type: 'mcq', section: 'theory', points: 6,
    title: 'Неоновый адрес',
    prompt: 'Чем этот отель становится для Томми в начале Vice City?',
    game: 'GTA: Vice City', era: '3d', difficulty: 'easy',
    image: 'assets/rc3/vc-ocean-view.jpg',
    alt: 'Томми стоит напротив неонового фасада Ocean View Hotel на ночной улице.',
    mediaKind: 'screenshot', imageCaption: 'Vice City · Ocean View',
    options: [
      { id: 'safehouse', text: 'Первым убежищем' },
      { id: 'business', text: 'Первым купленным бизнесом' },
      { id: 'lovefist', text: 'Штаб-квартирой группы Love Fist' },
      { id: 'lawyer', text: 'Офисом Кена Розенберга' }
    ],
    answer: 'safehouse',
    explanation: 'Ocean View Hotel — первое убежище Томми. Здесь он живёт в начале истории, а в вестибюле можно сохранить игру.',
    sources: [
      { title: 'Rockstar Support — Ocean View как место для начала жизни в Vice City', url: 'https://support.rockstargames.com/articles/1whGN71DLs4cASqQOHQzE4/game-tips-for-gta-vice-city' },
      { title: 'GTA Wiki — первое убежище и точка сохранения Ocean View Hotel', url: 'https://gta.fandom.com/wiki/Ocean_View_Hotel_(3D_Universe)' },
      { title: 'GTAVision — исходный кадр Ocean View Hotel', url: 'https://www.gtavision.com/index.php?section=content&site=160' }
    ], spoiler: false
  },
  {
    id: 'v14-b-tommy-voice', type: 'image', section: 'field', points: 8,
    title: 'Голос за кадром',
    prompt: 'Какой актёр озвучил Томми Версетти в Vice City?',
    game: 'GTA: Vice City', era: '3d', difficulty: 'medium',
    image: 'assets/scene-02.jpg',
    alt: 'Томми Версетти рядом с мотоциклом на улице Вайс-Сити.',
    mediaKind: 'screenshot', imageCaption: 'Vice City · Томми Версетти',
    options: [
      { id: 'liotta', text: 'Рэй Лиотта' },
      { id: 'pacino', text: 'Аль Пачино' },
      { id: 'deniro', text: 'Роберт Де Ниро' },
      { id: 'travolta', text: 'Джон Траволта' }
    ],
    answer: 'liotta',
    explanation: 'Голос Томми — Рэй Лиотта. В актёрском составе официального руководства Vice City он указан напротив Tommy Vercetti.',
    sources: [
      { title: 'Rockstar Games — официальное руководство Vice City, Cast', url: 'https://media.rockstargames.com/rockstargames-newsite/img/manuals/en_us/GTATrilogy_GTAVC_PS2_Manual_M01.pdf' },
      { title: 'Rockstar Games в Steam — официальный кадр Vice City', url: 'https://store.steampowered.com/app/12110/' }
    ], spoiler: false
  },
  {
    id: 'v14-b-rockstar-north', type: 'image', section: 'field', points: 8,
    title: 'По другую сторону океана',
    prompt: 'В каком городе находится Rockstar North, разработавшая Vice City и San Andreas?',
    game: 'Rockstar North / GTA: Vice City / GTA: San Andreas', era: 'mixed', difficulty: 'medium',
    image: 'assets/rc3/rockstar-north.jpg',
    alt: 'Современный офис Rockstar North со стеклянным входом и деревьями перед фасадом.',
    mediaKind: 'photo', imageCaption: 'Rockstar North · Richard Webb / Geograph · CC BY-SA 2.0',
    options: [
      { id: 'newyork', text: 'Нью-Йорк' },
      { id: 'losangeles', text: 'Лос-Анджелес' },
      { id: 'london', text: 'Лондон' },
      { id: 'edinburgh', text: 'Эдинбург' }
    ],
    answer: 'edinburgh',
    explanation: 'Rockstar North находится в Эдинбурге, Шотландия. Американские миры Vice City и San Andreas разработала именно эта студия.',
    sources: [
      { title: 'Rockstar Careers — Rockstar North: Edinburgh, Scotland', url: 'https://www.rockstargames.com/careers' },
      { title: 'Rockstar Games — разработчик Vice City', url: 'https://www.rockstargames.com/games/vicecity' },
      { title: 'Rockstar Games — разработчик San Andreas', url: 'https://www.rockstargames.com/games/sanandreas' },
      { title: 'Richard Webb / Geograph — оригинал фотографии', url: 'https://www.geograph.org.uk/photo/7081991' },
      { title: 'Лицензия фотографии — CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/' }
    ], spoiler: false
  }
];

// Reuse the verified recording without mutating v6-b-vice-radio or v12-b-1.
// The first two music tasks keep their original MP3s; this question gets a radio-specific key record.
(function addRadioQuestion() {
  const source = window.GTAExamRadioQuestions.find(q => q.id === 'v6-b-vice-radio');
  if (!source) throw new Error('Edition 14 requires v6-b-vice-radio');
  window.GTAExamRC3Questions.push({
    ...JSON.parse(JSON.stringify(source)),
    id: 'v14-b-vice-radio',
    title: 'Знакомая волна',
    prompt: 'Из радио какой GTA этот трек?',
    explanation: 'I Ran (So Far Away) группы A Flock of Seagulls звучит на Wave 103 в GTA: Vice City.',
    points: 8
  });
})();

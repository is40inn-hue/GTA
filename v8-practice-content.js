'use strict';

// Editions 7 and 8. Keep legacy questions immutable for saved results and shared tickets.
window.GTAExamPracticalQuestions = [
  {
    id: 'v7-c-pistol', type: 'vice', section: 'final', points: 10,
    nativeScene: 1, targetsCount: 2, pointsPerTarget: 5, initialAmmo: 6,
    title: 'Пристрелка', stageTitle: 'C1 · Пистолет',
    prompt: 'Попади в каждую из двух машин. На пристрелку выдано шесть патронов.',
    game: 'Vice City · полигон GTA 2026', era: 'practice', difficulty: 'easy',
    goal: 'Повредить две разные цели', weaponLabel: 'Пистолет', ammoLabel: '6 патронов',
    explanation: 'За каждую из двух разных машин, повреждённых из пистолета, начисляется 5 баллов. Повторные попадания в ту же цель баллы не добавляют. Урон и расход боезапаса фиксирует игровой движок. Скорость прохождения не влияет на оценку.',
    sources: [], spoiler: false
  },
  {
    id: 'v7-c-uzi', type: 'vice', section: 'final', points: 12,
    nativeScene: 2, targetsCount: 3, pointsPerTarget: 4, initialAmmo: 15,
    title: 'Контроль очереди', stageTitle: 'C2 · Uzi',
    prompt: 'Переводи прицел между тремя машинами. Одно нажатие — короткая очередь.',
    game: 'Vice City · полигон GTA 2026', era: 'practice', difficulty: 'medium',
    goal: 'Повредить три разные цели', weaponLabel: 'Uzi', ammoLabel: '15 патронов',
    explanation: 'За каждую из трёх разных машин, повреждённых из Uzi, начисляется 4 балла. Кнопка запускает короткую очередь; патроны расходует игровой движок. Повторный урон по одной цели не увеличивает оценку. Время не ограничено.',
    sources: [], spoiler: false
  },
  {
    id: 'v7-c-native-rpg', type: 'vice', section: 'final', points: 14,
    nativeScene: 3, targetsCount: 2, pointsPerTarget: 7, initialAmmo: 3,
    title: 'Тяжёлый билет', stageTitle: 'C3 · РПГ',
    prompt: 'Уничтожь две машины из РПГ. Три ракеты — последний этап перед комиссией.',
    game: 'Vice City · полигон GTA 2026', era: 'practice', difficulty: 'hard',
    goal: 'Уничтожить две цели', weaponLabel: 'РПГ', ammoLabel: '3 ракеты',
    explanation: 'За каждую из двух уничтоженных машин начисляется 7 баллов. В этом этапе одного повреждения недостаточно: игровой движок должен подтвердить уничтожение. На обе цели выданы три ракеты. Сценарий полигона создан для нашего экзамена.',
    sources: [], spoiler: false
  },
  {
    id: 'v8-c-native-heli', type: 'vice', section: 'final', points: 14,
    nativeScene: 3, targetsCount: 1, pointsPerTarget: 14, initialAmmo: 3,
    title: 'Воздушная цель', stageTitle: 'C3 · РПГ',
    prompt: 'Сбей вертолёт из РПГ. На всё — три ракеты.',
    game: 'Vice City · полигон GTA 2026', era: 'practice', difficulty: 'hard',
    goal: 'Уничтожить вертолёт', weaponLabel: 'РПГ', ammoLabel: '3 ракеты',
    explanation: '14 баллов за уничтоженный вертолёт. Одного повреждения недостаточно: уничтожение должен подтвердить игровой движок. На задание выданы три ракеты и 90 секунд.',
    sources: [], spoiler: false
  }
];

window.GTAExamPracticalQuestions.push(
  { id:'v9-c-hijack',type:'vice',section:'final',points:10,nativeScene:1,resultVersion:3,targetsCount:2,pointsPerTarget:5,initialAmmo:0,
    title:'Чужие ключи',stageTitle:'C1 · Угон',prompt:'Вытащи водителя, сядь и прокатись.',game:'Vice City · практика',era:'practice',difficulty:'easy',
    goal:'Угнать машину и проехать',weaponLabel:'За руль',ammoLabel:'90 секунд',explanation:'5 баллов за настоящий угон, ещё 5 за поездку. Посадку и движение проверяет игровой движок.',sources:[],spoiler:false },
  { id:'v9-c-explode',type:'vice',section:'final',points:12,nativeScene:2,resultVersion:3,targetsCount:1,pointsPerTarget:12,initialAmmo:40,
    title:'Взрывной ответ',stageTitle:'C2 · Взрыв',prompt:'Расстреляй автомобиль до взрыва.',game:'Vice City · практика',era:'practice',difficulty:'medium',
    goal:'Взорвать автомобиль',weaponLabel:'Uzi',ammoLabel:'40 патронов',explanation:'12 баллов за уничтожение автомобиля после попаданий Uzi. Просто повреждение не засчитывается.',sources:[],spoiler:false },
  { id:'v9-c-heli',type:'vice',section:'final',points:14,nativeScene:3,resultVersion:3,targetsCount:1,pointsPerTarget:14,initialAmmo:3,
    title:'Воздушная цель',stageTitle:'C3 · РПГ',prompt:'Сбей пролетающий вертолёт из РПГ.',game:'Vice City · практика',era:'practice',difficulty:'hard',
    goal:'Сбить вертолёт',weaponLabel:'РПГ',ammoLabel:'3 ракеты',explanation:'14 баллов за попадание РПГ и уничтожение летящего вертолёта. Случайная авария не засчитывается. На задание 90 секунд.',sources:[],spoiler:false }
);

// Edition 10: five action beats, three immutable scoring checkpoints.
window.GTAExamPracticalQuestions.push(
  { id:'v10-c-explode',type:'vice',section:'final',points:12,nativeScene:1,resultVersion:3,targetsCount:1,pointsPerTarget:12,initialAmmo:40,
    title:'Первый выстрел',stageTitle:'C1 · Взрыв',prompt:'Подбери оружие и взорви машину.',game:'Vice City · практика',era:'practice',difficulty:'easy',
    goal:'Взорвать автомобиль',weaponLabel:'Uzi',ammoLabel:'40 патронов',explanation:'12 баллов за уничтоженный автомобиль после попаданий Uzi. Одного повреждения недостаточно.',sources:[],spoiler:false },
  { id:'v10-c-escape',type:'vice',section:'final',points:10,nativeScene:2,resultVersion:3,targetsCount:2,pointsPerTarget:5,initialAmmo:0,
    title:'Пора уезжать',stageTitle:'C2 · Побег',prompt:'Забери машину и доберись до оружия.',game:'Vice City · практика',era:'practice',difficulty:'medium',
    goal:'Угнать машину и завершить поездку',weaponLabel:'За руль',ammoLabel:'90 секунд',explanation:'5 баллов за настоящий угон, ещё 5 за завершённую поездку. Действия подтверждает игровой движок.',sources:[],spoiler:false },
  { id:'v10-c-finale',type:'vice',section:'final',points:14,nativeScene:3,resultVersion:3,targetsCount:3,targetPoints:[4,4,6],initialAmmo:6,
    title:'Последний залп',stageTitle:'C3 · РПГ',prompt:'Подбери РПГ. Останови машины и сбей вертолёт.',game:'Vice City · практика',era:'practice',difficulty:'hard',
    goal:'Уничтожить две машины и вертолёт',weaponLabel:'РПГ',ammoLabel:'6 ракет',explanation:'По 4 балла за каждую машину и 6 за вертолёт. Нужны попадание РПГ и уничтожение. Случайные аварии не засчитываются.',sources:[],spoiler:false }
);

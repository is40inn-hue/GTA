'use strict';

/* A 20-second excerpt of the official Apple preview; source details in docs/v6-audio.md. */
window.GTAExamRadioQuestions = [
  {
    id: 'v6-b-vice-radio',
    type: 'audio',
    section: 'field',
    title: 'Радиоклассика',
    prompt: 'Из какой GTA эта радиоклассика?',
    game: 'Grand Theft Auto: Vice City',
    era: '3d',
    difficulty: 'easy',
    points: 8,
    audio: 'assets/audio/radio-fragment-02.mp3',
    audioDuration: 20,
    audioTitle: 'A Flock of Seagulls — I Ran (So Far Away)',
    audioSourceUrl: 'https://music.apple.com/us/song/i-ran-so-far-away/1874711522',
    audioSourceLabel: 'Фрагмент превью Apple Music',
    audioWaveform: [
      0.859, 0.781, 0.856, 0.856, 0.833, 0.804, 0.846, 0.811,
      0.808, 0.730, 0.839, 0.832, 0.889, 0.760, 1.000, 0.857,
      0.866, 0.875, 0.777, 0.882, 0.709, 0.850, 0.774, 0.918,
      0.751, 0.862, 0.835, 0.967, 0.764, 0.847, 0.800, 0.986,
      0.750, 0.826, 0.806, 0.901, 0.769, 0.855, 0.868, 0.865,
      0.883, 0.917, 0.930, 0.921, 0.814, 0.938, 0.888, 0.754
    ],
    options: [
      { id: 'iii', text: 'GTA III' },
      { id: 'vicecity', text: 'GTA: Vice City' },
      { id: 'sanandreas', text: 'GTA: San Andreas' },
      { id: 'iv', text: 'GTA IV' }
    ],
    answer: 'vicecity',
    explanation: 'I Ran (So Far Away) группы A Flock of Seagulls звучит на Wave 103 в GTA: Vice City. Rockstar прямо связывает эту композицию с радиостанцией в своём материале о музыкантах саундтрека Vice City.',
    sources: [
      {
        title: 'Rockstar — I Ran (So Far Away) на Wave 103',
        url: 'https://www.rockstargames.com/newswire/article/9k1248838739o4/rockstar-alumni-concert-calendar-special-vice-city-edition.html'
      },
      {
        title: 'Apple Music — A Flock of Seagulls, I Ran (So Far Away)',
        url: 'https://music.apple.com/us/song/i-ran-so-far-away/1874711522'
      }
    ],
    spoiler: false
  }
];

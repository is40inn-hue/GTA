# RC4 — сохранение мобильной защиты жестов из Netlify

16 ноября 2026. Проверены только два явно подключённых файла альтернативной живой ветки RC3:

- https://incandescent-clafoutis-f22c0a.netlify.app/game-gestures.js
- https://incandescent-clafoutis-f22c0a.netlify.app/native-vc/native-gestures.js

Оба адреса вернули HTTP 200 и `application/javascript`. Копии сохранены без изменений в `dist/game-gestures.js` и `dist/native-vc/native-gestures.js`. Этот шаг не подключает скрипты, не меняет приложение или движок и не публикует сайт. Подключение и вызовы жизненного цикла выполняются отдельно при интеграции RC4.

## Найденное отличие

`game-gestures.js` управляет только штатным API Telegram: пока игра активна, временно отключает вертикальные жесты закрытия/сворачивания Mini App. Запоминает прежнее состояние и восстанавливает его при деактивации или `pagehide`; при `pageshow` возвращает защиту, если игра ещё активна. При асинхронной загрузке SDK ограниченно повторяет поиск API: до 40 попыток с интервалом 500 мс.

В текущем RC4 уже имеются `touch-action: none` для игрового canvas и органов управления, Pointer Capture для прицела и джойстика, обработка `pointercancel`/`lostpointercapture`, отсечение повторного raw SDL touch и сброс ввода при потере активности. Они решают ввод внутри страницы. Вызовов `disableVerticalSwipes`/`enableVerticalSwipes` до интеграции этого helper не было.

| Область | Решение |
| --- | --- |
| Прицел, джойстик, удержание кнопок | Сохранить существующий `native.js`; новые helper не слушают touch/pointer события. |
| Жест сворачивания Telegram над игрой | Использовать `GTAGameGestures.setActive(true)` только при видимой C. |
| Скрытая подготовка города во время A/B | Оставить helper неактивным; само наличие iframe не является основанием для защиты. |
| Вопросы, главная, итоговая PNG | `setActive(false)`; прокрутка теста и удержание картинки результата сохраняются. |
| Масштабирование и viewport | В прочитанных файлах ограничений нет. Переносить глобальные запреты zoom или `document.touchmove` не требуется. |

Telegram документирует эти методы начиная с API 7.7. Жесты за заголовок Mini App остаются под управлением Telegram даже при отключённых вертикальных свайпах содержимого: https://core.telegram.org/bots/webapps#initializing-mini-apps.

## Точный API и подключения

После загрузки `game-gestures.js` доступен один объект:

```js
window.GTAGameGestures.setActive(true);  // видимая игровая C
window.GTAGameGestures.setActive(false); // выход из C, результат, тест
window.GTAGameGestures.destroy();        // окончательный teardown helper
```

Обычные переходы должны вызывать `setActive(false)`, а не `destroy()`: после destroy экземпляр не предназначен для повторного запуска. Повторный `setActive(true)` не делает повторного вызова Telegram API, если защитой уже владеет этот helper. Если свайпы были выключены до его включения, выход не включает их самовольно.

В основном документе helper должен загрузиться до `app.js`:

```html
<script defer src="game-gestures.js"></script>
```

При переходе от скрытого warmup к видимой практике вызов делается после передачи runtime и установки `nativeVisible = true`; при `releaseNative()` и уходе с игровой страницы — `false`. В `prepareNativeWarm()` и его callbacks включать защиту не следует.

Для прямого открытия `native-vc/index.html` порядок подключения:

```html
<script defer src="../game-gestures.js"></script>
<script defer src="native-gestures.js"></script>
```

`native-gestures.js` выполняется только при `window.self === window.top`: при необходимости добавляет Telegram SDK и вызывает `window.GTAGameGestures?.setActive(true)`. В iframe он ничего не делает — владение API остаётся у родительского приложения. В обоих файлах нет сетевой отправки данных пользователя и нет изменений камеры, кадров, оружия или баллов.

Helper добавляет/убирает CSS-класс `gta-game-gestures` на `documentElement`. Сам по себе класс в нашем RC4 не имеет CSS-правил; добавление глобальной блокировки прокрутки под этим классом не входит в перенос.

## Проверка и границы

Пять целевых VM-проверок прошли: однократное включение и восстановление при pagehide/pageshow; сохранение исходно отключённых свайпов; поздняя загрузка SDK; ограниченное число попыток и очистка; отсутствие самостоятельной загрузки SDK внутри iframe и её наличие при прямом открытии. Проверено отсутствие touch/pointer перехватчиков в helper.

Это проверка API и жизненного цикла на адаптере Telegram, не игровой проход на мобильном клиенте. Она не подтверждает жесты iOS/Android, native/GPU или влияние на фактический FPS. Публикаций и изменений существующего Netlify-сайта не выполнялось.

Контрольные суммы неизменённых исходников:

```text
game-gestures.js
bdf200356c85d556e9488740ea1e333ba23fd0001b02c54a40ffb404c6a5f00c

native-vc/native-gestures.js
cfc9dfb35f884d60dfbd6b67e2bfec7e8a451ef4b53048c023aefbe8286bb4db
```

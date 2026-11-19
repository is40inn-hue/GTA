/* Local double-click launches use the files the player selects in the picker. */
(function () {
  'use strict';
  if (location.protocol !== 'file:') return;
  const page = new URL('.', location.href);
  const files = new Map();
  function keyFor(input) {
    const url = new URL(input, document.baseURI);
    if (url.protocol !== 'file:' || !url.pathname.startsWith(page.pathname)) return null;
    return decodeURIComponent(url.pathname.slice(page.pathname.length));
  }
  const fetchNetwork = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const key = keyFor(input instanceof Request ? input.url : input);
    if (key === null) return fetchNetwork(input, init);
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const file = files.get(key);
    return file ? new Response(file, { headers: { 'Content-Length': String(file.size) } })
      : new Response(null, { status: 404 });
  };
  const openRequest = XMLHttpRequest.prototype.open, urls = new Map();
  XMLHttpRequest.prototype.open = function (method, input, ...rest) {
    const key = keyFor(input);
    if (key !== null && files.has(key)) {
      if (!urls.has(key)) urls.set(key, URL.createObjectURL(files.get(key)));
      input = urls.get(key);
    }
    return openRequest.call(this, method, input, ...rest);
  };
  window.chooseRideFolder = function (start) {
    const panel = document.getElementById('local-choice');
    const picker = document.getElementById('ride-folder');
    panel.hidden = false;
    picker.onchange = () => {
      files.clear();
      for (const file of picker.files) {
        const parts = file.webkitRelativePath.split('/');
        files.set(parts.slice(1).join('/'), file);
      }
      if (!files.has('index.html') || !files.has('native-vc/runtime/manifest.json')) {
        document.getElementById('local-hint').textContent = 'Выбери папку, где рядом лежат index.html и native-vc.';
        picker.value = '';
        return;
      }
      panel.hidden = true;
      start();
    };
  };
})();

#!/bin/bash
# Finder does not load shell profiles. Search installed binaries directly;
# never source nvm/pyenv or invoke Apple's Python/Xcode installer stub.
_rc4_pause() {
  printf '\nДля закрытия окна нажми Enter.\n'
  read -r _rc4_reply
}
cd -- "$(dirname "$0")" || { printf 'Не удалось открыть папку экзамена.\n'; _rc4_pause; exit 1; }
if [ ! -f index.html ] && [ ! -f dist/index.html ]; then
  printf '\nНе найден index.html. Распакуй весь ZIP в обычную папку и открой START из неё.\n'
  _rc4_pause
  exit 1
fi

_rc4_find_node() {
  for _rc4_bin in \
    "$HOME/.local/node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node \
    "$(type -P node 2>/dev/null)" \
    "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node \
    "$HOME"/.volta/tools/image/node/*/bin/node \
    "$HOME"/.fnm/node-versions/*/installation/bin/node \
    "$HOME"/Library/Application\ Support/fnm/node-versions/*/installation/bin/node; do
    [ -x "$_rc4_bin" ] || continue
    case "$_rc4_bin" in */shims/*|*/.volta/bin/*) continue ;; esac
    if "$_rc4_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 16 ? 1 : 0)' >/dev/null 2>&1; then
      printf '%s' "$_rc4_bin"
      return 0
    fi
  done
  return 1
}

_rc4_find_python() {
  for _rc4_bin in \
    /opt/homebrew/bin/python3 /usr/local/bin/python3 /opt/local/bin/python3 \
    /Library/Frameworks/Python.framework/Versions/Current/bin/python3 \
    /Library/Frameworks/Python.framework/Versions/*/bin/python3 \
    "$(type -P python3 2>/dev/null)" \
    "$HOME"/.pyenv/versions/*/bin/python3; do
    [ -x "$_rc4_bin" ] || continue
    case "$_rc4_bin" in /usr/bin/python3|*/shims/*|*/CommandLineTools/*|*/Xcode.app/*) continue ;; esac
    [ "$_rc4_bin" -ef /usr/bin/python3 ] && continue
    if "$_rc4_bin" -I -c 'import sys; sys.exit(sys.version_info < (3, 7))' >/dev/null 2>&1; then
      printf '%s' "$_rc4_bin"
      return 0
    fi
  done
  return 1
}

_rc4_status=0
if _rc4_node="$(_rc4_find_node)"; then
  "$_rc4_node" server.cjs || _rc4_status=$?
elif _rc4_python="$(_rc4_find_python)"; then
  "$_rc4_python" -B server.py || _rc4_status=$?
else
  printf '\nНе найден установленный Node.js 16+ или Python 3.7+.\n'
  printf 'Установи Node.js с nodejs.org либо Python с python.org, затем открой этот файл ещё раз.\n'
  printf 'Системный Python macOS намеренно не запускается: он может вызвать установку Xcode.\n'
  _rc4_status=1
fi
_rc4_pause
exit "$_rc4_status"

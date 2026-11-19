#!/bin/sh
_rc4_pause() {
  if [ -t 0 ]; then
    printf '\nДля закрытия окна нажми Enter.\n'
    read -r _rc4_reply
  fi
}
cd -- "$(dirname "$0")" || { printf 'Не удалось открыть папку экзамена.\n'; _rc4_pause; exit 1; }
if [ ! -f index.html ] && [ ! -f dist/index.html ]; then
  printf '\nНе найден index.html. Распакуй весь ZIP в обычную папку и запусти START из неё.\n'
  _rc4_pause
  exit 1
fi
_rc4_status=0
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 16 ? 1 : 0)' >/dev/null 2>&1; then
  node server.cjs || _rc4_status=$?
elif command -v python3 >/dev/null 2>&1 && python3 -I -c 'import sys; sys.exit(sys.version_info < (3, 7))' >/dev/null 2>&1; then
  python3 -B server.py || _rc4_status=$?
else
  printf '\nДля запуска нужен установленный Node.js 16+ или Python 3.7+.\n'
  printf 'Установи один из них с nodejs.org или python.org, затем запусти этот файл ещё раз.\n'
  _rc4_status=1
fi
_rc4_pause
exit "$_rc4_status"

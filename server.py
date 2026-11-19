#!/usr/bin/env python3
"""Dependency-free local RC4 launcher; serves the application beside this file (or legacy dist directory)."""
import errno
import mimetypes
import re
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote

TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.bin': 'application/octet-stream', '.data': 'application/octet-stream',
    '.scm': 'application/octet-stream', '.dff': 'application/octet-stream',
    '.txd': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
}


def locate_file(root, raw_url):
    raw_path, separator, query = raw_url.partition('?')
    if re.search(r'%(?![0-9a-fA-F]{2})', raw_path):
        return {'status': 400}
    try:
        decoded = unquote(raw_path, errors='strict')
    except (UnicodeError, ValueError):
        return {'status': 400}
    if not decoded.startswith('/') or any(char in decoded for char in ('\\', '\0', ':')):
        return {'status': 400}
    parts = [part for part in decoded.split('/') if part]
    if any(part.startswith('.') for part in parts):
        return {'status': 403}
    root = Path(root).resolve()
    try:
        file = root.joinpath(*parts).resolve(strict=True)
        file.relative_to(root)
        if file.is_dir():
            if not decoded.endswith('/'):
                location = '/' + '/'.join(quote(part, safe='') for part in parts) + '/'
                if separator:
                    location += '?' + query
                return {'status': 308, 'location': location}
            file = (file / 'index.html').resolve(strict=True)
            file.relative_to(root)
        if not file.is_file():
            return {'status': 404}
        mime = TYPES.get(file.suffix.lower()) or mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        return {'status': 200, 'file': file, 'size': file.stat().st_size, 'type': mime}
    except ValueError:
        return {'status': 403}
    except (OSError, RuntimeError):
        return {'status': 404}


def parse_range(value, size):
    if not value:
        return None
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', value.strip())
    if not match or (not match[1] and not match[2]) or size == 0:
        return False
    try:
        if not match[1]:
            suffix = int(match[2])
            if suffix <= 0:
                return False
            return max(0, size - suffix), size - 1
        start = int(match[1])
        end = int(match[2]) if match[2] else size - 1
        if start >= size or start > end:
            return False
        return start, min(end, size - 1)
    except ValueError:
        return False


class RC4Handler(BaseHTTPRequestHandler):
    root = None

    def log_message(self, *_):
        pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def finish_status(self, status, extra=None):
        body = ('HTTP ' + str(status)).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        port = self.server.server_port
        if self.headers.get('Host') not in ('127.0.0.1:' + str(port), 'localhost:' + str(port)):
            self.finish_status(403)
            return
        result = locate_file(self.root, self.path)
        if result['status'] != 200:
            self.finish_status(result['status'], {'Location': result['location']} if 'location' in result else None)
            return
        byte_range = parse_range(self.headers.get('Range'), result['size'])
        if byte_range is False:
            self.finish_status(416, {'Content-Range': 'bytes */' + str(result['size'])})
            return
        start, end = byte_range if byte_range is not None else (0, result['size'] - 1)
        remaining = end - start + 1
        try:
            source = result['file'].open('rb')
        except OSError:
            self.finish_status(404)
            return
        with source:
            self.send_response(206 if byte_range is not None else 200)
            self.send_header('Content-Type', result['type'])
            self.send_header('Content-Length', str(remaining))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'no-cache')
            if byte_range is not None:
                self.send_header('Content-Range', 'bytes {}-{}/{}'.format(start, end, result['size']))
            self.end_headers()
            if self.command == 'HEAD':
                return
            source.seek(start)
            try:
                while remaining:
                    chunk = source.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

    do_HEAD = do_GET

    def reject_method(self):
        self.finish_status(405, {'Allow': 'GET, HEAD'})

    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_TRACE = do_CONNECT = reject_method


def select_root(base_directory):
    base = Path(base_directory).resolve()
    for candidate in (base, base / 'dist'):
        if (candidate / 'index.html').is_file():
            return candidate.resolve()
    raise ValueError('Не найден index.html. Распакуй весь ZIP в обычную папку и запусти START из неё.')


def main():
    try:
        root = select_root(Path(__file__).resolve().parent)
        required = ['native-assets.js', 'native-vc/native.js', 'native-vc/range.scm', 'native-vc/runtime/index.wasm']
        missing = [name for name in required if not (root / name).is_file() or not (root / name).stat().st_size]
        if missing:
            raise ValueError('Архив распакован не полностью. Не найдены: ' + ', '.join(missing) + '. Распакуй весь ZIP заново.')
    except (ValueError, OSError) as error:
        print('\nНе удалось запустить Подготовка к GTA VI.\n' + str(error))
        return 1
    handler = type('LocalRC4Handler', (RC4Handler,), {'root': root.resolve()})
    try:
        try:
            server = ThreadingHTTPServer(('127.0.0.1', 4173), handler)
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
            server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    except OSError as error:
        print('Не удалось открыть локальный порт: ' + str(error) + '\nЗакрой лишние окна запуска и повтори. Адрес будет показан только после успешного старта.')
        return 1
    url = 'http://127.0.0.1:{}/'.format(server.server_port)
    print('\nПодготовка к GTA VI запущен на этом компьютере.\n\n' + url + '\n\nОставь это окно открытым. Если браузер не открылся сам — скопируй адрес выше.\nДля остановки нажми Ctrl+C.\n', flush=True)
    browser = threading.Timer(0.3, webbrowser.open, args=(url,))
    browser.daemon = True
    browser.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())

@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 (
  echo Не удалось открыть папку экзамена.
  goto failure
)
if not exist index.html if not exist dist\index.html (
  echo Не найден index.html. Распакуй весь ZIP в обычную папку и запусти START из неё.
  goto failure
)
set "RC4_NODE="
set "RC4_PYTHON="
for /f "delims=" %%P in ('where node 2^>nul') do call :try_node "%%P"
call :try_node "%ProgramFiles%\nodejs\node.exe"
call :try_node "%ProgramFiles(x86)%\nodejs\node.exe"
call :try_node "%LOCALAPPDATA%\Programs\nodejs\node.exe"
for /d %%D in ("%APPDATA%\nvm\v*") do call :try_node "%%D\node.exe"
if defined RC4_NODE (
  "%RC4_NODE%" server.cjs
  goto finished
)
for /f "delims=" %%P in ('where python 2^>nul') do call :try_python "%%P"
for /f "delims=" %%P in ('where python3 2^>nul') do call :try_python "%%P"
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do call :try_python "%%D\python.exe"
for /d %%D in ("%ProgramFiles%\Python*") do call :try_python "%%D\python.exe"
for /d %%D in ("%SystemDrive%\Python*") do call :try_python "%%D\python.exe"
if defined RC4_PYTHON (
  "%RC4_PYTHON%" -B server.py
  goto finished
)
echo Не найден установленный Node.js 16+ или Python 3.7+.
echo Установи один из них с nodejs.org или python.org, затем открой этот файл ещё раз.
goto failure

:try_node
if defined RC4_NODE exit /b 0
if not exist "%~1" exit /b 0
for %%D in ("%~1") do if /i "%%~dpD"=="%LOCALAPPDATA%\Microsoft\WindowsApps\" exit /b 0
"%~1" -e "process.exit(Number(process.versions.node.split('.')[0]) < 16 ? 1 : 0)" >nul 2>nul
if not errorlevel 1 set "RC4_NODE=%~1"
exit /b 0

:try_python
if defined RC4_PYTHON exit /b 0
if not exist "%~1" exit /b 0
for %%D in ("%~1") do if /i "%%~dpD"=="%LOCALAPPDATA%\Microsoft\WindowsApps\" exit /b 0
"%~1" -I -c "import sys; sys.exit(sys.version_info < (3, 7))" >nul 2>nul
if not errorlevel 1 set "RC4_PYTHON=%~1"
exit /b 0

:failure
echo.
pause
exit /b 1

:finished
echo.
pause

@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo === Sieglings TCG - local server ===
echo.

where java >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Java is not installed or not on PATH.
    echo         Install JDK 21+ from https://adoptium.net/
    echo         Then open a NEW terminal and run this script again.
    exit /b 1
)

echo Java version:
java -version 2>&1
echo.

if not defined PORT set PORT=8081
echo Using port %PORT%
echo Open in browser: http://127.0.0.1:%PORT%/shop
echo.

netstat -ano 2>nul | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo [WARN] Something is already listening on port %PORT%.
    echo        Stop that process or run: set PORT=8082
    echo.
)

echo Starting server... DO NOT close this window while you play.
echo First run may download Maven dependencies (several minutes).
echo.
call mvnw.cmd spring-boot:run
if errorlevel 1 (
    echo.
    echo [ERROR] Server exited. Read the errors above.
    pause
    exit /b 1
)
pause

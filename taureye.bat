@echo off
setlocal EnableDelayedExpansion
REM ============================================================================
REM  TaurEye control script (Windows)
REM
REM  Double-click  -> interactive menu.
REM  Or pass a command:
REM     taureye setup        first-time install (venv + npm deps)
REM     taureye run          run the app with SYNTHETIC data (default)
REM     taureye run-db       run the app with REAL EOD data (TAUREYE_PROVIDER=db)
REM     taureye stop         stop any running TaurEye servers (free the ports)
REM     taureye nightly      data engine: full nightly pull (prev trading day)
REM     taureye nightly 2026-05-29   ... for a specific date
REM     taureye backfill     data engine: pull ~14 months of history (first run)
REM     taureye backfill 60          ... only the last 60 trading days
REM     taureye status       data engine: show what's in the spine
REM     taureye logs         data engine: tail the nightly run log
REM     taureye selftest     data engine: offline reconcile/adjust proof
REM     taureye master       data engine: refresh security master only
REM     taureye corp         data engine: refresh corporate actions only
REM     taureye readjust     data engine: recompute adjusted prices
REM     taureye marketcap    data engine: refresh real market caps (BSE bulk feed)
REM     taureye export       publish compact JSON for clients (public/data: fundamentals + metrics + indices)
REM     taureye export all           ... publish the COMPLETE cloud bundle (adds per-symbol candles)
REM     taureye export 400           ... with a 400-trading-day OHLC window
REM     taureye probe [SYM]  data engine: diagnose the market-cap feed for one symbol
REM     taureye build        build the web app (dist/)
REM     taureye apk          build web + sync into the Android project
REM     taureye help         show this list
REM ============================================================================
cd /d "%~dp0"

set "PY=.venv\Scripts\python.exe"
set "CMD=%~1"
set "ARG=%~2"

if "%CMD%"=="" goto :menu
goto :dispatch

REM ---------------------------------------------------------------------------
:menu
cls
echo.
echo   ====================  TaurEye  ====================
echo.
echo     1^)  Run app            (synthetic data)
echo     2^)  Run app            (real EOD data)
echo     3^)  Data engine: nightly pull
echo     4^)  Data engine: status
echo     5^)  Data engine: selftest (offline)
echo     6^)  Data engine: refresh master
echo     7^)  Data engine: refresh corporate actions
echo     8^)  Data engine: readjust prices
echo     9^)  Build web app (dist)
echo    10^)  Build + sync Android (APK project)
echo    11^)  First-time setup (install everything)
echo    12^)  Stop running servers (free the ports)
echo    13^)  Data engine: view run log
echo    14^)  Data engine: backfill history (first-time, ~14 months)
echo    15^)  Data engine: refresh market caps (real, BSE bulk feed)
echo     0^)  Quit
echo.
set /p "choice=  Choose: "
if "%choice%"=="1"  set "CMD=run"      & goto :dispatch
if "%choice%"=="2"  set "CMD=run-db"   & goto :dispatch
if "%choice%"=="3"  set "CMD=nightly"  & goto :dispatch
if "%choice%"=="4"  set "CMD=status"   & goto :dispatch
if "%choice%"=="5"  set "CMD=selftest" & goto :dispatch
if "%choice%"=="6"  set "CMD=master"   & goto :dispatch
if "%choice%"=="7"  set "CMD=corp"     & goto :dispatch
if "%choice%"=="8"  set "CMD=readjust" & goto :dispatch
if "%choice%"=="9"  set "CMD=build"    & goto :dispatch
if "%choice%"=="10" set "CMD=apk"      & goto :dispatch
if "%choice%"=="11" set "CMD=setup"    & goto :dispatch
if "%choice%"=="12" set "CMD=stop"     & goto :dispatch
if "%choice%"=="13" set "CMD=logs"     & goto :dispatch
if "%choice%"=="14" set "CMD=backfill" & goto :dispatch
if "%choice%"=="15" set "CMD=marketcap" & goto :dispatch
if "%choice%"=="0"  goto :eof
goto :menu

REM ---------------------------------------------------------------------------
:dispatch
if /i "%CMD%"=="help"     goto :help
if /i "%CMD%"=="setup"    goto :setup
if /i "%CMD%"=="run"      goto :run
if /i "%CMD%"=="run-db"   goto :run_db
if /i "%CMD%"=="stop"     goto :stop
if /i "%CMD%"=="firewall" goto :firewall
if /i "%CMD%"=="nightly"  goto :engine
if /i "%CMD%"=="status"   goto :engine
if /i "%CMD%"=="selftest" goto :engine
if /i "%CMD%"=="logs"     goto :engine
if /i "%CMD%"=="master"   goto :engine
if /i "%CMD%"=="corp"     goto :engine
if /i "%CMD%"=="readjust" goto :engine
if /i "%CMD%"=="marketcap" goto :engine
if /i "%CMD%"=="segments" goto :engine
if /i "%CMD%"=="export"   goto :engine
if /i "%CMD%"=="probe"    goto :probe
if /i "%CMD%"=="backfill" goto :backfill
if /i "%CMD%"=="build"    goto :build
if /i "%CMD%"=="apk"      goto :apk
echo [TaurEye] Unknown command "%CMD%".
goto :help

REM ---------------------------------------------------------------------------
:ensure_setup
if not exist "%PY%" (
  echo [TaurEye] Creating Python venv...
  python -m venv .venv || goto :fail
  "%PY%" -m pip install --upgrade pip
  "%PY%" -m pip install -r backend\requirements.txt || goto :fail
) else (
  REM venv exists - verify required deps are actually importable. This catches
  REM the case where requirements.txt gained a package after the venv was made.
  "%PY%" -c "import fastapi, uvicorn, requests" 1>nul 2>nul
  if errorlevel 1 (
    echo [TaurEye] Installing/updating backend deps...
    "%PY%" -m pip install -r backend\requirements.txt || goto :fail
  )
)
if not exist "node_modules" (
  echo [TaurEye] Installing frontend deps...
  call npm install || goto :fail
)
exit /b 0

:setup
call :ensure_setup || goto :fail
echo.
echo [TaurEye] Setup complete.
goto :done

REM ---------------------------------------------------------------------------
REM ---------------------------------------------------------------------------
REM Free the ports TaurEye uses, killing any orphaned servers from a prior run
REM that was closed without Ctrl+C. Safe to call anytime.
:freeports
powershell -NoProfile -Command ^
  "foreach ($p in 8010,5174,5175,5176) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop; Write-Host ('[TaurEye] freed port ' + $p) } catch {} } }"
exit /b 0

:stop
call :freeports
echo [TaurEye] All TaurEye servers stopped; ports are free.
goto :done

REM ---------------------------------------------------------------------------
REM Open the Windows Firewall so other LAN machines can reach the web app (5174)
REM and, if you also want devices to hit the API directly, the backend (8010).
REM Adds inbound TCP rules for Private networks only. Self-elevates to admin.
:firewall
echo [TaurEye] Adding Windows Firewall inbound rules for ports 5174 and 8010 (Private networks)...
powershell -NoProfile -Command ^
  "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-Command','New-NetFirewallRule -DisplayName \"TaurEye Web (5174)\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName \"TaurEye API (8010)\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8010 -Profile Private -ErrorAction SilentlyContinue'"
echo [TaurEye] Done. If it did not prompt for admin, run this from an elevated prompt.
goto :done

REM ---------------------------------------------------------------------------
:run
call :ensure_setup || goto :fail
call :freeports
echo.
echo  TaurEye starting (synthetic data)...  Opening  http://localhost:5174
call :lanurl
echo  (API on http://localhost:8010 - do NOT open this one directly)
echo  Press Ctrl+C in this window to stop cleanly.
echo.
set "TAUREYE_PROVIDER=synthetic"
call :openbrowser
call npm start
goto :done

:run_db
call :ensure_setup || goto :fail
call :freeports
echo.
echo  TaurEye starting (REAL EOD data)...  Opening  http://localhost:5174
call :lanurl
echo  If results are empty, run a data pull first:  taureye nightly
echo  Press Ctrl+C in this window to stop cleanly.
echo.
set "TAUREYE_PROVIDER=db"
call :openbrowser
call npm start
goto :done

REM ---------------------------------------------------------------------------
REM Open the app in the default browser once the dev server is actually up.
REM Runs detached (minimized) so it doesn't block npm start in this window; it
REM polls the Vite port and only launches the browser when it's listening, so
REM you never land on a "can't connect" page.
:openbrowser
start "" /min powershell -NoProfile -Command ^
  "$u='http://localhost:5174'; for ($i=0; $i -lt 60; $i++) { if (Test-NetConnection -ComputerName localhost -Port 5174 -InformationLevel Quiet -WarningAction SilentlyContinue) { Start-Process $u; break }; Start-Sleep -Milliseconds 500 }"
exit /b 0

REM ---------------------------------------------------------------------------
REM Print the LAN URL(s) other machines on the same network can use to open the
REM app. Picks the IPv4 address(es) of the active adapters (skips loopback/APIPA).
:lanurl
powershell -NoProfile -Command ^
  "$ips=Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -ExpandProperty IPAddress; if ($ips) { Write-Host ''; Write-Host '  On other devices on the same Wi-Fi/LAN, open one of:'; foreach ($ip in $ips) { Write-Host ('     http://' + $ip + ':5174') } } else { Write-Host '  (No LAN IP found - check your network connection.)' }"
exit /b 0

REM ---------------------------------------------------------------------------
:engine
call :ensure_setup || goto :fail
REM Map menu names to data-engine subcommands.
set "SUB=%CMD%"
if /i "%CMD%"=="corp" set "SUB=corp-actions"
REM nightly takes an optional date as --date; other subcommands take no arg.
set "EXTRA="
if /i "%CMD%"=="nightly" if not "%ARG%"=="" set "EXTRA=--date %ARG%"
REM export takes an optional arg: "all" publishes the COMPLETE cloud bundle
REM (fundamentals + metrics + indices + per-symbol candles); a number sets the
REM OHLC window length (trading days).
if /i "%CMD%"=="export" if /i "%ARG%"=="all" set "EXTRA=--all"
if /i "%CMD%"=="export" if not "%ARG%"=="" if /i not "%ARG%"=="all" set "EXTRA=--days %ARG%"
echo [TaurEye] data engine: %SUB% %EXTRA%
"%PY%" -m backend.app.dataengine.run %SUB% %EXTRA%
goto :done

:probe
call :ensure_setup || goto :fail
set "SYM=%ARG%"
if "%SYM%"=="" set "SYM=RELIANCE"
echo [TaurEye] data engine: marketcap-probe %SYM%
"%PY%" -m backend.app.dataengine.run marketcap-probe %SYM%
goto :done

:backfill
call :ensure_setup || goto :fail
set "DAYS=%ARG%"
if "%DAYS%"=="" set "DAYS=300"
echo [TaurEye] data engine: backfill --days %DAYS%
echo [TaurEye] This pulls one bhavcopy per trading day - it can take several minutes.
"%PY%" -m backend.app.dataengine.run backfill --days %DAYS%
goto :done

REM ---------------------------------------------------------------------------
:build
call :ensure_setup || goto :fail
echo [TaurEye] Building web app into dist\ ...
call npm run build
goto :done

:apk
call :ensure_setup || goto :fail
echo [TaurEye] Building web + syncing Android project...
call npm run cap:sync
echo.
echo [TaurEye] Synced. To produce an APK:
echo   - cloud build: push to GitHub, run the "Build Android APK" Action, or
echo   - local build: taureye build, then open android\ in Android Studio.
goto :done

REM ---------------------------------------------------------------------------
:help
echo.
echo   taureye setup ^| run ^| run-db ^| stop ^| firewall ^| nightly [date] ^| backfill [days]
echo           ^| status ^| logs ^| selftest ^| master ^| corp ^| readjust ^| marketcap ^| segments ^| export [days] ^| build ^| apk
echo.
goto :done

:fail
echo.
echo [TaurEye] Something failed above. Check the message and retry.
set "EXITCODE=1"

:done
REM Pause only when launched by double-click (no command-line arg given).
if "%~1"=="" pause
endlocal

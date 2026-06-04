@echo off
REM ===========================================================================
REM  refresh-host.bat — publish the latest TaurEye data to the VM.
REM
REM  Runs on THIS PC (the EOD database + data engine live here), then uploads the
REM  rendered bundle to the nginx host. The phone app picks up the new data on its
REM  next launch automatically — no rebuild, no reinstall.
REM
REM  Double-click to run, or schedule it (Task Scheduler) for hands-off daily
REM  updates. Edit the variables below if your key path / VM / paths change.
REM ===========================================================================
setlocal
cd /d "%~dp0"

set "KEY=C:\TAUREYE\TaurEyeMain\TaurEye\ssh-key-2026-06-04.key"
set "VM=opc@161.118.174.177"
set "LOCAL=C:\TAUREYE\taureye-host-data"
set "REMOTE=/usr/share/nginx/html/data"
set "PY=.venv\Scripts\python.exe"

echo.
echo [refresh] 1/4  Pulling latest EOD data (best effort)...
REM Pulls the previous trading day's bhavcopy. Non-fatal: on a holiday/weekend
REM there may be nothing new, and we still want to republish what's in the DB.
"%PY%" -m backend.app.dataengine.run nightly

echo.
echo [refresh] 2/4  Exporting bundle + per-symbol candles...
set "TAUREYE_PROVIDER=db"
"%PY%" -m backend.app.dataengine.run export --all --out "%LOCAL%" || goto :fail

echo.
echo [refresh] 3/4  Packing into one archive...
tar -cf "%LOCAL%.tar" -C "%LOCAL%" . || goto :fail

echo.
echo [refresh] 4/4  Uploading to the VM and extracting...
scp -o StrictHostKeyChecking=accept-new -i "%KEY%" "%LOCAL%.tar" %VM%:/tmp/taureye-host-data.tar || goto :fail
ssh -o StrictHostKeyChecking=accept-new -i "%KEY%" %VM% "sudo tar -xf /tmp/taureye-host-data.tar -C %REMOTE%/ && sudo restorecon -R %REMOTE% && rm -f /tmp/taureye-host-data.tar" || goto :fail
del "%LOCAL%.tar"

echo.
echo [refresh] DONE. The app will show the new data on its next launch.
goto :eof

:fail
echo.
echo [refresh] FAILED — see the message above. Nothing was changed on the VM
echo           unless the upload step had already started.
if exist "%LOCAL%.tar" del "%LOCAL%.tar"
exit /b 1

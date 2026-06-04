@echo off
setlocal
REM Removes the TaurEye nightly Task Scheduler job created by schedule-install.bat.
set "TASKNAME=TaurEye Nightly Data Pull"

echo [TaurEye] Removing scheduled task "%TASKNAME%"
schtasks /Delete /TN "%TASKNAME%" /F

if errorlevel 1 (
  echo [TaurEye] Task not found or could not be removed (may already be gone).
) else (
  echo [TaurEye] Removed.
)
echo.
pause
endlocal

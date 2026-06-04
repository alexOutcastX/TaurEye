@echo off
setlocal
REM ============================================================================
REM  Registers a Windows Task Scheduler job that runs the TaurEye data engine
REM  every weekday evening (after NSE/BSE close + EOD file publish).
REM
REM  Default time: 20:30 (8:30 PM) Mon-Fri. Bhavcopies are usually available by
REM  ~19:00 IST; 20:30 leaves a safe margin. Adjust /ST below if you like.
REM
REM  Run this ONCE (double-click). Remove later with schedule-remove.bat.
REM ============================================================================
cd /d "%~dp0"

set "TASKNAME=TaurEye Nightly Data Pull"
set "RUNTIME=20:30"
set "TARGET=%~dp0taureye.bat"

echo [TaurEye] Registering scheduled task "%TASKNAME%"
echo          Command : "%TARGET%" nightly
echo          Schedule: weekdays at %RUNTIME%
echo.

schtasks /Create ^
  /TN "%TASKNAME%" ^
  /TR "\"%TARGET%\" nightly" ^
  /SC WEEKLY ^
  /D MON,TUE,WED,THU,FRI ^
  /ST %RUNTIME% ^
  /F

if errorlevel 1 (
  echo.
  echo [TaurEye] Could not create the task. If it says "Access is denied",
  echo           right-click this file and choose "Run as administrator".
) else (
  echo.
  echo [TaurEye] Done. The data engine will run automatically on weekday evenings.
  echo           Check it anytime with:  taureye status
  echo           Remove it with:         schedule-remove.bat
)
echo.
pause
endlocal

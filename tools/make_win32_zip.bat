@echo off

if "%1" == "" (
  echo usage: make_zip builddir cfgfile supportbuffer
  echo.
  echo   builddir       build output directory ^(e.g., out\Release^)
  echo   cfgfile        configuration file containing a tagged list of files processed by the stage/archive scripts
  echo   supportbuffer  ArrayBuffer | GPUBuffer
  goto :eof
)

setlocal

set makezip=%1\chrome\tools\build\make_zip.py
echo %makezip%
set cfg=%2\FILES.cfg
echo %cfg%
set builddir=%3
set archive=%3\chrome-win32-%4.zip

C:\Python27\python.exe %makezip% %builddir% %cfg% %archive%

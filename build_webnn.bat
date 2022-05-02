:: This script is for build webnn-native on Windows platform.
@ echo off
set arg=%*

:: Check whether "all" command
echo %1 | find "all" >NULL
if not ERRORLEVEL 1 (
  echo %1 | find "all-node" >NULL
  if not ERRORLEVEL 1 (
    echo Run all-node command.
    node bin\build_webnn all-node %arg:~5,-1%
    goto:eof
  ) else (
    echo Run all command.
    node bin\build_webnn all %arg:~5,-1%
    goto:eof
  )
) else (
  set cmds=sync pull package upload notify
  (for %%a in (%cmds%) do (
    if [%%a]==[%arg%] (
      echo Run %%a command.
      node bin\build_webnn %%a
      goto:eof
    )
  ))
  if [%arg%]==[] (
    echo Run build with default null backend and default bot_config.json.
    node bin\build_webnn build
    goto:eof
  ) else (
    echo Run build command with %arg:~1,-1%.
    node bin\build_webnn build %arg:~1,-1%
  )
)
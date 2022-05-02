:: This script is for build webnn-native on Windows platform.
@echo off

:: please modify path
set arrayBufferConfigFile=bot_config_chromium_arraybuffer.json
set gpuBufferConfigFile=bot_config_chromium.json


call cd <path>\chromium\src
call git stash
call gclient sync
call git rev-parse HEAD > commitid
call set /p cid=<commitid

echo "============ Start to build for Array Buffer...."
echo %arrayBufferConfigFile%
call cd <path>\chromium\src\webnn.nightly-build
call rmdir /s /q node_modules
call npm install
call build_webnn.bat all "--config=bot_config_chromium_arraybuffer.json"


echo "============ Start to build for GPU Buffer...."
call cd <path>\chromium\src
call git reset %cid% --hard
echo %gpuBufferConfigFile%
call cd <path>\chromium\src\webnn.nightly-build
call rmdir /s /q node_modules
call npm install
call build_webnn.bat all "--config=bot_config_chromium.json"

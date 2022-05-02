# Description

Node script [bin/build_webnn](./bin/build_webnn) enables you to build [webnn-native](https://github.com/webmachinelearning/webnn-native) with given `bot_config.json` or  build [chromium-src](https://github.com/otcshare/chromium-src) with given
`bot_config_chromium.json` for Supporting GPU Buffer / `bot_config_chromium_arraybuffer.json` for supporting Array Buffer easily.

### Configure config json file
Here's [bot_config<_chromium|_chromium_arraybuffer>.json](./bot_config.json) config file, its content is

```
{
  "target-os": "",
  "target-cpu": "",
  "gnArgs": {
    "is-debug": false,
    "backend": "null"
    "chromium-extra": {
      "wire": true,
      "gpu-buffer": true
    }
  },
  "clean-build": true,
  "logging": {
    "level": "info"
  },
  "archive-server": {
    "host": "",
    "dir": "",
    "ssh-user": ""
  },
  "email-service": {
    "user": "",
    "host": "",
    "from": "",
    "to": ""
  }
}
```
- target-os: The desired operating system for the build. Defualt "", use current system OS for build. Values
  - ""
  - "linux"
  - "win"

- target-cpu: The desired cpu architecture for the build. Defualt "", use current system CPU architecture for build. values
  - ""
  - "x86"
  - "x64"
  - "arm"
  - "arm64"

- clean-build: Whether remove output directory. Default true, remove output directory before build.

Seetings in **"gnArgs"**: Specifies build arguments overrides, will save in args.gn file under output directory after running *gn gen --args="args"* command.
- is-debug: Debug build. Enabling official builds automatically sets is_debug to false.
- backend: Enables the compilation of specified backend with webnn_enable_\<backend\> argument. Default "null". Values:
  - "null"
  - "openvino"
  - "dml"
  - "onednn"
  - "xnnpack"
- chromium-extra: Extra args to build chromium, used in `bot_config_chromium*.json`.

Seetings in **"logging"**: Specifies directory for storing output packages on a dedicated server.
- level: Logging level. Default "info". Values:
  - "info"
  - "warn"
  - "error"
  - "debug"

Seetings in **"archive-server"**: Specifies directory for storing output packages and logging files on a dedicated server.
- host: IP or domain name.
- dir: Path of directory for storing output packages, likes /path .
- ssh-user: A account you want to access to host.

Seetings in **"email-service"**: Specifies directory for storing output packages and logging files on a dedicated server.
- user: User name for logging into SMTP Serve.
- host: SMTP host.
- from: Sender of the format (address or name \<address\> or "name" \<address\>).
- to: Recipients (same format as above), multiple recipients are separated by a comma.

### Configure files for packaging .tgz compressed file
Please config the JSON file [test_data.json](./src/test_data.json) to add test data resources files such as weights files, model files, and image files into .tgz compressed file. And config the file [tar_linux.cfg](./src/tar_linux.cfg) to include extraction build files for Linux platform, or config the file [tar_win.cfg](./src/tar_win.cfg) to include extraction build files for Windows platform.

### Install
```sh
> npm install.
```

### Use Node Scripts
```sh
$ ./bin/build_webnn --help

Usage: build_webnn [options] [command]

Options:
  -V, --version    output the version number
  -h, --help       display help for command

Commands:
  sync
  pull
  build [options]
  build-node [options]
  package
  upload
  notify
  all [options]
  all-node [options]
  help [command]   display help for command
```

Options for *./bin/build_webnn build* or *./bin/build_webnn all* commands are same, likes:
```
$ ./bin/build_webnn build --help
Usage: build_webnn build [options]

Options:
  -b, --backend <backend>  Build with target backend (default: backend of gnArgs in bot_config.json)
  -c, --conf <config>      Configuration file (default: "bot_config.json")
  -h, --help               display help for command
```

### Use Batch Wrapper Scripts
[build_webnn](./build_webnn) script is for build on Linux platform
[build_webnn.bat](./build_webnn.bat) script is for build on Windows platform.

### Fetch code
```sh
> ./build_webnn pull
```
```sh
> build_webnn.bat pull
```

### Sync dependencies
```sh
> ./build_webnn sync
```
```sh
> build_webnn.bat sync
```

### Build
##### Build webnn-native with arguments from configurations in [./bot_config.json](./bot_config.json)
```sh
> ./build_webnn
```
```sh
> build_webnn.bat
```

##### Or build with explicitly specified backend and other arguments from configurations in [./bot_config.json](./bot_config.json), backend of gnArgs in [./bot_config.json](./bot_config.json) will be updated as specified backend if backend weren't matched.
```sh
> ./build_webnn --backend=[null|openvino|dml|onednn|xnnpack]
```
```sh
> build_webnn.bat "--backend=[null|openvino|dml|onednn|xnnpack]"
```

##### Or build with configured arguments from configurations in specified config json file.
```sh
> ./build_webnn --config=<path>
```
```sh
> build_webnn.bat "--config=<path>"
```

##### Or build with explicitly specified backend and other arguments from configurations in specified config json file, backend of gnArgs in specified config json file will be updated as specified backend if backend weren't matched.
```sh
> ./build_webnn --backend=[null|openvino|dml|onednn|xnnpack] --config=<path>
```
```sh
> build_webnn.bat "--backend=[null|openvino|dml|onednn|xnnpack] --config=<path>"
```

### Build node addon
Notice: To build node addon is require build webnn native firstly.
```sh
> ./build_webnn build-node
```
```sh
> build_webnn.bat build-node
```

### Package
```sh
> ./build_webnn package
```
```sh
> build_webnn.bat package
```

### Upload package and log file to Store Server
```sh
> ./build_webnn upload
```
```sh
> build_webnn.bat upload
```

### Notify by sending Email
```sh
> ./build_webnn notify
```
```sh
> build_webnn.bat notify
```

### All above commands exclude 'Build node addon' in one command
The usage of backend and config arguments are same with above **Build** command

```sh
> ./build_webnn all --backend=[null|openvino|dml|onednn|xnnpack] --config=<path>
```
```sh
> build_webnn.bat all "--backend=[null|openvino|dml|onednn|xnnpack] --config=<path>"
```

### All above commands involve 'Build node addon' in one command
The usage of backend and config arguments are same with above **Build** command

```sh
> ./build_webnn all-node --backend=[null|openvino|dml|onednn|xnnpack] --config=<path>
```
```sh
> build_webnn.bat all-node "--backend=[null|openvino|dml|onednn|xnnpack] --config=<path>"
```

### Nightly build chromium script - build_chromium_nightly.bat
This batch script enable to build chromium with both ArrayBuffer and GPUBuffer.

## Log file
Save logging message into /tmp/webnn_\<target-os\>\_\<target-cpu\>\_\<backend\>>.log when build on Linux platform or C:\Users\\<username\>\AppData\Local\Temp\\<target-os\>\_\<target-cpu\>\_\<backend\>>.log when build on Windows platform.

## Tools
`linter.js` is a script for check js scripts by eslint tool.  
`make_tar.py` is a script for packaging build to .tgz compressed file.
`make_win32_zip.bat` is a script for packing build to .zip compressed file.  

## How to deploy this scripts for nightly build?
### Nightly build chromium
Suppose that you have [fetched chromium-src code](https://github.com/otcshare/webnn-native/wiki/How-to-build-Chromium-browser-with-otcshare-chromium-src-for-Windows), for example, code is now under C:\path\chromium

* Step1: Deploy this build_script and configurations files into C:\path\chromium\src

   Copy build_script into C:\path\chromium\src

   Copy build_script/bot_config_chromium.json C:\path\chromium\src

   Copy build_script/bot_config_chromium_arraybuffer.json C:\path\chromium\src

* Step2: Modify configurations files following above "Configure config json file"

* Step3: Modify path variable in build_chromium_nightly file, then create task by "Windows Task Scheduler" with action to call build_chromium_nightly.bat

## BKMs
### To support to upload via SSH
1. On your client, follow [Github SSH page](https://help.github.com/articles/connecting-to-github-with-ssh/) to generate SSH keys and add to ssh-agent. (If you've done that, ignore)
2. On upload server, config [Authorized keys](https://www.ssh.com/ssh/authorized_keys/) with above client public keys.

### Coding style
We're following the [Google JavaScript coding style](https://google.github.io/styleguide/jsguide.html) in general. And there is pre-commit checking `tools/linter.js` to ensure styling before commit code.

// Use of this source code is governed by an Apache 2.0 license
// that can be found in the LICENSE file.

'use strict';

const fs = require('fs-extra');
const glob = require('glob');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {spawn} = require('child_process');
const {BuilderConf} = require('./builder_conf');
const {SMTPClient} = require('emailjs');

/**
 * Builder class.
 */
class Builder {
  /**
   * @param {string} rootDir webnn-native source code directory.
   */
  constructor(rootDir) {
    this.rootDir_ = rootDir;
    this.targetType_ = null;
    this.outDir_ = null;
    this.config_ = undefined;
    this.childResult_ = {};

    // Upload server
    this.remoteSshHost_ = null;
    this.remoteDir_ = null;
    this.remoteSshDir_ = null;

    // Config emial service
    this.client_ = null;
    this.message_ = null;
    this.subject_ = null;
    this.test_ = null;
  }

  /**
   * Init config_ member.
   * @param {object} options An object containing options as key-value pairs
   *    {backend:"", config:"",}.
   */
  init(options) {
    let backend = null;
    let configFile = 'bot_config.json';
    // 'native': build webnn-naitve
    let targetType = 'native';

    if (options !== undefined) {
      backend = options.backend;
      configFile = options.config;
      // 'chromium': build chromium-src
      // 'bot_config_chromium.json': support GPUBuffer
      // 'bot_config_chromium_arraybuffer.json': support ArrayBuffer
      targetType = configFile.indexOf('bot_config_chromium') != -1 ? 'chromium' : 'native';
    }

    this.targetType_ = targetType;

    if (!path.isAbsolute(configFile)) {
      configFile = path.join(this.rootDir_, configFile);
    }

    this.config_ = new BuilderConf(backend, configFile, this.targetType_);
    this.config_.init();
    this.config_.logger.debug('root dir: ' + this.rootDir_);
    this.outDir_ = path.join(this.rootDir_, 'out', this.config_.buildType);
    this.config_.logger.debug('out dir: ' + this.outDir_);
    this.config_.logger.debug(`config file: ${configFile}`);

    if (!this.config_.cleanBuild) {
      try {
        this.config_.logger.debug(
            `Last sucessful build changeset is ${this.lastSucceedChangeset_}`);
      } catch (e) {
        this.config_.logger.info('Not found last sucessful build.');
      }
    }

    if (!this.config_.archiveServer.host ||
      !this.config_.archiveServer.dir ||
      !this.config_.archiveServer.sshUser) {
      this.config_.logger.warn(
          `Insufficient archive-server settings configure in ${configFile}`);
      return;
    }

    this.remoteSshHost_ = this.config_.archiveServer.sshUser + '@' +
      this.config_.archiveServer.host;

    if (!this.config_.emailService.user ||
        !this.config_.emailService.host ||
        !this.config_.emailService.from ||
        !this.config_.emailService.to) {
      this.config_.logger.warn(
          `Insufficient email-service settings configure in ${configFile}`);
      return;
    }

    this.client_ = new SMTPClient({
      user: this.config_.emailService.user,
      host: this.config_.emailService.host});
    let logFileName = `${this.targetType_}_` + this.config_.targetOs + '_' +
      this.config_.targetCpu + '_' + this.config_.backend + '.log';
    if (this.targetType_ === 'chromium') {
      logFileName = `${this.targetType_}_` + this.config_.targetOs + '_' +
        this.config_.targetCpu + '_' + this.config_.backend + `_${this.config_.supportBuffer}.log`;
    }
    this.message_ = {
      text: this.test_,
      from: this.config_.emailService.from,
      to: this.config_.emailService.to,
      subject: this.subject_,
      attachment: [
        {
          path: path.join(os.tmpdir(), logFileName),
          type: 'text/plain',
          name: logFileName},
      ],
    };
  };

  /**
   * Run specified command with optional options.
   * @param {string} cmd Command string.
   * @param {object} options An object containing options as key-value pairs
   *    {backend:"", config:"",}.
   */
  async run(cmd, options) {
    this.init(options);

    switch (cmd) {
      case 'sync':
        await this.actionSync();
        break;
      case 'pull':
        await this.actionPull();
        break;
      case 'build':
        await this.actionBuild();
        break;
      case 'build-node':
        await this.actionBuildNode();
        break;
      case 'package':
        await this.actionPackage();
        break;
      case 'upload':
        await this.actionUpload();
        break;
      case 'notify':
        await this.actionNotify();
        break;
      case 'all':
        await this.actionPull();
        await this.actionSync();
        await this.actionBuild();
        await this.actionPackage();
        await this.actionUpload();
        await this.actionNotify();
        break;
      case 'all-node':
        await this.actionPull();
        await this.actionSync();
        await this.actionBuild();
        await this.actionBuildNode();
        await this.actionPackage();
        await this.actionUpload();
        await this.actionNotify();
        break;
      default:
        this.config_.logger.error(`Unsupported command: ${cmd}`);
        process.exit(1);
    }
  }

  /**
   * Run 'gclient sync' command
   */
  async actionSync() {
    this.config_.logger.info('Action sync');

    if (this.targetType_ === 'native') {
      const gclientFile = path.join(this.rootDir_, '.gclient');
      if (!fs.existsSync(gclientFile)) {
        fs.copyFileSync(
            path.join(this.rootDir_, 'scripts', 'standalone.gclient'),
            gclientFile);
      }
    }

    await this.childCommand(
      os.platform() == 'win32' ? 'gclient.bat' : 'gclient',
      ['sync'], this.rootDir_);

    if (!this.childResult_.success) {
      this.config_.logger.error('Failed to run \'gclient sync\' command.');
      await this.sendEmail('FAILED',
          'Error: Failed to run \'gclient sync\' command');
      process.exit(1);
    }
  }

  /**
   * Run 'git pull' command
   */
  async actionPull() {
    this.config_.logger.info('Action pull');
    const lastCommitId = await this.getBuildCommitId();
    await this.childCommand('git', ['pull', '--rebase'], this.rootDir_);

    if (!this.childResult_.success) {
      this.config_.logger.error('Failed to run \'git pull\' command.');
      await this.sendEmail('FAILED',
          'Error: Failed to run \'git pull\' command');
      process.exit(1);
    }

    const currentCommitId = await this.getBuildCommitId();

    if (currentCommitId === lastCommitId) {
      this.config_.logger.info('None new commit');
      await this.sendEmail('SKIPPED', 'None new commit');
      process.exit(1);
    }
  }

  /**
   * Run 'gn gen' and 'ninja -C' commands
   */
  async actionBuild() {
    this.config_.logger.info('Action build');

    if (this.config_.cleanBuild) {
      if (fs.existsSync(this.outDir_)) {
        fs.removeSync(this.outDir_);
      }
    }

    let genCmd = ['gen', `--args=${this.config_.gnArgs}`, this.outDir_];

    if (this.config_.getHostOs() === 'win') {
      genCmd =
        ['gen', `--args=${this.config_.gnArgs}`, this.outDir_];
    }

    await this.childCommand(
      os.platform() == 'win32' ? 'gn.bat' : 'gn', genCmd, this.rootDir_);

    if (!this.childResult_.success) {
      this.config_.logger.error('Failed to run \'gn gen\' command.');
      await this.sendEmail('FAILED',
          'Error: Failed to run \'gn gen\' command');
      process.exit(1);
    }

    let args = ['-C', this.outDir_];
    if (this.targetType_ = 'chromium') {
      args = ['-C', this.outDir_, 'chrome', 'mini_installer'];
    }
    await this.childCommand(
      os.platform() == 'win32' ? 'autoninja.bat' : 'autoninja', args, this.rootDir_);
    if (!this.childResult_.success) {
      this.config_.logger.error(
          `Failed to run 'autoninja -C ${this.outDir_}' command.`);
      await this.sendEmail('FAILED',
          `Failed to run 'autoninja -C ${this.outDir_}' command`);
      process.exit(1);
    }
  }

  /**
   * Build node addon in node folder.
   */
  async actionBuildNode() {
    if (this.config_.backend === 'null') {
      this.config_.logger.info('No need to build node addon for null backend');
      return;
    }

    this.config_.logger.info('Action build node addon');

    if (!fs.existsSync(this.outDir_)) {
      this.config_.logger.error(
          'Please run build webnn native firstly.');
    }

    const nodeDir = path.join(this.rootDir_, 'node');

    // install
    await this.childCommand(
        'npm',
        ['install',
          `--webnn_native_lib_path="../out/${this.config_.buildType}"`,
        ],
        nodeDir, undefined, true);

    // build
    await this.childCommand(
        'npm',
        ['run',
          'build',
          `--webnn_native_lib_path="../out/${this.config_.buildType}"`,
        ],
        nodeDir, undefined, true);

    // copy files to out folder for package
    this.copyTestDataResources('node');
  }

  /**
   * Copy test data resources files into out directory.
   * @param {string} key json key, default "default"
   */
  copyTestDataResources(key = 'default') {
    const testDataJson =
        path.join(this.rootDir_, 'src', 'test_data.json');
    const josnConfig = JSON.parse(fs.readFileSync(testDataJson, 'utf8'));
    const config = josnConfig[key];
    const start = this.rootDir_.length + 1;
    for (const category in config) {
      if (config.hasOwnProperty(category)) {
        for (const name of config[category]) {
          const src =
            path.join(this.rootDir_, name.split('/').join(path.sep));
          const items = glob.sync(src);
          for (const item of items) {
            if (fs.lstatSync(item).isFile()) {
              const dest = path.join(this.outDir_,
                  path.dirname(item).slice(start).split('/').join(path.sep));
              fs.mkdirpSync(dest);
              fs.copyFileSync(item, path.join(dest, path.basename(src)));
            } else {
              const dest = path.join(this.outDir_,
                  item.slice(start).split('/').join(path.sep));
              fs.mkdirpSync(dest);
              fs.copySync(item, dest);
            }
          }
        }
      }
    }
  }

  /**
   * Package libraries and executable files.
   */
  async actionPackage() {
    this.config_.logger.info('Action package');
    const buildInfo = this.getBuildInfo();
    if (this.targetType_ === 'native') {
      this.copyTestDataResources();
      const packageName =
        `webnn-${buildInfo.os}-${buildInfo.cpu}-${buildInfo.backend}.tgz`;
      console.log(`packageName: ${packageName}`);
      const packageFile = path.join(this.rootDir_, packageName);
      const packageCfg = path.join(
          this.rootDir_, 'src', `tar_${buildInfo.os}.json`);
      const compressedScript = path.join(
          this.rootDir_, 'tools', 'make_tar.py');
      await this.childCommand(
          'python',
          [compressedScript, this.outDir_, packageCfg, packageFile],
          this.rootDir_);
      if (!this.childResult_.success) {
        this.config_.logger.error('Failed to package.');
        await this.sendEmail('FAILED', 'Error: Failed to package');
        process.exit(1);
      }
      const savedFile = path.join(this.outDir_, packageName);
      fs.rename(packageFile, savedFile, function(err) {
        if (err) throw err;
        console.log(`Save packaged file as ${savedFile}`);
      });
    } else if (this.targetType_ === 'chromium') {
      switch (buildInfo.os) {
        case 'mac':
          // Zip files
          await this.childCommand('zip',
              ['-r', this.packagedFile, 'Chromium.app', 'pnacl'], this.outDir_);
          break;
        case 'win':
          // Extract chrome.7z
          await this.childCommand(
              path.join(this.rootDir_, 'third_party', 'lzma_sdk', 'Executable', '7za.exe'),
              ['x', '-y', '-sdel', path.join(this.outDir_, 'chrome.7z')], this.outDir_);
          // Zip files
          await this.childCommand(
              path.join(this.rootDir_, 'tools', 'make_win32_zip.bat'),
              [this.rootDir_, __dirname, this.outDir_, this.config_.supportBuffer],
              this.outDir_);
          break;
        default:
          // Nothing to do on Linux and Android
          break;
      }
    }
  }

  /**
   * Upload package and log file to stored server.
   */
  async actionUpload() {
    this.config_.logger.info('Action upload');
    if (!this.remoteSshHost_) return;
    const buildInfo = this.getBuildInfo();
    let packageFile;
    if (this.targetType_ === 'chromium') {
      switch (buildInfo.os) {
        case 'android':
          packageFile = path.join(this.outDir_, 'apks', 'ChromePublic.apk');
          break;
        case 'linux':
          const installer =
            '//out/linux_x64_release/chromium-browser-unstable_102.0.4976.0-1_amd64.deb';
          packageFile = path.join(this.outDir_, installer.split('/')[4]);
          break;
        case 'mac':
          packageFile = path.join(this.outDir_, 'chromium-mac.zip');
          break;
        case 'win':
          packageFile= path.join(this.outDir_, `chrome-win32-${this.config_.supportBuffer}.zip`);
          break;
        default:
          packageFile = null;
          break;
      }
    } else if (this.targetType_ === 'native') {
      packageFile = path.join(this.outDir_,
          `webnn-${buildInfo.os}-${buildInfo.cpu}-${buildInfo.backend}.tgz`);
    }

    await this.makeRemoteDir();
    await this.childCommand(
        'scp', [packageFile, this.remoteSshDir_], this.rootDir_);

    if (!this.childResult_.success) {
      this.config_.logger.error('Failed to upload package.');
      await this.sendEmail('FAILED', 'Error: Failed to upload package');
      process.exit(1);
    }

    const md5Content = crypto.createHash('md5')
        .update(fs.readFileSync(packageFile)).digest('hex');
    const md5File = packageFile + '.md5';

    fs.writeFile(md5File, md5Content, (err) => {
      if (err) throw err;

      this.childCommand(
          'scp', [md5File, this.remoteSshDir_], this.rootDir_);
    });

    await this.uploadLogfile();
  }

  /**
   * Do notify by sending email.
   */
  async actionNotify() {
    this.config_.logger.info('Action notify');
    await this.sendEmail('SUCCESSED');
  }

  /**
   * Parse os/cpu/backend info from args.gn in out directory.
   * @return {object} Returns JSON object,
   *    {
   *      'os': <target_os>,
   *      'cpu': <target_cpu>,
   *      'backend': <backend>,
   *      'commitId': <commitId>,
   *     }
   */
  getBuildInfo() {
    const content =
      fs.readFileSync(path.join(this.outDir_, 'args.gn'), 'utf8');
    const info = {
      'os': this.config_.getHostOs(),
      'cpu': this.config_.getHostCpu(),
      'backend': 'null',
    };

    for (const line of content.split('\n')) {
      if (line.startsWith('target_os')) {
        info['os'] = line.slice(line.indexOf('=') + 2).split('"')[1];
      } else if (line.startsWith('target_cpu')) {
        info['cpu'] = line.slice(line.indexOf('=') + 2).split('"')[1];
      } else if (line.startsWith('webnn_enable_') &&
          line.indexOf('webnn_enable_wire') === -1 &&
          line.indexOf('webnn_enable_gpu_buffer') === -1) {
        info['backend'] = line.slice(0, line.indexOf('=') - 1).split('_')[2];
      }
    }

    return info;
  }

  /**
   * @return {string} Returns a string for commit id.
   */
  async getBuildCommitId() {
    const obj = {};
    await this.childCommand('git', ['rev-parse', 'HEAD'], this.rootDir_, obj);

    if (!this.childResult_.success) {
      this.config_.logger.error('Failed run \'git rev-parse HEAD\' command.');
      process.exit(1);
    }

    return obj.changeset.slice(0, 7);
  }

  /**
   * Create remote directory
   */
  async makeRemoteDir() {
    if (!this.remoteSshHost_) return;

    const commitId = await this.getBuildCommitId();
    const buildInfo = this.getBuildInfo();
    this.remoteDir_ = path.join(this.config_.archiveServer.dir,
        commitId, `${buildInfo.os}_${buildInfo.cpu}_${buildInfo.backend}`);
    this.remoteSshDir_ = this.remoteSshHost_ + ':' + this.remoteDir_ + '/';
    let dir = this.remoteDir_;
    if (os.platform() == 'win32') {
      dir = this.remoteDir_.split(path.sep).join('/');
    }
    this.config_.logger.info(`HEAD is at ${dir}`);

    await this.childCommand('ssh',
        [this.remoteSshHost_, 'mkdir', '-p', dir], this.rootDir_);
  }

  /**
   * Upload log file
   */
  async uploadLogfile() {
    if (!this.remoteSshHost_) return;

    const buildInfo = this.getBuildInfo();
    let logFile = path.join(os.tmpdir(),
        `${this.targetType_}_${buildInfo.os}_${buildInfo.cpu}_${buildInfo.backend}.log`);
    if (this.targetType_ === 'chromium') {
      logFile = path.join(os.tmpdir(),
        `${this.targetType_}_${buildInfo.os}_${buildInfo.cpu}_${buildInfo.backend}_` +
        `${this.config_.supportBuffer}.log`);
    }
    await this.makeRemoteDir();
    await this.childCommand(
        'scp', [logFile, this.remoteSshDir_], this.rootDir_);

    if (!this.childResult_.success) {
      this.config_.logger.error('Failed to upload log file.');
      await this.sendEmail('FAILED', 'Error: Failed to upload log file');
      process.exit(1);
    }
  }

  /**
   * Send status email
   * @param {string} result build result
   * @param {string} cause string
   * @return {object} promise.
   */
  sendEmail(result, cause) {
    return new Promise((resolve, reject) => {
      const title = this.targetType_ === 'native' ? 'WebNN Native': 'Chromium';
      this.message_.subject = `[${this.config_.targetOs}]` +
        `[${this.config_.backend}] ${title} Nightly Build -- ${result}`;
      this.message_.text = `Hi all,\n \n${title} Nightly Build ` + result +
        ' for ' + this.config_.targetOs + ' ' + this.config_.targetCpu + ' ' +
        this.config_.backend + ' backend';
      if (cause !== undefined) {
        this.message_.text += ' (' + cause + ')';
      }
      this.message_.text += '.\n \nThanks\nWebNN Team';
      this.client_.send(this.message_, function(err, message) {
        resolve(message['text']);
      });
    });
  }

  /**
   * Execute command.
   * @param {string} cmd command string.
   * @param {array} args arguments array.
   * @param {string} cwd path string.
   * @param {object} result return value.
   * @param {boolean} shell shell option.
   * @return {object} child_process.spawn promise.
   */
  childCommand(cmd, args, cwd, result, shell = false) {
    return new Promise((resolve, reject) => {
      const cmdFullStr = cmd + ' ' + args.join(' ');
      this.config_.logger.info('Execute command: ' + cmdFullStr);
      const options = {cwd: cwd};

      if (shell) {
        options.shell = true;
      }

      const child = spawn(cmd, [...args], options);

      child.stdout.on('data', (data) => {
        if (result) result.changeset = data.toString();
        this.config_.logger.debug(`${data.toString()}`);
      });

      child.stderr.on('data', (data) => {
        this.config_.logger.error(data.toString());
      });

      child.on('close', (code) => {
        this.childResult_.success = (code === 0);
        resolve(code);
      });
    });
  }
}

module.exports = {
  Builder,
};

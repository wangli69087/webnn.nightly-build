// Use of this source code is governed by an Apache 2.0 license
// that can be found in the LICENSE file.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const winston = require('winston');

/**
 * BuilderConf class.
 */
class BuilderConf {
  /**
   * @param {String} backend Target backend.
   * @param {String} conf Configuration file for build.
   * @param {String} targetType
   *    'native': build webnn-native,
   *    'chromium': build chromium-src
   */
  constructor(backend, conf, targetType) {
    this.conf_ = conf;
    this.backend_ = backend;
    this.targetType_ = targetType;

    // Get list via "gn help target_os <out_dir>", current support
    // linux|win
    this.targetOs_ = undefined;

    // Get list via "gn help target_cpu <out_dir>", current support
    // x86|x64|arm|arm64
    this.targetCpu_ = undefined;

    // gn-args for generate webnn-native or chromium-src
    this.gnArgs_ = {
      isDebug: false,
      backend: 'null',
    };

    // extra gn-args for generate chromium-src
    this.chromiumExtraGnArgs_ = {
      wire: true,
      gpuBuffer: true, // false: ArrayBuffer
    };

    // support buffer type: 'ArrayBuffer', 'GPUBuffer'
    this.supportBuffer_ = undefined;

    // True indicate remove out dir before build
    this.cleanBuild_ = true;

    // logging
    this.logger_ = undefined;

    // archive-server
    this.archiveServer_ = {
      host: undefined,
      dir: undefined,
      sshUser: undefined,
    };

    // email-service
    this.emailService_ = {
      user: undefined,
      host: undefined,
      from: undefined,
      to: undefined,
      subject: undefined,
      text: undefined,
    };
  }

  /**
   * Init following BuilderConf members from parsing this.conf_:
   *  this.targetOs_
   *  this.targetCpu_
   *  this.gnArgs_
   *  this.chromiumExtraGnArgs_
   *  this.cleanBuild_
   *  this.archiveServer_
   *  this.emailService_
   *  this.logger_
   */
  init() {
    fs.accessSync(this.conf_);
    const config = JSON.parse(fs.readFileSync(this.conf_, 'utf8'));

    this.targetOs_ = config['target-os'];
    this.targetCpu_ = config['target-cpu'];
    this.targetOs_ = this.targetOs_ || this.getHostOs();
    this.targetCpu_ = this.targetCpu_ || this.getHostCpu();

    this.gnArgs_.isDebug = config['gnArgs']['is-debug'];
    this.gnArgs_.backend = config['gnArgs']['backend'];
    // save path of native build
    this.archiveServer_.dir = config['archive-server']['dir'];

    if (this.targetType_ === 'chromium') {
      this.chromiumExtraGnArgs_.wire = config['gnArgs']['chromium-extra']['wire'];
      this.chromiumExtraGnArgs_.gpuBuffer = config['gnArgs']['chromium-extra']['gpu-buffer'];
    }

    this.cleanBuild_ = config['clean-build'];

    this.archiveServer_.host = config['archive-server']['host'];
    this.archiveServer_.dir = config['archive-server']['dir'];
    this.archiveServer_.sshUser = config['archive-server']['ssh-user'];

    this.emailService_.user = config['email-service']['user'];
    this.emailService_.host = config['email-service']['host'];
    this.emailService_.from = config['email-service']['from'];
    this.emailService_.to = config['email-service']['to'];

    if (this.backend_ === null) {
      this.backend_ = this.gnArgs_.backend;
    } else {
      if ( this.backend_ != this.gnArgs_.backend) {
        // Update backend of gnArgs
        config['gnArgs']['backend'] = this.backend_;
        fs.writeFileSync(this.conf_, JSON.stringify(config, null, 2));
      }
    }

    // Handel logger
    const logLevel = config['logging']['level'];
    let logFile = path.join(os.tmpdir(),
        `${this.targetType_}_${this.targetOs_}_${this.targetCpu_ }` +
        `_${this.backend_}.log`);
    if (this.targetType_ === 'chromium') {
      let buffer = 'GPUBuffer';
      if (!this.chromiumExtraGnArgs_.gpuBuffer) {
        buffer = 'ArrayBuffer';
      }
      this.supportBuffer_ = buffer;
      logFile = path.join(os.tmpdir(),
          `${this.targetType_}_${this.targetOs_}_${this.targetCpu_ }` +
          `_${this.backend_}_${buffer}.log`);
    }
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }

    this.logger_ = winston.createLogger({
      level: logLevel,
      format: winston.format.simple(),
      transports: [
        new winston.transports.Console({
          colorize: true,
        }),
        new winston.transports.File({
          filename: logFile,
        }),
      ],
    });

    // create logfile is does not exist
    fs.writeFileSync(logFile, '', {flag: 'w+'});
    this.logger_.debug('Config settings:');
    this.logger_.debug(`  backend: ${this.backend_}`);
    this.logger_.debug(`  target OS: ${this.targetOs_}`);
    this.logger_.debug(`  target CPU: ${this.targetCpu_}`);
    if (this.targetType_ === 'chromium') {
      this.logger_.debug(`  enable wire: ${this.chromiumExtraGnArgs_.wire}`);
      this.logger_.debug(`  enable GPU Buffer: ${this.chromiumExtraGnArgs_.gpuBuffer}`);
    }
    this.logger_.debug(`  log level: ${logLevel}`);
    this.logger_.debug(`  log file: ${logFile}`);
  }

  /**
   * @return {string} target backend.
   */
  get backend() {
    return this.backend_;
  }

  /**
   * @return {string} supported buffer type.
   */
  get supportBuffer() {
    return this.supportBuffer_;
  }

  /**
   * @return {string} target OS.
   */
  get targetOs() {
    return this.targetOs_;
  }

  /**
   * @return {string} target CPU.
   */
  get targetCpu() {
    return this.targetCpu_;
  }

  /**
   * @return {string} arguments to run 'gn gen'.
   */
  get gnArgs() {
    let args = 'target_os=\"' + this.targetOs_ + '\"';
    args += ' target_cpu=\"' + this.targetCpu_ + '\"';
    args += ' is_debug=' + (this.gnArgs_.isDebug).toString();
    args += ' webnn_enable_' + this.backend_ + '=true';
    if (this.targetType_ === 'chromium') {
      args += ' webnn_enable_wire=' + (this.chromiumExtraGnArgs_.wire).toString();
      args += ' webnn_enable_gpu_buffer=' + (this.chromiumExtraGnArgs_.gpuBuffer).toString();
    }
    return args;
  }

  /**
   * @return {string} build type.
   */
  get buildType() {
    return this.gnArgs_.isDebug ? 'Debug' : 'Release';
  }

  /**
   * @return {boolean} of clean build.
   */
  get cleanBuild() {
    return this.cleanBuild_;
  }

  /**
   * @return {Object} logger.
   */
  get logger() {
    return this.logger_;
  }

  /**
   * @return {Object} archive server.
   */
  get archiveServer() {
    return this.archiveServer_;
  }

  /**
   * @return {Object} email service.
   */
  get emailService() {
    return this.emailService_;
  }

  /**
   * Get hosted OS string.
   * @return {string} hosted OS.
   */
  getHostOs() {
    const hostOs = os.platform();
    switch (hostOs) {
      case 'linux':
        return 'linux';
      case 'win32':
        return 'win';
      case 'aix':
      case 'freebsd':
      case 'openbsd':
      case 'sunos':
        return 'linux';
    }
  }

  /**
   * Get hosted CPU string.
   * @return {string} hosted CPU.
   */
  getHostCpu() {
    let hostCpu = os.arch();
    switch (hostCpu) {
      case 'arm':
      case 'arm64':
      case 'mipsel':
      case 'x64':
        break;
      case 'ia32':
        hostCpu = 'x86';
        break;
      case 'mips':
      case 'ppc':
      case 'ppc64':
      case 's390':
      case 's390x':
      case 'x32':
        this.logger_.error(`Unsuppurted arch: ${hostCpu}`);
    }

    return hostCpu;
  }
}

module.exports = {
  BuilderConf,
};

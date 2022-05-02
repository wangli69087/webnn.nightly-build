// Use of this source code is governed by an Apache 2.0 license
// that can be found in the LICENSE file.

'use strict';

const os = require('os');
const path = require('path');
const recursive = require('recursive-readdir');
const spawn = require('child_process').spawnSync;
const which = require('which');

let errors = [];

/**
 * Do CPP linter
 * @param {files} files to be linted.
 */
function doCppLint(files) {
  if (!files || files.length == 0) return;

  const cpplint = (os.platform() == 'win32') ?
    which.sync('cpplint', {pathExt: '.EXE;.PY'}) :
    which.sync('cpplint.py');
  if (!cpplint) {
    console.log(
        'You need install depot_tools, and add to PATH.' +
        ' https://dev.chromium.org/developers/how-tos/install-depot-tools');
    process.exit(1);
  }

  let cmdOptions = [cpplint];
  cmdOptions = cmdOptions.concat(files);
  // cpplint report result in stderr,
  // $? is always 0 whatever there are errors or not.
  // So we need check the last line as "Total errors found: 0"
  const output = spawn('python', cmdOptions).stderr.toString().split(os.EOL);
  if (output[output.length - 2] != 'Total errors found: 0') {
    errors = errors.concat(output);
  }
}

/**
 * Do JavaScript linter
 * @param {files} files to be linted.
 */
function doJsLint(files) {
  if (!files || files.length == 0) return;

  const jsLinterDir = path.join(__dirname, '..', 'node_modules', '.bin');

  for (const linter of ['eslint']) {
    let output = null;
    if (os.platform() == 'win32') {
      output =
        spawn(path.join(jsLinterDir, linter + '.cmd'), files).stdout.toString();
    } else {
      output =
        spawn('node', [path.join(jsLinterDir, linter)].concat(files))
            .stdout.toString();
    }
    if (output) {
      const lines = output.split('\n');
      if (lines.length > 0) errors = errors.concat(lines);
    }
  }
}

recursive(path.dirname(__dirname),
    // ignore files
    ['node_modules', 'prettify'], function(err, files) {
      const cppFiles = [];
      const jsFiles = [];
      for (const f of files) {
        if (path.extname(f) == '.js') {
          jsFiles.push(f);
        } else if (path.extname(f) == '.cpp') {
          cppFiles.push(f);
        }
      }

      doCppLint(cppFiles);
      doJsLint(jsFiles);

      if (errors.length >= 1) {
        for (const l of errors) console.log(l);
        process.exit(1);
      }
    });

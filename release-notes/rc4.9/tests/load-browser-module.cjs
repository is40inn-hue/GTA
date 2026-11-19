'use strict';
// Evaluate the browser's explicit CommonJS export without inheriting a host package type.
const fs = require('node:fs');
const vm = require('node:vm');
module.exports = filename => {
  const module = { exports: {} };
  const run = vm.runInThisContext('(function(module, exports) {\n' + fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  run(module, module.exports);
  return module.exports;
};

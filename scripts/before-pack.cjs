const { checkRuntime } = require('./check-runtime.cjs');
module.exports = async context => checkRuntime({ rootDir: context && (context.appDir || context.projectDir) });
if (require.main === module) module.exports({ projectDir: process.cwd() }).catch(e => { console.error(e.message); process.exitCode = 1; });

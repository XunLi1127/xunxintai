const path = require('node:path');
function resolveBun({ isPackaged, engineDir, platform, homedir, exists }) {
  const bundled = path.join(engineDir, 'bin', platform === 'win32' ? 'bun.exe' : 'bun');
  if (exists(bundled)) return bundled;
  if (isPackaged) return null;
  const user = path.join(homedir, '.bun', 'bin', platform === 'win32' ? 'bun.exe' : 'bun');
  return exists(user) ? user : 'bun';
}
function resolveGitBash({ platform, env, homedir, exists }) {
  if (platform !== 'win32') return { ok: true, path: null };
  const candidates = [env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe', path.join(homedir, 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'), env.ProgramW6432 && path.join(env.ProgramW6432, 'Git', 'bin', 'bash.exe')].filter(Boolean);
  const found = candidates.find(exists);
  return found ? { ok: true, path: found } : { ok: false, code: 'ENGINE_GIT_BASH_MISSING', message: '未找到 Git Bash。请安装 Git for Windows 后重试。' };
}
module.exports = { resolveBun, resolveGitBash };

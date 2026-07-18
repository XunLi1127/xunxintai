const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const { loadProductPrompt, composeSystemPrompt } = require('../prompt-loader.cjs');

function withPromptDir(files, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xunxintai-prompt-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content, 'utf8');
    }
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('小洵.md 优先于旧提示并标记 primary', () => {
  withPromptDir({ '小洵.md': '你是小洵。', 'system-prompt.txt': '旧身份' }, (dir) => {
    const loaded = loadProductPrompt(dir);
    assert.equal(loaded.prompt, '你是小洵。');
    assert.equal(loaded.cleanPrompt, '你是小洵。');
    assert.equal(loaded.source, 'primary');
    assert.equal(loaded.deprecated, false);
    assert.doesNotMatch(loaded.prompt, /旧身份/);
  });
});

test('主提示缺失时读取旧文件并标记 legacy fallback', () => {
  withPromptDir({ 'system-prompt.txt': '<identity>旧身份</identity>\n旧版通用说明' }, (dir) => {
    const loaded = loadProductPrompt(dir);
    assert.equal(loaded.source, 'legacy-fallback');
    assert.equal(loaded.deprecated, true);
    assert.match(loaded.deprecationMessage, /system-prompt\.txt/);
    assert.match(loaded.prompt, /旧身份/);
    assert.doesNotMatch(loaded.cleanPrompt, /<identity>/);
    assert.match(loaded.cleanPrompt, /旧版通用说明/);
  });
});

test('旧提示清理身份块后不会给 self-hosted 返回空提示', () => {
  withPromptDir({ 'system-prompt.txt': '<identity>仅旧身份</identity>' }, (dir) => {
    const loaded = loadProductPrompt(dir);
    assert.equal(loaded.source, 'legacy-fallback');
    assert.ok(loaded.cleanPrompt.trim().length > 0);
    assert.match(loaded.cleanPrompt, /事实|验证/);
  });
});

test('严格按 UTF-8 保留中文内容', () => {
  const chinese = '你是小洵，运行在中文优先桌面 AI 工作台“洵心台”中。事实与证据优先。';
  withPromptDir({ '小洵.md': chinese }, (dir) => {
    assert.equal(loadProductPrompt(dir).prompt, chinese);
  });
});

test('空白主文件按缺失处理并稳定回退旧提示', () => {
  withPromptDir({ '小洵.md': ' \r\n\t', 'system-prompt.txt': '可用旧提示' }, (dir) => {
    const loaded = loadProductPrompt(dir);
    assert.equal(loaded.source, 'legacy-fallback');
    assert.equal(loaded.prompt, '可用旧提示');
  });
});

test('主文件与旧文件都缺失时返回非空的最小安全提示', () => {
  withPromptDir({}, (dir) => {
    const first = loadProductPrompt(dir);
    const second = loadProductPrompt(dir);
    assert.equal(first.source, 'builtin-fallback');
    assert.equal(first.prompt, second.prompt);
    assert.ok(first.prompt.trim().length > 0);
    assert.match(first.prompt, /事实|验证/);
  });
});

test('组合只注入一次产品身份并保持运行时附加层顺序', () => {
  const product = '你是小洵，运行在洵心台中。';
  const runtime = ['<user_profile>用户层</user_profile>', '<tool_access_policy>安全层</tool_access_policy>'];
  const combined = composeSystemPrompt(product, runtime);
  assert.equal((combined.match(/你是小洵/g) || []).length, 1);
  assert.ok(combined.indexOf(product) < combined.indexOf(runtime[0]));
  assert.ok(combined.indexOf(runtime[0]) < combined.indexOf(runtime[1]));
});

test('bridge 使用提示加载器与统一组合入口', () => {
  const bridge = fs.readFileSync(path.join(repoRoot, 'electron', 'bridge-server.cjs'), 'utf8');
  assert.match(bridge, /require\(['"]\.\/prompt-loader\.cjs['"]\)/);
  assert.match(bridge, /composeSystemPrompt\(/);
  assert.doesNotMatch(bridge, /CUSTOM_SYSTEM_PROMPT_PATH\s*=\s*path\.join\(__dirname,\s*['"]system-prompt\.txt['"]\)/);
});

test('electron-builder files 配置会打包小洵.md', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const files = pkg.build && pkg.build.files;
  assert.ok(Array.isArray(files));
  assert.ok(files.some((pattern) => pattern === 'electron/**/*' || pattern === 'electron/小洵.md'));
  assert.ok(fs.existsSync(path.join(repoRoot, 'electron', '小洵.md')));
});

test('引擎 CLAUDE.md 兼容加载协议仍然存在', () => {
  const loaderPath = path.join(repoRoot, 'engine', 'src', 'utils', 'claudemd.ts');
  assert.ok(fs.existsSync(loaderPath));
  const loader = fs.readFileSync(loaderPath, 'utf8');
  assert.match(loader, /CLAUDE\.md/);
  assert.match(loader, /CLAUDE\.local\.md/);
  assert.match(loader, /\.claude/);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');
const { createCapabilityDiagnostics, registerCapabilityDiagnosticsRoute } = require('../capability-diagnostics.cjs');

test('能力诊断只返回稳定的白名单技术状态', () => {
  const result = createCapabilityDiagnostics({
    appVersion: '1.6.31',
    bunAvailable: true,
    gitBashAvailable: false,
    petAvailable: true,
    evidenceGateAvailable: true,
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    appVersion: '1.6.31',
    status: 'degraded',
    capabilities: [
      { id: 'bun_runtime', status: 'ready', code: null, message: 'Bun 运行时可用' },
      { id: 'git_bash', status: 'unavailable', code: 'GIT_BASH_NOT_FOUND', message: '未找到 Git Bash，请安装 Git for Windows' },
      { id: 'desktop_pet', status: 'ready', code: null, message: '桌宠组件可用' },
      { id: 'input_evidence_gate', status: 'ready', code: null, message: '输入证据门可用' },
    ],
  });
});

test('能力诊断拒绝未知字段和敏感字段而不是尝试脱敏', () => {
  const base = { appVersion: '1.6.31', bunAvailable: true, gitBashAvailable: true, petAvailable: false, evidenceGateAvailable: true };
  for (const extra of [
    { prompt: 'private conversation' },
    { apiKey: 'secret' },
    { config: { provider: 'private' } },
    { workspacePath: 'C:\\private' },
    { unknown: true },
  ]) assert.throws(() => createCapabilityDiagnostics({ ...base, ...extra }), /unknown diagnostic field/i);
});

test('能力诊断拒绝可夹带隐私的版本和非布尔探针', () => {
  const base = { appVersion: '1.6.31', bunAvailable: true, gitBashAvailable: true, petAvailable: false, evidenceGateAvailable: true };
  assert.throws(() => createCapabilityDiagnostics({ ...base, appVersion: '1.6.31 secret' }), /invalid appVersion/i);
  assert.throws(() => createCapabilityDiagnostics({ ...base, bunAvailable: 'yes' }), /invalid diagnostic probe/i);
});

test('能力诊断拒绝带自定义原型的输入对象', () => {
  const input = Object.assign(Object.create({ prompt: 'private' }), {
    appVersion: '1.6.31', bunAvailable: true, gitBashAvailable: true, petAvailable: false, evidenceGateAvailable: true,
  });
  assert.throws(() => createCapabilityDiagnostics(input), /invalid diagnostic input/i);
});

function fakeResponse() {
  return {
    statusCode: 200, contentType: null, body: null,
    status(value) { this.statusCode = value; return this; },
    type(value) { this.contentType = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('HTTP 入口可达并以 JSON 200 返回脱敏快照', () => {
  let route;
  const server = { get(pathname, handler) { route = { pathname, handler }; } };
  registerCapabilityDiagnosticsRoute(server, () => ({
    appVersion: '1.6.31', bunAvailable: true, gitBashAvailable: true, petAvailable: false, evidenceGateAvailable: true,
  }));
  const res = fakeResponse();
  route.handler({}, res);
  assert.equal(route.pathname, '/api/capabilities/diagnostics');
  assert.equal(res.statusCode, 200);
  assert.equal(res.contentType, 'application/json');
  assert.equal(res.body.status, 'degraded');
  assert.doesNotMatch(JSON.stringify(res.body), /prompt|token|secret|workspacePath|credential|api.?key/i);
});

test('HTTP 入口探针失败时返回稳定脱敏的 JSON 503', () => {
  let handler;
  registerCapabilityDiagnosticsRoute({ get(_path, value) { handler = value; } }, () => { throw new Error('secret-token prompt path'); });
  const res = fakeResponse();
  handler({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.contentType, 'application/json');
  assert.deepEqual(res.body, { schemaVersion: 1, status: 'unavailable', code: 'CAPABILITY_DIAGNOSTICS_FAILED', message: '能力诊断暂时不可用' });
});

test('bridge 接入受控能力诊断路由并只使用非敏感现有状态', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');
  assert.match(bridge, /registerCapabilityDiagnosticsRoute\(server/);
  assert.match(bridge, /bunAvailable:\s*Boolean\(bunExePath\)/);
  assert.match(bridge, /gitBashAvailable:\s*gitBashDiagnostic\.ok/);
  assert.match(bridge, /evidenceGateAvailable:\s*typeof validateInputEvidence === 'function'/);
});

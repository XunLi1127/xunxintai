const INPUT_FIELDS = new Set([
  'appVersion',
  'bunAvailable',
  'gitBashAvailable',
  'petAvailable',
  'evidenceGateAvailable',
]);

const CAPABILITIES = Object.freeze([
  ['bunAvailable', 'bun_runtime', 'BUN_RUNTIME_NOT_FOUND', 'Bun 运行时可用', '未找到 Bun 运行时，请重新安装洵心台'],
  ['gitBashAvailable', 'git_bash', 'GIT_BASH_NOT_FOUND', 'Git Bash 可用', '未找到 Git Bash，请安装 Git for Windows'],
  ['petAvailable', 'desktop_pet', 'PET_SIDECAR_NOT_INSTALLED', '桌宠组件可用', '桌宠组件尚未安装'],
  ['evidenceGateAvailable', 'input_evidence_gate', 'INPUT_EVIDENCE_GATE_UNAVAILABLE', '输入证据门可用', '输入证据门不可用'],
]);

function createCapabilityDiagnostics(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('invalid diagnostic input');
  for (const key of Object.keys(input)) if (!INPUT_FIELDS.has(key)) throw new Error(`unknown diagnostic field: ${key}`);
  if (typeof input.appVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.appVersion)) throw new Error('invalid appVersion');
  for (const [field] of CAPABILITIES) if (typeof input[field] !== 'boolean') throw new Error(`invalid diagnostic probe: ${field}`);

  const capabilities = CAPABILITIES.map(([field, id, code, readyMessage, unavailableMessage]) => input[field]
    ? { id, status: 'ready', code: null, message: readyMessage }
    : { id, status: 'unavailable', code, message: unavailableMessage });
  return {
    schemaVersion: 1,
    appVersion: input.appVersion,
    status: capabilities.every(item => item.status === 'ready') ? 'ready' : 'degraded',
    capabilities,
  };
}

function registerCapabilityDiagnosticsRoute(server, getProbes) {
  server.get('/api/capabilities/diagnostics', (_req, res) => {
    res.type('application/json');
    try {
      return res.status(200).json(createCapabilityDiagnostics(getProbes()));
    } catch (_) {
      return res.status(503).json({
        schemaVersion: 1,
        status: 'unavailable',
        code: 'CAPABILITY_DIAGNOSTICS_FAILED',
        message: '能力诊断暂时不可用',
      });
    }
  });
}

module.exports = { createCapabilityDiagnostics, registerCapabilityDiagnosticsRoute };

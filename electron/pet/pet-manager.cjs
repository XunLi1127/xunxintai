const { PET_PROTOCOL_VERSION } = require('./protocol.cjs');
const { normalizeLifecycleEvent } = require('./state-normalizer.cjs');

const SETTING_KEYS = new Set(['position', 'size', 'muted', 'clickThrough', 'doNotDisturb']);
function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid settings');
  for (const key of Object.keys(input)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('unsafe setting');
    if (!SETTING_KEYS.has(key)) throw new Error('unknown setting');
  }
  if ('muted' in input && typeof input.muted !== 'boolean') throw new Error('invalid muted setting');
  if ('clickThrough' in input && typeof input.clickThrough !== 'boolean') throw new Error('invalid clickThrough setting');
  if ('doNotDisturb' in input && typeof input.doNotDisturb !== 'boolean') throw new Error('invalid doNotDisturb setting');
  if ('size' in input && (!Number.isFinite(input.size) || input.size < 32 || input.size > 512)) throw new Error('invalid size setting');
  if ('position' in input && (!input.position || Object.keys(input.position).some(k => !['x', 'y'].includes(k)) || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y))) throw new Error('invalid position setting');
  return { ...input, ...('position' in input ? { position: { x: input.position.x, y: input.position.y } } : {}) };
}
class PetManager {
  constructor({ client = null, sidecar = null, clock = globalThis, now = Date.now, completedDisplayMs = 5000 } = {}) {
    this.client = client; this.sidecar = sidecar; this.clock = clock; this.now = now; this.completedDisplayMs = completedDisplayMs;
    this.state = 'idle'; this.settings = {}; this.errorCode = null;
  }
  getStatus() { return { state: this.state, running: Boolean(this.client?.getStatus().connected), retryCount: this.client?.getStatus().retryCount || 0 }; }
  async start() {
    if (!this.sidecar) { this.errorCode = 'PET_SIDECAR_NOT_INSTALLED'; return { ok: false, code: this.errorCode, message: '桌宠组件尚未安装' }; }
    this.client?.start(); return { ok: true, state: this.state };
  }
  stop() { this.clock.clearTimeout(this.idleTimer); this.client?.stop(); this.state = 'idle'; return { ok: true, state: 'idle' }; }
  updateSettings(input) { const safe = validateSettings(input); this.settings = { ...this.settings, ...safe }; return { ...this.settings, ...(this.settings.position ? { position: { ...this.settings.position } } : {}) }; }
  handleLifecycleEvent(event) {
    const result = normalizeLifecycleEvent(event); if (!result) return null;
    this.clock.clearTimeout(this.idleTimer); this.state = result.state; this.client?.setState(result.state);
    if (result.state === 'completed' || result.state === 'failed') this.idleTimer = this.clock.setTimeout(() => { this.state = 'idle'; this.client?.setState('idle'); }, this.completedDisplayMs);
    return result;
  }
  exportDiagnostics() { return { protocolVersion: PET_PROTOCOL_VERSION, state: this.state, timestamp: this.now(), errorCode: this.errorCode, retryCount: this.client?.getStatus().retryCount || 0 }; }
}
module.exports = { PetManager, validateSettings };

const crypto = require('node:crypto');

const PET_PROTOCOL_VERSION = '1.0';
const MAX_LINE_BYTES = 16 * 1024;
const STATES = new Set(['idle', 'thinking', 'tool_running', 'awaiting_confirmation', 'completed', 'failed', 'sleeping']);
const SENSITIVE = new Set(['conversation', 'prompt', 'toolInput', 'toolOutput', 'reasoning']);
const SETTING_FIELDS = new Set(['position', 'size', 'muted', 'clickThrough', 'doNotDisturb']);
const FIELDS = {
  hello: new Set(['type', 'version', 'token']), hello_ack: new Set(['type', 'version', 'token']),
  state: new Set(['type', 'sessionId', 'seq', 'state']),
  settings: new Set(['type', 'sessionId', 'seq', 'settings']),
  heartbeat: new Set(['type', 'sessionId', 'seq']), shutdown: new Set(['type', 'sessionId', 'seq']),
};

function inspect(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE.has(key)) throw new Error('sensitive field rejected');
    inspect(nested);
  }
}
function validateMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('invalid message');
  inspect(message);
  const allowed = FIELDS[message.type];
  if (!allowed) throw new Error('unknown message type');
  for (const key of Object.keys(message)) if (!allowed.has(key)) throw new Error('unknown field');
  if (message.type === 'hello' || message.type === 'hello_ack') {
    if (message.version !== PET_PROTOCOL_VERSION || typeof message.token !== 'string' || message.token.length < 32) throw new Error('invalid handshake');
  } else {
    if (typeof message.sessionId !== 'string' || !message.sessionId || !Number.isSafeInteger(message.seq) || message.seq < 1) throw new Error('invalid envelope');
    if (message.type === 'state' && !STATES.has(message.state)) throw new Error('invalid state');
    if (message.type === 'settings') {
      const settings = message.settings;
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('invalid settings');
      if (Object.keys(settings).some(key => !SETTING_FIELDS.has(key))) throw new Error('unknown setting');
      for (const key of ['muted', 'clickThrough', 'doNotDisturb']) if (key in settings && typeof settings[key] !== 'boolean') throw new Error('invalid setting');
      if ('size' in settings && (!Number.isFinite(settings.size) || settings.size < 32 || settings.size > 512)) throw new Error('invalid setting');
      if ('position' in settings && (!settings.position || Object.keys(settings.position).some(key => !['x', 'y'].includes(key)) || !Number.isFinite(settings.position.x) || !Number.isFinite(settings.position.y))) throw new Error('invalid setting');
    }
  }
  return message;
}
function decodeLine(line) {
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) throw new Error('line too large');
  return validateMessage(JSON.parse(line));
}
function encodeMessage(message) {
  const line = JSON.stringify(validateMessage(message));
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) throw new Error('line too large');
  return `${line}\n`;
}
function createPipeName({ sid = 'unknown', randomBytes = crypto.randomBytes } = {}) {
  const safeSid = String(sid).replace(/[^a-zA-Z0-9-]/g, '') || 'unknown';
  return `\\\\.\\pipe\\xunxintai-pet-${safeSid}-${randomBytes(16).toString('hex')}`;
}
module.exports = { PET_PROTOCOL_VERSION, MAX_LINE_BYTES, STATES, validateMessage, decodeLine, encodeMessage, createPipeName };

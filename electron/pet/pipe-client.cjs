const { EventEmitter } = require('node:events');
const { PET_PROTOCOL_VERSION, MAX_LINE_BYTES, encodeMessage, decodeLine } = require('./protocol.cjs');

const RETRY_DELAYS = [1000, 3000, 10000];
class PetPipeClient extends EventEmitter {
  constructor({ token, connect, randomId, clock = globalThis, heartbeatTimeoutMs = 15000 }) {
    super(); this.token = token; this.connect = connect; this.randomId = randomId; this.clock = clock;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs; this.snapshot = 'idle'; this.retryCount = 0; this.stopped = true;
  }
  start() { if (!this.stopped) return; this.stopped = false; this.retryCount = 0; this.#open(); }
  stop() { this.stopped = true; this.clock.clearTimeout(this.retryTimer); this.clock.clearTimeout(this.heartbeatTimer); this.connection?.destroy(); this.connection = null; }
  setState(state) { this.snapshot = state; if (this.authenticated) this.#send({ type: 'state', state }); }
  getStatus() { return { state: this.snapshot, connected: Boolean(this.authenticated), retryCount: this.retryCount, retryDelayMs: this.retryDelayMs || 0 }; }
  #open() {
    if (this.stopped) return;
    this.sessionId = this.randomId(); this.seq = 0; this.lastIncomingSeq = 0; this.authenticated = false; this.buffer = '';
    const connection = this.connect(); this.connection = connection;
    connection.on('data', chunk => this.#data(connection, chunk));
    connection.once('close', () => this.#closed(connection));
    connection.once('error', () => connection.destroy());
    connection.write(encodeMessage({ type: 'hello', version: PET_PROTOCOL_VERSION, token: this.token }));
    this.#armHeartbeat(connection);
  }
  #armHeartbeat(connection) {
    this.clock.clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = this.clock.setTimeout(() => { if (connection === this.connection) connection.destroy(); }, this.heartbeatTimeoutMs);
  }
  #data(connection, chunk) {
    if (connection !== this.connection) return;
    this.buffer += chunk.toString('utf8');
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_LINE_BYTES && !this.buffer.includes('\n')) return connection.destroy();
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      try { this.#message(connection, decodeLine(line)); } catch { connection.destroy(); return; }
    }
  }
  #message(connection, message) {
    if (!this.authenticated) {
      if (message.type !== 'hello_ack' || message.token !== this.token) throw new Error('authentication failed');
      this.authenticated = true; this.retryCount = 0; this.#armHeartbeat(connection); this.#send({ type: 'state', state: this.snapshot }); return;
    }
    if (message.sessionId !== this.sessionId || message.seq <= this.lastIncomingSeq) throw new Error('invalid sequence');
    this.lastIncomingSeq = message.seq; this.#armHeartbeat(connection); this.emit('message', message);
  }
  #send(message) { this.connection.write(encodeMessage({ ...message, sessionId: this.sessionId, seq: ++this.seq })); }
  #closed(connection) {
    if (connection !== this.connection) return;
    this.clock.clearTimeout(this.heartbeatTimer); this.connection = null; this.authenticated = false;
    if (this.stopped || this.retryCount >= RETRY_DELAYS.length) return;
    this.retryDelayMs = RETRY_DELAYS[this.retryCount++];
    this.retryTimer = this.clock.setTimeout(() => this.#open(), this.retryDelayMs);
  }
}
function launchSidecar({ executable, pipeName, token, spawnFn }) {
  const child = spawnFn(executable, [pipeName], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
  child.stdin.end(`${token}\n`);
  return { started: true };
}
module.exports = { PetPipeClient, launchSidecar, RETRY_DELAYS };

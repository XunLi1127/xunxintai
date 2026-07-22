const ROLES = new Set(['user', 'assistant', 'system']);
const { createHash } = require('node:crypto');

class CheckpointError extends Error {
  constructor(code, message, statusCode) { super(message); this.name = 'CheckpointError'; this.code = code; this.statusCode = statusCode; }
}

function corrupt() { return new CheckpointError('CHECKPOINT_DATA_CORRUPT', '检查点数据损坏', 500); }

function parseLimit(value) {
  if (value === undefined) return 20;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new CheckpointError('CHECKPOINT_INVALID_PAGINATION', '分页参数无效', 400);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 50) throw new CheckpointError('CHECKPOINT_INVALID_PAGINATION', '分页参数无效', 400);
  return number;
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  try { return new Date(value).toISOString() === value; } catch (_) { return false; }
}
function validId(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function tokenFor(conversationId, messageId) {
  return createHash('sha256').update('xunxintai-checkpoint-v1\0').update(conversationId).update('\0').update(messageId).digest('hex').slice(0, 32);
}
function encodeCursor(item) {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: item.createdAt, token: item.token }), 'utf8').toString('base64url');
}
function decodeCursor(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length < 10 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new CheckpointError('CHECKPOINT_INVALID_PAGINATION', '分页参数无效', 400);
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || Object.keys(parsed).sort().join(',') !== 'createdAt,token,v' || parsed.v !== 1 || !validTimestamp(parsed.createdAt) || !/^[a-f0-9]{32}$/.test(parsed.token)) throw new Error('invalid cursor');
    return parsed;
  } catch (_) { throw new CheckpointError('CHECKPOINT_INVALID_PAGINATION', '分页参数无效', 400); }
}

function createCheckpointPage({ conversation, messages, limit, cursor } = {}) {
  if (!conversation || typeof conversation !== 'object' || Array.isArray(conversation)
      || !validId(conversation.id)
      || !validTimestamp(conversation.created_at) || !Array.isArray(messages)) throw corrupt();
  const pageLimit = limit === undefined ? 20 : parseLimit(limit);
  const keyset = decodeCursor(cursor);
  const ordered = messages.map(message => {
    if (!message || typeof message !== 'object' || Array.isArray(message)
        || !validId(message.id)
        || message.conversation_id !== conversation.id || !ROLES.has(message.role)
        || !validTimestamp(message.created_at)) throw corrupt();
    return { message, token: tokenFor(conversation.id, message.id) };
  }).sort((a, b) => b.message.created_at.localeCompare(a.message.created_at) || b.token.localeCompare(a.token));
  const afterCursor = keyset ? ordered.filter(item => item.message.created_at < keyset.createdAt || (item.message.created_at === keyset.createdAt && item.token < keyset.token)) : ordered;
  const selected = afterCursor.slice(0, pageLimit);
  const hasMore = afterCursor.length > selected.length;
  return {
    schemaVersion: 1,
    conversation: {
      createdAt: conversation.created_at,
      hasEngineSession: typeof conversation.claude_session_id === 'string' && conversation.claude_session_id.length > 0,
    },
    checkpoints: selected.map(({ message, token }) => ({
      token,
      role: message.role,
      createdAt: message.created_at,
      kind: message.is_compact_boundary === true ? 'compact_boundary' : 'message',
      engineSynchronized: message.engineUuidSynced === true,
    })),
    page: { limit: pageLimit, nextCursor: hasMore ? encodeCursor({ createdAt: selected.at(-1).message.created_at, token: selected.at(-1).token }) : null, hasMore },
  };
}

function registerCheckpointRoute(server, { getConversation, getMessages }) {
  server.get('/api/conversations/:id/checkpoints', (req, res) => {
    res.type('application/json');
    try {
      const conversation = getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ schemaVersion: 1, code: 'CHECKPOINT_CONVERSATION_NOT_FOUND', message: '会话不存在' });
      return res.status(200).json(createCheckpointPage({ conversation, messages: getMessages(req.params.id), limit: req.query.limit, cursor: req.query.cursor }));
    } catch (error) {
      const known = error instanceof CheckpointError;
      return res.status(known ? error.statusCode : 500).json({
        schemaVersion: 1,
        code: known ? error.code : 'CHECKPOINT_DATA_CORRUPT',
        message: known ? error.message : '检查点数据损坏',
      });
    }
  });
}

module.exports = { createCheckpointPage, registerCheckpointRoute, CheckpointError };

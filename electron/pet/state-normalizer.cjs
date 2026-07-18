const MAP = Object.freeze({
  request_started: 'thinking', tool_started: 'tool_running', permission_required: 'awaiting_confirmation',
  completed: 'completed', failed: 'failed', do_not_disturb: 'sleeping', idle: 'idle',
});
function normalizeLifecycleEvent(event) {
  const state = event && typeof event === 'object' ? MAP[event.type] : undefined;
  return state ? { state } : null;
}
module.exports = { normalizeLifecycleEvent };

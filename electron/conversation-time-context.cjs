'use strict';

const MAX_TIMELINE_ITEMS = 6;

function formatter(timeZone, options) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone, hourCycle: 'h23', ...options });
}

function partsFor(date, timeZone) {
  const parts = formatter(timeZone, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function timePeriod(hour) {
  if (hour < 5) return '凌晨';
  if (hour < 8) return '早晨';
  if (hour < 11) return '上午';
  if (hour < 13) return '中午';
  if (hour < 17) return '下午';
  if (hour < 19) return '傍晚';
  if (hour < 23) return '晚上';
  return '深夜';
}

function approximateGap(milliseconds) {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `约 ${hours} 小时`;
  const days = Math.round(hours / 24);
  return `约 ${days} 天`;
}

function buildConversationTimeContext({ now = new Date(), timeZone, messages = [] } = {}) {
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(current.getTime()) || typeof timeZone !== 'string' || !Array.isArray(messages)) {
    return Object.freeze({ generatedAt: null, promptBlock: '' });
  }

  let currentParts;
  try {
    currentParts = partsFor(current, timeZone);
  } catch {
    return Object.freeze({ generatedAt: current.toISOString(), promptBlock: '' });
  }

  const validMessages = messages
    .map(message => {
      if (!message || (message.role !== 'user' && message.role !== 'assistant')) return null;
      const timestamp = Date.parse(message.created_at);
      if (!Number.isFinite(timestamp) || timestamp > current.getTime()) return null;
      return Object.freeze({ role: message.role, timestamp });
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);

  const hour = Number(currentParts.hour);
  const lines = [
    '[对话时间背景]',
    `当前本地时间：${currentParts.year}年${currentParts.month}月${currentParts.day}日${currentParts.weekday} ${currentParts.hour}:${currentParts.minute}（${timePeriod(hour)}）`,
    `时区：${timeZone}`,
  ];

  const lastUser = validMessages.findLast(message => message.role === 'user');
  const lastAssistant = validMessages.findLast(message => message.role === 'assistant');
  if (lastUser) lines.push(`距上一条用户消息：${approximateGap(current.getTime() - lastUser.timestamp)}`);
  if (lastAssistant) lines.push(`距上一条助手消息：${approximateGap(current.getTime() - lastAssistant.timestamp)}`);

  if (validMessages.length > 0) {
    lines.push('最近消息时间线（仅时间元数据）：');
    for (const message of validMessages.slice(-MAX_TIMELINE_ITEMS)) {
      const parts = partsFor(new Date(message.timestamp), timeZone);
      const label = message.role === 'user' ? '用户' : '助手';
      lines.push(`- ${label}：${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}（距现在${approximateGap(current.getTime() - message.timestamp)}）`);
    }
  }
  lines.push('请把时间作为事实背景，结合原有对话自然判断；不必每次提及时间，也不要据此预设情绪或把推断说成确定事实。');

  return Object.freeze({
    generatedAt: current.toISOString(),
    promptBlock: lines.join('\n'),
  });
}

module.exports = {
  buildConversationTimeContext,
};

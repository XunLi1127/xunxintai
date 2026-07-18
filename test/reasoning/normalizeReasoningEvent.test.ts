import { describe, expect, it } from 'vitest';
import { normalizeReasoningEvent } from '../../src/reasoning/normalizeReasoningEvent';
import { extractCompatibilityThinking } from '../../src/reasoning/compatibilityThinking';

describe('normalizeReasoningEvent', () => {
  it('接受提供商 thinking_delta', () => {
    expect(normalizeReasoningEvent({
      delta: { type: 'thinking_delta', thinking: '先核对文件' },
    })).toEqual({ kind: 'delta', text: '先核对文件', source: 'provider' });
  });

  it('接受提供商 thinking_summary', () => {
    expect(normalizeReasoningEvent({
      type: 'thinking_summary', summary: '已完成依赖分析',
    })).toEqual({ kind: 'summary', text: '已完成依赖分析', source: 'provider' });
  });

  it('标记未公开的提供商推理', () => {
    expect(normalizeReasoningEvent({ type: 'redacted_thinking' })).toEqual({
      kind: 'redacted',
      text: '该段推理未由模型提供商公开。',
      source: 'provider',
    });
  });

  it('不把普通 text_delta 自动当成原生推理', () => {
    expect(normalizeReasoningEvent({
      delta: { type: 'text_delta', text: '<thinking>兼容内容</thinking>' },
    })).toBeNull();
  });

  it('拒绝缺少字符串内容的结构化事件', () => {
    expect(normalizeReasoningEvent({ delta: { type: 'thinking_delta' } })).toBeNull();
    expect(normalizeReasoningEvent({ type: 'thinking_summary', summary: 42 })).toBeNull();
  });
});

describe('extractCompatibilityThinking', () => {
  it('提取闭合兼容标签并保留来源边界', () => {
    expect(extractCompatibilityThinking('前文<thinking>核对依赖</thinking>结论')).toEqual({
      visibleText: '前文结论',
      reasoning: ['核对依赖'],
    });
  });

  it('提取多个完整片段', () => {
    expect(extractCompatibilityThinking('<thinking>一</thinking>回答<thinking>二</thinking>')).toEqual({
      visibleText: '回答',
      reasoning: ['一', '二'],
    });
  });

  it('未闭合标签仍作为可见文本保留', () => {
    expect(extractCompatibilityThinking('回答<thinking>未闭合')).toEqual({
      visibleText: '回答<thinking>未闭合',
      reasoning: [],
    });
  });
});

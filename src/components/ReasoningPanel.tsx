import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import ClaudeLogo from './ClaudeLogo';
import type { ReasoningSource } from '../reasoning/types';

type ReasoningPanelProps = {
  reasoning?: string;
  summary?: string;
  source?: ReasoningSource;
  interrupted?: boolean;
  isThinking?: boolean;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  language?: 'zh-CN' | 'en';
};

export default function ReasoningPanel({
  reasoning = '',
  summary,
  source = 'provider',
  interrupted = false,
  isThinking = false,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  language = 'zh-CN',
}: ReasoningPanelProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? internalExpanded;
  if (!reasoning && !summary) return null;

  const lines = reasoning.trim().split('\n').filter(line => line.trim());
  const last = lines[lines.length - 1] || '';
  const fallbackSummary = last.length > 40 ? `${last.slice(0, 40)}...` : last;
  const sourceLabel = source === 'compatibility'
    ? (language === 'zh-CN' ? '兼容通道返回' : 'Compatibility channel')
    : (language === 'zh-CN' ? '模型提供商返回' : 'Model provider');

  const toggle = () => {
    const next = !isExpanded;
    setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        className="flex items-center gap-2 cursor-pointer select-none group/think text-claude-textSecondary hover:text-claude-text transition-colors"
        onClick={toggle}
        aria-expanded={isExpanded}
      >
        {isThinking && <ClaudeLogo autoAnimate style={{ width: '30px', height: '30px' }} />}
        <span className={`text-[14px] ${isThinking ? 'animate-shimmer-text' : 'text-claude-textSecondary'}`}>
          {summary || fallbackSummary || (language === 'zh-CN' ? '思考中…' : 'Thinking...')}
        </span>
        <span className="text-[11px] text-claude-textSecondary/70">{sourceLabel}</span>
        <ChevronDown size={14} className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && reasoning && (
        <div className="mt-2 ml-1 pl-4 border-l-2 border-claude-border">
          <div className="text-claude-textSecondary text-[14px] leading-normal whitespace-pre-wrap">
            {reasoning}
          </div>
          {interrupted ? (
            <div className="mt-2 text-[14px] text-claude-textSecondary">
              {language === 'zh-CN' ? '思考流已中断' : 'Reasoning stream interrupted'}
            </div>
          ) : !isThinking ? (
            <div className="flex items-center gap-2 mt-2 text-claude-textSecondary">
              <Check size={16} />
              <span className="text-[14px]">{language === 'zh-CN' ? '完成' : 'Done'}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ReasoningPanel from '../../src/components/ReasoningPanel';
import { mergeReasoningSource } from '../../src/reasoning/types';

afterEach(cleanup);

describe('ReasoningPanel', () => {
  it('显示提供商来源并保留展开折叠', () => {
    render(<ReasoningPanel reasoning={'第一步\n先核对文件'} source="provider" />);

    expect(screen.getByText('模型提供商返回')).toBeInTheDocument();
    expect(screen.queryByText(/第一步/)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    expect(screen.getByText(/第一步/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.queryByText(/第一步/)).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('明确标记兼容通道来源', () => {
    render(<ReasoningPanel reasoning="兼容内容" source="compatibility" />);
    expect(screen.getByText('兼容通道返回')).toBeInTheDocument();
  });

  it('摘要优先于推理末行显示', () => {
    render(<ReasoningPanel reasoning="原始推理末行" summary="已完成依赖分析" source="provider" />);
    expect(screen.getByText('已完成依赖分析')).toBeInTheDocument();
    expect(screen.queryByText('原始推理末行')).not.toBeInTheDocument();
  });

  it('仅收到提供商摘要时仍显示面板', () => {
    render(<ReasoningPanel summary="仅有摘要" source="provider" />);
    expect(screen.getByText('仅有摘要')).toBeInTheDocument();
    expect(screen.getByText('模型提供商返回')).toBeInTheDocument();
  });

  it('中断时只显示已收到内容和中断状态', () => {
    render(<ReasoningPanel reasoning="已收到片段" source="provider" interrupted defaultExpanded />);
    expect(screen.getByText('思考流已中断')).toBeInTheDocument();
    expect(screen.getAllByText('已收到片段')).toHaveLength(2);
    expect(screen.queryByText(/补写/)).not.toBeInTheDocument();
  });

  it('没有可展示推理时不渲染', () => {
    const { container } = render(<ReasoningPanel reasoning="" source="provider" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('mergeReasoningSource', () => {
  it('provider 来源不会被后续 compatibility 降级', () => {
    expect(mergeReasoningSource('provider', 'compatibility')).toBe('provider');
    expect(mergeReasoningSource('compatibility', 'provider')).toBe('provider');
    expect(mergeReasoningSource(undefined, undefined)).toBe('provider');
  });
});

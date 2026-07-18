import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CodeExecution from '../../src/components/CodeExecution';

describe('CodeExecution 渲染基线', () => {
  it('执行中显示现有的离线状态提示', () => {
    render(<CodeExecution code="console.log('baseline')" status="running" />);

    expect(screen.getByText('正在执行代码...')).toBeInTheDocument();
  });
});

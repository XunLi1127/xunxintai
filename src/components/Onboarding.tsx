import React, { useEffect, useState } from 'react';
import { FolderOpen, KeyRound, Monitor, ServerCog } from 'lucide-react';
import { getThemeController } from '../theme/runtime';
import ClaudeLogo from './ClaudeLogo';

interface OnboardingProps {
  onComplete: () => void;
}

type ThemeMode = 'system' | 'light' | 'dark';
type ApiMode = 'official' | 'selfhosted';

const stepTitle = [
  { title: '选择外观', subtitle: '先确定界面的明暗主题，后面随时可以在设置里改。' },
  { title: '选择接入方式', subtitle: '推荐直接使用官方 Anthropic API，也支持你自己的兼容接口。' },
  { title: '选择工作目录', subtitle: 'Claude 会优先在这里打开和分析你的项目。' },
];

function getInitialThemeMode(): ThemeMode {
  const controller = getThemeController();
  if (controller.getPreference() === 'system') return 'system';
  return controller.getActiveTheme().mode === 'light' ? 'light' : 'dark';
}

function commitThemeMode(theme: ThemeMode): void {
  getThemeController().commitTheme(
    theme === 'system' ? 'system' : theme === 'light' ? 'catppuccin-latte' : 'catppuccin-mocha',
  );
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>(getInitialThemeMode);
  const [mode, setMode] = useState<ApiMode>(
    localStorage.getItem('user_mode') === 'selfhosted' ? 'selfhosted' : 'official',
  );
  const [workspace, setWorkspace] = useState(localStorage.getItem('workspace_path') || '');

  useEffect(() => {
    fetch('http://127.0.0.1:30080/api/workspace-config')
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultDir && !workspace) setWorkspace(data.defaultDir);
      })
      .catch(() => {});

    const api = (window as any).electronAPI;
    if (api?.resizeWindow) api.resizeWindow(760, 620);
  }, []);

  const handleBrowse = async () => {
    const api = (window as any).electronAPI;
    if (api?.selectDirectory) {
      const dir = await api.selectDirectory();
      if (dir) setWorkspace(dir);
    }
  };

  const handleFinish = () => {
    const api = (window as any).electronAPI;
    if (api?.resizeWindow) api.resizeWindow(1300, 780);

    localStorage.setItem('user_mode', mode === 'official' ? 'clawparrot' : 'selfhosted');
    localStorage.setItem('onboarding_done', 'true');
    localStorage.removeItem('cross_mode_overrides');

    if (mode === 'official') {
      localStorage.setItem('ANTHROPIC_BASE_URL', 'https://api.anthropic.com');
      localStorage.removeItem('CUSTOM_API_KEY');
      localStorage.removeItem('CUSTOM_BASE_URL');
    } else {
      localStorage.removeItem('gateway_user');
      localStorage.removeItem('gateway_quota');
    }

    if (workspace) {
      localStorage.setItem('workspace_path', workspace);
      fetch('http://127.0.0.1:30080/api/workspace-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: workspace }),
      }).catch(() => {});
    }

    onComplete();
  };

  const canContinue = step === 2 ? true : true;

  return (
    <div className="fixed inset-0 z-[999] bg-claude-bg text-claude-text flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-[760px] rounded-[30px] border border-claude-border bg-white/95 dark:bg-[#1B1B1A] shadow-[0_24px_90px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="border-b border-claude-border px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11">
              <ClaudeLogo color="#D97757" maxScale={0.15} />
            </div>
            <div>
              <div className="text-[26px] font-semibold tracking-[-0.02em]">{stepTitle[step].title}</div>
              <div className="mt-1 text-[13px] leading-6 text-claude-textSecondary">{stepTitle[step].subtitle}</div>
            </div>
          </div>
        </div>

        <div className="px-8 py-8 min-h-[360px]">
          {step === 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  id: 'system' as const,
                  label: '跟随系统',
                  icon: <Monitor size={18} />,
                  desc: '自动跟随系统深浅色切换。',
                },
                {
                  id: 'light' as const,
                  label: '浅色',
                  icon: <Monitor size={18} />,
                  desc: '适合明亮背景与长时间阅读。',
                },
                {
                  id: 'dark' as const,
                  label: '深色',
                  icon: <Monitor size={18} />,
                  desc: '适合夜间使用与代码工作流。',
                },
              ].map((item) => {
                const active = theme === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      commitThemeMode(item.id);
                      setTheme(item.id);
                    }}
                    className={`rounded-2xl border px-5 py-5 text-left transition-all ${
                      active ? 'border-[#2E7CF6]/45 bg-[#2E7CF6]/10' : 'border-claude-border hover:bg-claude-hover'
                    }`}
                  >
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${active ? 'bg-[#2E7CF6]/12 text-[#2E7CF6]' : 'bg-claude-hover text-claude-textSecondary'}`}>
                      {item.icon}
                    </div>
                    <div className="text-[15px] font-semibold text-claude-text">{item.label}</div>
                    <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">{item.desc}</div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMode('official')}
                className={`rounded-2xl border px-5 py-5 text-left transition-all ${
                  mode === 'official' ? 'border-[#2E7CF6]/45 bg-[#2E7CF6]/10' : 'border-claude-border hover:bg-claude-hover'
                }`}
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${mode === 'official' ? 'bg-[#D97757]/12 text-[#D97757]' : 'bg-claude-hover text-claude-textSecondary'}`}>
                  <KeyRound size={18} />
                </div>
                <div className="text-[15px] font-semibold text-claude-text">官方 Anthropic API</div>
                <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                  直接使用 Anthropic Console 生成的官方 API Key，默认走 `api.anthropic.com`。
                </div>
              </button>

              <button
                onClick={() => setMode('selfhosted')}
                className={`rounded-2xl border px-5 py-5 text-left transition-all ${
                  mode === 'selfhosted' ? 'border-[#2E7CF6]/45 bg-[#2E7CF6]/10' : 'border-claude-border hover:bg-claude-hover'
                }`}
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${mode === 'selfhosted' ? 'bg-[#2E7CF6]/12 text-[#2E7CF6]' : 'bg-claude-hover text-claude-textSecondary'}`}>
                  <ServerCog size={18} />
                </div>
                <div className="text-[15px] font-semibold text-claude-text">自定义兼容 API</div>
                <div className="mt-2 text-[12px] leading-5 text-claude-textSecondary">
                  适合 OpenAI 兼容接口、代理地址或你自己的中转网关。
                </div>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <button
                onClick={handleBrowse}
                className="w-full rounded-2xl border border-claude-border px-5 py-5 text-left hover:bg-claude-hover transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-claude-hover text-claude-textSecondary">
                    <FolderOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-claude-text">项目工作目录</div>
                    <div className="mt-2 truncate text-[13px] text-claude-textSecondary">
                      {workspace || '点击这里选择一个默认工作目录'}
                    </div>
                  </div>
                </div>
              </button>
              <div className="rounded-xl border border-claude-border bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3 text-[12px] leading-6 text-claude-textSecondary">
                你之后仍然可以在 `项目`、`代码` 或设置页里重新切换工作目录，这里只是先给 Claude 一个默认入口。
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-claude-border px-8 py-5">
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((dot) => (
              <div
                key={dot}
                className={`h-2.5 rounded-full transition-all ${step === dot ? 'w-7 bg-[#2E7CF6]' : 'w-2.5 bg-claude-border'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                className="rounded-xl border border-claude-border px-4 py-2 text-[13px] text-claude-textSecondary hover:bg-claude-hover"
              >
                上一步
              </button>
            )}
            {step < 2 ? (
              <button
                disabled={!canContinue}
                onClick={() => setStep((prev) => Math.min(2, prev + 1))}
                className="rounded-xl bg-claude-text px-4 py-2 text-[13px] font-medium text-claude-bg hover:opacity-90 disabled:opacity-50"
              >
                下一步
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="rounded-xl bg-[#D97757] px-5 py-2.5 text-[13px] font-medium text-white hover:opacity-90"
              >
                开始使用
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;

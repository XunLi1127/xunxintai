import type { ThemeDefinition } from '../../theme/types';

const MODE_LABEL = {
  light: '浅色',
  dark: '深色',
  'high-contrast': '高对比',
} as const;

type ThemePreviewCardProps = {
  theme: ThemeDefinition;
  isActive: boolean;
  isPreviewing: boolean;
  onPreview(id: string): void;
};

export default function ThemePreviewCard({ theme, isActive, isPreviewing, onPreview }: ThemePreviewCardProps) {
  return (
    <button
      type="button"
      onClick={() => onPreview(theme.id)}
      aria-pressed={isPreviewing}
      className="rounded-xl border border-[var(--xun-border)] bg-[var(--xun-panel)] p-4 text-left text-[var(--xun-text-primary)] transition hover:bg-[var(--xun-overlay)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xun-focus)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium">{theme.displayName}</span>
        <span className="text-xs text-[var(--xun-text-secondary)]">{MODE_LABEL[theme.mode]}</span>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {[theme.tokens.canvas, theme.tokens.panel, theme.tokens.accent, theme.tokens.textPrimary].map(color => (
          <span key={color} className="h-5 flex-1 rounded" style={{ backgroundColor: color }} />
        ))}
      </div>
      <dl className="mt-3 text-xs text-[var(--xun-text-secondary)]">
        <div><dt className="inline">来源：</dt><dd className="inline">{theme.source.name}</dd></div>
        <div><dt className="inline">许可证：</dt><dd className="inline">{theme.source.license}</dd></div>
      </dl>
      <div className="mt-2 flex gap-2 text-xs font-medium">
        {isActive && <span>已应用</span>}
        {isPreviewing && <span>正在预览</span>}
      </div>
    </button>
  );
}

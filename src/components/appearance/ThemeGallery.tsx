import type { ThemeDefinition } from '../../theme/types';
import ThemePreviewCard from './ThemePreviewCard';

export type ThemeGalleryProps = {
  themes: ThemeDefinition[];
  activeThemeId: string;
  previewThemeId: string | null;
  onPreview(id: string): void;
  onApply(id: string): void;
  onCancel(): void;
};

export default function ThemeGallery({
  themes,
  activeThemeId,
  previewThemeId,
  onPreview,
  onApply,
  onCancel,
}: ThemeGalleryProps) {
  const selectedThemeId = previewThemeId ?? activeThemeId;

  return (
    <section aria-labelledby="theme-gallery-title">
      <div className="mb-4">
        <h2 id="theme-gallery-title" className="text-base font-semibold text-[var(--xun-text-primary)]">主题画廊</h2>
        <p className="mt-1 text-sm text-[var(--xun-text-secondary)]">先预览，确认后再应用到洵心台。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {themes.map(theme => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            isActive={theme.id === activeThemeId}
            isPreviewing={theme.id === previewThemeId}
            onPreview={onPreview}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--xun-border)] px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xun-focus)]">取消</button>
        <button type="button" onClick={() => onApply(selectedThemeId)} className="rounded-lg bg-[var(--xun-accent)] px-4 py-2 text-sm text-[var(--xun-text-inverse)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xun-focus)]">应用</button>
      </div>
    </section>
  );
}

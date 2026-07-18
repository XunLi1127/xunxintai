import { useEffect, useRef, useState } from 'react';
import { BUILTIN_THEMES } from '../../theme/builtinThemes';
import { getThemeController } from '../../theme/runtime';
import ThemeGallery from './ThemeGallery';

export default function AppearancePetSettings() {
  const controller = getThemeController();
  const [activeThemeId, setActiveThemeId] = useState(() => controller.getActiveTheme().id);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const hasPendingPreview = useRef(false);

  useEffect(() => () => {
    if (hasPendingPreview.current) controller.cancelPreview();
  }, [controller]);

  const preview = (id: string) => {
    controller.previewTheme(id);
    hasPendingPreview.current = true;
    setPreviewThemeId(id);
  };

  const apply = (id: string) => {
    controller.commitTheme(id);
    hasPendingPreview.current = false;
    setActiveThemeId(controller.getActiveTheme().id);
    setPreviewThemeId(null);
  };

  const cancel = () => {
    controller.cancelPreview();
    hasPendingPreview.current = false;
    setPreviewThemeId(null);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--xun-border)] bg-[var(--xun-panel)] p-5">
        <ThemeGallery
          themes={[...BUILTIN_THEMES]}
          activeThemeId={activeThemeId}
          previewThemeId={previewThemeId}
          onPreview={preview}
          onApply={apply}
          onCancel={cancel}
        />
      </div>
      <section className="rounded-2xl border border-[var(--xun-border)] bg-[var(--xun-panel)] p-5" aria-labelledby="pet-settings-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="pet-settings-title" className="text-base font-semibold text-[var(--xun-text-primary)]">桌宠</h2>
            <p className="mt-1 text-sm text-[var(--xun-text-secondary)]">后续可安装独立开源桌宠组件；本页当前不会联网、探测或启动进程。</p>
          </div>
          <span className="rounded-full border border-[var(--xun-border)] px-3 py-1 text-xs text-[var(--xun-text-secondary)]">未安装</span>
        </div>
      </section>
    </div>
  );
}

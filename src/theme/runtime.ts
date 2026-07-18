import { createThemeController } from './themeStorage';
import type { ThemeController, ThemeControllerOptions } from './types';

let runtimeController: ThemeController | undefined;

export function initializeThemeController(options: ThemeControllerOptions): ThemeController {
  runtimeController?.dispose();
  runtimeController = createThemeController(options);
  return runtimeController;
}

export function getThemeController(): ThemeController {
  if (!runtimeController) throw new Error('Theme controller has not been initialized');
  return runtimeController;
}

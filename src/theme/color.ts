const HEX_COLOR = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

function parseColor(color: string): [number, number, number, number] {
  const match = HEX_COLOR.exec(color);
  if (!match) throw new Error(`Unsupported color: ${color}`);
  const rgb = match[1];
  return [
    Number.parseInt(rgb.slice(0, 2), 16),
    Number.parseInt(rgb.slice(2, 4), 16),
    Number.parseInt(rgb.slice(4, 6), 16),
    match[2] ? Number.parseInt(match[2], 16) / 255 : 1,
  ];
}

function composite(
  [red, green, blue, alpha]: [number, number, number, number],
  background: [number, number, number],
): [number, number, number] {
  return [
    (red * alpha) + (background[0] * (1 - alpha)),
    (green * alpha) + (background[1] * (1 - alpha)),
    (blue * alpha) + (background[2] * (1 - alpha)),
  ];
}

function luminance([red, green, blue]: [number, number, number]): number {
  const channels = [red, green, blue].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

export function isHexColor(color: unknown): color is string {
  return typeof color === 'string' && HEX_COLOR.test(color);
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundColor = parseColor(foreground);
  const backgroundColor = parseColor(background);
  if (backgroundColor[3] < 1) return 1;

  const opaqueBackground: [number, number, number] = [backgroundColor[0], backgroundColor[1], backgroundColor[2]];
  const renderedForeground = composite(foregroundColor, opaqueBackground);
  const foregroundLuminance = luminance(renderedForeground);
  const backgroundLuminance = luminance(opaqueBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

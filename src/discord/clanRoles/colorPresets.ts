import type { ClanColorPreset } from "../../config";

export const DEFAULT_CLAN_COLOR_PRESETS: readonly ClanColorPreset[] = [
  { id: "red", label: "Красный", hex: 0xe74c3c },
  { id: "orange", label: "Оранжевый", hex: 0xe67e22 },
  { id: "yellow", label: "Жёлтый", hex: 0xf1c40f },
  { id: "green", label: "Зелёный", hex: 0x2ecc71 },
  { id: "teal", label: "Бирюзовый", hex: 0x1abc9c },
  { id: "blue", label: "Синий", hex: 0x3498db },
  { id: "nblue", label: "Тёмно-синий", hex: 0x206694 },
  { id: "purple", label: "Фиолетовый", hex: 0x9b59b6 },
  { id: "pink", label: "Розовый", hex: 0xe91e63 },
  { id: "maroon", label: "Бордовый", hex: 0x992d22 },
  { id: "gray", label: "Серый", hex: 0x95a5a6 },
  { id: "lgray", label: "Светло-серый", hex: 0xbdc3c7 },
  { id: "dark", label: "Тёмный", hex: 0x23272a },
] as const;

let activePresets: ClanColorPreset[] = [...DEFAULT_CLAN_COLOR_PRESETS];

export function setClanColorPresetsFromEnv(overrides: ClanColorPreset[]): void {
  activePresets = overrides.length > 0 ? overrides : [...DEFAULT_CLAN_COLOR_PRESETS];
}

export function getClanColorPresets(): readonly ClanColorPreset[] {
  return activePresets;
}

/** Normalize preset labels for comparison (ё → е, case-insensitive). */
export function normalizeColorLabel(label: string): string {
  return label.trim().toLowerCase().replace(/ё/g, "е");
}

function formatHexColorLabel(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

/** Parse #RGB or #RRGGBB (with or without #). Returns 0xRRGGBB or null. */
export function parseClanHexColor(input: string): number | null {
  const trimmed = input.trim();
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) return null;

  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return parseInt(digits, 16);
}

export function getClanColorPresetById(id: string): ClanColorPreset | undefined {
  return activePresets.find((p) => p.id === id);
}

export function getClanColorPresetByLabel(label: string): ClanColorPreset | undefined {
  const q = normalizeColorLabel(label);
  if (!q) return undefined;
  return activePresets.find((p) => normalizeColorLabel(p.label) === q || p.id.toLowerCase() === q);
}

/** Preset by Russian label / id, or custom #hex for !создать line 3. */
export function resolveClanCreateColor(input: string): ClanColorPreset | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const hex = parseClanHexColor(trimmed);
  if (hex !== null) {
    return { id: "custom", label: formatHexColorLabel(hex), hex };
  }

  return getClanColorPresetByLabel(trimmed);
}

/** Comma-separated preset labels for help text and validation errors. */
export function formatClanColorPresetOptions(): string {
  return getClanColorPresets()
    .map((p) => p.label)
    .join(", ");
}

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

export function getClanColorPresetById(id: string): ClanColorPreset | undefined {
  return activePresets.find((p) => p.id === id);
}

export function getClanColorPresetByLabel(label: string): ClanColorPreset | undefined {
  const q = label.trim().toLowerCase();
  if (!q) return undefined;
  return activePresets.find((p) => p.label.toLowerCase() === q || p.id.toLowerCase() === q);
}

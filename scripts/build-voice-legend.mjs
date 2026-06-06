import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EMOJI_DIR = path.join(ROOT, "assets/discord/emojis");
const OUT = path.join(ROOT, "assets/discord/voice-panel-legend.png");

/** Matches buildTempVoicePanelComponents row order. */
const CELLS = [
  ["voice-emoji-name.png", "НАЗВАНИЕ"],
  ["voice-emoji-limit.png", "ЛИМИТ"],
  ["voice-emoji-access.png", "ДОСТУП"],
  ["voice-emoji-region.png", "РЕГИОН"],
  ["voice-emoji-invite.png", "ПРИГЛАСИТЬ"],
  ["voice-emoji-kick.png", "ВЫГНАТЬ"],
  ["voice-emoji-transfer.png", ["СМЕНА", "ВЛАДЕЛЬЦА"]],
  ["voice-emoji-delete.png", "УДАЛИТЬ"],
];

const COLS = 4;
const ROWS = 2;
const CELL_W = 168;
const ICON = 112;
const LABEL_H = 28;
const PAD_Y = 10;
const ROW_H = ICON + LABEL_H + PAD_Y;
const WIDTH = COLS * CELL_W;
const HEIGHT = ROWS * ROW_H + PAD_Y;
const BG = { r: 43, g: 45, b: 49, alpha: 1 };

function labelSvg(label) {
  const lines = Array.isArray(label) ? label : [label];
  if (lines.length === 1) {
    return Buffer.from(
      `<svg width="${CELL_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${CELL_W / 2}" y="19" text-anchor="middle"
        fill="#dcddde" font-family="Arial, Helvetica, sans-serif"
        font-size="12" font-weight="600" letter-spacing="0.5">${lines[0]}</text>
    </svg>`,
    );
  }
  return Buffer.from(
    `<svg width="${CELL_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${CELL_W / 2}" y="13" text-anchor="middle"
        fill="#dcddde" font-family="Arial, Helvetica, sans-serif"
        font-size="12" font-weight="600" letter-spacing="0.5">${lines[0]}</text>
      <text x="${CELL_W / 2}" y="25" text-anchor="middle"
        fill="#dcddde" font-family="Arial, Helvetica, sans-serif"
        font-size="12" font-weight="600" letter-spacing="0.5">${lines[1]}</text>
    </svg>`,
  );
}

const composites = [];

for (let i = 0; i < CELLS.length; i++) {
  const [file, label] = CELLS[i];
  const src = path.join(EMOJI_DIR, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing emoji: ${src}`);
  }
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * CELL_W + Math.floor((CELL_W - ICON) / 2);
  const y = row * ROW_H + PAD_Y;
  const iconBuf = await sharp(src).resize(ICON, ICON).png().toBuffer();
  composites.push({ input: iconBuf, left: x, top: y });
  composites.push({
    input: labelSvg(label),
    left: col * CELL_W,
    top: y + ICON + 4,
  });
}

await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 4, background: BG },
})
  .composite(composites)
  .png()
  .toFile(OUT);

console.log(`Wrote ${OUT} (${WIDTH}x${HEIGHT})`);

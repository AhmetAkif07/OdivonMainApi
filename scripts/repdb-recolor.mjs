// Recolors RepDB flat exercise illustrations to the Odivon palette (license term 4 allows recoloring).
// Deterministic per-pixel HSV remap, no generative models (term 5 forbids those).
// The art uses one cyan/blue family for the background, shirt and shorts; every pixel in that hue
// band is turned to the brand hue, and the pale background is pulled toward the app's primarySoft.
import sharp from 'sharp';

const BRAND_HUE = 214; // #0066EE
const BAND = [160, 228]; // source cyan → blue band, faded out over FEATHER degrees on each side
const FEATHER = 12;

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bandWeight(h) {
  if (h < BAND[0] - FEATHER || h > BAND[1] + FEATHER) return 0;
  if (h < BAND[0]) return (h - (BAND[0] - FEATHER)) / FEATHER;
  if (h > BAND[1]) return (BAND[1] + FEATHER - h) / FEATHER;
  return 1;
}

/** Returns a recolored WebP buffer for one source image. */
export async function recolor(input) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    // Greys (rack, bench, outlines) keep their colour.
    const w = bandWeight(h) * Math.min(1, s / 0.08);
    if (!w) continue;
    // Smooth masks (no hard thresholds, so soft floor shadows don't speckle).
    // Pale background and its shadows → primarySoft (#E6F0FF): a touch lighter, less saturated.
    const pale = smoothstep(0.7, 0.86, v) * (1 - smoothstep(0.2, 0.36, s));
    // Saturated shirt → brand blue.
    const vivid = smoothstep(0.45, 0.65, s);
    const ns = Math.min(1, s * (1 - 0.25 * pale) * (1 + 0.05 * vivid));
    const nv = Math.min(1, v + 0.05 * pale);
    const nh = h + (BRAND_HUE - h) * w;
    const [r, g, b] = hsvToRgb(nh, s + (ns - s) * w, v + (nv - v) * w);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return sharp(data, { raw: info }).webp({ quality: 88 }).toBuffer();
}

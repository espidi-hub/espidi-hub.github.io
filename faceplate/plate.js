// Derived from Eugene Carlo's ESPIDI-BLANK GKO and NPTH files (mm, top view).
// The editable half lies below Y=19.05; the assembled main board starts at Y=20.193.
export const W = 372,
  H = 228,
  pitch = 0.2;
const left = 208.48,
  top = 18.93;
const rectangles = [
  [220.472, -7.23798, 243.97195, 0.762],
  [216.535, -23.53497, 226.73497, -13.335],
  [240.6015, -23.53497, 250.80147, -13.335],
  [264.668, -23.53497, 274.86797, -13.335],
];
const holes = [
  [212.09, 15.24, 1.6505],
  [279.273, 15.24, 1.6505],
  [212.09, -22.987, 1.6505],
  [279.273, -22.987, 1.6505],
  [269.875, -4.191, 3.5],
];
function clearance(x, y) {
  // Signed distance to a rounded board edge, then to each mechanical opening.
  const dx = Math.abs(x - 245.68155) - (37.40155 - 2.54);
  const dy = Math.abs(y + 3.8735) - (22.9235 - 2.54);
  let gap =
    2.54 -
    Math.hypot(Math.max(0, dx), Math.max(0, dy)) -
    Math.min(0, Math.max(dx, dy));
  for (const [cx, cy, r] of holes)
    gap = Math.min(gap, Math.hypot(x - cx, y - cy) - r);
  for (const [x0, y0, x1, y1] of rectangles) {
    const a = Math.max(x0 - x, x - x1),
      b = Math.max(y0 - y, y - y1);
    gap = Math.min(
      gap,
      Math.hypot(Math.max(0, a), Math.max(0, b)) + Math.min(0, Math.max(a, b)),
    );
  }
  return gap;
}
export const geometry = Uint8Array.from({ length: W * H }, (_, i) => {
  const x = left + ((i % W) + 0.5) * pitch,
    y = top - (Math.floor(i / W) + 0.5) * pitch;
  const gap = clearance(x, y);
  return gap < 0 ? 0 : gap < 0.55 ? 1 : 2;
});

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function raster(luma, mode, threshold, invert) {
  const bits = new Uint8Array(W * H),
    levels = Float32Array.from(luma);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const offset =
        mode === "bayer"
          ? ((bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16 - 0.5) * 255
          : 0;
      const value = levels[i],
        lit = value >= threshold + offset;
      bits[i] = Number(invert ? !lit : lit);
      if (mode !== "diffuse") continue;
      const e = (value - (lit ? 255 : 0)) / 16;
      if (x + 1 < W) levels[i + 1] += 7 * e;
      if (y + 1 < H) {
        if (x > 0) levels[i + W - 1] += 3 * e;
        levels[i + W] += 5 * e;
        if (x + 1 < W) levels[i + W + 1] += e;
      }
    }
  return bits;
}

export const layers = {
  copper: "Gerber_TopLayer.GTL",
  mask: "Gerber_TopSolderMaskLayer.GTS",
  silk: "Gerber_TopSilkscreenLayer.GTO",
};
export function artwork(layerBits) {
  const out = {};
  for (const key of Object.keys(layers))
    out[key] = Uint8Array.from(layerBits[key], (v, i) =>
      Number(v && geometry[i] === 2),
    );
  // A fabricator clips ink at exposed openings. Keep one raster cell clear in the files too.
  for (let i = 0; i < out.silk.length; i++) {
    if (!out.silk[i]) continue;
    for (const d of [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1]) {
      if (out.mask[i + d]) {
        out.silk[i] = 0;
        break;
      }
    }
  }
  return out;
}

const coord = (x, y) =>
  "X" + Math.round(x * 100000) + "Y" + Math.round(y * 100000);
function region(x0, y0, x1, y1) {
  const a = coord(x0, y0);
  return [
    "G36*",
    a + "D02*",
    coord(x1, y0) + "D01*",
    coord(x1, y1) + "D01*",
    coord(x0, y1) + "D01*",
    a + "D01*",
    "G37*",
  ].join("\n");
}
export function gerber(original, bits) {
  if (
    !original.includes("%FSLAX45Y45*%") ||
    !original.includes("%MOMM*%") ||
    !/M02\*\s*$/.test(original)
  )
    throw Error("Unexpected Gerber template");
  const additions = [
    "G04 ESPidi HUB - v1 faceplate only*",
    "G01*",
    "%LPC*%",
    region(208, -27, 283.4, 19.05),
    "%LPD*%",
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; ) {
      if (!bits[y * W + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < W && bits[y * W + x]) x++;
      additions.push(
        region(
          left + start * pitch,
          top - (y + 1) * pitch,
          left + x * pitch,
          top - y * pitch,
        ),
      );
    }
  }
  return original.replace(/M02\*\s*$/, additions.join("\n") + "\nM02*\n");
}

import "../page.js";
import { t } from "../i18n.js";
import {
  unzipSync,
  zipSync,
  strFromU8,
  strToU8,
} from "../vendor/fflate/browser.js";
import { W, H, geometry, layers, raster, artwork, gerber } from "./plate.js";

const $ = (id) => document.getElementById(id);
const cv = $("plate"),
  ctx = cv.getContext("2d");
const controls = [
  "effect",
  "threshold",
  "scale",
  "offsetX",
  "offsetY",
  "invert",
];
const defaults = () => ({
  image: null,
  effect: "bayer",
  threshold: 128,
  scale: 100,
  offsetX: 0,
  offsetY: 0,
  invert: false,
  edits: new Map(),
});
let designs = Object.fromEntries(
  Object.keys(layers).map((k) => [k, defaults()]),
);
let masks = {},
  result = {};
const active = () => designs[$("layer").value];
function surface() {
  return Object.assign(document.createElement("canvas"), {
    width: W,
    height: H,
  });
}
function sync() {
  const d = active();
  for (const key of controls) {
    if (key === "invert") $(key).checked = d[key];
    else $(key).value = d[key];
  }
  $("picture").value = "";
}
function rebuild(key) {
  const d = designs[key];
  let bits = new Uint8Array(W * H);
  if (d.image) {
    const s = surface(),
      g = s.getContext("2d");
    const zoom =
      (Math.min(W / d.image.width, H / d.image.height) * d.scale) / 100;
    const w = d.image.width * zoom,
      h = d.image.height * zoom;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    g.drawImage(
      d.image,
      (W - w) / 2 + d.offsetX,
      (H - h) / 2 + d.offsetY,
      w,
      h,
    );
    const rgba = g.getImageData(0, 0, W, H).data;
    const luma = Uint8Array.from(
      { length: W * H },
      (_, i) =>
        0.2126 * rgba[4 * i] +
        0.7152 * rgba[4 * i + 1] +
        0.0722 * rgba[4 * i + 2],
    );
    bits = raster(luma, d.effect, d.threshold, d.invert);
  }
  for (const [i, v] of d.edits) bits[i] = v;
  masks[key] = bits;
}
const palette = {
  outside: [14, 16, 17],
  board: [39, 52, 48],
  copper: [98, 121, 107],
  bare: [116, 92, 59],
  metal: [201, 174, 117],
  ink: [222, 222, 216],
};
function paint() {
  result = artwork(masks);
  const frame = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    let color = palette.outside;
    if (geometry[i]) {
      color = result.copper[i] ? palette.copper : palette.board;
      if (result.mask[i])
        color = result.copper[i] ? palette.metal : palette.bare;
      if (result.silk[i]) color = palette.ink;
    }
    const p = i * 4;
    frame.data[p] = color[0];
    frame.data[p + 1] = color[1];
    frame.data[p + 2] = color[2];
    frame.data[p + 3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
}
function refresh() {
  rebuild($("layer").value);
  paint();
}
function randomGrid() {
  // Share cell edges across layers; open some copper blocks while other cells carry ink.
  const cols = 5 + Math.floor(Math.random() * 5),
    rows = 3 + Math.floor(Math.random() * 4);
  const context = {};
  for (const key of Object.keys(layers)) {
    designs[key] = defaults();
    designs[key].image = surface();
    context[key] = designs[key].image.getContext("2d");
  }
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const style = Math.floor(Math.random() * 5);
      const shade = 60 + Math.floor(Math.random() * 160);
      const tones = {
        copper: [230, 255, 0, 100, 200][style],
        mask: [0, shade, 0, 0, 140][style],
        silk: [shade, 0, shade, 125, 0][style],
      };
      const x = Math.round((col * W) / cols),
        y = Math.round((row * H) / rows);
      for (const key of Object.keys(layers)) {
        context[key].fillStyle =
          "rgb(" + Array(3).fill(tones[key]).join(",") + ")";
        context[key].fillRect(
          x,
          y,
          Math.round(((col + 1) * W) / cols) - x,
          Math.round(((row + 1) * H) / rows) - y,
        );
      }
    }
  for (const key of Object.keys(layers)) rebuild(key);
  sync();
  paint();
}
$("random").onclick = randomGrid;
$("layer").onchange = sync;
$("clear").onclick = () => {
  designs[$("layer").value] = defaults();
  sync();
  refresh();
};
for (const key of controls)
  $(key).oninput = () => {
    active()[key] =
      key === "invert"
        ? $(key).checked
        : key === "effect"
          ? $(key).value
          : Number($(key).value);
    refresh();
  };
$("picture").onchange = async (e) => {
  const file = e.target.files[0],
    key = $("layer").value,
    d = designs[key];
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    if (d !== designs[key] || e.target.files[0] !== file) {
      bitmap.close();
      return;
    }
    const s = surface(),
      factor = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    s.width = Math.max(1, Math.round(bitmap.width * factor));
    s.height = Math.max(1, Math.round(bitmap.height * factor));
    s.getContext("2d").drawImage(bitmap, 0, 0, s.width, s.height);
    bitmap.close();
    d.image = s;
    d.edits.clear();
    rebuild(key);
    paint();
    $("feedback").textContent = "";
  } catch {
    $("feedback").textContent = t("bad_picture");
  }
};
let pen = null;
function dot(e) {
  const b = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - b.left) * W) / b.width),
    y = Math.floor(((e.clientY - b.top) * H) / b.height);
  if (x < 0 || x >= W || y < 0 || y >= H || geometry[y * W + x] !== 2) return;
  const i = y * W + x,
    key = $("layer").value;
  if (pen === null) pen = 1 - masks[key][i];
  active().edits.set(i, pen);
  masks[key][i] = pen;
  paint();
}
cv.onpointerdown = (e) => {
  cv.setPointerCapture(e.pointerId);
  pen = null;
  dot(e);
};
cv.onpointermove = (e) => {
  if (cv.hasPointerCapture(e.pointerId)) dot(e);
};
cv.onlostpointercapture = () => {
  pen = null;
};
$("export").onclick = async () => {
  const data = result;
  $("export").disabled = true;
  try {
    const res = await fetch(new URL("./ESPIDI-BLANK.zip", import.meta.url));
    if (!res.ok) throw Error("Template");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    for (const [key, name] of Object.entries(layers))
      files[name] = strToU8(gerber(strFromU8(files[name]), data[key]));
    const url = URL.createObjectURL(
      new Blob([zipSync(files, { level: 6 })], { type: "application/zip" }),
    );
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "ESPidi-v1-faceplate.zip",
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    $("feedback").textContent = t("export_ok");
  } catch {
    $("feedback").textContent = t("bad_plate");
  } finally {
    $("export").disabled = false;
  }
};
randomGrid();

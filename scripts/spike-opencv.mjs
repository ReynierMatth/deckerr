/**
 * SPIKE — OpenCV card detection + perspective rectification + art crop.
 * Runs OpenCV.js (WASM, same build as the browser) in Node on static photos.
 * For each photo: find the largest 4-corner card quad, warp it flat to
 * 488x680, crop the art region, and save both. This validates the "detect +
 * rectify + crop art" brick before we build it in the PWA.
 */
import Jimp from 'jimp';
import cvReady from '@techstark/opencv-js';

const cv = await (typeof cvReady?.then === 'function' ? cvReady : Promise.resolve(cvReady));
if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });

const SCR = '/private/tmp/claude-501/-Users-matthieureynier-Perso-deckerr/11381e05-295b-4e6f-b2ef-202b8c200a4a/scratchpad';
const IMG = '/Users/matthieureynier/.claude/image-cache/11381e05-295b-4e6f-b2ef-202b8c200a4a';
const CARD_W = 488, CARD_H = 680;

const orderCorners = (pts) => {
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.y - p.x);
  return {
    tl: pts[sum.indexOf(Math.min(...sum))],
    br: pts[sum.indexOf(Math.max(...sum))],
    tr: pts[diff.indexOf(Math.min(...diff))],
    bl: pts[diff.indexOf(Math.max(...diff))],
  };
};

async function matFromFile(path, maxW = 1100) {
  let im = await Jimp.read(path);
  if (im.bitmap.width > maxW) im = im.resize(maxW, Jimp.AUTO);
  const { data, width, height } = im.bitmap;
  return cv.matFromImageData({ data: new Uint8ClampedArray(data), width, height });
}
async function matToFile(mat, path) {
  const out = new Jimp({ data: Buffer.from(mat.data), width: mat.cols, height: mat.rows });
  await out.writeAsync(path);
}

const boxCorners = (rr) => {
  const cx = rr.center.x, cy = rr.center.y, w = rr.size.width, h = rr.size.height;
  const a = (rr.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([dx, dy]) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }));
};

function findCardQuad(src) {
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
  // Otsu foreground mask: the (brighter) card vs the darker table/background.
  cv.threshold(blur, edges, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k);
  cv.morphologyEx(edges, edges, cv.MORPH_OPEN, k);
  const contours = new cv.MatVector(), hier = new cv.Mat();
  cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const imgArea = src.cols * src.rows;
  // Largest contour whose area is a plausible card (15%-99% of frame).
  let bestC = null, bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area > bestArea && area > 0.15 * imgArea && area < 0.99 * imgArea) { bestArea = area; bestC?.delete(); bestC = c; }
    else c.delete();
  }
  let result = null;
  if (bestC) {
    const rr = cv.minAreaRect(bestC); // robust rotated rect -> always 4 corners
    const maskRGBA = new cv.Mat();
    cv.cvtColor(edges, maskRGBA, cv.COLOR_GRAY2RGBA);
    result = { quad: boxCorners(rr), areaRatio: bestArea / imgArea, mask: maskRGBA };
    bestC.delete();
  }
  console.log(`  [debug] contours=${contours.size()} bestAreaRatio=${(bestArea / imgArea).toFixed(2)}`);
  gray.delete(); blur.delete(); edges.delete(); k.delete(); contours.delete(); hier.delete();
  return result;
}

function warpCard(src, quad) {
  const { tl, tr, br, bl } = orderCorners(quad);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(CARD_W, CARD_H));
  srcTri.delete(); dstTri.delete(); M.delete();
  return dst;
}

for (const [n, f] of Object.entries({ 18: `${IMG}/18.png`, 19: `${IMG}/19.png`, 20: `${IMG}/20.png`, 21: `${IMG}/21.jpeg` })) {
  const src = await matFromFile(f);
  const found = findCardQuad(src);
  if (found?.mask) { await matToFile(found.mask, `${SCR}/dbg${n}-mask.png`); found.mask.delete(); }
  if (!found) { console.log(`CARTE ${n}: aucun quad`); src.delete(); continue; }

  // Debug: draw the detected quad on the original
  const overlay = src.clone();
  const { tl, tr, br, bl } = orderCorners(found.quad);
  const red = new cv.Scalar(255, 0, 0, 255);
  for (const [a, b] of [[tl, tr], [tr, br], [br, bl], [bl, tl]])
    cv.line(overlay, new cv.Point(a.x, a.y), new cv.Point(b.x, b.y), red, 6);
  await matToFile(overlay, `${SCR}/dbg${n}-quad.png`);
  overlay.delete();

  const rect = warpCard(src, found.quad);
  await matToFile(rect, `${SCR}/rect${n}.png`);
  // Crop the art region from the (correct) rectified PNG with jimp — reliable,
  // avoids OpenCV roi/heap-view export quirks.
  const rj = await Jimp.read(`${SCR}/rect${n}.png`);
  rj.crop(Math.round(0.075 * CARD_W), Math.round(0.11 * CARD_H), Math.round(0.85 * CARD_W), Math.round(0.45 * CARD_H));
  await rj.writeAsync(`${SCR}/autoart${n}.png`);
  console.log(`CARTE ${n}: quad aire ${(100 * found.areaRatio).toFixed(0)}% -> dbg${n}-quad.png, rect${n}.png`);
  src.delete(); rect.delete();
}

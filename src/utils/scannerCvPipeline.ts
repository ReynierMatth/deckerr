/**
 * EXPERIMENTAL browser port of the validated Node CV pipeline
 * (scripts/spike-opencv.mjs + scripts/build-art-index.mjs). On a captured video
 * frame it runs: OpenCV detect + perspective-rectify -> crop the art region ->
 * DINOv2 embedding (transformers.js) -> cosine match against the prebuilt art
 * index -> top-5. Ported step-for-step so the on-device vectors line up with
 * the offline index.
 *
 * OpenCV.js and transformers.js are heavy (WASM + a model runtime), so they are
 * pulled in with dynamic import() only here — Rollup emits them as their own
 * chunks that load the first time /scan-cv runs a scan, never in the main
 * bundle. On first use transformers.js downloads the DINOv2 weights from the
 * Hugging Face CDN (network required once; cached by the browser afterwards).
 */
import type { ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { loadArtIndex, matchTopK, type ArtIndex, type ArtMatch } from './artIndex';

/** Full type of the OpenCV.js module namespace (all functions/classes typed). */
type CvModule = typeof import('@techstark/opencv-js');

// Rectified card + art-crop geometry, identical to the spike.
const CARD_W = 488;
const CARD_H = 680;
const ART_X = 0.075;
const ART_Y = 0.11;
const ART_W = 0.85;
const ART_H = 0.45;
// Downscale the captured frame so its longest side is ~1100px before detection.
const MAX_FRAME_WIDTH = 1100;
const EMBED_DIM = 384;

interface Pt {
  x: number;
  y: number;
}

export interface ScanTimings {
  detectMs: number;
  embedMs: number;
  matchMs: number;
}

export interface ScanSuccess {
  ok: true;
  matches: ArtMatch[];
  timings: ScanTimings;
  /** data: URL of the rectified 488x680 card (debug thumbnail). */
  rectifiedUrl: string;
  /** data: URL of the cropped art region (debug thumbnail). */
  artUrl: string;
}

export interface ScanFailure {
  ok: false;
  reason: 'no-card';
  detectMs: number;
}

export type ScanOutcome = ScanSuccess | ScanFailure;

/**
 * Order 4 quad corners into tl/tr/br/bl by x+y and y-x extremes — the same
 * heuristic as the spike, robust to the card's rotation.
 */
const orderCorners = (pts: Pt[]): { tl: Pt; tr: Pt; br: Pt; bl: Pt } => {
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.y - p.x);
  return {
    tl: pts[sum.indexOf(Math.min(...sum))],
    br: pts[sum.indexOf(Math.max(...sum))],
    tr: pts[diff.indexOf(Math.min(...diff))],
    bl: pts[diff.indexOf(Math.max(...diff))],
  };
};

/** 4 corners of a rotated rectangle from its center/size/angle (degrees). */
const boxCorners = (rr: {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
}): Pt[] => {
  const { x: cx, y: cy } = rr.center;
  const { width: w, height: h } = rr.size;
  const a = (rr.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as const
  ).map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }));
};

let cvPromise: Promise<CvModule> | null = null;
let embedderPromise: Promise<ImageFeatureExtractionPipeline> | null = null;

/**
 * Lazy-load OpenCV.js (its own chunk) and wait for the WASM runtime to be
 * ready. The UMD build's live runtime object is the module's default export;
 * the named namespace bindings are snapshotted before the async WASM init
 * populates them, so hold the default reference and await onRuntimeInitialized.
 */
function loadCv(): Promise<CvModule> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then(async (mod) => {
      console.info('[scan-cv] opencv module imported, initializing WASM runtime…');
      // @techstark/opencv-js v5 uses the Emscripten MODULARIZE pattern: its
      // default export is a Promise that resolves to the fully-initialized
      // OpenCV module (with Mat/imread/etc.). There is no onRuntimeInitialized
      // handshake — just await the exported promise.
      const exported = (mod as unknown as { default?: unknown }).default ?? mod;
      const cv = (await exported) as CvModule;
      if (typeof (cv as unknown as { Mat?: unknown }).Mat !== 'function') {
        throw new Error('OpenCV.js loaded but the runtime API is missing (unexpected build)');
      }
      console.info('[scan-cv] opencv runtime ready');
      return cv;
    });
  }
  return cvPromise;
}

/**
 * Lazy-load transformers.js (its own chunk) and build the DINOv2 extractor.
 * Prefers the WebGPU backend (runs on the GPU — dramatically faster than the
 * CPU-bound WASM backend for a ViT); falls back to WASM when the browser has no
 * WebGPU (older Firefox, etc.) so scanning still works, just slower. dtype is
 * fp32 on both backends to stay bit-for-bit aligned with the offline index,
 * which scripts/build-art-index.mjs builds at fp32.
 */
function loadEmbedder(): Promise<ImageFeatureExtractionPipeline> {
  if (!embedderPromise) {
    embedderPromise = import('@huggingface/transformers').then(async ({ pipeline, env }) => {
      // Fetch the model straight from the HF CDN — don't probe our own origin
      // for a local copy first (it would 404).
      env.allowLocalModels = false;
      const build = (device: 'webgpu' | 'wasm') =>
        pipeline('image-feature-extraction', 'Xenova/dinov2-small', { device, dtype: 'fp32' });
      const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      if (hasWebGpu) {
        try {
          console.info('[scan-cv] loading DINOv2 on WebGPU…');
          const p = await build('webgpu');
          console.info('[scan-cv] embedder ready (WebGPU)');
          return p;
        } catch (err) {
          console.warn('[scan-cv] WebGPU init failed, falling back to WASM:', err);
        }
      } else {
        console.info('[scan-cv] no WebGPU in this browser — using WASM (slower)');
      }
      const p = await build('wasm');
      console.info('[scan-cv] embedder ready (WASM)');
      return p;
    });
  }
  return embedderPromise;
}

/** Warm up every heavy dependency so the first capture is responsive. */
export async function preloadScannerCv(): Promise<void> {
  await Promise.all([loadCv(), loadEmbedder(), loadArtIndex()]);
}

/**
 * Detect the largest plausible card quad in the frame via an Otsu foreground
 * mask + contours, returning its 4 ordered-later corners. Mirrors the spike's
 * findCardQuad exactly. Returns null when no contour is card-sized.
 */
function findCardQuad(cv: CvModule, src: InstanceType<CvModule['Mat']>): Pt[] | null {
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const mask = new cv.Mat();
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
    cv.threshold(blur, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.findContours(mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = src.cols * src.rows;
    let best: InstanceType<CvModule['Mat']> | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > bestArea && area > 0.15 * imgArea && area < 0.99 * imgArea) {
        best?.delete();
        best = c;
        bestArea = area;
      } else {
        c.delete();
      }
    }
    if (!best) return null;
    const rr = cv.minAreaRect(best);
    best.delete();
    return boxCorners(rr);
  } finally {
    gray.delete();
    blur.delete();
    mask.delete();
    contours.delete();
    hier.delete();
    kernel.delete();
  }
}

/** Warp the detected quad to a flat CARD_W x CARD_H card. */
function warpCard(
  cv: CvModule,
  src: InstanceType<CvModule['Mat']>,
  quad: Pt[],
): InstanceType<CvModule['Mat']> {
  const { tl, tr, br, bl } = orderCorners(quad);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(CARD_W, CARD_H));
    return dst;
  } finally {
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }
}

/**
 * Mean-pool the DINOv2 patch grid [1, T, D] over the T tokens and L2-normalize
 * to a D-dim unit vector. MUST match scripts/build-art-index.mjs (Float64
 * accumulate, then normalize) so on-device vectors align with the index.
 */
function poolEmbedding(data: Float32Array | Float64Array | number[], dims: number[]): Float32Array {
  const [, T, D] = dims.length === 3 ? dims : [1, 1, dims[dims.length - 1] ?? EMBED_DIM];
  const v = new Float64Array(D);
  for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) v[d] += data[t * D + d];
  let norm = 0;
  for (let d = 0; d < D; d++) {
    v[d] /= T;
    norm += v[d] * v[d];
  }
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(D);
  for (let d = 0; d < D; d++) out[d] = v[d] / norm;
  return out;
}

/** Draw a source (video or canvas) onto a fresh canvas at the given size. */
function drawToCanvas(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  sx = 0,
  sy = 0,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas;
}

/**
 * Run one full scan on the current video frame. Detect + rectify + art crop,
 * embed the art, cosine-match the top-5. Timings are measured per stage. When
 * no card quad is found, returns { ok: false }.
 */
export async function runScan(video: HTMLVideoElement): Promise<ScanOutcome> {
  console.info('[scan-cv] runScan: awaiting deps (cv/embedder/index)…');
  const [cv, embedder, index]: [CvModule, ImageFeatureExtractionPipeline, ArtIndex] =
    await Promise.all([loadCv(), loadEmbedder(), loadArtIndex()]);
  console.info(`[scan-cv] deps ready (index: ${index.ids.length} vecs)`);

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return { ok: false, reason: 'no-card', detectMs: 0 };

  const scale = Math.min(1, MAX_FRAME_WIDTH / vw);
  const frameCanvas = drawToCanvas(video, vw, vh, Math.round(vw * scale), Math.round(vh * scale));
  console.info(`[scan-cv] frame drawn ${frameCanvas.width}x${frameCanvas.height}, detecting card…`);

  // 1. Detect + rectify + crop the art region.
  const detectStart = performance.now();
  const src = cv.imread(frameCanvas);
  let artData: ImageData;
  let rectifiedUrl: string;
  let artUrl: string;
  try {
    const quad = findCardQuad(cv, src);
    if (!quad) {
      return { ok: false, reason: 'no-card', detectMs: performance.now() - detectStart };
    }
    const rect = warpCard(cv, src, quad);
    // Render the rectified Mat to a canvas (cv.imshow), then crop the art rect
    // with a second canvas — a direct cv.roi() view is non-contiguous and
    // exports corrupt, so we go through the canvas as the spike does.
    const rectCanvas = document.createElement('canvas');
    rectCanvas.width = CARD_W;
    rectCanvas.height = CARD_H;
    cv.imshow(rectCanvas, rect);
    rect.delete();

    const ax = Math.round(ART_X * CARD_W);
    const ay = Math.round(ART_Y * CARD_H);
    const aw = Math.round(ART_W * CARD_W);
    const ah = Math.round(ART_H * CARD_H);
    const artCanvas = drawToCanvas(rectCanvas, aw, ah, aw, ah, ax, ay);
    const artCtx = artCanvas.getContext('2d');
    if (!artCtx) throw new Error('2D canvas context unavailable');
    artData = artCtx.getImageData(0, 0, aw, ah);
    rectifiedUrl = rectCanvas.toDataURL('image/jpeg', 0.8);
    artUrl = artCanvas.toDataURL('image/jpeg', 0.85);
  } finally {
    src.delete();
  }
  const detectMs = performance.now() - detectStart;

  console.info(`[scan-cv] detect+rectify: ${Math.round(detectMs)}ms`);

  // 2. Embed the art crop with DINOv2 (mean-pooled, L2-normalized).
  const embedStart = performance.now();
  const { RawImage } = await import('@huggingface/transformers');
  const image = new RawImage(artData.data, artData.width, artData.height, 4);
  console.info('[scan-cv] running embedder on art crop…');
  const output = await embedder(image);
  const query = poolEmbedding(output.data as Float32Array, output.dims);
  const embedMs = performance.now() - embedStart;
  console.info(`[scan-cv] embed: ${Math.round(embedMs)}ms`);

  // 3. Cosine-match against the prebuilt index.
  const matchStart = performance.now();
  const matches = matchTopK(query, index, 5);
  const matchMs = performance.now() - matchStart;

  return { ok: true, matches, timings: { detectMs, embedMs, matchMs }, rectifiedUrl, artUrl };
}

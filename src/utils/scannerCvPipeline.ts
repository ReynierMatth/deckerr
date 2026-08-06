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
import type { Worker as TesseractWorker } from 'tesseract.js';
import { loadArtIndex, matchTopK, type ArtIndex, type ArtMatch } from './artIndex';
import type { GameId } from '../cards/domain/game';

/** Full type of the OpenCV.js module namespace (all functions/classes typed). */
type CvModule = typeof import('@techstark/opencv-js');

/**
 * Rectified-card + embed-crop geometry, per game. The embedded pixels must match
 * how that game's offline index encoded its images (build-art-index.mjs):
 * - MTG embeds Scryfall's `art_crop` (illustration only) -> ART_* selects the
 *   art box of a rectified card; the landscape branch targets the art_crop aspect.
 * - Pokémon embeds the FULL card image (no art crop) -> ART_* is the whole card
 *   and ART_CROP matches the card aspect, so both detection branches embed the
 *   full rectified card.
 */
interface ScanGeometry {
  CARD_W: number;
  CARD_H: number;
  ART_X: number;
  ART_Y: number;
  ART_W: number;
  ART_H: number;
  ART_CROP_W: number;
  ART_CROP_H: number;
  PORTRAIT_RATIO: number;
  TITLE_X: number;
  TITLE_Y: number;
  TITLE_W: number;
  TITLE_H: number;
}

const GEOMETRY: Record<GameId, ScanGeometry> = {
  mtg: {
    CARD_W: 488, CARD_H: 680,
    ART_X: 0.075, ART_Y: 0.11, ART_W: 0.85, ART_H: 0.45,
    ART_CROP_W: 626, ART_CROP_H: 457, // Scryfall art_crop aspect ~1.37:1
    PORTRAIT_RATIO: 1.15,
    TITLE_X: 0.05, TITLE_Y: 0.03, TITLE_W: 0.78, TITLE_H: 0.075,
  },
  // Pokémon: embed the illustration window (same crop as build-art-index.mjs
  // POKEMON_ART_CROP) — more discriminant + language-independent, like MTG.
  pokemon: {
    CARD_W: 488, CARD_H: 680,
    ART_X: 0.06, ART_Y: 0.12, ART_W: 0.88, ART_H: 0.42,
    ART_CROP_W: 429, ART_CROP_H: 286, // 0.88*488 x 0.42*680
    PORTRAIT_RATIO: 1.15,
    TITLE_X: 0.08, TITLE_Y: 0.04, TITLE_W: 0.7, TITLE_H: 0.07,
  },
  // Lorcana / One Piece (Phase 2) — placeholder full-card geometry.
  lorcana: {
    CARD_W: 488, CARD_H: 680, ART_X: 0, ART_Y: 0, ART_W: 1, ART_H: 1,
    ART_CROP_W: 488, ART_CROP_H: 680, PORTRAIT_RATIO: 1.15,
    TITLE_X: 0.08, TITLE_Y: 0.04, TITLE_W: 0.7, TITLE_H: 0.07,
  },
  onepiece: {
    CARD_W: 488, CARD_H: 680, ART_X: 0, ART_Y: 0, ART_W: 1, ART_H: 1,
    ART_CROP_W: 488, ART_CROP_H: 680, PORTRAIT_RATIO: 1.15,
    TITLE_X: 0.08, TITLE_Y: 0.04, TITLE_W: 0.7, TITLE_H: 0.07,
  },
};

// Downscale the captured frame so its longest side is ~1100px before detection.
const MAX_FRAME_WIDTH = 1100;
const EMBED_DIM = 384;

export interface Pt {
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
  /** data: URL of the original captured frame fed to OpenCV (debug thumbnail). */
  frameUrl: string;
  /** data: URL of the rectified 488x680 card (debug thumbnail). */
  rectifiedUrl: string;
  /** data: URL of the cropped art region (debug thumbnail). */
  artUrl: string;
  /** OCR read of the card's title strip (null if not a full-card detection). */
  ocrTitle: string | null;
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
let ocrWorkerPromise: Promise<TesseractWorker> | null = null;

/** Lazy-load the tesseract.js worker used to OCR the card title strip. */
function loadOcr(): Promise<TesseractWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
  }
  return ocrWorkerPromise;
}

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
// DEBUG: which backend the embedder actually initialised on (null until loaded).
// Purely observational — no behaviour change; surfaced in the scanner debug panel.
export let activeBackend: 'webgpu' | 'wasm' | null = null;

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
          activeBackend = 'webgpu';
          console.info('[scan-cv] embedder ready (WebGPU)');
          return p;
        } catch (err) {
          console.warn('[scan-cv] WebGPU init failed, falling back to WASM:', err);
        }
      } else {
        console.info('[scan-cv] no WebGPU in this browser — using WASM (slower)');
      }
      const p = await build('wasm');
      activeBackend = 'wasm';
      console.info('[scan-cv] embedder ready (WASM)');
      return p;
    });
  }
  return embedderPromise;
}

/** Warm up every heavy dependency so the first capture is responsive. */
export async function preloadScannerCv(game: GameId = 'mtg'): Promise<void> {
  await Promise.all([loadCv(), loadEmbedder(), loadArtIndex(game)]);
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Detect the card by its straight rectangular border (edge-based, à la ManaBox /
 * document scanners), NOT by brightness segmentation — so it ignores a cluttered
 * background (face, body, ceiling) that has no card-shaped edges.
 *
 * Pipeline: grayscale -> blur -> Canny edges -> dilate (close small gaps so the
 * border is one closed loop) -> contours -> approxPolyDP. Keep only convex
 * 4-corner polygons whose side lengths give a ~5:7 aspect and whose area is a
 * sensible fraction of the frame; return the largest such quad's TRUE corners
 * (so the perspective warp is accurate). Returns null when no card-like quad is
 * found — better an honest "no card" than embedding whatever blob was largest.
 */
function findCardQuad(cv: CvModule, src: InstanceType<CvModule['Mat']>): Pt[] | null {
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 40, 120);
    // Dilate so a card border broken by glare/soft focus still closes into one
    // loop that findContours can trace.
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const W = src.cols;
    const H = src.rows;
    const imgArea = W * H;
    let best: Pt[] | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < 0.05 * imgArea || area > 0.97 * imgArea) {
        c.delete();
        continue;
      }
      const rr = cv.minAreaRect(c);
      const rectArea = rr.size.width * rr.size.height;
      const aspect = Math.min(rr.size.width, rr.size.height) / Math.max(rr.size.width, rr.size.height);
      // How completely the contour fills its rotated bounding box: a card is a
      // solid rectangle (~1), a face/hand blob is not. Combined with the 5:7
      // aspect this reliably isolates the card without a perfect 4-gon.
      const rectangularity = rectArea > 0 ? area / rectArea : 0;
      if (!(rectangularity > 0.7 && aspect > 0.5 && aspect < 0.9 && area > bestArea)) {
        c.delete();
        continue;
      }
      // Prefer the contour's true 4 corners (crisp warp); fall back to the
      // rotated bounding box when the polygon isn't a clean quad.
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
      let corners: Pt[];
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        corners = [];
        for (let k = 0; k < 4; k++) {
          corners.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        }
      } else {
        corners = boxCorners(rr);
      }
      approx.delete();
      c.delete();
      // Reject the whole-frame rectangle (edges of the image itself): a real
      // card floats inside the frame, its corners aren't all on the borders.
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const spansFrame =
        Math.min(...xs) < 0.02 * W &&
        Math.max(...xs) > 0.98 * W &&
        Math.min(...ys) < 0.02 * H &&
        Math.max(...ys) > 0.98 * H;
      if (!spansFrame) {
        best = corners;
        bestArea = area;
      }
    }
    return best;
  } finally {
    gray.delete();
    blur.delete();
    edges.delete();
    contours.delete();
    hier.delete();
    kernel.delete();
  }
}

/** Warp the detected quad to a flat dstW x dstH rectangle. */
function warpCard(
  cv: CvModule,
  src: InstanceType<CvModule['Mat']>,
  quad: Pt[],
  dstW: number,
  dstH: number,
): InstanceType<CvModule['Mat']> {
  const { tl, tr, br, bl } = orderCorners(quad);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstW, 0, dstW, dstH, 0, dstH]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(dstW, dstH));
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

export interface DetectResult {
  /** Ordered [tl, tr, br, bl] card corners in frame pixels, or null. */
  quad: Pt[] | null;
  /** Frame dimensions the quad is expressed in (downscaled video). */
  frameW: number;
  frameH: number;
}

/**
 * Detect-only pass for the live loop: find the card quad on the current video
 * frame and return its ordered corners plus the frame size they're in. Cheap
 * (OpenCV only, no embed/OCR), so it can run continuously to drive the on-screen
 * outline. Only OpenCV needs to be loaded.
 */
export async function detectQuad(video: HTMLVideoElement): Promise<DetectResult> {
  const cv = await loadCv();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return { quad: null, frameW: 0, frameH: 0 };
  const scale = Math.min(1, MAX_FRAME_WIDTH / vw);
  const frameW = Math.round(vw * scale);
  const frameH = Math.round(vh * scale);
  const frameCanvas = drawToCanvas(video, vw, vh, frameW, frameH);
  const src = cv.imread(frameCanvas);
  try {
    const quad = findCardQuad(cv, src);
    if (!quad) return { quad: null, frameW, frameH };
    const { tl, tr, br, bl } = orderCorners(quad);
    return { quad: [tl, tr, br, bl], frameW, frameH };
  } finally {
    src.delete();
  }
}

/**
 * Run one full scan on the current video frame. Detect + rectify + art crop,
 * embed the art, cosine-match the top-5. Timings are measured per stage. When
 * no card quad is found, returns { ok: false }.
 */
export async function runScan(video: HTMLVideoElement, game: GameId = 'mtg'): Promise<ScanOutcome> {
  console.info(`[scan-cv] runScan (${game}): awaiting deps (cv/embedder/index)…`);
  const [cv, embedder, index]: [CvModule, ImageFeatureExtractionPipeline, ArtIndex] =
    await Promise.all([loadCv(), loadEmbedder(), loadArtIndex(game)]);
  console.info(`[scan-cv] deps ready (index: ${index.ids.length} vecs)`);
  const {
    CARD_W, CARD_H, ART_X, ART_Y, ART_W, ART_H,
    ART_CROP_W, ART_CROP_H, PORTRAIT_RATIO, TITLE_X, TITLE_Y, TITLE_W, TITLE_H,
  } = GEOMETRY[game];

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
  let frameUrl: string;
  let titleCanvas: HTMLCanvasElement | null = null;
  try {
    const quad = findCardQuad(cv, src);
    if (!quad) {
      return { ok: false, reason: 'no-card', detectMs: performance.now() - detectStart };
    }

    // Debug: the original frame with the detected quad drawn on top, so we can
    // see exactly what OpenCV locked onto (the corner order is the same one fed
    // to the perspective warp).
    const { tl, tr, br, bl } = orderCorners(quad);
    const overlay = drawToCanvas(frameCanvas, frameCanvas.width, frameCanvas.height, frameCanvas.width, frameCanvas.height);
    const octx = overlay.getContext('2d');
    if (octx) {
      octx.lineWidth = Math.max(2, Math.round(frameCanvas.width / 200));
      octx.strokeStyle = '#22d3ee';
      octx.beginPath();
      octx.moveTo(tl.x, tl.y);
      octx.lineTo(tr.x, tr.y);
      octx.lineTo(br.x, br.y);
      octx.lineTo(bl.x, bl.y);
      octx.closePath();
      octx.stroke();
    }
    frameUrl = overlay.toDataURL('image/jpeg', 0.8);

    // Is the detected quad a whole (portrait) card, or just the (landscape)
    // art window? Edge detection often locks onto the crisp illustration frame
    // rather than the low-contrast outer card border, so handle both: a
    // portrait quad -> warp to a full card and crop the art region by %; a
    // landscape quad IS the art window -> warp it straight to the art-crop
    // aspect and embed the whole thing. Either way the embedded pixels match
    // how the offline index encoded Scryfall's art_crop (the full illustration).
    const wLen = (dist(tl, tr) + dist(bl, br)) / 2;
    const hLen = (dist(tl, bl) + dist(tr, br)) / 2;
    const isFullCard = hLen >= wLen * PORTRAIT_RATIO;
    console.info(
      `[scan-cv] detected ${isFullCard ? 'full card (portrait)' : 'art window (landscape)'} ${Math.round(wLen)}x${Math.round(hLen)}`,
    );

    let artCanvas: HTMLCanvasElement;
    if (isFullCard) {
      const rect = warpCard(cv, src, quad, CARD_W, CARD_H);
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
      artCanvas = drawToCanvas(rectCanvas, aw, ah, aw, ah, ax, ay);
      rectifiedUrl = rectCanvas.toDataURL('image/jpeg', 0.8);

      // Title strip (top band), upscaled 2x — OCR'd below to reconcile with the
      // art-embedding matches. Only available on a full-card detection.
      const tx = Math.round(TITLE_X * CARD_W);
      const ty = Math.round(TITLE_Y * CARD_H);
      const tw = Math.round(TITLE_W * CARD_W);
      const th = Math.round(TITLE_H * CARD_H);
      titleCanvas = drawToCanvas(rectCanvas, tw, th, tw * 2, th * 2, tx, ty);
    } else {
      const rect = warpCard(cv, src, quad, ART_CROP_W, ART_CROP_H);
      artCanvas = document.createElement('canvas');
      artCanvas.width = ART_CROP_W;
      artCanvas.height = ART_CROP_H;
      cv.imshow(artCanvas, rect);
      rect.delete();
      rectifiedUrl = artCanvas.toDataURL('image/jpeg', 0.8);
    }

    const artCtx = artCanvas.getContext('2d');
    if (!artCtx) throw new Error('2D canvas context unavailable');
    artData = artCtx.getImageData(0, 0, artCanvas.width, artCanvas.height);
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

  // 4. OCR the title strip (full-card detections only) so the caller can
  // reconcile the noisy art-embedding ranking with the actual card name.
  let ocrTitle: string | null = null;
  if (titleCanvas) {
    try {
      const worker = await loadOcr();
      const { data } = await worker.recognize(titleCanvas);
      const cleaned = (data.text ?? '')
        .replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      ocrTitle = cleaned || null;
      console.info(`[scan-cv] OCR title: "${ocrTitle ?? ''}"`);
    } catch (err) {
      console.warn('[scan-cv] title OCR failed:', err);
    }
  }

  return { ok: true, matches, timings: { detectMs, embedMs, matchMs }, frameUrl, rectifiedUrl, artUrl, ocrTitle };
}

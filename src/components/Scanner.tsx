import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Minus, Plus, Sparkles, ScanLine, ShoppingBasket, Trash2, Check, PackagePlus, ChevronDown } from 'lucide-react';
import type { Worker as TesseractWorker } from 'tesseract.js';
import { Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { addCardToCollection, getCardsByIds } from '../services/api';
import { getCardByFuzzyName } from '../services/scryfall';
import { getCardArtCrop } from '../utils/cardFaces';
import { dhashFromRGBA, matchHashIndex } from '../utils/imageHash';
import { useCardHashIndex } from '../hooks/useCardHashIndex';
import Modal from './Modal';
import PrintingPickerModal from './card/PrintingPickerModal';

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable';

interface ScannedEntry {
  card: Card;
  quantity: number;
  isFoil: boolean;
  /** Whether this entry has already been committed to the collection. */
  added: boolean;
}

// Simple linear contrast boost applied after grayscale conversion.
const OCR_CONTRAST = 1.4;
// Downscale the captured frame to at most this width before OCR (perf).
const MAX_OCR_WIDTH = 1000;
// Delay between automatic scan passes (the OCR pass itself adds to this).
const SCAN_INTERVAL = 1200;
// How many candidate text lines to try resolving against Scryfall per pass.
const MAX_CANDIDATES = 4;
// Max Hamming distance (of 64 bits) to consider an image-hash match. Live
// camera crops diverge from the reference border_crop, so this is generous;
// the real guard against wrong matches is the sliding-window vote below.
const HASH_MAX_DISTANCE = 14;
// The nearest match flickers frame-to-frame (camera noise, focus, motion), so
// instead of N consecutive identical matches we vote over a sliding window: a
// card wins once it's the nearest (within threshold) HASH_VOTES times out of
// the last HASH_WINDOW passes. Tolerates flicker while still rejecting one-off
// mis-reads (which rarely repeat).
const HASH_WINDOW = 4;
const HASH_VOTES = 2;
// Temporary: overlay the nearest index match + distance to calibrate on real
// hardware. Flip off once tuned.
const DEBUG_HASH = true;

/**
 * Per-copy price for a printing, matching how the collection values entries:
 * foil copies use usd_foil (falling back to usd), non-foil copies use usd.
 */
const priceForVariant = (card: Card, isFoil: boolean): number => {
  const raw = isFoil ? card.prices?.usd_foil ?? card.prices?.usd : card.prices?.usd;
  const price = Number(raw ?? 0);
  return Number.isFinite(price) ? price : 0;
};

/**
 * Reduce raw OCR output (from the whole frame) to candidate card-name lines,
 * top-to-bottom: strip non-letter noise, collapse whitespace, keep lines with
 * a real run of letters, and dedupe. A card's name is its topmost text, so the
 * earliest plausible lines are the best guesses; the caller tries them in
 * order against Scryfall until one resolves.
 */
/** Significant words (3+ letters, lowercased) of a card-name-ish string. */
const nameTokens = (s: string): Set<string> =>
  new Set(s.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length >= 3));

/**
 * Guard against wild fuzzy leaps: accept an OCR result only if the resolved
 * card name shares at least one significant word with what we read. Stops
 * "Bury in Books" resolving to an unrelated "Fifty Feet of Rope".
 */
const sharesToken = (read: string, resolved: string): boolean => {
  const a = nameTokens(read);
  for (const w of nameTokens(resolved)) if (a.has(w)) return true;
  return false;
};

const ocrNameCandidates = (raw: string): string[] => {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const rawLine of raw.split('\n')) {
    const line = rawLine
      .replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line.length < 3 || !/[A-Za-zÀ-ÿ]{3}/.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(line);
  }
  return candidates;
};

/**
 * Camera card scanner: point the phone at a card and align its name in the
 * title strip — detection is automatic. A background loop OCRs the strip
 * with tesseract.js every SCAN_INTERVAL and, once a name reads confidently
 * and resolves against Scryfall's fuzzy lookup, opens a drawer to add it to
 * the collection (pausing the loop). Scan misses are silent. The camera
 * stays live between scans so a stack of cards can be scanned in one session.
 */
export default function Scanner() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { index: hashIndex } = useCardHashIndex();

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Created lazily on the first scan pass, then reused for every scan.
  const workerPromiseRef = useRef<Promise<TesseractWorker> | null>(null);
  // Last name we acted on, so a card lingering in frame isn't re-added.
  const lastNameRef = useRef('');
  // Last image-hash match id acted on, same lingering-guard for the hash path.
  const lastHashIdRef = useRef('');
  // Sliding window of recent nearest-within-threshold match ids (for voting).
  const recentMatchesRef = useRef<string[]>([]);
  // Candidate lines Scryfall didn't recognise, skipped on later passes.
  const failedNamesRef = useRef<Set<string>>(new Set());
  // Latest toast fns via a ref: the context value isn't memoized, so reading
  // it in a ref keeps the auto-scan callback stable across renders.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [scanning, setScanning] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showBasket, setShowBasket] = useState(false);
  // Basket entry whose printing picker is open (by card id), or null.
  const [pickerEntryId, setPickerEntryId] = useState<string | null>(null);
  // Calibration overlay: nearest index match + distance (DEBUG_HASH only).
  const [hashDebug, setHashDebug] = useState<string | null>(null);
  // Cards found during this scanning session (resets on unmount).
  const [scanned, setScanned] = useState<ScannedEntry[]>([]);

  // Start the rear camera on mount; stop every track on unmount.
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState('ready');
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : '';
        setCameraState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    };

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // Terminate the OCR worker (if one was ever created) on unmount.
  useEffect(() => {
    return () => {
      workerPromiseRef.current?.then((worker) => worker.terminate()).catch(() => {});
      workerPromiseRef.current = null;
    };
  }, []);

  const getWorker = useCallback((): Promise<TesseractWorker> => {
    if (!workerPromiseRef.current) {
      // Dynamic import keeps tesseract.js out of the route chunk until the
      // first scan pass actually needs it.
      workerPromiseRef.current = import('tesseract.js').then(({ createWorker }) =>
        createWorker('eng'),
      );
    }
    return workerPromiseRef.current;
  }, []);

  /**
   * Grab the whole current video frame (downscaled for OCR speed) as a
   * grayscale, contrast-boosted canvas. OCR'ing the full frame means the card
   * is read wherever it sits in view — no need to line the name up in a strip.
   */
  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const scale = Math.min(1, MAX_OCR_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Grayscale + linear contrast boost: dark ink OCRs far better than the raw
    // colour frame.
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const boosted = Math.max(0, Math.min(255, (luma - 128) * OCR_CONTRAST + 128));
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }
    ctx.putImageData(image, 0, 0);

    return canvas;
  }, []);

  /**
   * Crop the on-screen guide frame's region out of the video as raw RGBA. The
   * video is object-cover, so it's scaled by max(dispW/vidW, dispH/vidH) and
   * centred; inverting that maps the guide rect back to source pixels. The
   * region is the whole card outline — the same framing as the border_crop
   * images the hash index was built from.
   */
  const captureGuideRegion = useCallback((): ImageData | null => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || video.videoWidth === 0) return null;

    const vRect = video.getBoundingClientRect();
    const fRect = frame.getBoundingClientRect();
    if (vRect.width === 0 || vRect.height === 0) return null;

    const scale = Math.max(vRect.width / video.videoWidth, vRect.height / video.videoHeight);
    const offsetX = (vRect.width - video.videoWidth * scale) / 2;
    const offsetY = (vRect.height - video.videoHeight * scale) / 2;

    const sx = Math.max(0, (fRect.left - vRect.left - offsetX) / scale);
    const sy = Math.max(0, (fRect.top - vRect.top - offsetY) / scale);
    const sw = Math.min(fRect.width / scale, video.videoWidth - sx);
    const sh = Math.min(fRect.height / scale, video.videoHeight - sy);
    if (sw <= 0 || sh <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  /** Add a resolved card to the basket (or bump its quantity), with feedback. */
  const addCardToBasket = useCallback((card: Card) => {
    setScanned((prev) => {
      const existing = prev.find((e) => e.card.id === card.id && !e.added);
      if (existing) {
        return prev.map((e) => (e === existing ? { ...e, quantity: e.quantity + 1 } : e));
      }
      return [{ card, quantity: 1, isFoil: false, added: false }, ...prev];
    });
    toastRef.current.success(`Found ${card.name}`);
  }, []);

  /**
   * One automatic scan pass. Image-hash first (edition-accurate, on-device);
   * if that misses, fall back to OCR of the card name. Misses are silent —
   * this runs on a timer, so toasting each failure would be unbearable. A
   * freshly-detected card increments its quantity if already in the basket.
   */
  const scanOnce = useCallback(
    async (isCancelled: () => boolean): Promise<void> => {
      // 1. Image-hash match against the on-device index (exact printing).
      if (hashIndex) {
        const region = captureGuideRegion();
        if (region) {
          const hash = dhashFromRGBA(region.data, region.width, region.height);
          const nearest = matchHashIndex(hashIndex, hash, 64); // nearest, any distance
          const within = nearest !== null && nearest.distance <= HASH_MAX_DISTANCE;

          // Slide the window and tally votes over it.
          const hist = recentMatchesRef.current;
          hist.push(within && nearest ? nearest.id : '');
          while (hist.length > HASH_WINDOW) hist.shift();

          let bestId = '';
          let bestVotes = 0;
          const tally = new Map<string, number>();
          for (const id of hist) {
            if (!id) continue;
            const v = (tally.get(id) ?? 0) + 1;
            tally.set(id, v);
            if (v > bestVotes) {
              bestVotes = v;
              bestId = id;
            }
          }
          const confirmed = bestVotes >= HASH_VOTES && bestId !== '';

          if (DEBUG_HASH && nearest) {
            if (within) {
              const [c] = await getCardsByIds([nearest.id]);
              if (isCancelled()) return;
              setHashDebug(
                c
                  ? `≈ ${c.name} · ${c.set?.toUpperCase()} · d${nearest.distance} · ${bestVotes}/${HASH_VOTES}`
                  : `d${nearest.distance} · ${bestVotes}/${HASH_VOTES}`,
              );
            } else {
              setHashDebug(`d${nearest.distance} (>${HASH_MAX_DISTANCE})`);
            }
          }

          if (confirmed && bestId !== lastHashIdRef.current) {
            const [card] = await getCardsByIds([bestId]);
            if (isCancelled()) return;
            if (card) {
              lastHashIdRef.current = bestId;
              lastNameRef.current = card.name;
              recentMatchesRef.current = [];
              addCardToBasket(card);
              return;
            }
          }
        }
      }

      // 2. OCR fallback: read the whole frame and resolve the name on Scryfall.
      const canvas = captureFrame();
      if (!canvas) return;

      const worker = await getWorker();
      if (isCancelled()) return;

      const { data } = await worker.recognize(canvas);
      if (isCancelled()) return;

      // Try the top candidate lines (the card name is the topmost text) until
      // one resolves. Skip lines already known to fail and the last name acted on.
      const candidates = ocrNameCandidates(data.text ?? '')
        .filter((line) => !failedNamesRef.current.has(line.toLowerCase()))
        .slice(0, MAX_CANDIDATES);

      for (const name of candidates) {
        if (isCancelled()) return;
        if (name === lastNameRef.current) continue;

        const card = await getCardByFuzzyName(name);
        if (isCancelled()) return;

        if (!card || !sharesToken(name, card.name)) {
          failedNamesRef.current.add(name.toLowerCase());
          continue;
        }

        lastNameRef.current = name;
        addCardToBasket(card);
        return;
      }
    },
    [captureFrame, captureGuideRegion, addCardToBasket, getWorker, hashIndex],
  );

  // Automatic detection loop: runs continuously while the camera is ready.
  // Pauses while the basket drawer is open (the camera is hidden and the user
  // is reviewing) and resumes when it closes.
  useEffect(() => {
    if (cameraState !== 'ready' || showBasket) return;

    let cancelled = false;
    let timer: number | undefined;
    const isCancelled = () => cancelled;
    // Allow the last-detected card to be picked up again after a pause.
    lastNameRef.current = '';
    lastHashIdRef.current = '';
    recentMatchesRef.current = [];

    const tick = async () => {
      setScanning(true);
      try {
        await scanOnce(isCancelled);
      } catch (error) {
        console.error('Error during auto-scan:', error);
      } finally {
        if (!cancelled) setScanning(false);
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, SCAN_INTERVAL);
      }
    };

    timer = window.setTimeout(tick, SCAN_INTERVAL);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [cameraState, showBasket, scanOnce]);

  const updateEntry = (cardId: string, patch: Partial<ScannedEntry>) => {
    setScanned((prev) => prev.map((e) => (e.card.id === cardId && !e.added ? { ...e, ...patch } : e)));
  };

  const removeEntry = (cardId: string) => {
    setScanned((prev) => prev.filter((e) => !(e.card.id === cardId && !e.added)));
  };

  // Swap a not-yet-added entry to a different printing (fixes a wrong edition
  // auto-picked from the name alone), keeping its quantity and foil flag.
  const changeEntryPrinting = (cardId: string, printing: Card) => {
    setScanned((prev) => prev.map((e) => (e.card.id === cardId && !e.added ? { ...e, card: printing } : e)));
    setPickerEntryId(null);
  };

  const invalidateCollection = () => {
    queryClient.invalidateQueries({ queryKey: ['myCollection'] });
    queryClient.invalidateQueries({ queryKey: ['collection'] });
    queryClient.invalidateQueries({ queryKey: ['collectionValue'] });
  };

  const addEntryToCollection = async (entry: ScannedEntry) => {
    if (!user || entry.added || addingId) return;
    setAddingId(entry.card.id);
    try {
      const priceUsd = priceForVariant(entry.card, entry.isFoil);
      await addCardToCollection(user.id, entry.card.id, entry.quantity, priceUsd, entry.card.name);
      invalidateCollection();
      setScanned((prev) => prev.map((e) => (e === entry ? { ...e, added: true } : e)));
      toast.success(`Added ${entry.quantity}x ${entry.card.name} to collection`);
    } catch (error) {
      console.error('Error adding scanned card to collection:', error);
      toast.error('Failed to add card to collection');
    } finally {
      setAddingId(null);
    }
  };

  const addAllToCollection = async () => {
    if (!user || addingId) return;
    const pending = scanned.filter((e) => !e.added);
    if (pending.length === 0) return;
    setAddingId('all');
    try {
      for (const entry of pending) {
        const priceUsd = priceForVariant(entry.card, entry.isFoil);
        await addCardToCollection(user.id, entry.card.id, entry.quantity, priceUsd, entry.card.name);
      }
      invalidateCollection();
      setScanned((prev) => prev.map((e) => ({ ...e, added: true })));
      toast.success(`Added ${pending.length} card(s) to collection`);
    } catch (error) {
      console.error('Error adding scanned cards to collection:', error);
      toast.error('Failed to add some cards to collection');
    } finally {
      setAddingId(null);
    }
  };

  const pendingCount = scanned.filter((e) => !e.added).length;
  const basketValue = scanned.reduce(
    (sum, e) => sum + priceForVariant(e.card, e.isFoil) * e.quantity,
    0,
  );
  const pickerEntry = pickerEntryId ? scanned.find((e) => e.card.id === pickerEntryId) : undefined;

  return (
    <div className="fixed inset-x-0 top-14 md:top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-40 bg-black text-white overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />

      {cameraState === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="loading-spinner h-16 w-16"></div>
        </div>
      )}

      {(cameraState === 'denied' || cameraState === 'unavailable') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black p-6">
          <div className="max-w-sm text-center space-y-3">
            <Camera size={40} className="mx-auto text-gray-500" />
            <p className="font-semibold">
              {cameraState === 'denied' ? 'Camera access was denied' : 'No camera available'}
            </p>
            <p className="text-sm text-gray-400">
              {cameraState === 'denied'
                ? 'Allow camera access for Deckerr in your browser settings, then reload this page.'
                : 'Scanning needs a device with a camera.'}
            </p>
            {!window.isSecureContext && (
              <p className="text-sm text-yellow-400">
                The camera requires HTTPS (or localhost) — this page is not a secure context.
              </p>
            )}
          </div>
        </div>
      )}

      {cameraState === 'ready' && (
        <>
          {/* Calibration overlay (DEBUG_HASH): nearest index match + distance */}
          {DEBUG_HASH && hashDebug && (
            <div className="absolute top-3 inset-x-3 flex justify-center pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg bg-black/80 text-xs font-mono text-blue-200 max-w-full truncate">
                {hashDebug}
              </div>
            </div>
          )}

          {/* Card-shaped guide frame — fill it with the card (its region is hashed) */}
          <div className="absolute inset-x-0 top-0 bottom-32 flex items-center justify-center pointer-events-none">
            <div
              ref={frameRef}
              className="aspect-[5/7] border-2 border-white/40 rounded-xl"
              style={{ width: 'min(78vw, 340px)' }}
            />
          </div>

          {/* Bottom bar: scan status + basket button */}
          <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3 px-4">
            {scanned.length > 0 && (
              <button
                onClick={() => setShowBasket(true)}
                className="flex items-center gap-2 px-5 h-12 rounded-full bg-blue-600 active:bg-blue-700 font-semibold shadow-lg shadow-blue-600/30"
              >
                <ShoppingBasket size={20} />
                <span>Review {scanned.length} scanned</span>
                {pendingCount > 0 && (
                  <span className="ml-1 min-w-6 px-1.5 h-6 rounded-full bg-white text-blue-700 text-sm font-bold flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 text-sm text-white pointer-events-none">
              {scanning ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
              ) : (
                <ScanLine size={16} className="text-blue-400" />
              )}
              <span>Fill the frame with the card — scanning automatically</span>
            </div>
          </div>
        </>
      )}

      {/* Scanned-cards basket drawer */}
      <Modal isOpen={showBasket} onClose={() => setShowBasket(false)} size="lg" labelledBy="scan-basket-title">
        <div className="p-4 pt-2">
          <div className="flex items-baseline justify-between mb-3 pr-8">
            <h2 id="scan-basket-title" className="text-lg font-bold">
              Scanned cards ({scanned.length})
            </h2>
            <span className="text-sm text-green-400 font-semibold">${basketValue.toFixed(2)}</span>
          </div>

          {scanned.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No cards scanned yet. Point the camera at a card to start.
            </p>
          ) : (
            <div className="space-y-2">
              {scanned.map((entry) => {
                const art = getCardArtCrop(entry.card, 0);
                const unitPrice = priceForVariant(entry.card, entry.isFoil);
                return (
                  <div
                    key={entry.card.id}
                    className={`bg-gray-900 border border-gray-700 rounded-lg p-3 ${entry.added ? 'opacity-60' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-700">
                        {art && <img src={art} alt={entry.card.name} loading="lazy" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{entry.card.name}</p>
                        {entry.added ? (
                          entry.card.set_name && (
                            <p className="text-xs text-gray-400 truncate">{entry.card.set_name}</p>
                          )
                        ) : (
                          <button
                            onClick={() => setPickerEntryId(entry.card.id)}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:underline max-w-full"
                          >
                            <span className="truncate">{entry.card.set_name ?? 'Choose edition'}</span>
                            <ChevronDown size={12} className="flex-shrink-0" />
                          </button>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          ${unitPrice.toFixed(2)}
                          {entry.quantity > 1 && <span className="text-gray-500"> × {entry.quantity} = ${(unitPrice * entry.quantity).toFixed(2)}</span>}
                        </p>
                      </div>
                      {!entry.added ? (
                        <button
                          onClick={() => removeEntry(entry.card.id)}
                          aria-label="Remove from list"
                          className="self-start p-2 text-red-400 hover:bg-gray-700 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="self-start flex items-center gap-1 text-green-400 text-xs font-medium">
                          <Check size={14} /> Added
                        </span>
                      )}
                    </div>

                    {!entry.added && (
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateEntry(entry.card.id, { quantity: Math.max(1, entry.quantity - 1) })}
                            disabled={entry.quantity <= 1}
                            aria-label="Decrease quantity"
                            className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 flex items-center justify-center"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-7 text-center font-bold">{entry.quantity}</span>
                          <button
                            onClick={() => updateEntry(entry.card.id, { quantity: entry.quantity + 1 })}
                            aria-label="Increase quantity"
                            className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <button
                          onClick={() => updateEntry(entry.card.id, { isFoil: !entry.isFoil })}
                          aria-pressed={entry.isFoil}
                          aria-label="Toggle foil"
                          className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border text-sm transition-colors ${
                            entry.isFoil
                              ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                              : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <Sparkles size={16} />
                          Foil
                        </button>
                        <button
                          onClick={() => addEntryToCollection(entry)}
                          disabled={addingId !== null}
                          className="flex-1 h-9 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          {addingId === entry.card.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                          ) : (
                            <>
                              <PackagePlus size={16} /> Add
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pendingCount > 0 && (
            <button
              onClick={addAllToCollection}
              disabled={addingId !== null}
              className="w-full h-12 mt-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 font-semibold flex items-center justify-center gap-2"
            >
              {addingId === 'all' ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                <>
                  <PackagePlus size={18} /> Add all {pendingCount} to collection
                </>
              )}
            </button>
          )}
        </div>
      </Modal>

      {/* Printing picker for a basket entry (fix a wrong auto-detected edition) */}
      {pickerEntry && (
        <PrintingPickerModal
          card={pickerEntry.card}
          isOpen={pickerEntryId !== null}
          onClose={() => setPickerEntryId(null)}
          onSelect={(printing) => changeEntryPrinting(pickerEntry.card.id, printing)}
        />
      )}
    </div>
  );
}

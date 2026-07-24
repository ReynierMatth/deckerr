import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Minus, Plus, Sparkles, ScanLine } from 'lucide-react';
import type { Worker as TesseractWorker } from 'tesseract.js';
import { Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { addCardToCollection } from '../services/api';
import { getCardByFuzzyName } from '../services/scryfall';
import { getCardArtCrop } from '../utils/cardFaces';
import Modal from './Modal';
import CardRow from './card/CardRow';

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable';

interface ScannedEntry {
  card: Card;
  quantity: number;
  isFoil: boolean;
}

// Upscale factor for the OCR crop (small title strips read better enlarged).
const OCR_UPSCALE = 2;
// Simple linear contrast boost applied after grayscale conversion.
const OCR_CONTRAST = 1.6;
// Delay between automatic scan passes (the OCR pass itself adds to this).
const SCAN_INTERVAL = 1200;
// Minimum tesseract confidence (0-100) before spending a Scryfall lookup.
const MIN_CONFIDENCE = 55;

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
 * Reduce raw OCR output to the most plausible card-name line: strip
 * non-letter noise, collapse whitespace, and keep the longest line that
 * still contains a run of letters (title strips often pick up mana-cost
 * symbols and border artifacts as stray characters).
 */
const cleanOcrText = (raw: string): string => {
  const lines = raw
    .split('\n')
    .map((line) =>
      line
        .replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => /[A-Za-zÀ-ÿ]{3}/.test(line));

  if (lines.length === 0) return '';
  return lines.reduce((best, line) => (line.length > best.length ? line : best), '');
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Created lazily on the first scan pass, then reused for every scan.
  const workerPromiseRef = useRef<Promise<TesseractWorker> | null>(null);
  // Last name sent to Scryfall, to avoid re-querying an identical failed read.
  const lastNameRef = useRef('');

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [scanning, setScanning] = useState(false);
  const [match, setMatch] = useState<Card | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isFoil, setIsFoil] = useState(false);
  const [adding, setAdding] = useState(false);
  // Cards added during this scanning session (resets on unmount).
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
   * Grab the current video frame region under the on-screen title strip.
   *
   * The video is rendered with object-cover, so the displayed image is the
   * source frame scaled by max(dispW/vidW, dispH/vidH) and centered (the
   * overflow is cropped equally on both sides). Inverting that transform
   * maps the strip's screen rect back to source-pixel coordinates, which
   * are drawn upscaled onto an offscreen canvas and contrast-boosted.
   */
  const captureTitleStrip = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    const strip = stripRef.current;
    if (!video || !strip || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const videoRect = video.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    if (videoRect.width === 0 || videoRect.height === 0) return null;

    const scale = Math.max(
      videoRect.width / video.videoWidth,
      videoRect.height / video.videoHeight,
    );
    const offsetX = (videoRect.width - video.videoWidth * scale) / 2;
    const offsetY = (videoRect.height - video.videoHeight * scale) / 2;

    const sx = Math.max(0, (stripRect.left - videoRect.left - offsetX) / scale);
    const sy = Math.max(0, (stripRect.top - videoRect.top - offsetY) / scale);
    const sw = Math.min(stripRect.width / scale, video.videoWidth - sx);
    const sh = Math.min(stripRect.height / scale, video.videoHeight - sy);
    if (sw <= 0 || sh <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * OCR_UPSCALE);
    canvas.height = Math.round(sh * OCR_UPSCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    // Grayscale + linear contrast boost: dark ink on a light title bar OCRs
    // far better than the raw color frame.
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
   * One automatic scan pass: OCR the title strip and, if it reads confidently
   * and resolves to a card, open the result drawer. Returns true when a match
   * was found (so the loop stops rescheduling). Misses are silent — this runs
   * on a timer, so toasting each failure would be unbearable.
   */
  const scanOnce = useCallback(
    async (isCancelled: () => boolean): Promise<boolean> => {
      const canvas = captureTitleStrip();
      if (!canvas) return false;

      const worker = await getWorker();
      if (isCancelled()) return false;

      const { data } = await worker.recognize(canvas);
      if (isCancelled()) return false;
      if ((data.confidence ?? 0) < MIN_CONFIDENCE) return false;

      const name = cleanOcrText(data.text ?? '');
      // Skip empty reads and identical consecutive reads (an unchanged frame
      // that already failed to resolve would just spend Scryfall lookups).
      if (name.length < 3 || name === lastNameRef.current) return false;
      lastNameRef.current = name;

      const card = await getCardByFuzzyName(name);
      if (isCancelled() || !card) return false;

      setQuantity(1);
      setIsFoil(false);
      setMatch(card);
      return true;
    },
    [captureTitleStrip, getWorker],
  );

  // Automatic detection loop: runs while the camera is ready and no result
  // drawer is open. Pauses whenever a match is showing (match !== null) and
  // resumes when the drawer closes.
  useEffect(() => {
    if (cameraState !== 'ready' || match !== null) return;

    let cancelled = false;
    let timer: number | undefined;
    const isCancelled = () => cancelled;
    // Allow the just-scanned name to be detected again after the drawer closed.
    lastNameRef.current = '';

    const tick = async () => {
      setScanning(true);
      let found = false;
      try {
        found = await scanOnce(isCancelled);
      } catch (error) {
        console.error('Error during auto-scan:', error);
      } finally {
        if (!cancelled) setScanning(false);
      }
      // On a match the effect re-runs (match !== null) and cleans up; only
      // reschedule while still hunting.
      if (!cancelled && !found) {
        timer = window.setTimeout(tick, SCAN_INTERVAL);
      }
    };

    timer = window.setTimeout(tick, SCAN_INTERVAL);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [cameraState, match, scanOnce]);

  const handleAddToCollection = async () => {
    if (!match || !user || adding) return;
    setAdding(true);
    try {
      const priceUsd = priceForVariant(match, isFoil);
      await addCardToCollection(user.id, match.id, quantity, priceUsd, match.name);

      queryClient.invalidateQueries({ queryKey: ['myCollection'] });
      queryClient.invalidateQueries({ queryKey: ['collection'] });
      queryClient.invalidateQueries({ queryKey: ['collectionValue'] });

      setScanned((prev) => [{ card: match, quantity, isFoil }, ...prev]);
      setMatch(null);
      toast.success(`Added ${quantity}x ${match.name} to collection`);
    } catch (error) {
      console.error('Error adding scanned card to collection:', error);
      toast.error('Failed to add card to collection');
    } finally {
      setAdding(false);
    }
  };

  const matchPrice = match
    ? (isFoil ? match.prices?.usd_foil ?? match.prices?.usd : match.prices?.usd) ?? null
    : null;

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
          {/* Card-shaped guide frame with the OCR title strip highlighted */}
          <div className="absolute inset-x-0 top-0 bottom-32 flex items-center justify-center pointer-events-none">
            <div
              className="relative aspect-[5/7] border-2 border-white/60 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{ width: 'min(72vw, 300px)' }}
            >
              <div
                ref={stripRef}
                className="absolute left-[4%] right-[4%] top-[4%] h-[9%] border-2 border-blue-400 rounded-md bg-blue-400/10"
              />
              <p className="absolute left-0 right-0 top-[15%] text-center text-xs text-blue-200 drop-shadow px-2">
                Align the card name here
              </p>
            </div>
          </div>

          {/* Recently scanned session strip */}
          {scanned.length > 0 && (
            <div className="absolute inset-x-0 bottom-24 px-3 pointer-events-none">
              <div className="flex gap-2 overflow-x-auto pointer-events-auto pb-1">
                {scanned.map((entry, index) => {
                  const art = getCardArtCrop(entry.card, 0);
                  return (
                    <div
                      key={`${entry.card.id}-${index}`}
                      className="relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-gray-600 bg-gray-800"
                      title={entry.card.name}
                    >
                      {art ? (
                        <img src={art} alt={entry.card.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-700" />
                      )}
                      <span className="absolute bottom-0 right-0 bg-black/80 text-[10px] px-1 rounded-tl">
                        x{entry.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-detect status pill (no shutter — detection is automatic) */}
          <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 text-sm text-white">
              {scanning ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
              ) : (
                <ScanLine size={16} className="text-blue-400" />
              )}
              <span>Point at a card — scanning automatically</span>
            </div>
          </div>
        </>
      )}

      {/* Match result drawer */}
      <Modal isOpen={match !== null} onClose={() => setMatch(null)} labelledBy="scan-result-title">
        {match && (
          <div className="p-4 pt-2 space-y-4">
            <h2 id="scan-result-title" className="text-lg font-bold">
              Card found
            </h2>

            <CardRow
              card={match}
              price={matchPrice}
              subtitle={
                match.set_name ? (
                  <p className="text-xs text-gray-400 truncate">{match.set_name}</p>
                ) : undefined
              }
            />

            <div className="flex items-center justify-between gap-3">
              {/* Quantity stepper */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                  className="w-11 h-11 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 flex items-center justify-center"
                >
                  <Minus size={18} />
                </button>
                <span className="w-8 text-center font-bold text-lg">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                  className="w-11 h-11 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center"
                >
                  <Plus size={18} />
                </button>
              </div>

              {/* Foil toggle */}
              <button
                onClick={() => setIsFoil((f) => !f)}
                aria-pressed={isFoil}
                className={`flex items-center gap-2 px-4 h-11 rounded-lg border transition-colors ${
                  isFoil
                    ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Sparkles size={18} />
                <span className="text-sm font-medium">Foil</span>
              </button>
            </div>

            <button
              onClick={handleAddToCollection}
              disabled={adding}
              className="w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 font-semibold flex items-center justify-center gap-2"
            >
              {adding ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                'Add to collection'
              )}
            </button>

            <button
              onClick={() => setMatch(null)}
              className="w-full h-11 rounded-lg text-gray-300 hover:bg-gray-700 text-sm"
            >
              Not this card? Rescan
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

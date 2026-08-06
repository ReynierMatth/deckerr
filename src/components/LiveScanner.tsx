import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ScanEye, Zap, ZapOff, Trash2, Plus, Minus, X, Layers, ShoppingCart, Library, Check, Wand2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Card } from '../types';
import { getCardsByIds, createDeckFromCards, addCardToCollection } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCollectionCounts } from '../hooks/useCollectionCounts';
import { GameId, enabledGames } from '../cards/domain/game';
import { useActiveGames } from '../contexts/PriceSourceContext';
import { preloadScannerCv, detectQuad, runScan, activeBackend, type Pt } from '../utils/scannerCvPipeline';
import { sharedTokenCount } from '../utils/nameMatch';
import CardDetail from './card/CardDetail';
import { useBackDismiss } from '../hooks/useBackDismiss';
import { getPrice } from '../cards/domain/accessors/price';

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable';

interface Candidate {
  card: Card;
  score: number;
}

interface BasketEntry {
  card: Card;
  qty: number;
  score: number;
  /** Scan top-5 (best first), kept for correction. Only the RECENT_SCANS most
   * recently-scanned entries retain this — older ones drop it to spare memory. */
  candidates?: Candidate[];
}

// How many recent scans keep their correction candidates in memory.
const RECENT_SCANS = 10;

// Live-loop tuning.
const DETECT_INTERVAL = 180; // ms between detection passes (~5.5 fps)
const STABLE_FRAMES = 3; // consecutive steady detections before we recognize
const GONE_FRAMES = 2; // consecutive empty frames before we re-arm for the next card
const MIN_SCORE = 0.45; // reject low-confidence matches (junk) rather than add them

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const quadMetrics = (q: Pt[]) => {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const s = (dist(q[0], q[1]) + dist(q[1], q[2]) + dist(q[2], q[3]) + dist(q[3], q[0])) / 4;
  return { cx, cy, s };
};

/**
 * Live camera card scanner. A continuous OpenCV loop detects the card and draws
 * its outline on the video; when the card is held steady, the full CV pipeline
 * (rectify -> DINOv2 embed -> cosine match -> OCR re-rank) recognizes it, adds
 * the top match to a basket (with a beep), and waits for the card to leave the
 * frame before the next one. From the basket you can build a deck. Torch and
 * sound are supported where the device allows.
 */
export default function LiveScanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useToast();
  const { data: collectionCounts } = useCollectionCounts(user?.id);
  const owned = collectionCounts ?? {};
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Live-loop state kept in refs so the interval callback always sees the latest
  // without re-subscribing.
  const busyRef = useRef(false);
  const tickingRef = useRef(false);
  const armedRef = useRef(true);
  const stableRef = useRef(0);
  const goneRef = useRef(0);
  const lastMetricsRef = useRef<{ cx: number; cy: number; s: number } | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scanning, setScanning] = useState(false); // recognizing right now
  const [basket, setBasket] = useState<Map<string, BasketEntry>>(new Map());
  const [basketOpen, setBasketOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  // Basket entry whose correction picker (top-5) is open, if any.
  const [correcting, setCorrecting] = useState<string | null>(null);
  // DEBUG: last scan's raw top-5 (id + score + resolved name), set on every
  // scan — including "not recognized" — to diagnose id/resolution issues.
  const [scanDebug, setScanDebug] = useState<{
    ocr: string;
    minScore: number;
    items: { id: string; score: number; name: string | null }[];
  } | null>(null);
  // DEBUG: actual camera resolution negotiated by getUserMedia.
  const [camRes, setCamRes] = useState<string | null>(null);
  // DEBUG: active inference backend (webgpu/wasm), read after the embedder loads.
  const [backend, setBackend] = useState<string | null>(null);
  // Ids of the RECENT_SCANS most recent scans (oldest first) — entries outside
  // this window drop their candidates so the basket stays light.
  const recentRef = useRef<string[]>([]);

  // Which game we're scanning (its art index is what we match against). Kept in
  // a ref too so the detection loop reads the latest without re-subscribing.
  const activeGames = useActiveGames();
  // You scan physical cards you hold — offer every game, not just the user's
  // preferred ones. Default to their first game.
  const scanGames = enabledGames();
  const [scanGame, setScanGame] = useState<GameId>(activeGames[0]?.id ?? 'mtg');
  const scanGameRef = useRef<GameId>(scanGame);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const beep = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new Ctor();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {
      /* sound is best-effort */
    }
  }, []);

  // Add a scan's best match to the basket, keeping its top-5 candidates for
  // later correction. Only the RECENT_SCANS most recent scans keep candidates.
  const registerScan = useCallback((candidates: Candidate[]) => {
    const best = candidates[0];
    setBasket((prev) => {
      const next = new Map(prev);
      // Move this card to the front of the recent window (dedup), then evict
      // candidates from anything that falls out of the window.
      const order = recentRef.current.filter((id) => id !== best.card.id);
      order.push(best.card.id);
      while (order.length > RECENT_SCANS) {
        const evicted = order.shift()!;
        const it = next.get(evicted);
        if (it?.candidates) next.set(evicted, { ...it, candidates: undefined });
      }
      recentRef.current = order;
      const existing = next.get(best.card.id);
      next.set(best.card.id, { card: best.card, qty: (existing?.qty ?? 0) + 1, score: best.score, candidates });
      return next;
    });
  }, []);

  // Swap a basket entry for one of its scan candidates (a manual correction):
  // move the whole line's quantity onto the chosen card, carrying the top-5 so
  // it can be re-corrected.
  const applyCorrection = useCallback((fromId: string, pick: Candidate) => {
    setCorrecting(null);
    if (pick.card.id === fromId) return;
    setBasket((prev) => {
      const from = prev.get(fromId);
      if (!from) return prev;
      const next = new Map(prev);
      next.delete(fromId);
      recentRef.current = recentRef.current.map((id) => (id === fromId ? pick.card.id : id));
      const existing = next.get(pick.card.id);
      next.set(pick.card.id, {
        card: pick.card,
        qty: (existing?.qty ?? 0) + from.qty,
        score: pick.score,
        candidates: from.candidates,
      });
      return next;
    });
    flashToast(`✓ ${pick.card.name}`);
  }, [flashToast]);

  // Recognize the current frame and add the best match to the basket.
  const recognize = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    busyRef.current = true;
    setScanning(true);
    try {
      const outcome = await runScan(video, scanGameRef.current);
      if (!outcome.ok) return;
      const cards = await getCardsByIds(outcome.matches.map((m) => m.id));
      const byId = new Map(cards.map((c) => [c.id, c]));
      const ocr = outcome.ocrTitle ?? '';
      const ranked = outcome.matches
        .map((m) => {
          const card = byId.get(m.id);
          const ocrHits = ocr && card ? sharedTokenCount(ocr, card.name) : 0;
          return { m, card, ocrHits };
        })
        .sort((a, b) => b.ocrHits - a.ocrHits || b.m.score - a.m.score);
      // DEBUG: always capture the raw top-5 so we can see ids/scores/resolution
      // even when nothing is recognized.
      setScanDebug({
        ocr,
        minScore: MIN_SCORE,
        items: ranked.slice(0, 5).map((r) => ({
          id: r.m.id,
          score: r.m.score,
          name: r.card?.name ?? null,
        })),
      });
      const best = ranked[0];
      if (!best?.card || best.m.score < MIN_SCORE) {
        flashToast('Carte non reconnue, réessaie');
        return;
      }
      // Resolved top-5 (best first) kept for correction from the basket.
      const candidates: Candidate[] = ranked
        .slice(0, 5)
        .filter((r): r is typeof r & { card: Card } => !!r.card)
        .map((r) => ({ card: r.card, score: r.m.score }));
      registerScan(candidates);
      beep();
      flashToast(`+ ${best.card.name}`);
    } catch (err) {
      console.error('live scan failed:', err);
      flashToast('Scan indisponible pour ce jeu');
    } finally {
      busyRef.current = false;
      setScanning(false);
    }
  }, [registerScan, beep, flashToast]);

  // Preload (and warm) the selected game's art index; refresh on game switch.
  useEffect(() => {
    scanGameRef.current = scanGame;
    preloadScannerCv(scanGame)
      .then(() => setBackend(activeBackend)) // DEBUG: reflect the chosen backend
      .catch((err) => console.error('scanner preload failed:', err));
  }, [scanGame]);

  // Continuous detection loop: draw the outline, gate recognition on stability.
  useEffect(() => {
    if (cameraState !== 'ready') return;
    let stopped = false;

    const tick = async () => {
      const video = videoRef.current;
      const canvas = overlayRef.current;
      if (!video || !canvas || busyRef.current || tickingRef.current) return;
      tickingRef.current = true;
      let result;
      try {
        result = await detectQuad(video);
      } catch {
        return;
      } finally {
        tickingRef.current = false;
      }
      if (stopped) return;
      const { quad, frameW, frameH } = result;

      // Size the overlay to the frame once so its object-cover matches the video.
      if (frameW && (canvas.width !== frameW || canvas.height !== frameH)) {
        canvas.width = frameW;
        canvas.height = frameH;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!quad) {
        stableRef.current = 0;
        lastMetricsRef.current = null;
        goneRef.current += 1;
        if (goneRef.current >= GONE_FRAMES) armedRef.current = true;
        return;
      }
      goneRef.current = 0;

      // Steadiness: same position & size as last frame => the card is being held
      // still (and thus sharp), so it's worth the expensive recognition.
      const m = quadMetrics(quad);
      const last = lastMetricsRef.current;
      const steady =
        last !== null &&
        Math.abs(m.cx - last.cx) < 0.04 * frameW &&
        Math.abs(m.cy - last.cy) < 0.04 * frameH &&
        Math.abs(m.s - last.s) < 0.06 * m.s;
      stableRef.current = steady ? stableRef.current + 1 : 0;
      lastMetricsRef.current = m;

      const ready = armedRef.current && stableRef.current >= STABLE_FRAMES;
      if (ctx) {
        ctx.lineWidth = Math.max(3, Math.round(frameW / 150));
        ctx.strokeStyle = ready ? '#22c55e' : '#22d3ee';
        ctx.beginPath();
        ctx.moveTo(quad[0].x, quad[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
        ctx.closePath();
        ctx.stroke();
      }

      if (ready) {
        armedRef.current = false;
        stableRef.current = 0;
        void recognize();
      }
    };

    const id = setInterval(tick, DETECT_INTERVAL);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [cameraState, recognize]);

  // Start the rear camera; detect torch capability; warm the pipeline.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable');
        return;
      }
      try {
        // Ask for a high-res rear stream. Without explicit width/height the
        // Android WebView negotiates a low default (~640×480), degrading the
        // scan embeddings; Chrome/PWA defaults much higher. `ideal` lets the
        // device fall back gracefully if it can't hit 1080p.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(Boolean(caps?.torch));
        const s = track?.getSettings?.();
        setCamRes(s?.width && s?.height ? `${s.width}×${s.height}` : null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState('ready');
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setCameraState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    };
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch (err) {
      console.error('torch toggle failed:', err);
    }
  }, [torchOn]);

  // Add one copy of a scanned card to the collection — mirrors the Search card:
  // optimistic count bump, then invalidate the shared collection caches.
  const addToCollection = useCallback(
    async (card: Card) => {
      if (!user) {
        notify.error('Connecte-toi pour ajouter à ta collection');
        return;
      }
      try {
        const priceUsd = getPrice(card, 'tcgplayer');
        await addCardToCollection(user.id, card.id, 1, priceUsd, card.name);
        queryClient.setQueryData<Record<string, number>>(
          ['collection', user.id, 'counts'],
          (prev) => ({ ...(prev ?? {}), [card.id]: (prev?.[card.id] ?? 0) + 1 }),
        );
        queryClient.invalidateQueries({ queryKey: ['collection'] });
        queryClient.invalidateQueries({ queryKey: ['myCollection'] });
        notify.success(`${card.name} ajoutée à la collection`);
      } catch (err) {
        console.error('add to collection failed:', err);
        notify.error("Échec de l'ajout à la collection");
      }
    },
    [user, queryClient, notify],
  );

  const changeQty = useCallback((id: string, delta: number) => {
    setBasket((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (!entry) return prev;
      const qty = entry.qty + delta;
      if (qty <= 0) {
        next.delete(id);
        recentRef.current = recentRef.current.filter((rid) => rid !== id);
      } else next.set(id, { ...entry, qty });
      return next;
    });
  }, []);

  const basketEntries = Array.from(basket.values());
  const basketCount = basketEntries.reduce((n, e) => n + e.qty, 0);

  // Back / back-gesture closes the basket sheet (it's an ad-hoc overlay, not the
  // shared Modal, so it opts in directly).
  useBackDismiss(basketOpen, () => setBasketOpen(false));

  const createDeck = useCallback(async () => {
    if (!user || basketEntries.length === 0 || creating) return;
    setCreating(true);
    try {
      const name = `Scan ${new Date().toLocaleDateString()}`;
      const deckId = await createDeckFromCards(
        user.id,
        name,
        'commander',
        basketEntries.map((e) => ({ cardId: e.card.id, quantity: e.qty })),
      );
      navigate({ to: '/decks/$deckId/edit', params: { deckId } });
    } catch (err) {
      console.error('create deck failed:', err);
      flashToast('Échec de la création du deck');
    } finally {
      setCreating(false);
    }
  }, [user, basketEntries, creating, navigate, flashToast]);

  return (
    <div className="min-h-full bg-gray-900 text-white p-4 pb-24 animate-fade-in">
      <header className="flex items-center gap-2 mb-4">
        <ScanEye className="text-blue-400" size={24} />
        <div>
          <h1 className="text-xl font-bold">Scan</h1>
          <p className="text-xs text-gray-400">Vise une carte, tiens-la immobile — elle est reconnue toute seule.</p>
        </div>
      </header>

      {/* Which game are you scanning? (its art index is matched against) */}
      {scanGames.length > 1 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5 text-xs text-gray-400">
            <ScanEye size={14} /> Scanning:
          </div>
          <div className="flex gap-2">
            {scanGames.map((g) => (
              <button
                key={g.id}
                onClick={() => setScanGame(g.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  scanGame === g.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Camera preview + live outline */}
      <div className="relative w-full max-w-md mx-auto aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-gray-700">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="loading-spinner h-12 w-12" />
          </div>
        )}

        {(cameraState === 'denied' || cameraState === 'unavailable') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-6">
            <div className="max-w-xs text-center space-y-3">
              <Camera size={40} className="mx-auto text-gray-500" />
              <p className="font-semibold">
                {cameraState === 'denied' ? "Accès caméra refusé" : 'Aucune caméra disponible'}
              </p>
              <p className="text-sm text-gray-400">
                {cameraState === 'denied'
                  ? 'Autorise la caméra pour Deckerr dans les réglages du navigateur, puis recharge.'
                  : 'Le scan nécessite un appareil avec caméra.'}
              </p>
              {!window.isSecureContext && (
                <p className="text-sm text-yellow-400">La caméra requiert HTTPS (ou localhost).</p>
              )}
            </div>
          </div>
        )}

        {/* Torch toggle */}
        {cameraState === 'ready' && torchSupported && (
          <button
            onClick={toggleTorch}
            aria-label="Torche"
            className={`absolute top-3 right-3 p-2.5 rounded-full backdrop-blur ${
              torchOn ? 'bg-yellow-400 text-gray-900' : 'bg-black/50 text-white'
            }`}
          >
            {torchOn ? <Zap size={20} /> : <ZapOff size={20} />}
          </button>
        )}

        {/* Recognizing indicator */}
        {scanning && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm backdrop-blur">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
            Reconnaissance…
          </div>
        )}

        {/* DEBUG: negotiated camera resolution + active inference backend */}
        {camRes && (
          <div className="absolute top-3 left-3 rounded bg-black/70 px-2 py-1 text-[10px] font-mono text-cyan-300">
            cam {camRes} · {backend ?? '…'}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* DEBUG: last scan's raw top-5 (id + score + resolved name) */}
        {scanDebug && (
          <div className="absolute bottom-2 left-2 right-2 max-h-52 overflow-auto rounded-lg bg-black/80 p-2 text-[10px] leading-tight text-gray-200 font-mono">
            <div className="mb-1 flex items-center justify-between text-gray-400">
              <span>DEBUG top-5 · min={scanDebug.minScore} · OCR:"{scanDebug.ocr}"</span>
              <button onClick={() => setScanDebug(null)} className="px-1 text-gray-400">✕</button>
            </div>
            {scanDebug.items.length === 0 && <div className="text-amber-400">aucun match</div>}
            {scanDebug.items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <span className={it.score >= scanDebug.minScore ? 'text-emerald-400' : 'text-red-400'}>
                  {it.score.toFixed(3)}
                </span>
                <span className={it.name ? 'text-cyan-300' : 'text-red-400'}>
                  {it.name ?? '✗ non résolu'}
                </span>
                <span className="truncate text-gray-500">{it.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="max-w-md mx-auto mt-3 text-center text-xs text-gray-500">
        Contour <span className="text-cyan-400">cyan</span> = détectée, <span className="text-green-400">vert</span> = reconnaissance en cours.
        {!torchSupported && cameraState === 'ready' ? ' (Torche non dispo sur cet appareil.)' : ''}
      </p>

      {/* Basket FAB */}
      <button
        onClick={() => setBasketOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-8 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 h-14 shadow-lg shadow-blue-600/30 active:bg-blue-700"
      >
        <ShoppingCart size={22} />
        <span className="font-semibold">{basketCount}</span>
      </button>

      {/* Basket drawer */}
      {basketOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setBasketOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] flex flex-col bg-gray-800 border-t border-gray-700 rounded-t-2xl safe-area-bottom animate-slide-in-up">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="font-semibold">Panier ({basketCount})</h2>
              <button onClick={() => setBasketOpen(false)} aria-label="Fermer" className="p-2 -m-1 text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {basketEntries.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-8">Aucune carte scannée pour l'instant.</p>
              )}
              {basketEntries.map((e) => {
                const ownedQty = owned[e.card.id] ?? 0;
                return (
                  <div key={e.card.id} className="rounded-lg border border-gray-700 bg-gray-900 p-2 space-y-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setDetailCard(e.card)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        aria-label={`Détails de ${e.card.name}`}
                      >
                        {e.card.images?.artCrop && (
                          <img src={e.card.images.artCrop} alt="" className="w-12 h-9 rounded object-cover flex-shrink-0" loading="lazy" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{e.card.name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {e.card.setName}
                            {e.card.setCode ? ` · ${e.card.setCode.toUpperCase()}` : ''} · {e.score.toFixed(2)}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => changeQty(e.card.id, -1)} aria-label="Moins" className="p-1.5 rounded bg-gray-700 hover:bg-gray-600">
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center font-mono">{e.qty}</span>
                        <button onClick={() => changeQty(e.card.id, 1)} aria-label="Plus" className="p-1.5 rounded bg-gray-700 hover:bg-gray-600">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => changeQty(e.card.id, -e.qty)} aria-label="Retirer" className="p-1.5 rounded text-red-300 hover:bg-red-500/20">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Correction: pick the right card among the scan's top-5. */}
                    {e.candidates && e.candidates.length > 1 && (
                      <button
                        onClick={() => setCorrecting((id) => (id === e.card.id ? null : e.card.id))}
                        className="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-medium text-gray-300 hover:bg-gray-700"
                      >
                        <Wand2 size={14} />
                        {correcting === e.card.id ? 'Fermer' : 'Corriger la carte'}
                      </button>
                    )}
                    {correcting === e.card.id && e.candidates && (
                      <ol className="space-y-1 rounded-lg bg-gray-800 p-1.5">
                        {e.candidates.map((c) => {
                          const current = c.card.id === e.card.id;
                          return (
                            <li key={c.card.id}>
                              <button
                                onClick={() => applyCorrection(e.card.id, c)}
                                disabled={current}
                                className={`w-full flex items-center gap-2 rounded-md p-1.5 text-left ${
                                  current ? 'bg-blue-600/20 ring-1 ring-blue-500' : 'hover:bg-gray-700'
                                }`}
                              >
                                {c.card.images?.artCrop && (
                                  <img src={c.card.images.artCrop} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0" loading="lazy" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{c.card.name}</p>
                                  <p className="text-[11px] text-gray-400 truncate">
                                    {c.card.setCode ? c.card.setCode.toUpperCase() : c.card.setName}
                                  </p>
                                </div>
                                <span className="flex-shrink-0 font-mono text-[11px] text-gray-400">{c.score.toFixed(2)}</span>
                                {current && <Check size={13} className="flex-shrink-0 text-blue-400" />}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {/* Per-card add-to-collection (like the Search card) */}
                    <button
                      onClick={() => addToCollection(e.card)}
                      className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium"
                    >
                      <Library size={16} />
                      Ajouter à la collection
                      {ownedQty > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                          <Check size={11} /> x{ownedQty}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-gray-700">
              <button
                onClick={createDeck}
                disabled={basketEntries.length === 0 || creating}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 active:bg-blue-700 disabled:opacity-50 font-semibold"
              >
                <Layers size={20} />
                {creating ? 'Création…' : 'Créer un deck depuis le panier'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
    </div>
  );
}

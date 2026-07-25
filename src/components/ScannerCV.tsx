import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ScanEye, Sparkles, Timer } from 'lucide-react';
import type { Card } from '../types';
import { getCardsByIds } from '../services/api';
import { preloadScannerCv, runScan, type ScanSuccess } from '../utils/scannerCvPipeline';

type CameraState = 'starting' | 'ready' | 'denied' | 'unavailable';

/**
 * EXPERIMENTAL "Scan CV (beta)" screen. Runs the validated computer-vision
 * pipeline entirely in the browser (OpenCV detect + rectify -> art crop ->
 * DINOv2 embedding -> cosine match) so the owner can measure real on-device
 * performance and accuracy. This is a proof: capture is on-tap (not
 * continuous), and results show the top-5, per-stage timings, and debug
 * thumbnails of what OpenCV extracted. The shipped /scan scanner is untouched.
 *
 * NOTE: camera behaviour and pipeline performance can only be validated on a
 * real device — the owner must test on a phone.
 */
export default function ScannerCV() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanSuccess | null>(null);
  const [cardsById, setCardsById] = useState<Map<string, Card>>(new Map());
  const [noCard, setNoCard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start the rear camera on mount; stop every track on unmount. Same pattern
  // as the shipped Scanner.
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
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setCameraState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    };

    start();
    // Warm up OpenCV.js, transformers.js and the index in the background so the
    // first capture isn't cold. Failures surface on capture instead.
    preloadScannerCv().catch((err) => console.error('CV scanner preload failed:', err));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || busy) return;
    setBusy(true);
    setError(null);
    setNoCard(false);
    try {
      const outcome = await runScan(video);
      if (!outcome.ok) {
        setResult(null);
        setCardsById(new Map());
        setNoCard(true);
        return;
      }
      setResult(outcome);
      setNoCard(false);
      const cards = await getCardsByIds(outcome.matches.map((m) => m.id));
      setCardsById(new Map(cards.map((c) => [c.id, c])));
    } catch (err) {
      console.error('CV scan failed:', err);
      setError('The scan failed to run. The model may still be downloading, or the device ran out of memory — check the console.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="min-h-full bg-gray-900 text-white p-4 pb-24 animate-fade-in">
      <header className="flex items-center gap-2 mb-4">
        <ScanEye className="text-blue-400" size={24} />
        <div>
          <h1 className="text-xl font-bold">Scan CV (beta)</h1>
          <p className="text-xs text-gray-400">
            Experimental on-device computer-vision matcher — tap Capture to test.
          </p>
        </div>
      </header>

      {/* 3-column debug layout on wide screens: camera | pipeline images |
          results. Stacks vertically on mobile. */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
      {/* Column 1 — camera + capture */}
      <div className="space-y-4">
      {/* Camera preview */}
      <div className="relative w-full max-w-md mx-auto lg:max-w-none lg:mx-0 aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-gray-700">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="loading-spinner h-12 w-12"></div>
          </div>
        )}

        {(cameraState === 'denied' || cameraState === 'unavailable') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-6">
            <div className="max-w-xs text-center space-y-3">
              <Camera size={40} className="mx-auto text-gray-500" />
              <p className="font-semibold">
                {cameraState === 'denied' ? 'Camera access was denied' : 'No camera available'}
              </p>
              <p className="text-sm text-gray-400">
                {cameraState === 'denied'
                  ? 'Allow camera access for Deckerr in your browser settings, then reload.'
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

        {/* Card-shaped alignment guide */}
        {cameraState === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="aspect-[5/7] h-[80%] border-2 border-white/40 rounded-xl" />
          </div>
        )}
      </div>

      {/* Capture button */}
      <button
        onClick={handleCapture}
        disabled={cameraState !== 'ready' || busy}
        className="w-full max-w-md mx-auto lg:max-w-none lg:mx-0 flex items-center justify-center gap-2 h-14 rounded-xl bg-blue-600 active:bg-blue-700 disabled:opacity-50 font-semibold text-lg shadow-lg shadow-blue-600/30"
      >
        {busy ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            Running pipeline…
          </>
        ) : (
          <>
            <ScanEye size={22} /> Capture
          </>
        )}
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {noCard && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          No card outline found. Fill the frame with a single card on a contrasting
          surface, hold steady, and capture again.
        </div>
      )}
      </div>
      {/* End column 1 */}

      {/* Column 2 — pipeline images */}
      <div>
        {result ? (
          <section>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-300 mb-2">
              <Sparkles size={16} /> What OpenCV extracted
            </h2>
            <figure className="mb-3">
              <img
                src={result.frameUrl}
                alt="Original frame with detected outline"
                className="w-full rounded-lg border border-gray-700"
              />
              <figcaption className="mt-1 text-center text-[11px] text-gray-400">
                Original input (cyan = detected card)
              </figcaption>
            </figure>
            <div className="flex gap-3">
              <figure className="flex-1">
                <img
                  src={result.rectifiedUrl}
                  alt="Rectified card"
                  className="w-full rounded-lg border border-gray-700"
                />
                <figcaption className="mt-1 text-center text-[11px] text-gray-400">
                  Rectified card
                </figcaption>
              </figure>
              <figure className="flex-1">
                <img
                  src={result.artUrl}
                  alt="Cropped art region"
                  className="w-full rounded-lg border border-gray-700"
                />
                <figcaption className="mt-1 text-center text-[11px] text-gray-400">
                  Art crop (embedded)
                </figcaption>
              </figure>
            </div>
          </section>
        ) : (
          <div className="hidden lg:flex h-full min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-gray-700 text-sm text-gray-500">
            Pipeline images appear here after a capture
          </div>
        )}
      </div>

      {/* Column 3 — results */}
      <div>
      {result ? (
        <div className="space-y-4">
          {/* Top-5 matches */}
          <section>
            <h2 className="text-sm font-semibold text-gray-300 mb-2">Top 5 matches</h2>
            <ol className="space-y-2">
              {result.matches.map((match, i) => {
                const card = cardsById.get(match.id);
                return (
                  <li
                    key={match.id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      i === 0 ? 'border-blue-500/60 bg-blue-500/10' : 'border-gray-700 bg-gray-800'
                    }`}
                  >
                    <span className="w-6 flex-shrink-0 text-center font-bold text-gray-400">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {card?.name ?? `Unknown (${match.id.slice(0, 8)}…)`}
                      </p>
                      {card?.set_name && (
                        <p className="text-xs text-gray-400 truncate">
                          {card.set_name}
                          {card.set ? ` · ${card.set.toUpperCase()}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-mono text-sm text-blue-200">
                      {match.score.toFixed(3)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Timing readout */}
          <section className="rounded-lg border border-gray-700 bg-gray-800 p-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-300 mb-2">
              <Timer size={16} /> Timing
            </h2>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['Detect + rectify', result.timings.detectMs],
                  ['Embed', result.timings.embedMs],
                  ['Match', result.timings.matchMs],
                ] as const
              ).map(([label, ms]) => (
                <div key={label} className="rounded-md bg-gray-900 py-2">
                  <dd className="font-mono text-base text-white">{Math.round(ms)}ms</dd>
                  <dt className="text-[11px] text-gray-400">{label}</dt>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : (
        <div className="hidden lg:flex h-full min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-gray-700 text-sm text-gray-500">
          Matches appear here after a capture
        </div>
      )}
      </div>
      {/* End column 3 */}
      </div>
      {/* End 3-column layout */}
    </div>
  );
}

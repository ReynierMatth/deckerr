import { useState } from 'react';
import { Globe, Link2, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  resolveInstanceFromUrl,
  buildManualConfig,
  InstanceConfigError,
} from '../lib/instanceConfig';

/**
 * Jellyfin-style "connect to your instance" screen, shown before the login form
 * when no instance is configured (the Capacitor/Android case; web self-hosts
 * bake their config and skip this). The user types their Deckerr instance URL
 * and we discover its Supabase config from `<url>/config.js`; an "advanced"
 * fallback lets them paste the Supabase URL + anon key directly.
 */
export default function InstanceForm() {
  const { connectInstance } = useAuth();

  const [instanceUrl, setInstanceUrl] = useState('');
  const [manual, setManual] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const config = manual
        ? buildManualConfig(supabaseUrl, anonKey)
        : await resolveInstanceFromUrl(instanceUrl);
      connectInstance(config);
      // AuthProvider now re-runs its session check and RootLayout swaps this
      // screen for the login form.
    } catch (err) {
      if (err instanceof InstanceConfigError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not connect to that instance.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bg-gray-900 overflow-hidden">
      <div className="relative z-10 bg-gray-900/80 p-8 rounded-lg shadow-xl backdrop-blur-sm w-full max-w-md glass-effect animate-scale-in">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 animate-bounce-in">
            <Globe size={28} />
          </div>
          <h2 className="text-3xl font-bold text-orange-500 text-center">Deckerr</h2>
          <p className="mt-2 text-sm text-gray-400 text-center">
            Connect to your Deckerr instance to get started.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded text-red-500 animate-fade-in">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {!manual ? (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Instance URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={instanceUrl}
                  onChange={(e) => setInstanceUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-smooth"
                  placeholder="deckerr.example.com"
                  required
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                The address where your Deckerr instance is hosted.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Supabase URL</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-smooth"
                    placeholder="https://your-project.supabase.co"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Anon key</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-smooth"
                    placeholder="Supabase anon / publishable key"
                    required
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg btn-ripple glow-on-hover transition-smooth"
          >
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Globe size={20} />}
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setManual((m) => !m);
              setError(null);
            }}
            className="text-blue-400 hover:text-blue-300 text-sm transition-smooth"
          >
            {manual ? 'Use my instance URL instead' : 'Enter Supabase details manually'}
          </button>
        </div>
      </div>
    </div>
  );
}

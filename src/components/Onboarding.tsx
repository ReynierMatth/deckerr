import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePreferredGames } from '../contexts/PriceSourceContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { enabledGames, GameId } from '../cards/domain/game';
import { HANDLE_PATTERN } from '../utils/profileName';

/**
 * One-time post-signup onboarding: confirm/adjust display name + @handle (email
 * is read-only, it's owned by the auth provider) and pick the TCGs you care
 * about. The choice drives which per-game UI is shown; it's editable later in
 * Profile settings.
 */
export default function Onboarding() {
  const { user } = useAuth();
  const { completeOnboarding } = usePreferredGames();
  const toast = useToast();

  const games = enabledGames();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  // Default to everything selected — a user who doesn't care just continues.
  const [selectedGames, setSelectedGames] = useState<GameId[]>(games.map((g) => g.id));
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Prefill from the existing profile, falling back to the OAuth metadata.
  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const metaName = meta.full_name || meta.name || '';
    const metaHandle = meta.preferred_username || meta.user_name || '';
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name, handle, username')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDisplayName(data?.display_name || metaName || '');
        const fallbackHandle = (user.email?.split('@')[0] || '').toLowerCase();
        setHandle((data?.handle || data?.username || metaHandle || fallbackHandle).toLowerCase());
        setSeeded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleValid = HANDLE_PATTERN.test(handle);
  const canSubmit = handleValid && selectedGames.length > 0 && !saving;

  const toggleGame = (id: GameId) =>
    setSelectedGames((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await completeOnboarding({ displayName, handle, games: selectedGames });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      toast.error(code === '23505' ? 'That handle is already taken' : 'Failed to save your profile');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome to Deckerr 👋</h1>
          <p className="mt-1 text-sm text-gray-400">A couple of things and you're set.</p>
        </div>

        {user?.email && (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Email</label>
            <div className="w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-gray-400">
              {user.email}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Handle</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={seeded && handle.length > 0 && !handleValid}
              className={`w-full pl-7 pr-3 py-2.5 bg-gray-800 border rounded-lg text-sm ${
                seeded && handle.length > 0 && !handleValid ? 'border-red-500' : 'border-gray-700'
              }`}
              placeholder="handle"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">3–20 characters: lowercase letters, numbers or underscore.</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Which games do you play?</label>
          <div className="grid grid-cols-2 gap-2">
            {games.map((g) => {
              const active = selectedGames.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGame(g.id)}
                  className={`relative p-3 rounded-lg border-2 text-center transition ${
                    active ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  {active && <Check size={14} className="absolute top-1.5 right-1.5 text-blue-400" />}
                  <span className="font-medium text-sm">{g.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-500">You'll only see features for the games you pick. Change it anytime in settings.</p>
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-3 rounded-lg font-medium"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : 'Get started'}
        </button>
      </div>
    </div>
  );
}

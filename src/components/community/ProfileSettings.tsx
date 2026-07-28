import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePriceSource } from '../../contexts/PriceSourceContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { HANDLE_PATTERN } from '../../utils/profileName';

const PRICE_SOURCE_OPTIONS = [
  { value: 'tcgplayer', label: 'TCGplayer', description: 'US market (USD)' },
  { value: 'cardmarket', label: 'Cardmarket', description: 'EU market (EUR)' },
] as const;

type Visibility = 'public' | 'friends' | 'private';

interface ProfileRow {
  username: string | null;
  display_name: string | null;
  handle: string | null;
  collection_visibility: Visibility | null;
}

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', description: 'Anyone can view' },
  { value: 'friends', label: 'Friends', description: 'Friends only' },
  { value: 'private', label: 'Private', description: 'Only you' },
] as const;

/** Postgres unique-violation code — raised when a handle is already taken. */
const UNIQUE_VIOLATION = '23505';

/** Profile settings tab: display name, @handle + collection visibility. Self-contained. */
export default function ProfileSettings() {
  const { user } = useAuth();
  const { source: priceSource, setSource: setPriceSource } = usePriceSource();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [collectionVisibility, setCollectionVisibility] = useState<Visibility>('private');

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, handle, collection_visibility')
        .eq('id', user!.id)
        .single();
      return data;
    },
  });

  // Seed the editable form fields once the profile loads. Fall back to the
  // legacy username for the handle so a not-yet-migrated row stays editable.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || '');
    setHandle(profile.handle || profile.username || '');
    setCollectionVisibility(profile.collection_visibility || 'private');
  }, [profile]);

  const handleValid = HANDLE_PATTERN.test(handle);
  const handleError = handle.length > 0 && !handleValid;

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('profiles').upsert({
        id: user!.id,
        display_name: displayName.trim() || null,
        handle,
        // Keep the legacy username column synced to the handle for the
        // currently-deployed image, which still reads it.
        username: handle,
        collection_visibility: collectionVisibility,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Prefix invalidation also refreshes ['profile', 'name', userId] in Navigation.
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated!');
    },
    onError: (error: unknown) => {
      const code = (error as { code?: string } | null)?.code;
      if (code === UNIQUE_VIOLATION) {
        toast.error('That handle is already taken');
      } else {
        toast.error('Failed to update profile');
      }
    },
  });

  const savingProfile = saveProfile.isPending;

  const handleSaveProfile = () => {
    if (!user || !handleValid) return;
    saveProfile.mutate();
  };

  return (
    <div className="space-y-4 max-w-md">
      {/* Display name */}
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

      {/* Handle */}
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
            aria-invalid={handleError}
            className={`w-full pl-7 pr-3 py-2.5 bg-gray-800 border rounded-lg text-sm ${
              handleError ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="handle"
          />
        </div>
        {handleError ? (
          <p className="mt-1 text-xs text-red-400">
            3-20 characters, lowercase letters, numbers or underscore.
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Your unique @handle — how friends find you.
          </p>
        )}
      </div>

      {/* Visibility */}
      <div>
        <label className="block text-sm text-gray-400 mb-1.5">Collection Visibility</label>
        <div className="grid grid-cols-3 gap-2">
          {VISIBILITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setCollectionVisibility(option.value)}
              className={`p-3 rounded-lg border-2 transition text-center ${
                collectionVisibility === option.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800 active:border-gray-600'
              }`}
            >
              <div className="font-medium text-sm">{option.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preferred price source */}
      <div>
        <label className="block text-sm text-gray-400 mb-1.5">Price source</label>
        <div className="grid grid-cols-2 gap-2">
          {PRICE_SOURCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setPriceSource(option.value)}
              className={`p-3 rounded-lg border-2 transition text-center ${
                priceSource === option.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800 active:border-gray-600'
              }`}
            >
              <div className="font-medium text-sm">{option.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Cardmarket prices are available for Magic and Pokémon; other games fall back to TCGplayer.
        </p>
      </div>

      {/* Save */}
      <button
        onClick={handleSaveProfile}
        disabled={savingProfile || !handleValid}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-3 rounded-lg font-medium"
      >
        {savingProfile ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Save</>}
      </button>
    </div>
  );
}

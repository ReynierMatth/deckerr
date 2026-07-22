import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';

type Visibility = 'public' | 'friends' | 'private';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', description: 'Anyone can view' },
  { value: 'friends', label: 'Friends', description: 'Friends only' },
  { value: 'private', label: 'Private', description: 'Only you' },
] as const;

/** Profile settings tab: username + collection visibility. Self-contained. */
export default function ProfileSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [collectionVisibility, setCollectionVisibility] = useState<Visibility>('private');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, collection_visibility')
        .eq('id', user.id)
        .single();
      if (data && !cancelled) {
        setUsername(data.username || '');
        setCollectionVisibility(data.collection_visibility || 'private');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username,
        collection_visibility: collectionVisibility,
        updated_at: new Date(),
      });
      if (error) throw error;
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      {/* Username */}
      <div>
        <label className="block text-sm text-gray-400 mb-1.5">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          placeholder="Your username"
        />
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

      {/* Save */}
      <button
        onClick={handleSaveProfile}
        disabled={savingProfile}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-3 rounded-lg font-medium"
      >
        {savingProfile ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Save</>}
      </button>
    </div>
  );
}

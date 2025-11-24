import React, { useState, useEffect } from 'react';
import { Save, Globe, Users, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const THEME_COLORS = ['red', 'green', 'blue', 'yellow', 'grey', 'purple'];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe, description: 'Anyone can view your collection' },
  { value: 'friends', label: 'Friends Only', icon: Users, description: 'Only friends can view your collection' },
  { value: 'private', label: 'Private', icon: Lock, description: 'Only you can view your collection' },
] as const;

type CollectionVisibility = 'public' | 'friends' | 'private';

export default function Profile() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [themeColor, setThemeColor] = useState('blue');
  const [collectionVisibility, setCollectionVisibility] = useState<CollectionVisibility>('private');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, theme_color, collection_visibility')
          .eq('id', user.id)
          .single();

        if (data) {
          setUsername(data.username || '');
          setThemeColor(data.theme_color || 'blue');
          setCollectionVisibility((data.collection_visibility as CollectionVisibility) || 'private');
        }
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username,
          theme_color: themeColor,
          collection_visibility: collectionVisibility,
          updated_at: new Date()
        });

      if (error) throw error;
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Theme Color
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {THEME_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setThemeColor(color)}
                  className={`h-12 sm:h-14 rounded-lg border-2 transition-all capitalize text-sm sm:text-base
                    ${themeColor === color
                      ? 'border-white scale-105'
                      : 'border-transparent hover:border-gray-600'
                    }`}
                  style={{ backgroundColor: `var(--color-${color}-primary)` }}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Collection Visibility
            </label>
            <div className="space-y-2">
              {VISIBILITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCollectionVisibility(option.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left
                      ${collectionVisibility === option.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                      }`}
                  >
                    <Icon size={20} className={collectionVisibility === option.value ? 'text-blue-400' : 'text-gray-400'} />
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-gray-400">{option.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            ) : (
              <>
                <Save size={20} />
                Save Changes
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

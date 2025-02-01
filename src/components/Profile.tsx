import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const THEME_COLORS = ['red', 'green', 'blue', 'yellow', 'grey', 'purple'];

export default function Profile() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [themeColor, setThemeColor] = useState('blue');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, theme_color')
          .eq('id', user.id)
          .single();

        if (data) {
          setUsername(data.username || '');
          setThemeColor(data.theme_color || 'blue');
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
            <div className="grid grid-cols-3 gap-4">
              {THEME_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setThemeColor(color)}
                  className={`h-12 rounded-lg border-2 transition-all capitalize
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

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
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

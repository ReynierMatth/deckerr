import { Globe } from 'lucide-react';
import ProfileSettings from './community/ProfileSettings';
import { useAuth } from '../contexts/AuthContext';
import { getInstanceConfig } from '../lib/supabase';

/**
 * Dedicated settings page (reached from the user menu). Hosts the profile /
 * preferences form — moved out of the Community tabs — plus, on runtime-chosen
 * instances (Capacitor/Android), a way to switch instance.
 */
export default function Settings() {
  const { instanceLocked, changeInstance } = useAuth();
  const instanceUrl = getInstanceConfig()?.url ?? null;

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Settings</h1>
        <ProfileSettings />

        {!instanceLocked && instanceUrl && (
          <div className="mt-6 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-gray-200 font-medium">
              <Globe size={18} className="text-orange-500" />
              <span>Instance</span>
            </div>
            <p className="text-sm text-gray-400 mb-3 break-all">
              Connected to <span className="text-gray-300">{instanceUrl}</span>
            </p>
            <button
              type="button"
              onClick={() => changeInstance()}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-100 transition-smooth"
            >
              Change instance
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

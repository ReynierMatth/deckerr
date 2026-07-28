import ProfileSettings from './community/ProfileSettings';

/**
 * Dedicated settings page (reached from the user menu). Hosts the profile /
 * preferences form — moved out of the Community tabs.
 */
export default function Settings() {
  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Settings</h1>
        <ProfileSettings />
      </div>
    </div>
  );
}

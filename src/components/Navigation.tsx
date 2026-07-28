import { useState, useRef, useEffect } from 'react';
import { Library, LogOut, ChevronDown, Compass, Search, Heart, HeartPulse, Users, Bell, MoreHorizontal, ScanLine, X, Settings } from 'lucide-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useBackDismiss } from '../hooks/useBackDismiss';
import { supabase } from '../lib/supabase';
import { profileDisplayName } from '../utils/profileName';
import NotificationBell from './NotificationBell';

export default function Navigation() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Back / back-gesture closes the mobile "More" sheet + the desktop user menu.
  useBackDismiss(showMore, () => setShowMore(false));
  useBackDismiss(showDropdown, () => setShowDropdown(false));

  const { data: profileName } = useQuery({
    queryKey: ['profile', 'name', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, handle')
        .eq('id', user!.id)
        .single();
      return data ? profileDisplayName(data) : null;
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { to: '/', label: 'Decks', icon: Library },
    { to: '/collection', label: 'Collection', icon: Library },
    { to: '/wishlist', label: 'Wishlist', icon: Heart },
    { to: '/community', label: 'Community', icon: Users },
    { to: '/discover', label: 'Discover', icon: Compass },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/scan', label: 'Scan', icon: ScanLine },
    { to: '/life-counter', label: 'Life', icon: HeartPulse },
    { to: '/alerts', label: 'Alerts', icon: Bell },
  ] as const;

  const isActive = (to: string) => (to === '/' ? currentPath === '/' : currentPath.startsWith(to));

  // Mobile bottom bar shows only the primary tabs; the rest live in "More".
  const MOBILE_PRIMARY: string[] = ['/', '/collection', '/community', '/search'];
  const mobilePrimary = navItems.filter((i) => MOBILE_PRIMARY.includes(i.to));
  const mobileMore = navItems.filter((i) => !MOBILE_PRIMARY.includes(i.to));

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate({ to: '/' });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const getAvatarUrl = (userId: string) => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  };

  return (
    <>
      {/* Desktop Navigation - Top */}
      <nav className="hidden md:block fixed top-0 left-0 right-0 bg-gray-800 border-b border-gray-700 z-[100] animate-slide-in-left">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <span className="text-2xl font-bold text-orange-500 animate-bounce-in">Deckerr</span>
              {navItems.map((item) => (
                <button
                  key={item.to}
                  onClick={() => navigate({ to: item.to })}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-smooth
                    ${isActive(item.to)
                      ? 'text-white bg-gray-900 animate-pulse-glow'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                    }`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {user && (
              <div className="flex items-center space-x-4">
                <NotificationBell />
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-gray-700 transition-smooth"
                  >
                    <img
                      src={getAvatarUrl(user.id)}
                      alt="User avatar"
                      className="w-8 h-8 rounded-full bg-gray-700 transition-smooth hover:scale-110"
                    />
                    <span className="text-gray-300 text-sm">{profileName || user.email}</span>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>

                  {showDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 border border-gray-700 animate-scale-in glass-effect z-[110]">
                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          navigate({ to: '/settings' });
                        }}
                        className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-smooth"
                      >
                        <Settings size={16} />
                        <span>Settings</span>
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-smooth"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Navigation - Top bar (brand + notifications). safe-area-top pads
          for the iOS status bar (black-translucent) so content clears the notch. */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-gray-800 border-b border-gray-700 z-50 safe-area-top">
        <div className="h-14 flex items-center justify-between px-4">
          <span className="text-xl font-bold text-orange-500">Deckerr</span>
          {user && <NotificationBell />}
        </div>
      </div>

      {/* Mobile Navigation - Bottom */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-50 safe-area-bottom">
        <div className="flex justify-around items-center h-16 px-1">
          {mobilePrimary.map((item) => (
            <button
              key={item.to}
              onClick={() => navigate({ to: item.to })}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive(item.to)
                  ? 'text-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <item.icon size={20} />
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          ))}

          <button
            onClick={() => setShowMore(true)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              mobileMore.some((i) => isActive(i.to)) ? 'text-blue-500' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <MoreHorizontal size={20} />
            <span className="text-xs mt-1">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 rounded-t-2xl p-4 pb-8 safe-area-bottom animate-slide-in-up">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-300">More</span>
              <button
                onClick={() => setShowMore(false)}
                aria-label="Close menu"
                className="p-2.5 -m-1.5 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-1">
              {mobileMore.map((item) => (
                <button
                  key={item.to}
                  onClick={() => {
                    navigate({ to: item.to });
                    setShowMore(false);
                  }}
                  className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg transition-colors ${
                    isActive(item.to) ? 'bg-gray-900 text-white' : 'text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  setShowMore(false);
                  navigate({ to: '/settings' });
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <Settings size={20} />
                <span>Settings</span>
              </button>
              <button
                onClick={() => {
                  setShowMore(false);
                  handleSignOut();
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <LogOut size={20} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

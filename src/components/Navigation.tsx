import React, { useState, useRef, useEffect } from 'react';
    import { Home, PlusSquare, Library, LogOut, Settings, ChevronDown, Search, Heart, Menu } from 'lucide-react';
    import { useAuth } from '../contexts/AuthContext';
    import { supabase } from '../lib/supabase';

    type Page = 'home' | 'deck' | 'login' | 'collection' | 'profile' | 'search' | 'life-counter';

    interface NavigationProps {
      currentPage: Page;
      setCurrentPage: (page: Page) => void;
    }

    export default function Navigation({ currentPage, setCurrentPage }: NavigationProps) {
      const { user, signOut } = useAuth();
      const [showDropdown, setShowDropdown] = useState(false);
      const [showMobileMenu, setShowMobileMenu] = useState(false);
      const dropdownRef = useRef<HTMLDivElement>(null);
      const mobileMenuRef = useRef<HTMLDivElement>(null);
      const [username, setUsername] = useState<string | null>(null);

      useEffect(() => {
        const fetchProfile = async () => {
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', user.id)
              .single();
            
            if (data) {
              setUsername(data.username);
            }
          }
        };

        fetchProfile();
      }, [user]);

      useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setShowDropdown(false);
          }
          if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
            setShowMobileMenu(false);
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, []);

      const navItems = [
        { id: 'home' as const, label: 'Home', icon: Home },
        { id: 'deck' as const, label: 'New Deck', icon: PlusSquare },
        { id: 'collection' as const, label: 'Collection', icon: Library },
        { id: 'search' as const, label: 'Search', icon: Search },
        { id: 'life-counter' as const, label: 'Life Counter', icon: Heart },
      ];

      const handleSignOut = async () => {
        try {
          await signOut();
          setCurrentPage('login');
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
          <nav className="hidden md:block fixed top-0 left-0 right-0 bg-gray-800 border-b border-gray-700 z-50">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center space-x-8">
                  <span className="text-2xl font-bold text-orange-500">Deckerr</span>
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setCurrentPage(item.id)}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                        ${currentPage === item.id
                          ? 'text-white bg-gray-900'
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
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-gray-700"
                      >
                        <img
                          src={getAvatarUrl(user.id)}
                          alt="User avatar"
                          className="w-8 h-8 rounded-full bg-gray-700"
                        />
                        <span className="text-gray-300 text-sm">{username || user.email}</span>
                        <ChevronDown size={16} className="text-gray-400" />
                      </button>

                      {showDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 border border-gray-700">
                          <button
                            onClick={() => {
                              setCurrentPage('profile');
                              setShowDropdown(false);
                            }}
                            className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                          >
                            <Settings size={16} />
                            <span>Profile Settings</span>
                          </button>
                          <button
                            onClick={handleSignOut}
                            className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
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

          {/* Mobile Navigation - Bottom */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-50">
            <div className="flex justify-between items-center h-16 px-4">
              <span className="text-2xl font-bold text-orange-500">Deckerr</span>
              <div className="relative" ref={mobileMenuRef}>
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="text-gray-300 hover:text-white"
                >
                  <Menu size={24} />
                </button>
                {showMobileMenu && (
                  <div className="absolute right-0 bottom-16 w-48 bg-gray-800 rounded-md shadow-lg py-1 border border-gray-700">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setCurrentPage(item.id);
                          setShowMobileMenu(false);
                        }}
                        className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        <item.icon size={16} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                    {user && (
                      <>
                        <button
                          onClick={() => {
                            setCurrentPage('profile');
                            setShowMobileMenu(false);
                          }}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                        >
                          <Settings size={16} />
                          <span>Profile Settings</span>
                        </button>
                        <button
                          onClick={handleSignOut}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                        >
                          <LogOut size={16} />
                          <span>Sign Out</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* Content Padding */}
          <div className="md:pt-16 pb-16 md:pb-0" />
        </>
      );
    }

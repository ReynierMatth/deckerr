import React, { useState } from 'react';
    import DeckManager from './components/DeckManager';
    import DeckList from './components/DeckList';
    import LoginForm from './components/LoginForm';
    import Navigation from './components/Navigation';
    import Collection from './components/Collection';
    import DeckEditor from './components/DeckEditor';
    import Profile from './components/Profile';
    import CardSearch from './components/CardSearch';
    import LifeCounter from './components/LifeCounter';
    import PWAInstallPrompt from './components/PWAInstallPrompt';
    import { AuthProvider, useAuth } from './contexts/AuthContext';

    type Page = 'home' | 'deck' | 'login' | 'collection' | 'edit-deck' | 'profile' | 'search' | 'life-counter';

    function AppContent() {
      const [currentPage, setCurrentPage] = useState<Page>('home');
      const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
      const { user, loading } = useAuth();

      if (loading) {
        return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <div className="loading-spinner h-32 w-32"></div>
          </div>
        );
      }

      if (!user && currentPage !== 'login') {
        return <LoginForm />;
      }

      const handleDeckEdit = (deckId: string) => {
        setSelectedDeckId(deckId);
        setCurrentPage('edit-deck');
      };

      const renderPage = () => {
        switch (currentPage) {
          case 'home':
            return (
              <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-6 md:pt-16 pb-16 md:pb-0 animate-fade-in">
                <div className="max-w-7xl mx-auto">
                  <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 animate-slide-in-left">My Decks</h1>
                  <DeckList onDeckEdit={handleDeckEdit} />
                </div>
              </div>
            );
          case 'deck':
            return <DeckManager />;
          case 'edit-deck':
            return selectedDeckId ? (
              <DeckEditor 
                deckId={selectedDeckId} 
                onClose={() => {
                  setSelectedDeckId(null);
                  setCurrentPage('home');
                }}
              />
            ) : null;
          case 'collection':
            return <Collection />;
          case 'profile':
            return <Profile />;
          case 'search':
            return <CardSearch />;
          case 'life-counter':
            return <LifeCounter />;
          case 'login':
            return <LoginForm />;
          default:
            return null;
        }
      };

      return (
        <div className="min-h-screen bg-gray-900">
          <Navigation currentPage={currentPage} setCurrentPage={setCurrentPage} />
          {renderPage()}
          <PWAInstallPrompt />
        </div>
      );
    }

    function App() {
      return (
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      );
    }

    export default App;

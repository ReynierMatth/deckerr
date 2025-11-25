import React, { useState } from 'react';
import DeckManager from './components/DeckManager';
import DeckList from './components/DeckList';
import LoginForm from './components/LoginForm';
import Navigation from './components/Navigation';
import Collection from './components/Collection';
import DeckEditor from './components/DeckEditor';
import CardSearch from './components/CardSearch';
import LifeCounter from './components/LifeCounter';
import Community from './components/Community';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

type Page = 'home' | 'deck' | 'login' | 'collection' | 'edit-deck' | 'search' | 'life-counter' | 'community';

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
          <div className="relative bg-gray-900 text-white p-3 sm:p-6 animate-fade-in md:min-h-screen">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 animate-slide-in-left">My Decks</h1>
              <DeckList
                onDeckEdit={handleDeckEdit}
                onCreateDeck={() => setCurrentPage('deck')}
              />
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
      case 'search':
        return <CardSearch />;
      case 'life-counter':
        return <LifeCounter />;
      case 'community':
        return <Community />;
      case 'login':
        return <LoginForm />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Navigation currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="relative flex-1 overflow-y-auto pt-0 md:pt-16">
        <div className="relative min-h-full pb-20 md:pb-0">
          {renderPage()}
        </div>
      </main>
      <PWAInstallPrompt />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

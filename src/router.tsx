import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
} from '@tanstack/react-router';
import { useAuth } from './contexts/AuthContext';
import Navigation from './components/Navigation';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import LoginForm from './components/LoginForm';
import DeckList from './components/DeckList';
import DeckManager from './components/DeckManager';
import Collection from './components/Collection';
import Wishlist from './components/Wishlist';
import Community from './components/Community';
import CardSearch from './components/CardSearch';
import LifeCounter from './components/LifeCounter';
import DeckEditor from './components/DeckEditor';

/**
 * App shell + auth gate. Mirrors the previous behaviour: a spinner while auth
 * resolves, the login form when signed out, and the navigation + routed page
 * once signed in.
 */
function RootLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="loading-spinner h-32 w-32"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Navigation />
      <main className="relative flex-1 overflow-y-auto">
        <div className="relative min-h-full md:min-h-0 pt-14 md:pt-16 pb-20 md:pb-0">
          <Outlet />
        </div>
      </main>
      <PWAInstallPrompt />
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

function HomePage() {
  const navigate = useNavigate();
  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 animate-fade-in md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 animate-slide-in-left">My Decks</h1>
        <DeckList
          onDeckEdit={(deckId) => navigate({ to: '/decks/$deckId/edit', params: { deckId } })}
          onCreateDeck={() => navigate({ to: '/deck' })}
        />
      </div>
    </div>
  );
}

function EditDeckPage() {
  const { deckId } = editDeckRoute.useParams();
  const navigate = useNavigate();
  return <DeckEditor deckId={deckId} onClose={() => navigate({ to: '/' })} />;
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const deckRoute = createRoute({ getParentRoute: () => rootRoute, path: '/deck', component: DeckManager });
const collectionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/collection', component: Collection });
const wishlistRoute = createRoute({ getParentRoute: () => rootRoute, path: '/wishlist', component: Wishlist });
const communityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/community', component: Community });
const searchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/search', component: CardSearch });
const lifeCounterRoute = createRoute({ getParentRoute: () => rootRoute, path: '/life-counter', component: LifeCounter });
const editDeckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decks/$deckId/edit',
  component: EditDeckPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  deckRoute,
  collectionRoute,
  wishlistRoute,
  communityRoute,
  searchRoute,
  lifeCounterRoute,
  editDeckRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

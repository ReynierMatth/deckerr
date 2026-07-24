import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import Navigation from './components/Navigation';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import LoginForm from './components/LoginForm';
// The home page stays in the main chunk (it's the first thing rendered);
// every other page is code-split and loaded on navigation.
import DeckList from './components/DeckList';

const DeckEditor = lazy(() => import('./components/DeckEditor'));
const PublicDeck = lazy(() => import('./components/PublicDeck'));

const PageSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="loading-spinner h-16 w-16"></div>
  </div>
);

/**
 * App shell + auth gate. Mirrors the previous behaviour: a spinner while auth
 * resolves, the login form when signed out, and the navigation + routed page
 * once signed in. Exception: public deck links (/decks/:id/view) render for
 * signed-out visitors too — that's the whole point of sharing a deck.
 */
function RootLayout() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublicRoute = /^\/decks\/[^/]+\/view\/?$/.test(pathname);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="loading-spinner h-32 w-32"></div>
      </div>
    );
  }

  if (!user) {
    if (isPublicRoute) {
      // Minimal shell: no navbar (it's all auth-gated), just the shared deck.
      return (
        <div className="min-h-screen bg-gray-900">
          <Outlet />
        </div>
      );
    }
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Navigation />
      <main className="relative flex-1 overflow-y-auto">
        <div className="relative min-h-full md:min-h-0 pt-[var(--topbar-h)] md:pt-16 pb-20 md:pb-0">
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
  return (
    <Suspense fallback={<PageSpinner />}>
      <DeckEditor deckId={deckId} onClose={() => navigate({ to: '/' })} />
    </Suspense>
  );
}

function ViewDeckPage() {
  const { deckId } = viewDeckRoute.useParams();
  return (
    <Suspense fallback={<PageSpinner />}>
      <PublicDeck deckId={deckId} />
    </Suspense>
  );
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const deckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deck',
  component: lazyRouteComponent(() => import('./components/DeckManager')),
});
const collectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/collection',
  component: lazyRouteComponent(() => import('./components/Collection')),
});
const wishlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wishlist',
  component: lazyRouteComponent(() => import('./components/Wishlist')),
});
const communityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/community',
  component: lazyRouteComponent(() => import('./components/Community')),
});
const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discover',
  component: lazyRouteComponent(() => import('./components/Discover')),
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  component: lazyRouteComponent(() => import('./components/CardSearch')),
});
const scanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scan',
  component: lazyRouteComponent(() => import('./components/Scanner')),
});
const lifeCounterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/life-counter',
  component: lazyRouteComponent(() => import('./components/LifeCounter')),
});
const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/alerts',
  component: lazyRouteComponent(() => import('./components/PriceAlerts')),
});
const editDeckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decks/$deckId/edit',
  component: EditDeckPage,
});
const viewDeckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decks/$deckId/view',
  component: ViewDeckPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  deckRoute,
  collectionRoute,
  wishlistRoute,
  communityRoute,
  discoverRoute,
  searchRoute,
  scanRoute,
  lifeCounterRoute,
  alertsRoute,
  editDeckRoute,
  viewDeckRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPendingComponent: PageSpinner,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

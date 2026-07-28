import { useState, useEffect } from 'react';
    import { Mail, Lock, LogIn } from 'lucide-react';
    import { useAuth } from '../contexts/AuthContext';
    import { Card } from '../types';
    import { getRandomCards } from '../services/api';

    export default function LoginForm() {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [isSignUp, setIsSignUp] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const { signIn, signUp, signInWithProvider } = useAuth();
      const [cards, setCards] = useState<Card[]>([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        const loadCards = async () => {
          try {
            const randomCards = await getRandomCards(6);
            setCards(randomCards);
          } catch (error) {
            console.error('Failed to load cards:', error);
          } finally {
            setLoading(false);
          }
        };

        loadCards();
      }, []);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
          if (isSignUp) {
            await signUp(email, password);
          } else {
            await signIn(email, password);
          }
          window.location.href = '/'; // Redirect to home after successful login
        } catch (error) {
          setError(error instanceof Error ? error.message : 'An error occurred');
        }
      };

      const handleOAuth = async (provider: 'google' | 'discord') => {
        setError(null);
        try {
          // Redirects to the provider; Supabase returns to this origin.
          await signInWithProvider(provider);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'An error occurred');
        }
      };

      if (loading) {
        return <div className="animate-pulse h-96 bg-gray-700/50 rounded-lg"></div>;
      }

      return (
        <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
          {/* Animated Background */}
          <div className="absolute inset-0 overflow-hidden">
            <div 
              className="flex animate-slide"
              style={{
                width: `${cards.length * 100}%`,
                animation: 'slide 60s linear infinite'
              }}
            >
              {[...cards, ...cards].map((card, index) => (
                <div
                  key={`${card.id}-${index}`}
                  className="relative w-full h-screen"
                  style={{
                    width: `${100 / (cards.length * 2)}%`
                  }}
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transform transition-transform duration-1000"
                    style={{
                      backgroundImage: `url(${card.images?.normal})`,
                      filter: 'blur(8px) brightness(0.4)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Login Form */}
          <div className="relative z-10 bg-gray-900/80 p-8 rounded-lg shadow-xl backdrop-blur-sm w-full max-w-md glass-effect animate-scale-in">
            <h2 className="text-3xl font-bold text-orange-500 mb-6 text-center animate-bounce-in">
              Deckerr
            </h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded text-red-500 animate-fade-in">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-smooth"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-smooth"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg btn-ripple glow-on-hover transition-smooth"
              >
                <LogIn size={20} />
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>

            {/* Social sign-in (Google / Discord). Requires the matching provider
                enabled in Supabase → Authentication → Sign In / Providers. */}
            <div className="mt-6">
              <div className="flex items-center gap-3 text-gray-500 text-xs">
                <span className="h-px flex-1 bg-gray-700" />
                OR
                <span className="h-px flex-1 bg-gray-700" />
              </div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  className="w-full flex items-center justify-center gap-3 min-h-[44px] bg-white text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-smooth"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('discord')}
                  className="w-full flex items-center justify-center gap-3 min-h-[44px] bg-[#5865F2] text-white font-medium rounded-lg hover:bg-[#4752c4] transition-smooth"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.213.383-.462.9-.634 1.31a18.27 18.27 0 0 0-5.505 0A12.6 12.6 0 0 0 9.11 3 19.74 19.74 0 0 0 4.677 4.37C1.9 8.53 1.14 12.58 1.52 16.57a19.9 19.9 0 0 0 6.06 3.08c.49-.67.926-1.38 1.3-2.13-.714-.27-1.4-.6-2.045-.99.171-.126.34-.257.5-.39a14.2 14.2 0 0 0 12.33 0c.163.14.332.27.5.39-.646.39-1.333.72-2.047.99.375.75.81 1.46 1.3 2.13a19.87 19.87 0 0 0 6.06-3.08c.44-4.53-.735-8.55-3.16-12.2ZM8.02 14.09c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.96 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.947 2.42-2.157 2.42Z" />
                  </svg>
                  Continue with Discord
                </button>
              </div>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-blue-400 hover:text-blue-300 transition-smooth"
              >
                {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
              </button>
            </div>
          </div>
        </div>
      );
    }

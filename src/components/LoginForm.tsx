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
      const { signIn, signUp } = useAuth();
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
                      backgroundImage: `url(${card.image_uris?.normal})`,
                      filter: 'blur(8px) brightness(0.4)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Login Form */}
          <div className="relative z-10 bg-gray-900/80 p-8 rounded-lg shadow-xl backdrop-blur-sm w-full max-w-md">
            <h2 className="text-3xl font-bold text-orange-500 mb-6 text-center">
              Deckerr
            </h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded text-red-500">
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
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
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
                    className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
              >
                <LogIn size={20} />
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-blue-400 hover:text-blue-300"
              >
                {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
              </button>
            </div>
          </div>
        </div>
      );
    }

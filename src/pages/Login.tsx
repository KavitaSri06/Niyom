import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, X } from 'lucide-react';
import { Logo } from '../components/Logo';

interface LoginProps {
  onSwitchToSignup: () => void;
  onClose: () => void;
}

export function Login({ onSwitchToSignup, onClose }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <img
          src="https://images.pexels.com/photos/6801647/pexels-photo-6801647.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt="Background"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="bg-bg-elevated rounded-2xl shadow-2xl p-10 border-t-4 border-accent relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="mb-8 text-center">
            <button
              onClick={onClose}
              className="inline-flex flex-col items-center hover:opacity-80 transition-opacity mb-4"
            >
              <Logo size="xl" className="mb-4 shadow-lg" />
              <h1 className="text-4xl font-bold text-text-primary mb-1" style={{ fontFamily: 'var(--font-display)' }}>NIYOM WEALTH</h1>
              <p className="text-accent text-sm font-semibold tracking-wider">CLIENT PORTAL</p>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border-2 border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border-2 border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-strong text-on-accent font-bold py-3 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center mt-6 text-text-secondary">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToSignup}
              className="text-accent hover:text-accent-strong font-semibold transition-colors"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

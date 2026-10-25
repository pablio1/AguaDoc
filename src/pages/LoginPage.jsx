import { useState } from 'react';
import { apiLogin } from '../api';
import { Eye, EyeOff, User, Lock, ArrowRight } from 'lucide-react';
import AuthShell from '../components/AuthShell';

export default function LoginPage({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiLogin(username, password);
      if (result.success) onLogin(result.user);
      else setError(result.message || 'Invalid credentials');
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage orders, deliveries, and your account.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Username or email</label>
          <div className="flex items-center gap-2 rounded-[0.9rem] border border-slate-200/80 bg-white px-3 py-2.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-cyan-500/15">
            <User size={16} className="text-slate-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin / customer / rider"
              className="flex-1 bg-transparent text-sm outline-none"
              autoComplete="username"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Password</label>
          <div className="flex items-center gap-2 rounded-[0.9rem] border border-slate-200/80 bg-white px-3 py-2.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-cyan-500/15">
            <Lock size={16} className="text-slate-400" />
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="flex-1 bg-transparent text-sm outline-none"
              autoComplete="current-password"
            />
            <button type="button" onClick={() => setShowPass(!showPass)} className="text-slate-400 hover:text-slate-600">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-600 ring-1 ring-red-100">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="agua-btn agua-btn-primary w-full mt-1">
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <button type="button" onClick={onGoRegister} className="font-semibold text-accent2 hover:underline">
          Create an account
        </button>
      </p>
    </AuthShell>
  );
}

import { useState } from 'react';
import { apiLogin } from '../api';
import {
  Eye,
  EyeOff,
  User,
  Lock,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import AuthShell from '../components/AuthShell';

export default function LoginPage({ onLogin, onGoRegister, onGoLanding }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiLogin(username.trim(), password);
      if (result.success) onLogin(result.user);
      else setError(result.message || 'Invalid credentials');
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      badge="Secure sign-in"
      title="Welcome back"
      subtitle="Sign in to manage orders, deliveries, inventory, and your AguaDoc account."
    >
      {onGoLanding && (
        <button
          type="button"
          onClick={onGoLanding}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-accent2"
        >
          <ArrowLeft size={13} /> Back to home
        </button>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-ink">
            Username or email
          </label>
          <div
            className={`flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 transition ${
              focused === 'user'
                ? 'border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.14)]'
                : 'border-slate-200/90 hover:border-slate-300'
            }`}
          >
            <User size={16} className={focused === 'user' ? 'text-blue-500' : 'text-slate-400'} />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocused('user')}
              onBlur={() => setFocused('')}
              placeholder="e.g. admin"
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              autoComplete="username"
              autoFocus
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-[12px] font-semibold text-ink">Password</label>
          </div>
          <div
            className={`flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 transition ${
              focused === 'pass'
                ? 'border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.14)]'
                : 'border-slate-200/90 hover:border-slate-300'
            }`}
          >
            <Lock size={16} className={focused === 'pass' ? 'text-blue-500' : 'text-slate-400'} />
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused('pass')}
              onBlur={() => setFocused('')}
              placeholder="Enter your password"
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[12.5px] font-medium text-red-600"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.32)] transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition duration-700 group-hover:translate-x-full" />
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-5 text-center">
        <p className="text-sm text-muted">
          New to AguaDoc?{' '}
          <button
            type="button"
            onClick={onGoRegister}
            className="font-semibold text-[#2563EB] transition hover:underline"
          >
            Create an account
          </button>
        </p>
      </div>
    </AuthShell>
  );
}

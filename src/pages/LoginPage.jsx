import { useState } from 'react';
import { apiLogin } from '../api';
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Droplets,
} from 'lucide-react';
import BrandMark from '../components/BrandMark';

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
    <div className="relative min-h-dvh overflow-hidden bg-[#06101c] text-white">
      {/* Full-bleed water plane */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 15% 10%, rgba(14,165,233,0.35), transparent 55%), radial-gradient(ellipse 70% 55% at 88% 85%, rgba(37,99,235,0.28), transparent 50%), linear-gradient(165deg, #04101c 0%, #0a2744 42%, #0c3d5c 72%, #071826 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(125,211,252,0.18) 0 1.5px, transparent 2px), radial-gradient(circle at 70% 60%, rgba(186,230,253,0.12) 0 1px, transparent 2px)',
          backgroundSize: '72px 72px, 44px 44px',
          animation: 'agua-float 14s ease-in-out infinite',
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-1/4 h-[28rem] w-[28rem] rounded-full bg-cyan-400/20 blur-[100px]" style={{ animation: 'agua-float 9s ease-in-out infinite' }} />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[32rem] w-[32rem] rounded-full bg-blue-500/25 blur-[110px]" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 opacity-50"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(8,47,73,0.55) 55%, rgba(2,20,35,0.85) 100%)',
        }}
      />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-6 sm:px-8 sm:py-8 lg:justify-center">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between gap-3 lg:mb-10">
          <BrandMark light size="md" className="!max-w-[168px] drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]" />
          {onGoLanding && (
            <button
              type="button"
              onClick={onGoLanding}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={14} /> Home
            </button>
          )}
        </div>

        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          {/* Brand hero — first viewport signal */}
          <section className="max-w-xl agua-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/90">
              <Droplets size={14} className="text-sky-300" />
              Lapu-Lapu · Water station
            </p>
            <h1 className="font-display text-[2.75rem] font-bold leading-[1.02] tracking-tight text-white sm:text-5xl lg:text-[3.35rem]">
              AguaDoc
            </h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-sky-100/75 sm:text-lg">
              Sign in to request refills, track riders, and keep clean water moving to your door.
            </p>

            <div className="mt-8 hidden h-px w-24 bg-gradient-to-r from-sky-300/80 to-transparent lg:block" />
            <p className="mt-6 hidden max-w-sm text-sm leading-relaxed text-white/45 lg:block">
              Station staff, riders, and customers each land in the right workspace after sign-in.
            </p>
          </section>

          {/* Sign-in interaction surface */}
          <section className="agua-fade-up-delay w-full max-w-md justify-self-end lg:justify-self-stretch">
            <form
              onSubmit={handleSubmit}
              className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-white/[0.07] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-7"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(125,211,252,0.55), transparent)' }}
              />

              <div className="mb-6">
                <h2 className="font-display text-xl font-bold tracking-tight text-white">Sign in</h2>
                <p className="mt-1 text-sm text-white/50">Use your AguaDoc username or email.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="login-user" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-200/70">
                    Username or email
                  </label>
                  <input
                    id="login-user"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocused('user')}
                    onBlur={() => setFocused('')}
                    placeholder="e.g. admin"
                    autoComplete="username"
                    autoFocus
                    className={`w-full rounded-2xl border bg-white/[0.06] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/30 ${
                      focused === 'user'
                        ? 'border-sky-400/70 shadow-[0_0_0_4px_rgba(56,189,248,0.18)]'
                        : 'border-white/12 hover:border-white/25'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="login-pass" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-200/70">
                    Password
                  </label>
                  <div
                    className={`flex items-center gap-2 rounded-2xl border bg-white/[0.06] px-4 py-1 transition ${
                      focused === 'pass'
                        ? 'border-sky-400/70 shadow-[0_0_0_4px_rgba(56,189,248,0.18)]'
                        : 'border-white/12 hover:border-white/25'
                    }`}
                  >
                    <input
                      id="login-pass"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocused('pass')}
                      onBlur={() => setFocused('')}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="rounded-xl p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-100"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-400 to-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(14,165,233,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition duration-700 group-hover:translate-x-full" />
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>

              <p className="mt-6 text-center text-sm text-white/45">
                New here?{' '}
                <button
                  type="button"
                  onClick={onGoRegister}
                  className="font-semibold text-sky-300 transition hover:text-sky-200 hover:underline"
                >
                  Create an account
                </button>
              </p>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

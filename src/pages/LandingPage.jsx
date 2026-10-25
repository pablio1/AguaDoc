import { useEffect, useState } from 'react';
import { ArrowRight, Droplets, MapPinned, Bike, Clock, ShieldCheck, Smartphone } from 'lucide-react';
import BrandMark from '../components/BrandMark';

const STEPS = [
  {
    n: '01',
    title: 'Request a refill',
    copy: 'Choose delivery or walk-in, set gallons, and pin your drop-off on the map.',
  },
  {
    n: '02',
    title: 'We assign a rider',
    copy: 'Staff schedules the run. Your rider gets the stop with live navigation.',
  },
  {
    n: '03',
    title: 'Track to your door',
    copy: 'Follow the rider on a live map when your order is out for delivery.',
  },
];

const SERVICES = [
  {
    icon: Droplets,
    title: 'Gallon delivery',
    copy: 'Fresh refill water brought to your address across Lapu-Lapu City.',
  },
  {
    icon: MapPinned,
    title: 'Live rider map',
    copy: 'See where your delivery is in real time once it leaves the station.',
  },
  {
    icon: Smartphone,
    title: 'Pay your way',
    copy: 'GCash, Maya, or cash on delivery — pick what works for you.',
  },
  {
    icon: Clock,
    title: 'Walk-in pickup',
    copy: 'Prefer the station? Order ahead and pay when you arrive.',
  },
];

export default function LandingPage({ onLogin, onRegister }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Nav */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition ${
          scrolled
            ? 'border-b border-white/10 bg-navy/90 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandMark light size="sm" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onLogin}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:px-4"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="agua-btn agua-btn-primary !py-2 !text-xs sm:!text-sm"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      {/* Hero — one composition, brand first, full-bleed atmosphere */}
      <section className="agua-dark-mesh relative min-h-dvh overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="pointer-events-none absolute -right-20 top-24 h-[28rem] w-[28rem] rounded-full bg-cyan-400/20 blur-3xl agua-float" />
        <div className="pointer-events-none absolute -left-16 bottom-10 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl" />

        <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col justify-center px-5 pb-20 pt-28 sm:px-8">
          <div className="agua-fade-up max-w-2xl">
            <p className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl md:text-7xl">
              AguaDoc
            </p>
            <h1 className="mt-5 max-w-xl font-display text-2xl font-semibold leading-snug tracking-tight text-white/90 sm:text-3xl">
              Clean water, delivered on time.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/55 sm:text-lg">
              Smart refill ordering and live delivery tracking for Lapu-Lapu City.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onRegister} className="agua-btn agua-btn-primary">
                Create account
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={onLogin}
                className="agua-btn border border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Sign in
              </button>
            </div>
          </div>

          {/* Dominant visual plane — abstract water route, not a card collage */}
          <div className="agua-fade-up-delay pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] lg:block">
            <div className="absolute inset-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-sm">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(34,211,238,0.25),transparent_55%)]" />
              <svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 400 560" fill="none" aria-hidden>
                <path
                  d="M60 480 C120 400, 90 320, 160 280 S280 220, 250 140 S180 60, 320 40"
                  stroke="url(#route)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="8 10"
                  className="agua-dash"
                />
                <circle cx="60" cy="480" r="10" fill="#22d3ee" />
                <circle cx="250" cy="140" r="8" fill="#fff" fillOpacity="0.9" />
                <circle cx="320" cy="40" r="14" fill="#12b8c9" />
                <defs>
                  <linearGradient id="route" x1="60" y1="480" x2="320" y2="40">
                    <stop stopColor="#22d3ee" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0.5" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Live route</p>
                  <p className="mt-1 font-display text-xl font-bold text-white">Station → your door</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-600 text-xl shadow-lg shadow-cyan-500/40">
                  🛵
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-medium tracking-wide text-white/35">
          Scroll to explore
        </div>
      </section>

      {/* How it works — one job */}
      <section className="agua-mesh border-t border-slate-200/60 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent2">How it works</p>
          <h2 className="mt-2 max-w-lg font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Three steps from thirsty to delivered.
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="relative">
                <p className="font-display text-4xl font-extrabold text-cyan-200/80">{step.n}</p>
                <h3 className="mt-3 font-display text-xl font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services — one job */}
      <section className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent2">Services</p>
          <h2 className="mt-2 max-w-xl font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Built for everyday refill runs.
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {SERVICES.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-slate-100 bg-foam/50 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-600 text-white shadow-md shadow-cyan-500/25">
                  <Icon size={18} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coverage / trust — one job */}
      <section className="agua-dark-mesh px-5 py-20 text-white sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Coverage</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Serving Lapu-Lapu City households & shops.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">
              From Basak to Calawisan and nearby barangays — pin your location so riders find you faster.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-white/70">
              <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-300" /> Secure online checkout</li>
              <li className="flex items-center gap-2"><Bike size={16} className="text-cyan-300" /> Assigned delivery riders</li>
              <li className="flex items-center gap-2"><MapPinned size={16} className="text-cyan-300" /> Map-pin drop-offs</li>
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <p className="font-display text-5xl font-extrabold text-cyan-200">💧</p>
            <p className="mt-4 font-display text-2xl font-bold leading-snug">
              Order today.<br />Track every stop.
            </p>
            <p className="mt-3 text-sm text-white/50">
              Customers, riders, and staff share one live system — no more guessing ETAs.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="agua-mesh px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Ready for your next refill?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">
            Create a free account to request delivery, or sign in if you already have one.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={onRegister} className="agua-btn agua-btn-primary">
              Get started
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="agua-btn border border-slate-200 bg-white text-ink hover:bg-foam"
            >
              Sign in
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/70 bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <BrandMark size="sm" />
          <p className="text-xs text-muted">© {new Date().getFullYear()} AguaDoc · Lapu-Lapu City, Cebu</p>
        </div>
      </footer>

      <style>{`
        @keyframes agua-dash-move {
          to { stroke-dashoffset: -120; }
        }
        .agua-dash {
          animation: agua-dash-move 8s linear infinite;
        }
      `}</style>
    </div>
  );
}

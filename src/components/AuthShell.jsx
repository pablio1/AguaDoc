import BrandMark from './BrandMark';

export default function AuthShell({ children, title, subtitle }) {
  return (
    <div className="agua-mesh relative min-h-dvh overflow-hidden">
      {/* Soft atmospheric shapes */}
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl agua-float" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand stage */}
        <section className="relative hidden flex-col justify-between p-10 text-white lg:flex">
          <div className="agua-dark-mesh absolute inset-4 overflow-hidden rounded-[2rem] shadow-2xl shadow-slate-900/20">
            <div className="absolute inset-0 opacity-40" style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0 1px, transparent 1px), radial-gradient(circle at 80% 40%, rgba(255,255,255,0.08) 0 1px, transparent 1px)',
              backgroundSize: '28px 28px, 42px 42px',
            }} />
            <div className="relative flex h-full flex-col justify-between p-10">
              <BrandMark light size="lg" />

              <div className="agua-fade-up max-w-md">
                <p className="font-display text-4xl font-bold leading-[1.1] tracking-tight">
                  Clean water,<br />on time, every time.
                </p>
                <p className="mt-4 text-sm leading-relaxed text-white/65">
                  Order refills, track riders live, and manage deliveries across Lapu-Lapu — all in one place.
                </p>
              </div>

              <div className="agua-fade-up-delay flex gap-6 text-xs text-white/50">
                <div>
                  <p className="font-display text-2xl font-bold text-cyan-200">Live</p>
                  <p>Rider tracking</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-bold text-cyan-200">Fast</p>
                  <p>Same-day delivery</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-bold text-cyan-200">Secure</p>
                  <p>GCash / Maya</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Form stage */}
        <section className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="agua-panel agua-fade-up w-full max-w-md rounded-[1.75rem] px-6 py-8 sm:px-8">
            <div className="mb-7 lg:hidden">
              <BrandMark size="md" />
            </div>
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

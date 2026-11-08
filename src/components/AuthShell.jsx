import BrandMark from './BrandMark';
import { Droplets, MapPinned, ShieldCheck } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: MapPinned, title: 'Live tracking', copy: 'Follow your rider in real time' },
  { icon: Droplets, title: 'Same-day refill', copy: 'Delivery across Lapu-Lapu' },
  { icon: ShieldCheck, title: 'Secure pay', copy: 'GCash, Maya, or COD' },
];

export default function AuthShell({
  children,
  title,
  subtitle,
  badge = 'Station access',
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#EEF3F8]">
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 10% -10%, rgba(59,130,246,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(14,165,233,0.12), transparent 50%), linear-gradient(180deg, #F7FAFC 0%, #E8EFF6 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(15,23,42,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl agua-float" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl" />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.08fr_0.92fr]">
        {/* Brand stage */}
        <section className="relative hidden flex-col justify-between p-8 text-white lg:flex xl:p-10">
          <div className="agua-dark-mesh relative flex h-full flex-col overflow-hidden rounded-[2rem] shadow-[0_32px_80px_rgba(15,23,42,0.35)]">
            {/* Soft wave bands */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 opacity-90"
              style={{
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(37,99,235,0.18) 40%, rgba(14,165,233,0.22) 100%)',
              }}
            />
            <div
              className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-[120%] opacity-40"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(56,189,248,0.45), transparent 65%)',
                animation: 'agua-float 8s ease-in-out infinite',
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 18% 22%, rgba(255,255,255,0.14) 0 1px, transparent 1px), radial-gradient(circle at 78% 48%, rgba(255,255,255,0.08) 0 1px, transparent 1px)',
                backgroundSize: '26px 26px, 40px 40px',
              }}
            />

            <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
              <div className="agua-fade-up">
                <BrandMark light size="lg" className="!max-w-[280px]" />
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/90">
                  Water Refilling Station Manager
                </p>
              </div>

              <div className="agua-fade-up max-w-lg">
                <h2 className="font-display text-[2.65rem] font-bold leading-[1.08] tracking-tight xl:text-5xl">
                  Clean water,
                  <br />
                  <span className="bg-gradient-to-r from-sky-200 to-blue-300 bg-clip-text text-transparent">
                    delivered with care.
                  </span>
                </h2>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
                  Sign in to dispatch orders, track riders, manage inventory, and keep every gallon moving.
                </p>
              </div>

              <div className="agua-fade-up-delay grid gap-3">
                {HIGHLIGHTS.map(({ icon: Icon, title: hTitle, copy }) => (
                  <div
                    key={hTitle}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-3 backdrop-blur-sm"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300">
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{hTitle}</p>
                      <p className="text-[12px] text-white/50">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Form stage */}
        <section className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="agua-fade-up w-full max-w-[420px]">
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <BrandMark size="md" className="!max-w-[180px]" />
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/95 shadow-[0_24px_64px_rgba(15,23,42,0.1)] backdrop-blur-sm">
              <div className="h-1 w-full bg-gradient-to-r from-sky-400 via-blue-500 to-blue-700" />
              <div className="px-6 py-8 sm:px-8">
                <div className="mb-6">
                  <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-700 ring-1 ring-sky-100">
                    {badge}
                  </span>
                  <h1 className="mt-3 font-display text-[1.75rem] font-bold tracking-tight text-ink">
                    {title}
                  </h1>
                  {subtitle ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>
                  ) : null}
                </div>
                {children}
              </div>
            </div>

            <p className="mt-5 text-center text-[11px] font-medium tracking-wide text-slate-400">
              AquaDoc Water Refilling Station · Lapu-Lapu City
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

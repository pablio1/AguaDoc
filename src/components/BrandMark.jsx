export default function BrandMark({ size = 'md', light = false }) {
  const box =
    size === 'lg'
      ? 'h-14 w-14 rounded-2xl text-2xl'
      : size === 'sm'
        ? 'h-9 w-9 rounded-xl text-base'
        : 'h-11 w-11 rounded-2xl text-lg';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${box} flex items-center justify-center bg-gradient-to-br from-cyan-400 to-teal-600 text-white shadow-lg shadow-cyan-500/30`}
      >
        💧
      </div>
      <div className="min-w-0">
        <p className={`font-display font-bold tracking-tight leading-none ${light ? 'text-white' : 'text-ink'} ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>
          AguaDoc
        </p>
        {size !== 'sm' && (
          <p className={`mt-1 text-[11px] font-medium ${light ? 'text-white/55' : 'text-muted'}`}>
            Smart water delivery
          </p>
        )}
      </div>
    </div>
  );
}

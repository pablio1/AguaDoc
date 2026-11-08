export default function FilterPills({ options, value, onChange, className = '' }) {
  return (
    <div className={`-mx-1 mb-4 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      <div className="flex w-max min-w-full gap-2 sm:flex-wrap sm:w-auto">
        {options.map((opt) => {
          const key = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition
                ${
                  active
                    ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-muted hover:border-slate-300 hover:text-ink'
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterPills({ options, value, onChange, className = '' }) {
  return (
    <div className={`mb-4 flex flex-wrap gap-2 ${className}`}>
      {options.map((opt) => {
        const key = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition
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
  );
}

/** Centered empty placeholder — icon, title, optional description and action. */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      {Icon ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      ) : null}
      <p className={`text-sm font-semibold text-ink ${Icon ? 'mt-3' : ''}`}>{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

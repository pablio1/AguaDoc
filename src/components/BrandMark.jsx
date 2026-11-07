const SIZE = {
  sm: { className: 'h-10 w-auto max-w-[148px]', alt: true },
  md: { className: 'h-14 w-auto max-w-[180px]', alt: true },
  lg: { className: 'h-[5.5rem] w-auto max-w-[240px]', alt: true },
};

/**
 * AquaDoc logo — transparent PNG, no white/colored plate behind it.
 * The artwork already includes the AquaDoc wordmark.
 */
export default function BrandMark({ size = 'md', light = false, iconOnly = false, className = '' }) {
  const cfg = SIZE[size] || SIZE.md;

  if (iconOnly) {
    const box =
      size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
    return (
      <img
        src="/aguadoc-icon.png?v=20261108"
        alt="AquaDoc"
        className={`${box} object-contain ${className}`}
        draggable={false}
      />
    );
  }

  return (
    <img
      src="/aguadoc-logo-ui.png?v=20261108"
      alt="AquaDoc Water Refilling Station"
      className={`${cfg.className} object-contain object-left ${className}`}
      draggable={false}
    />
  );
}

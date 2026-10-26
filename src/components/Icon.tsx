/** Material Symbols icon, e.g. <Icon name="settings" />. */
export default function Icon({ name, size, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: size } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

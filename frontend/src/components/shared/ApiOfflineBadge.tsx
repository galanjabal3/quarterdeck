interface ApiOfflineBadgeProps {
  /** Pesan error backend — ditampilkan sebagai tooltip saat hover. */
  error?: string | null;
  /** Kelas tambahan untuk penempatan lokal (mis. `ml-1` di StorageOptimizer). */
  className?: string;
}

/**
 * Badge merah "API OFFLINE" bersama untuk panel Casual.
 * Render `null` bila tidak ada error — pemanggil tak perlu cek sendiri.
 */
export default function ApiOfflineBadge({ error, className = '' }: ApiOfflineBadgeProps) {
  if (!error) return null;

  const classes = [
    'px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} title={error}>
      API OFFLINE
    </span>
  );
}

import Image from 'next/image';

/**
 * Brand logo: the circular Mauri-Dev badge on its own dark disc (so it reads
 * cleanly in both light and dark themes) followed by the "Mauri-Dev" wordmark.
 * The badge image already carries the mark; the disc + ring keep it crisp on
 * light backgrounds where the artwork's black field would otherwise clash.
 */
export function Logo({
  wordmark = true,
  size = 40,
}: {
  wordmark?: boolean;
  size?: number;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#050509] shadow-gold ring-1 ring-gold/40"
        style={{ height: size, width: size }}
      >
        <Image
          src="/mauri-dev.jpeg"
          alt="Mauri-Dev logo"
          width={size}
          height={size}
          priority
          className="h-full w-full object-cover"
        />
      </span>
      {wordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          Mauri<span className="gold-text">-Dev</span>
        </span>
      )}
    </span>
  );
}

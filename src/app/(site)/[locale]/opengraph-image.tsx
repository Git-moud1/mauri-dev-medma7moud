import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LOCALES, type Locale } from '@/i18n/config';
import { isLocale, dirFor } from '@/i18n/locale';
import { dictionaries } from '@/i18n/dictionaries';
import { SITE, SITE_URL } from '@/lib/site';

/**
 * The card every share link renders — one per locale, in that locale's own
 * words and reading direction.
 *
 * Both locale routes are statically prerendered, so these PNGs are produced at
 * build time and served from the CDN; nothing here runs per request.
 *
 * This is the only implementation. `twitter-image.tsx`, and both files under
 * `projects/`, re-export it — a page that declares its own `openGraph` block
 * loses the parent's image entries with it, so each such page needs the
 * convention present in its own folder.
 */
export const contentType = 'image/png';

export const size = { width: 1200, height: 630 };

/**
 * Read once at module scope, as the docs call for: the files never change
 * between renders, so re-reading them per image is pure build-time cost.
 *
 * Satori cannot parse woff2, which is all `public/fonts` holds — see
 * `assets/fonts/README.md` for why these TrueType copies exist.
 */
const [tajawalBold, playfairBold, logo] = await Promise.all([
  readFile(join(process.cwd(), 'assets/fonts/Tajawal-Bold.ttf')),
  readFile(join(process.cwd(), 'assets/fonts/PlayfairDisplay-Bold.ttf')),
  readFile(join(process.cwd(), 'src/app/icon.png')),
]);

const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

/** The dark palette from `globals.css`, which this card is a still frame of. */
const COLORS = {
  bg: '#0B0C10',
  fg: '#EDEFF6',
  muted: '#9AA0B2',
  brand1: '#A78BFA',
  brand3: '#60A5FA',
};

/**
 * One card per locale, each with its own `alt`.
 *
 * `generateImageMetadata` rather than a bare `alt` export: `alt` is static per
 * file, and a single English sentence describing an Arabic card is exactly the
 * kind of detail that makes a site read as translated rather than written.
 */
export function generateImageMetadata({ params }: { params: { locale: string } }) {
  const locale = isLocale(params.locale) ? params.locale : LOCALES[0];
  const dict = dictionaries[locale];

  return [
    {
      id: locale,
      size,
      contentType,
      alt: dict.meta.title,
    },
  ];
}

/**
 * One headline line, laid out a word at a time.
 *
 * Satori does not implement the bidirectional algorithm. It shapes each Arabic
 * word correctly — the letters join — but then places the words left to right,
 * so `تُنمّي الأعمال` came out reading `الأعمال تُنمّي`, which is the sentence
 * backwards. Setting `direction: 'rtl'` changes nothing; it is not implemented
 * either. Both were rendered and looked at, not assumed.
 *
 * So word order is expressed as layout instead of left to the text engine: one
 * span per word in a `row-reverse` flex row. The words are laid out from the
 * right, which is the result the bidi algorithm would have produced, and a
 * latin token inside an Arabic line (a product name, a number) keeps its own
 * shape rather than being reversed with everything else.
 */
function Line(props: {
  text: string;
  rtl: boolean;
  gap: number;
  style?: React.CSSProperties;
  wordStyle?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: props.rtl ? 'row-reverse' : 'row',
        justifyContent: 'flex-start',
        alignItems: 'baseline',
        gap: props.gap,
        ...props.style,
      }}
    >
      {props.text.split(/\s+/).map((word, index) => (
        <span key={index} style={props.wordStyle}>
          {word}
        </span>
      ))}
    </div>
  );
}

export default async function Image(props: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await props.params;
  const locale: Locale = isLocale(raw) ? raw : LOCALES[0];
  const dict = dictionaries[locale];
  const rtl = dirFor(locale) === 'rtl';

  // Arabic sets its own face for everything; the latin locales pair the site's
  // display serif for the headline with Tajawal's latin for the small text,
  // which is the closest match available without vendoring a third file.
  const headlineFont = rtl ? 'Tajawal' : 'Playfair Display';
  const headlineSize = rtl ? 62 : 60;
  /**
   * The word gap is the space character the layout replaced, so it has to be
   * the width that face's space actually is. Tajawal's Arabic glyphs carry wide
   * side bearings of their own; at the latin value the words drifted apart far
   * enough to read as separate phrases.
   */
  const wordGap = headlineSize * (rtl ? 0.12 : 0.26);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        backgroundColor: COLORS.bg,
        // The hero's one light source, flattened into the card.
        backgroundImage: `radial-gradient(circle at 12% 8%, rgba(139,92,246,0.40), transparent 45%), radial-gradient(circle at 92% 96%, rgba(59,130,246,0.32), transparent 45%)`,
        fontFamily: 'Tajawal',
        color: COLORS.fg,
      }}
    >
      {/*
          Brand lockup: the same mark as the tab icon, beside the wordmark.
          `row-reverse` on the Arabic card for the same reason the headline uses
          it — the card is mirrored by layout, since `direction` does nothing.
        */}
      <div
        style={{
          display: 'flex',
          flexDirection: rtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 22,
        }}
      >
        {/*
            Satori renders a fixed-size PNG from a subset of HTML and knows
            nothing about `next/image` — there is no runtime here to swap in a
            srcset, and the source is an inline data URI. The rule's advice does
            not apply to this file.
          */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={84}
          height={84}
          style={{ borderRadius: 22, border: '1px solid rgba(167,139,250,0.35)' }}
          alt=""
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: -0.5 }}>
            {SITE.name}
          </div>
          <div style={{ fontSize: 20, color: COLORS.muted, letterSpacing: 3 }}>
            {SITE.tagline.toUpperCase()}
          </div>
        </div>
      </div>

      {/*
          The site's real headline, not a slogan written for the card. Whoever
          clicks through lands on the same sentence they were shown.
        */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontFamily: headlineFont,
          fontSize: headlineSize,
          lineHeight: 1.3,
          letterSpacing: rtl ? 0 : -1.5,
          /*
              The cap keeps the longest latin line off the right edge. Arabic
              takes none: its lines are laid out from the right, so a narrower
              box would inset them from the edge the lockup and the footer align
              to, and the card would look like three columns instead of one.

              Spread rather than `rtl ? undefined : 1010` — satori trims every
              style value it is handed, so an explicit `undefined` throws
              "Cannot read properties of undefined (reading 'trim')" and the
              route 500s. The property has to be absent, not empty.
            */
          ...(rtl ? {} : { maxWidth: 1010 }),
        }}
      >
        {/*
            One line per dictionary field rather than one wrapped paragraph. The
            three fields are already the three lines the hero breaks the sentence
            into, and fixed breaks mean no locale can wrap into a shape nobody
            has looked at.
          */}
        <Line text={dict.hero.titleLine1} rtl={rtl} gap={wordGap} />
        <Line
          text={dict.hero.titleHighlight}
          rtl={rtl}
          gap={wordGap}
          /*
              The gradient is per word, not per line: `background-clip: text` on a
              flex parent clips against that parent's own box, and the words are
              children of it, so a line-wide gradient leaves them transparent on
              transparent. Each word carrying the full ramp is the version that
              renders.
            */
          wordStyle={{
            backgroundImage: `linear-gradient(90deg, ${COLORS.brand1}, ${COLORS.brand3})`,
            backgroundClip: 'text',
            color: 'transparent',
          }}
        />
        <Line text={dict.hero.titleLine2} rtl={rtl} gap={wordGap} />
      </div>

      {/* Role on the reading side, origin on the far side. */}
      <div
        style={{
          display: 'flex',
          flexDirection: rtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 26,
          color: COLORS.muted,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 6,
              height: 34,
              borderRadius: 3,
              backgroundImage: `linear-gradient(180deg, ${COLORS.brand1}, ${COLORS.brand3})`,
            }}
          />
          {/*
              The role, from the About section's own heading rather than from
              `SITE.roleKey` — that one is english-only, and this card is not.
            */}
          <Line
            text={`${dict.about.title} ${dict.about.titleStrong}`}
            rtl={rtl}
            gap={rtl ? 4 : 8}
          />
        </div>
        <span>{new URL(SITE_URL).host}</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Tajawal', data: tajawalBold, style: 'normal', weight: 700 },
        { name: 'Playfair Display', data: playfairBold, style: 'normal', weight: 700 },
      ],
    },
  );
}

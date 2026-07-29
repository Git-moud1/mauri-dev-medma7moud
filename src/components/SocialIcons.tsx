import type { ComponentType, SVGProps } from 'react';
import { MailIcon, WhatsAppIcon } from './Icons';
import type { SocialKey } from '@/lib/social';

/**
 * Brand marks, kept apart from `Icons.tsx` for two reasons.
 *
 * Mechanically: `Icons.tsx` wraps a stroke-based `Base` (fill none, 1.75
 * stroke) and these are solid single-path fills, so they cannot share it.
 * Editorially: a brand mark is someone else's trademark drawn to their spec,
 * not a house icon to restyle — keeping them in one file keeps the provenance
 * note below attached to all of them.
 *
 * Source: Simple Icons (https://simpleicons.org), CC0 1.0 Universal. Only the
 * paths actually rendered are vendored — no dependency, no icon-font request,
 * and named exports so unused marks tree-shake out of the bundle.
 *
 * WhatsApp and Mail are deliberately absent: `Icons.tsx` already exports both
 * and the site has been rendering them since before this file existed.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Brand({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LinkedInIcon = (p: IconProps) => (
  <Brand {...p}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </Brand>
);

export const GitHubIcon = (p: IconProps) => (
  <Brand {...p}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </Brand>
);

/**
 * The one mark not taken verbatim from Simple Icons.
 *
 * Instagram's official path is 1,489 bytes — the squircle corners alone are
 * most of it, and they are invisible at the 20px these render at. This is the
 * same camera glyph reduced to plain 5px/3px corner arcs, which holds the
 * 1 KB budget at 264 bytes and is indistinguishable at tile size.
 */
export const InstagramIcon = (p: IconProps) => (
  <Brand {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.25-9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"
    />
  </Brand>
);

export const FacebookIcon = (p: IconProps) => (
  <Brand {...p}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </Brand>
);

export const TikTokIcon = (p: IconProps) => (
  <Brand {...p}>
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </Brand>
);

export const XIcon = (p: IconProps) => (
  <Brand {...p}>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </Brand>
);

/**
 * Key to mark, so the admin form and the public blocks both render a platform
 * from its registry entry alone and neither carries a switch on the key.
 *
 * A `Record<SocialKey, …>` rather than a lookup that can miss: adding a
 * platform to the registry without drawing its mark is a type error here, not
 * a blank tile discovered on the deployed site.
 */
export const SOCIAL_ICONS: Record<SocialKey, ComponentType<IconProps>> = {
  whatsapp: WhatsAppIcon,
  email: MailIcon,
  linkedin: LinkedInIcon,
  github: GitHubIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  x: XIcon,
};

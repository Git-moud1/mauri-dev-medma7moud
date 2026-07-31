/**
 * The same card as `/[locale]`, re-exported so this page has one at all.
 *
 * The convention does not reach here on its own. A page that declares an
 * `openGraph` block replaces its layout's entirely — image entries included —
 * and this page has to declare one, because otherwise it announces itself under
 * the homepage's title. Without this file `/[locale]/projects` went out with
 * `og:title` and no `og:image`, which is the bare share link the brief set out
 * to fix; `tests/seo.spec.ts` is what caught it.
 */
export { default, size, contentType, generateImageMetadata } from '../opengraph-image';

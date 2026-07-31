/**
 * The Twitter card is the Open Graph card. Same size, same content, one source.
 *
 * A separate file is still needed: Next emits `twitter:image` from this
 * convention only, and X falls back to `og:image` inconsistently depending on
 * which card type it resolves. Re-exporting keeps the two from drifting.
 */
export { default, size, contentType, generateImageMetadata } from './opengraph-image';

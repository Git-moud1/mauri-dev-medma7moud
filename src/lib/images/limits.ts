/**
 * The upload size ceiling, in its own module because the client bundle needs it.
 *
 * `process.ts` imports sharp at module scope, so a client component importing
 * this constant from there would drag a native image library into the browser.
 * `store.ts` exists for the same reason.
 *
 * ## The number is dictated by Netlify, not by taste
 *
 * A synchronous function's buffered request is capped at 6 MB, and binary
 * bodies are base64-encoded on the way in — roughly 33% overhead — which puts
 * the real ceiling near 4.5 MB of actual file. The previous 5 MB was therefore
 * never deliverable: measured on deploy-preview-1, a 3.41 MB JPEG returned
 * `502 {"errorMessage":"An unknown error has occurred"}` and a 17.3 MB one
 * returned `413`, both *before* the Server Action ran, so neither could report
 * itself. 3.5 MB of image leaves room for the base64 expansion, the multipart
 * framing and the Server Action's own payload.
 *
 * Next's `serverActions.bodySizeLimit` must stay above this or it rejects
 * first, with a 413 the action never sees. See next.config.mjs.
 */
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

/** The same number as it appears in UI copy and error messages. */
export const MAX_UPLOAD_LABEL = '3.5 MB';

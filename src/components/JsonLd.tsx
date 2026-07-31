/**
 * Renders a structured-data graph into the document.
 *
 * `dangerouslySetInnerHTML` is the documented way to emit `ld+json` from React:
 * a plain child would be escaped, and `&quot;` inside a JSON payload is invalid
 * JSON, so the block would be silently ignored by every consumer.
 *
 * The replace below is the injection guard. The payload is built from the
 * owner's own settings and dictionaries, but a project title typed into the
 * admin does reach this string, and a closing script tag inside it would end
 * the block early and put the rest of the title into the document as markup.
 * Rewriting every `<` as its JSON unicode escape keeps the payload byte-safe
 * and parses back to exactly the same object.
 *
 * The site's CSP carries `script-src 'self' 'unsafe-inline'` — see the note in
 * next.config.mjs for why — so this inline block is served as-is. A future move
 * to nonces has to cover this tag too, or the graph disappears.
 */
export function JsonLd({ graph }: { graph: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, '\\u003c'),
      }}
    />
  );
}

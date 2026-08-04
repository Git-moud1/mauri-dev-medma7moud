'use client';

import { useLayoutEffect } from 'react';
import { applyTheme, resolveTheme } from './theme';

/**
 * Re-applies the theme to <html> on every mount of the `[locale]` layout,
 * before the browser paints. Renders nothing.
 *
 * --- Why this has to exist ---
 *
 * <html> lives inside the dynamic `[locale]` segment, and Next keys each route
 * segment by its value — so `/ar` → `/fr` unmounts and remounts the whole
 * layout subtree. <html>, <head> and <body> are React singletons: on remount
 * React runs `acquireSingletonInstance`, which strips EVERY attribute from the
 * element and then re-applies only the props the layout renders:
 *
 *     for (attrs = instance.attributes; attrs.length; )
 *       instance.removeAttributeNode(attrs[0]);
 *     setInitialProperties(instance, type, props);
 *
 * `class="dark"` and `style="color-scheme:dark"` are written by the no-flash
 * script, not by React, so they are not among those props and they are gone.
 * The no-flash script does not run again either — <head> is acquired as a
 * singleton too and keeps its existing children, so the inline <script> node is
 * never re-inserted. Net effect before this component existed: a dark visitor
 * silently flipped to light on their first locale switch and stayed there.
 *
 * `useLayoutEffect` rather than `useEffect` is the whole point. React's commit
 * runs the mutation phase for the entire tree (where the attributes are
 * stripped) and only then the layout effects, all before the browser paints. So
 * the strip and this re-apply land in the same frame and there is no flash. A
 * passive effect would run after paint and the flash would be visible.
 *
 * The value comes from `resolveTheme()` — storage, then OS preference — never
 * from the `dark` class, because by the time this runs that class has just been
 * deleted.
 *
 * This is not a replacement for the no-flash script: that one still owns the
 * very first paint, before React exists. This owns every subsequent remount.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(resolveTheme());
  });

  return null;
}

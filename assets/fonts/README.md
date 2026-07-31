# Fonts vendored for `ImageResponse`

These two `.ttf` files exist only for the Open Graph card
(`src/app/(site)/[locale]/opengraph-image.tsx`). They are **not** served to the
browser — the site's own faces are loaded by `next/font` and by the self-hosted
woff2 files in `public/fonts`.

Satori, the renderer behind `ImageResponse`, cannot read woff2, which is the
only format `public/fonts` holds. Hence a second copy in TrueType, kept outside
`public/` so it is never shipped as a page asset.

| File                       | Family               | Used for                                                |
| -------------------------- | -------------------- | ------------------------------------------------------- |
| `Tajawal-Bold.ttf`         | Tajawal 700          | The Arabic card, and the small Latin text on every card |
| `PlayfairDisplay-Bold.ttf` | Playfair Display 700 | The headline on the `en` and `fr` cards                 |

Both are licensed under the SIL Open Font License 1.1, which permits bundling
and redistribution. Downloaded from the Google Fonts static endpoints:

- `https://fonts.gstatic.com/s/tajawal/v12/Iurf6YBj_oCad4k1l4qkLrY.ttf`
- `https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf`

// Resolves named photos to processed JPEG buffers.
// Sources: TheMealDB (real dish photography), Unsplash (free license), and
// DummyJSON (real product catalog photography + data) for the store screens.
import sharp from 'sharp';

const cache = new Map();
async function dl(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const b = Buffer.from(await r.arrayBuffer());
  cache.set(url, b);
  return b;
}

// Resolve TheMealDB thumb URLs by name substring (deterministic).
let mealIndex = null;
async function meals() {
  if (mealIndex) return mealIndex;
  mealIndex = {};
  for (const q of ['pizza']) {
    const j = await (
      await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${q}`)
    ).json();
    for (const m of j.meals || []) mealIndex[m.strMeal] = m.strMealThumb;
  }
  return mealIndex;
}
async function mealThumb(nameSub) {
  const idx = await meals();
  const key = Object.keys(idx).find((k) =>
    k.toLowerCase().includes(nameSub.toLowerCase()),
  );
  if (!key) throw new Error(`meal not found: ${nameSub}`);
  return idx[key];
}
const uns = (id, w = 900, h = 900) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=75`;

// Resolve a DummyJSON product thumbnail by category + title substring.
const djCache = new Map();
async function djProduct(category, titleSub) {
  if (!djCache.has(category)) {
    const j = await (
      await fetch(
        `https://dummyjson.com/products/category/${category}?limit=30&select=title,thumbnail`,
      )
    ).json();
    djCache.set(category, j.products || []);
  }
  const p = djCache
    .get(category)
    .find((x) => x.title.toLowerCase().includes(titleSub.toLowerCase()));
  if (!p) throw new Error(`product not found: ${category}/${titleSub}`);
  return p.thumbnail;
}
const product = (category, titleSub) => ({
  get: () => djProduct(category, titleSub),
  mode: 'contain',
});

// token -> { url(), box:[w,h] display aspect } | { get(), mode:'contain' }
export const SOURCES = {
  home_hero: { get: () => uns('1594007654729-407eedc4be65', 700, 700), box: [1, 1] }, // pizza on board
  home_pizza: { get: () => mealThumb('Margherita'), box: [1, 1] },
  home_bowl: { get: () => uns('1512621776951-a57141f2eefd', 700, 700), box: [1, 1] }, // veggie/avocado bowl
  home_burger: { get: () => uns('1568901346375-23c9450c58cd', 700, 700), box: [1, 1] }, // burger
  menu_hero: {
    get: () => uns('1565299624946-b28f40a0ae38', 1200, 820),
    box: [1200, 820],
  }, // moody whole pizza
  menu_1: { get: () => mealThumb('Margherita'), box: [1, 1] },
  menu_2: { get: () => mealThumb('Matambre'), box: [1, 1] }, // saucy red pizza -> Diavola
  menu_3: { get: () => mealThumb('Cassava'), box: [1, 1] }, // rustic pizza
  co_1: { get: () => mealThumb('Margherita'), box: [1, 1] },
  co_2: { get: () => mealThumb('Matambre'), box: [1, 1] },
  co_3: { get: () => uns('1554866585-cd94860890b7', 500, 500), box: [1, 1] }, // coca-cola can
  track_thumb: { get: () => mealThumb('Margherita'), box: [1, 1] },

  // ── AURA store — real product catalogue photography (on white) ──
  ec_hero: product('mens-watches', 'Rolex Cellini Date'),
  ec_p1: product('mens-watches', 'Longines Master'),
  ec_p2: product('sunglasses', 'Black Sun'),
  ec_p3: product('mens-shoes', 'Nike Air Jordan 1 Red'),
  ec_p4: product('womens-bags', 'Heshe'),
  ec_p5: product('sunglasses', 'Green and Black'),
  ec_p6: product('mens-shoes', 'Puma Future Rider'),
  ec_p7: product('womens-bags', 'Blue Women'),
  ec_p8: product('mens-watches', 'Brown Leather Belt'),
};

export async function processed(token) {
  const s = SOURCES[token];
  if (!s) throw new Error(`no source ${token}`);
  const url = await s.get();
  const buf = await dl(url);
  if (s.mode === 'contain') {
    // Product shots: keep the whole item, padded on a clean white field.
    return sharp(buf)
      .flatten({ background: '#ffffff' })
      .resize(720, 720, { fit: 'contain', background: '#ffffff' })
      .jpeg({ quality: 82 })
      .toBuffer();
  }
  const [aw, ah] = s.box;
  const W = aw <= 4 ? 600 : Math.min(aw, 1200);
  const H = Math.round((W * ah) / aw);
  return sharp(buf)
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function dataUri(token) {
  const b = await processed(token);
  return `data:image/jpeg;base64,${b.toString('base64')}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Next 16 defaults images.qualities to [75] and returns 400 for a direct
    // API request with an unlisted quality. The project renders cards at 70,
    // the lightbox stage at 78, and thumbnails at 55.
    qualities: [55, 70, 75, 78],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;

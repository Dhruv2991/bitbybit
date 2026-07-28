import type { MetadataRoute } from 'next';

// NOTE: BitByBit is currently a single-route SPA — Problems, Leaderboard,
// About, etc. are all client-side view state on "/", not separate URLs.
// So this sitemap genuinely only has one real entry today. If those
// sections ever move to real routes (e.g. /problems, /leaderboard), add
// them here so they show up correctly instead of just growing this file
// with URLs that don't actually exist.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://bitbybit-9h8e.vercel.app',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}

import type { MetadataRoute } from 'next';

const BASE_URL = 'https://bitbybit-9h8e.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: '',            changeFrequency: 'daily' as const,   priority: 1.0 },
    { path: '/problems',    changeFrequency: 'daily' as const,   priority: 0.9 },
    { path: '/leaderboard', changeFrequency: 'daily' as const,   priority: 0.8 },
    { path: '/arena',       changeFrequency: 'daily' as const,   priority: 0.8 },
    { path: '/weekly',      changeFrequency: 'weekly' as const,  priority: 0.8 },
    { path: '/subscribe',   changeFrequency: 'weekly' as const,  priority: 0.7 },
    { path: '/collaborations', changeFrequency: 'monthly' as const, priority: 0.6 },
    { path: '/about',       changeFrequency: 'monthly' as const, priority: 0.5 },
    { path: '/privacy',     changeFrequency: 'monthly' as const, priority: 0.3 },
    { path: '/terms',       changeFrequency: 'monthly' as const, priority: 0.3 },
    { path: '/refunds',     changeFrequency: 'monthly' as const, priority: 0.3 },
  ];

  const now = new Date();

  return routes.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}

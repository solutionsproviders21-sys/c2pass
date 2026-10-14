import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, MetadataRoute.Sitemap[number]['changeFrequency'], number][] = [
    ['/', 'weekly', 1], ['/tarifs', 'monthly', 0.8], ['/centres', 'daily', 0.9], ['/inscription', 'monthly', 0.6],
    ['/conditions', 'yearly', 0.2], ['/confidentialite', 'yearly', 0.2], ['/mentions-legales', 'yearly', 0.2],
  ];
  return pages.map(([path, changeFrequency, priority]) => ({ url: `${SITE_URL}${path}`, changeFrequency, priority }));
}

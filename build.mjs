#!/usr/bin/env node
/**
 * build.mjs — собирает статический index.html из template.html + content.json.
 *
 * Запуск: node build.mjs   (или npm run build)
 *
 * Сборка нужна, чтобы:
 *   • контент лежал в готовом HTML (SEO, работа без JavaScript, file://);
 *   • правки в content.json попадали на сайт.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { esc, renderProfileContent, renderGalleryContent } from './render.js';

const root = dirname(fileURLToPath(import.meta.url));
const readText = (file) => readFile(resolve(root, file), 'utf8');

/** Подставляет значение во все вхождения {{key}}. */
function fill(template, key, value) {
  return template.split(`{{${key}}}`).join(value);
}

const content = JSON.parse(await readText('content.json'));
const site = content.site || {};
const footer = site.footer || {};

let html = await readText('template.html');

const values = {
  lang: site.lang || 'ru',
  'site.title': site.title || '',
  'site.description': site.description || '',
  'site.name': site.name || '',
  'site.brandNote': site.brandNote || '',
  'site.themeColor': site.themeColor || '#f3ebdd',
  'site.ogImage': site.ogImage || '',
  'footer.left': footer.left || '',
  'footer.right': footer.right || '',
};

for (const [key, value] of Object.entries(values)) {
  html = fill(html, key, esc(value));
}

const headExtra = site.url
  ? [
      `<link rel="canonical" href="${esc(site.url)}">`,
      `<meta property="og:url" content="${esc(site.url)}">`,
    ].join('\n')
  : '<!-- canonical и og:url появятся, когда в content.json будет заполнен site.url -->';

html = fill(html, 'headExtra', headExtra);
html = fill(html, 'profile', renderProfileContent(content));
html = fill(html, 'gallery', renderGalleryContent(content));

await writeFile(resolve(root, 'index.html'), html, 'utf8');
console.log('✓ index.html собран');

if (site.url) {
  const url = site.url.replace(/\/+$/, '');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${esc(url)}/</loc>
  </url>
</urlset>
`;
  await writeFile(resolve(root, 'sitemap.xml'), sitemap, 'utf8');
  console.log('✓ sitemap.xml собран');
} else {
  console.log('· site.url пуст — sitemap.xml не создаётся');
}

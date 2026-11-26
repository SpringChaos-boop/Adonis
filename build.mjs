#!/usr/bin/env node
/**
 * build.mjs — собирает статический index.html и 404.html
 * из шаблонов и content.json.
 *
 * Запуск: node build.mjs   (или build.cmd двойным кликом)
 *
 * Сборка нужна, чтобы:
 *   • контент лежал в готовом HTML (SEO, работа без JavaScript, file://);
 *   • правки в content.json попадали в статическую версию страницы.
 *
 * Node.js здесь — только движок скрипта: ничего устанавливать не нужно.
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

const values = {
  lang: esc(site.lang || 'ru'),
  'site.title': esc(site.title || ''),
  'site.description': esc(site.description || ''),
  'site.name': esc(site.name || ''),
  'site.brandNote': esc(site.brandNote || ''),
  'site.themeColor': esc(site.themeColor || '#f3ebdd'),
  'site.ogImage': esc(site.ogImage || ''),
  'footer.left': esc(footer.left || ''),
  'footer.right': esc(footer.right || ''),
};

// Ссылка «на главную»: абсолютная для опубликованного сайта, относительная до публикации.
const home = site.url ? esc(site.url.replace(/\/?$/, '/')) : './';

const headExtra = site.url
  ? [
      `<link rel="canonical" href="${esc(site.url)}">`,
      `<meta property="og:url" content="${esc(site.url)}">`,
    ].join('\n')
  : '<!-- canonical и og:url появятся, когда в content.json будет заполнен site.url -->';

// ---------- index.html ----------

let html = await readText('template.html');
for (const [key, value] of Object.entries(values)) html = fill(html, key, value);
html = fill(html, 'headExtra', headExtra);
html = fill(html, 'profile', renderProfileContent(content));
html = fill(html, 'gallery', renderGalleryContent(content));

await writeFile(resolve(root, 'index.html'), html, 'utf8');
console.log('✓ index.html собран');

// ---------- 404.html ----------

let notFound = await readText('404.template.html');
notFound = fill(notFound, 'home', home);
for (const [key, value] of Object.entries(values)) notFound = fill(notFound, key, value);

await writeFile(resolve(root, '404.html'), notFound, 'utf8');
console.log('✓ 404.html собран');

// ---------- sitemap.xml ----------

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

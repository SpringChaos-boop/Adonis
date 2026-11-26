#!/usr/bin/env node
/**
 * check.mjs — быстрая проверка перед публикацией.
 *
 * Запуск: node check.mjs   (или npm run check)
 *
 * Проверяет:
 *   • что content.json читается и содержит обязательные поля;
 *   • что рендер не выдаёт «undefined» и прочий мусор;
 *   • что все файлы ассетов, на которые ссылается контент, существуют;
 *   • что собранный index.html присутствует и не отстал от content.json.
 */

import { access, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderProfileContent, renderGalleryContent } from './render.js';

const root = dirname(fileURLToPath(import.meta.url));
const problems = [];
const notes = [];

const required = (value, path) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    problems.push(`content.json: пустое обязательное поле ${path}`);
  }
};

let content;
try {
  content = JSON.parse(await readFile(resolve(root, 'content.json'), 'utf8'));
} catch (error) {
  console.error('✗ content.json не читается:', error.message);
  process.exit(1);
}

required(content.site?.title, 'site.title');
required(content.site?.description, 'site.description');
required(content.character?.name, 'character.name');
required(content.character?.intro, 'character.intro');

if (!Array.isArray(content.sections) || !content.sections.length) {
  problems.push('content.json: sections должен быть непустым массивом');
} else {
  content.sections.forEach((section, index) => {
    required(section.title, `sections[${index}].title`);
    required(section.text, `sections[${index}].text`);
    if (section.layout && !['half', 'full', 'split'].includes(section.layout)) {
      problems.push(`content.json: sections[${index}].layout = "${section.layout}" — допустимо half|full|split`);
    }
  });
}

if (!Array.isArray(content.gallery?.items) || !content.gallery.items.length) {
  problems.push('content.json: gallery.items должен быть непустым массивом');
}

// ---------- рендер ----------

const profileHtml = renderProfileContent(content);
const galleryHtml = renderGalleryContent(content);
const rendered = `${profileHtml}\n${galleryHtml}`;

for (const bad of ['undefined', 'NaN', '[object Object]']) {
  if (rendered.includes(bad)) problems.push(`рендер содержит «${bad}» — проверьте подстановки`);
}

if (!profileHtml.includes('id="profile-title"')) problems.push('рендер профиля потерял заголовок #profile-title');
if (!galleryHtml.includes('id="gallery-title"')) problems.push('рендер галереи потерял заголовок #gallery-title');

// ---------- файлы ассетов ----------

const assetPaths = new Set();
for (const match of rendered.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) assetPaths.add(match[1]);

for (const asset of assetPaths) {
  try {
    await access(resolve(root, asset));
  } catch {
    problems.push(`нет файла ${asset} (на него ссылается контент)`);
  }
}

if (!assetPaths.size) notes.push('контент пока не использует ни одного файла из assets/');

// ---------- собранный index.html ----------

try {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  if (html.includes('{{')) problems.push('index.html содержит незаполненные {{плейсхолдеры}} — пересоберите: npm run build');

  const [contentStat, htmlStat] = await Promise.all([
    stat(resolve(root, 'content.json')),
    stat(resolve(root, 'index.html')),
  ]);
  if (htmlStat.mtimeMs < contentStat.mtimeMs) {
    notes.push('index.html старше content.json — пересоберите: npm run build');
  }
} catch {
  problems.push('index.html не найден — выполните: npm run build');
}

// ---------- отчёт ----------

if (notes.length) {
  console.log('Заметки:');
  notes.forEach((note) => console.log(`  · ${note}`));
}

if (problems.length) {
  console.error(`✗ Найдено проблем: ${problems.length}`);
  problems.forEach((problem) => console.error(`  • ${problem}`));
  process.exit(1);
}

console.log(`✓ Проверки пройдены. Секций: ${content.sections.length}, изображений галереи: ${content.gallery.items.length}.`);

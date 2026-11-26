/**
 * render.js — чистые функции рендера страницы.
 *
 * Один и тот же код используют:
 *   • app.js    — перерисовка страницы из content.json в браузере;
 *   • build.mjs — пререндер в статический index.html.
 *
 * Обращений к DOM здесь нет, поэтому модуль работает и в Node.
 * Все текстовые значения проходят через esc().
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Экранирует значение для вставки в HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** 1 → "01". */
export function pad(number) {
  return String(number).padStart(2, '0');
}

/** Собирает <img> с размерами, srcset и ленивой загрузкой. */
function img(media, { sizes = '', eager = false } = {}) {
  if (!media || !media.src) return '';
  const attrs = [`src="${esc(media.src)}"`];
  if (media.srcset) attrs.push(`srcset="${esc(media.srcset)}"`);
  if (sizes) attrs.push(`sizes="${esc(sizes)}"`);
  if (media.width) attrs.push(`width="${esc(media.width)}"`);
  if (media.height) attrs.push(`height="${esc(media.height)}"`);
  attrs.push(`alt="${esc(media.alt || '')}"`);
  attrs.push('decoding="async"');
  attrs.push(eager ? 'fetchpriority="high"' : 'loading="lazy"');
  return `<img ${attrs.join(' ')}>`;
}

function hero(character) {
  const meta = (character.meta || []).filter(Boolean);
  const pills = meta.length
    ? `<div class="meta">${meta.map((item) => `<span>${esc(item)}</span>`).join('')}</div>`
    : '';
  const portrait = character.portrait || {};
  const art = portrait.src
    ? `<div class="portrait-placeholder has-image">${img(portrait, {
        sizes: '(max-width: 700px) 60vw, 420px',
        eager: true,
      })}</div>`
    : `<div class="portrait-placeholder"><div class="portrait-label">${(portrait.label || [character.name])
        .map(esc)
        .join('<br>')}</div></div>`;
  const caption = portrait.caption ? `<div class="art-caption">${esc(portrait.caption)}</div>` : '';

  return `<div class="hero">
      <div class="hero-copy">
        ${character.eyebrow ? `<div class="eyebrow">${esc(character.eyebrow)}</div>` : ''}
        <h1 id="profile-title">${esc(character.name)}</h1>
        ${character.nameChain ? `<p class="name-chain">${esc(character.nameChain)}</p>` : ''}
        ${pills}
        ${character.intro ? `<p class="intro">${esc(character.intro)}</p>` : ''}
      </div>
      <div class="hero-art">
        ${art}
        ${caption}
      </div>
    </div>`;
}

function sunMark() {
  return '<div class="sun-mark" aria-hidden="true"><span>✳</span></div>';
}

function quote(block) {
  if (!block || !block.text) return '';
  return `<blockquote class="quote">
      <p>${esc(block.text)}</p>
      ${block.source ? `<small>${esc(block.source)}</small>` : ''}
    </blockquote>`;
}

function banner(media) {
  if (!media || !media.src) return '';
  return `<figure class="decor-banner">
      <div class="decor-image icarus">${img(media, { sizes: media.sizes || '' })}</div>
    </figure>`;
}

function meander(className = '') {
  const extra = className ? ` ${className}` : '';
  return `<div class="meander-frieze${extra}" aria-hidden="true"></div>`;
}

function renderLinks(links) {
  if (!Array.isArray(links) || !links.length) return '';
  const items = links
    .filter((link) => link && link.label)
    .map((link) => {
      const arrow = '<span aria-hidden="true">↗</span>';
      if (!link.href) {
        return `<span class="link-item is-placeholder">${esc(link.label)} ${arrow}</span>`;
      }
      const external = link.external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(link.href)}"${external}>${esc(link.label)} ${arrow}</a>`;
    })
    .join('');
  return items ? `<div class="links">${items}</div>` : '';
}

function section(sectionData, index) {
  const layout = sectionData.layout === 'split' ? 'split' : sectionData.layout === 'full' ? 'full' : 'half';
  const number = `<div class="card-number">${pad(index + 1)}${
    sectionData.kicker ? ` / ${esc(sectionData.kicker)}` : ''
  }</div>`;
  const body = [
    number,
    sectionData.title ? `<h2>${esc(sectionData.title)}</h2>` : '',
    sectionData.text ? `<p>${esc(sectionData.text)}</p>` : '',
    renderLinks(sectionData.links),
  ]
    .filter(Boolean)
    .join('');

  if (layout === 'split') {
    const media = sectionData.media || {};
    const placeholder = media.placeholder || {};
    const art = media.src
      ? `<div class="family-art">${img(media, { sizes: '(max-width: 700px) 100vw, 280px' })}</div>`
      : `<div class="family-art"><span>${esc(placeholder.title || 'Изображение')}${
          placeholder.hint ? `<small>${esc(placeholder.hint)}</small>` : ''
        }</span></div>`;
    return `<article class="info-card wide info-card-split">
      <div class="info-card-body">${body}</div>
      ${art}
    </article>`;
  }

  const wide = layout === 'full' ? ' wide' : '';
  return `<article class="info-card${wide}">${body}</article>`;
}

function sectionsList(sections) {
  if (!Array.isArray(sections) || !sections.length) return '';
  return `<div class="section-grid">\n      ${sections.map(section).join('\n      ')}\n    </div>`;
}

function credits(data) {
  const list = (data.credits || []).filter((item) => item && item.text);
  if (!list.length) return '';
  const items = list
    .map((item) =>
      item.href
        ? `<a href="${esc(item.href)}" target="_blank" rel="noopener">${esc(item.text)}</a>`
        : `<span>${esc(item.text)}</span>`,
    )
    .join(' · ');
  return `<p class="image-credit">Изображения: ${items}</p>`;
}

/** Содержимое страницы «Профиль». */
export function renderProfileContent(data) {
  const character = data.character || {};
  return [
    hero(character),
    sunMark(),
    quote(data.quote),
    banner(data.banner),
    sectionsList(data.sections),
    meander(),
    credits(data),
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** Содержимое страницы «Галерея». */
export function renderGalleryContent(data) {
  const gallery = data.gallery || {};
  const items = Array.isArray(gallery.items) ? gallery.items : [];
  const tiles = items
    .map((item, index) => {
      const title = esc(item.title || `Изображение ${pad(index + 1)}`);
      const inner = item.src
        ? img(item, { sizes: '(max-width: 700px) 45vw, 340px' })
        : `<span>${title}<br><small>${esc(item.caption || '')}</small></span>`;
      return `<button type="button" class="gallery-tile" data-index="${index}" data-title="${title}" aria-label="Открыть: ${title}">${inner}</button>`;
    })
    .join('\n      ');

  return `<div class="eyebrow">${esc(gallery.eyebrow || '')}</div>
    <h1 id="gallery-title">${esc(gallery.title || 'Галерея')}</h1>
    ${gallery.intro ? `<p class="gallery-intro">${esc(gallery.intro)}</p>` : ''}
    ${meander('meander-frieze--rule')}
    <div class="gallery-grid">${tiles}</div>`;
}

/** Заголовок и описание страницы для <title> и meta description. */
export function pageMeta(data, route) {
  const name = (data.character && data.character.name) || '';
  if (route === 'gallery') {
    const title = (data.gallery && data.gallery.title) || 'Галерея';
    return {
      title: `${title} — ${name}`,
      description: (data.gallery && data.gallery.intro) || (data.site && data.site.description) || '',
    };
  }
  return {
    title: (data.site && data.site.title) || name,
    description: (data.site && data.site.description) || '',
  };
}

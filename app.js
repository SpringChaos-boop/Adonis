/**
 * app.js — «оживляет» страницу:
 *   • заново рендерит содержимое из content.json (если доступен);
 *   • переключает разделы по hash-ссылкам;
 *   • открывает лайтбокс галереи на <dialog>.
 *
 * Статический HTML из build.mjs остаётся рабочим и без этого скрипта:
 * если content.json недоступен (например, файл открыт через file://),
 * страница просто показывает уже собранную разметку.
 */

import { renderProfileContent, renderGalleryContent, pageMeta } from './render.js';

const RENDERERS = {
  profile: renderProfileContent,
  gallery: renderGalleryContent,
};

const HEADINGS = {
  profile: 'profile-title',
  gallery: 'gallery-title',
};

let content = null;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

async function loadContent() {
  try {
    const response = await fetch('content.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('content.json недоступен — используется статическая разметка.', error);
    return null;
  }
}

function routeFromHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  return Object.prototype.hasOwnProperty.call(RENDERERS, hash) ? hash : 'profile';
}

/** Подставляет название, подпись бренда и тексты подвала из content.json. */
function applySite(data) {
  const site = data.site || {};
  const footer = site.footer || {};
  const values = {
    name: site.name,
    brandNote: site.brandNote,
    footerLeft: footer.left,
    footerRight: footer.right,
  };

  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    document.querySelectorAll(`[data-site="${key}"]`).forEach((element) => {
      element.textContent = value;
    });
  }
}

function setDescription(text) {
  if (!text) return;
  const tag = document.querySelector('meta[name="description"]');
  if (tag) tag.setAttribute('content', text);
}

function applyRoute(name, { focus = false, scroll = true } = {}) {
  for (const key of Object.keys(RENDERERS)) {
    const section = document.getElementById(key);
    const link = document.querySelector(`nav a[href="#${key}"]`);
    const active = key === name;

    if (section) section.hidden = !active;
    if (link) {
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  if (content) {
    const meta = pageMeta(content, name);
    document.title = meta.title;
    setDescription(meta.description);
  }

  if (scroll) {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  if (focus) {
    const heading = document.getElementById(HEADINGS[name] || HEADINGS.profile);
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
}

function initLightbox() {
  const dialog = document.getElementById('lightbox');
  if (!dialog) return;

  const figure = dialog.querySelector('.lightbox-figure');
  const image = dialog.querySelector('.lightbox-figure img');
  const caption = dialog.querySelector('.lightbox-figure figcaption');
  const title = document.getElementById('lightbox-title');
  const closeButton = document.getElementById('close-lightbox');

  const open = (tile) => {
    const items = (content && content.gallery && content.gallery.items) || [];
    const item = items[Number(tile.dataset.index)] || {
      title: tile.dataset.title || 'Изображение',
      src: '',
    };
    const hasImage = Boolean(item.src);

    if (figure) figure.hidden = !hasImage;
    if (hasImage && image) {
      image.src = item.src;
      image.alt = item.alt || item.title || '';
      if (caption) caption.textContent = item.title || '';
      if (title) title.textContent = '';
    } else {
      if (image) {
        image.removeAttribute('src');
        image.alt = '';
      }
      if (title) title.textContent = `${item.title || 'Изображение'} — здесь будет увеличенный просмотр`;
    }

    document.documentElement.classList.add('has-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  document.addEventListener('click', (event) => {
    const tile = event.target instanceof Element ? event.target.closest('.gallery-tile') : null;
    if (tile) open(tile);
  });

  if (closeButton) closeButton.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('has-dialog');
  });
}

async function boot() {
  content = await loadContent();

  if (content) {
    applySite(content);
    for (const [key, render] of Object.entries(RENDERERS)) {
      const host = document.querySelector(`[data-render="${key}"]`);
      if (host) host.innerHTML = render(content);
    }
  }

  applyRoute(routeFromHash(), { focus: false, scroll: false });
  initLightbox();

  window.addEventListener('hashchange', () => {
    applyRoute(routeFromHash(), { focus: true });
  });
}

boot();

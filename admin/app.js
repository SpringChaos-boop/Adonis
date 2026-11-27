/**
 * admin/app.js — админ-панель «Горицвет».
 *
 * Два режима:
 *   • локальный — правки живут в браузере, готовая content.json скачивается
 *     файлом и кладётся в папку сайта (потом коммит);
 *   • Supabase — после входа правки сохраняются в таблицу site_content,
 *     изображения уходят в Storage. Сайт читает их сразу.
 *
 * Панель работает только с тем же объектом, что и сайт (schema 1),
 * и рендерит предпросмотр теми же функциями из render.js.
 */

import { renderProfileContent, renderGalleryContent, esc } from '../render.js';
import { supabase } from '../data/provider.js';
import {
  el,
  field,
  textField,
  numberField,
  areaField,
  selectField,
  imageField,
  listItem,
  panel,
} from './ui.js';
import { prepareImage, localFileName, downloadBlob } from './image.js';

const DRAFT_KEY = 'goritsvet.admin.draft';

const TABS = [
  { id: 'site', label: 'Общее', render: renderSite },
  { id: 'character', label: 'Персонаж', render: renderCharacter },
  { id: 'quote', label: 'Цитата', render: renderQuote },
  { id: 'banner', label: 'Баннер', render: renderBanner },
  { id: 'sections', label: 'Разделы', render: renderSections },
  { id: 'gallery', label: 'Галерея', render: renderGallery },
  { id: 'credits', label: 'Кредиты', render: renderCredits },
];

const dom = {};
const state = {
  content: null,
  tab: 'site',
  preview: 'profile',
  dirty: false,
  lastSaved: null,
  saveTimer: null,
  previewTimer: null,
  noteTimer: null,
};

init();

/* ============================ загрузка ============================ */

async function init() {
  cacheDom();
  bindChrome();
  renderTabs();

  try {
    state.content = await loadInitial();
  } catch (error) {
    showFatal(error.message);
    return;
  }

  openTab('site');
  updateChrome();
  updatePreview();
}

function cacheDom() {
  const ids = [
    'tabs', 'form', 'issues', 'status', 'mode-badge', 'user-badge',
    'btn-login', 'btn-logout', 'btn-draft', 'btn-cloud', 'btn-download',
    'btn-import', 'btn-validate', 'btn-reload', 'btn-reset', 'file-import', 'foot-note',
    'preview', 'login', 'login-form', 'login-email', 'login-password', 'login-error', 'login-cancel',
  ];
  for (const id of ids) dom[id] = document.getElementById(id);
  dom.previewWrap = dom.preview.parentElement;
  dom.previewTabs = [...document.querySelectorAll('[data-preview]')];
}

function showFatal(message) {
  dom.issues.hidden = false;
  dom.issues.className = 'issues';
  dom.issues.textContent = message;
  note('Панель не может продолжить работу', 'error');
}

async function loadInitial() {
  const draft = readDraft();

  if (supabase.configured && supabase.getSession()) {
    try {
      const cloud = await supabase.fetchContent();
      if (cloud) {
        note('Загружено из Supabase', 'ok');
        return cloud;
      }
      note('В Supabase пока нет данных — они появятся после первого сохранения', '');
    } catch (error) {
      note('Supabase недоступен: ' + error.message, 'error');
    }
  }

  if (draft) {
    note('Открыт несохранённый черновик из браузера', '');
    return draft;
  }

  try {
    const response = await fetch('content.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(
      'Не удалось прочитать content.json (' + error.message + '). ' +
      'Откройте админку через preview.cmd — при file:// браузер блокирует чтение файлов.',
    );
  }
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ============================ хром ============================ */

function bindChrome() {
  document.addEventListener('input', onFieldEvent);
  document.addEventListener('change', onFieldEvent);

  dom['btn-draft'].addEventListener('click', () => saveDraft(true));
  dom['btn-cloud'].addEventListener('click', saveCloud);
  dom['btn-download'].addEventListener('click', downloadContent);
  dom['btn-import'].addEventListener('click', () => dom['file-import'].click());
  dom['file-import'].addEventListener('change', importContent);
  dom['btn-validate'].addEventListener('click', () => runChecks(true));
  dom['btn-reload'].addEventListener('click', updatePreview);
  dom['btn-reset'].addEventListener('click', resetDraft);

  dom['btn-login'].addEventListener('click', openLogin);
  dom['btn-logout'].addEventListener('click', logout);
  dom['login-cancel'].addEventListener('click', closeLogin);
  dom['login-form'].addEventListener('submit', submitLogin);

  for (const button of dom.previewTabs) {
    button.addEventListener('click', () => {
      state.preview = button.dataset.preview;
      for (const other of dom.previewTabs) other.setAttribute('aria-current', String(other === button));
      updatePreview();
    });
  }

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('resize', fitPreview);
}

function onFieldEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const input = target.closest('[data-path]');
  if (!input) return;

  let value = input.type === 'checkbox' ? input.checked : input.value;
  if (input.dataset.type === 'number') value = value === '' ? null : Number(value);

  setDeep(state.content, input.dataset.path, value);
  markDirty();

  // смена раскладки раздела меняет набор полей — перерисовываем вкладку
  if (input.dataset.path.endsWith('.layout')) openTab(state.tab);
}

function setDeep(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = object;
  for (const key of keys) {
    if (target[key] == null || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  target[last] = value;
}

function markDirty() {
  state.dirty = true;
  updateChrome();
  schedulePreview();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state.content));
    } catch {
      /* приватный режим — просто не автсохраняем */
    }
  }, 700);
}

function note(text, kind = '') {
  dom.status.textContent = text;
  dom.status.className = `status${kind ? ` status--${kind}` : ''}`;
  clearTimeout(state.noteTimer);
  state.noteTimer = setTimeout(() => {
    dom.status.textContent = '';
    dom.status.className = 'status';
  }, 7000);
}

function updateChrome() {
  const session = supabase.getSession();

  if (!supabase.configured) {
    dom['mode-badge'].textContent = 'Локальный режим';
    dom['mode-badge'].className = 'badge';
  } else if (session) {
    dom['mode-badge'].textContent = 'Supabase';
    dom['mode-badge'].className = 'badge badge--cloud';
  } else {
    dom['mode-badge'].textContent = 'Supabase · вход не выполнен';
    dom['mode-badge'].className = 'badge';
  }

  dom['user-badge'].hidden = !session;
  dom['user-badge'].textContent = session ? session.email : '';
  dom['btn-login'].hidden = !supabase.configured || Boolean(session);
  dom['btn-logout'].hidden = !session;
  dom['btn-cloud'].hidden = !supabase.configured;
  dom['btn-cloud'].disabled = !session;

  const saved = state.lastSaved
    ? `Сохранено в ${state.lastSaved.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    : 'Черновик ещё не сохранён';
  dom['foot-note'].textContent = state.dirty ? 'Есть несохранённые изменения' : saved;
}

/* ============================ сохранение ============================ */

function saveDraft(announce) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.content));
    state.dirty = false;
    state.lastSaved = new Date();
    updateChrome();
    if (announce) note('Черновик сохранён в браузере', 'ok');
  } catch (error) {
    note('Не удалось сохранить черновик: ' + error.message, 'error');
  }
}

async function saveCloud() {
  if (!supabase.configured) {
    note('Supabase не настроен: заполните url и anonKey в config.js', 'error');
    return;
  }
  try {
    dom['btn-cloud'].disabled = true;
    await supabase.saveContent(state.content);
    state.dirty = false;
    state.lastSaved = new Date();
    localStorage.removeItem(DRAFT_KEY);
    updateChrome();
    note('Сохранено на сайт — обновите страницу, чтобы увидеть изменения', 'ok');
  } catch (error) {
    note('Не сохранено: ' + error.message, 'error');
  } finally {
    dom['btn-cloud'].disabled = !supabase.getSession();
  }
}

function resetDraft() {
  if (!confirm('Удалить черновик из браузера и загрузить content.json заново?')) return;
  localStorage.removeItem(DRAFT_KEY);
  location.reload();
}

function downloadContent() {
  const json = `${JSON.stringify(state.content, null, 2)}\n`;
  downloadBlob(new Blob([json], { type: 'application/json' }), 'content.json');
  note('Файл content.json скачан — замените им файл в папке сайта и закоммитьте', 'ok');
}

async function importContent() {
  const file = dom['file-import'].files && dom['file-import'].files[0];
  dom['file-import'].value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || !parsed.site) throw new Error('это не файл контента');
    state.content = parsed;
    markDirty();
    rerender();
    note('Файл загружен в редактор', 'ok');
  } catch (error) {
    note('Не удалось загрузить файл: ' + error.message, 'error');
  }
}

/* ============================ вход ============================ */

function openLogin() {
  dom['login'].hidden = false;
  dom['login-error'].hidden = true;
  dom['login-email'].focus();
}

function closeLogin() {
  dom['login'].hidden = true;
}

async function submitLogin(event) {
  event.preventDefault();
  const email = dom['login-email'].value.trim();
  const password = dom['login-password'].value;
  try {
    await supabase.signIn(email, password);
    dom['login-password'].value = '';
    closeLogin();
    await afterSignIn();
  } catch (error) {
    dom['login-error'].hidden = false;
    dom['login-error'].textContent = error.message;
  }
}

async function afterSignIn() {
  updateChrome();
  note('Вход выполнен: ' + supabase.getSession().email, 'ok');
  try {
    const cloud = await supabase.fetchContent();
    if (cloud) {
      state.content = cloud;
      rerender();
      note('Загружено содержимое сайта из Supabase', 'ok');
    } else {
      note('В Supabase ещё нет данных — первое сохранение их создаст', '');
    }
  } catch (error) {
    note('Вошли, но контент не прочитан: ' + error.message, 'error');
  }
}

async function logout() {
  await supabase.signOut();
  updateChrome();
  note('Вы вышли из Supabase', '');
}

/* ============================ вкладки ============================ */

function renderTabs() {
  dom.tabs.replaceChildren(
    ...TABS.map((tab) =>
      el('button', { type: 'button', dataset: { tab: tab.id }, onclick: () => openTab(tab.id) }, tab.label),
    ),
  );
}

function openTab(id) {
  state.tab = id;
  for (const button of dom.tabs.querySelectorAll('button')) {
    button.setAttribute('aria-current', String(button.dataset.tab === id));
  }
  const tab = TABS.find((item) => item.id === id) || TABS[0];
  dom.form.replaceChildren(...tab.render().filter(Boolean));
}

function rerender() {
  openTab(state.tab);
  schedulePreview();
  updateChrome();
}

function commit() {
  markDirty();
  openTab(state.tab);
}

/* ============================ вкладки: содержимое ============================ */

function site() {
  state.content.site ||= {};
  state.content.site.footer ||= { left: '', right: '' };
  return state.content.site;
}

function character() {
  state.content.character ||= {};
  state.content.character.portrait ||= { src: '', alt: '', label: [], caption: '' };
  if (!Array.isArray(state.content.character.portrait.label)) state.content.character.portrait.label = ['', ''];
  if (!Array.isArray(state.content.character.meta)) state.content.character.meta = [];
  return state.content.character;
}

function renderSite() {
  const data = site();
  return [
    panel(
      'Общее',
      'Название, описание и служебный адрес сайта.',
      field('Название сайта', textField({ path: 'site.name', value: data.name })),
      field('Подпись под названием', textField({ path: 'site.brandNote', value: data.brandNote })),
      field('Заголовок вкладки', textField({ path: 'site.title', value: data.title })),
      field(
        'Описание для поисковиков',
        areaField({ path: 'site.description', value: data.description, rows: 3 }),
        'Одна-две фразы, до ~160 символов.',
      ),
      field(
        'Адрес сайта',
        textField({ path: 'site.url', value: data.url, placeholder: 'https://login.github.io/Adonis/' }),
        'Нужен для canonical, og:url и sitemap. Со слэшем на конце.',
      ),
      el(
        'div',
        { class: 'row' },
        field('Подвал слева', textField({ path: 'site.footer.left', value: data.footer.left })),
        field('Подвал справа', textField({ path: 'site.footer.right', value: data.footer.right })),
      ),
    ),
    panel(
      'Техническое',
      'Менять редко. Тема оформления влияет на цвет адресной строки в браузере.',
      el(
        'div',
        { class: 'row' },
        field('Язык страницы', textField({ path: 'site.lang', value: data.lang, small: true, placeholder: 'ru' })),
        field('Цвет темы', textField({ path: 'site.themeColor', value: data.themeColor, small: true, placeholder: '#f3ebdd' })),
      ),
      imageField({
        path: 'site.ogImage',
        value: data.ogImage,
        label: 'Картинка для соцсетей (og:image)',
        hint: 'Лучше 1200 × 630.',
        onPick: pickImage,
      }),
    ),
  ];
}

function renderCharacter() {
  const data = character();

  const metaInput = el('input', {
    class: 'input',
    value: (data.meta || []).join(', '),
    placeholder: 'местоимения, возраст',
  });
  metaInput.addEventListener('input', () => {
    data.meta = metaInput.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    markDirty();
  });

  return [
    panel(
      'Основное',
      'То, что видно на первом экране.',
      el(
        'div',
        { class: 'row' },
        field('Имя', textField({ path: 'character.name', value: data.name })),
        field('Надзаголовок', textField({ path: 'character.eyebrow', value: data.eyebrow })),
      ),
      field('Цепь имён', textField({ path: 'character.nameChain', value: data.nameChain })),
      field('Приветствие / краткое описание', areaField({ path: 'character.intro', value: data.intro, rows: 4 })),
      field('Плашки через запятую', metaInput, 'Отображаются рядом с именем.'),
    ),
    panel(
      'Портрет',
      'Пока файла нет — на сайте показывается градиентная заглушка.',
      imageField({
        path: 'character.portrait.src',
        value: data.portrait.src,
        label: 'Изображение портрета',
        onPick: pickImage,
      }),
      el(
        'div',
        { class: 'row' },
        field('Alt-текст', textField({ path: 'character.portrait.alt', value: data.portrait.alt })),
        field('Подпись под портретом', textField({ path: 'character.portrait.caption', value: data.portrait.caption })),
      ),
    ),
  ];
}

function renderQuote() {
  state.content.quote ||= { text: '', source: '' };
  const data = state.content.quote;
  return [
    panel(
      'Цитата',
      'Эпиграф под первым экраном.',
      field('Текст', areaField({ path: 'quote.text', value: data.text, rows: 4 })),
      field('Источник', textField({ path: 'quote.source', value: data.source, placeholder: 'AN ORIGINAL EPIGRAPH' })),
    ),
  ];
}

function renderBanner() {
  state.content.banner ||= { src: '', alt: '', width: null, height: null };
  const data = state.content.banner;
  return [
    panel(
      'Крупное изображение',
      'Картина между цитатой и карточками. Пропорции сохраняются автоматически.',
      imageField({
        path: 'banner.src',
        value: data.src,
        label: 'Файл картины',
        hint: 'Ширина 960 px достаточно; больше — лишний вес.',
        onPick: (file, path, input) =>
          pickImage(file, path, input, {
            setSize: (width, height) => {
              setDeep(state.content, 'banner.width', width);
              setDeep(state.content, 'banner.height', height);
            },
          }),
      }),
      el(
        'div',
        { class: 'row' },
        field('Alt-текст', textField({ path: 'banner.alt', value: data.alt })),
        field('Ширина, px', numberField({ path: 'banner.width', value: data.width })),
        field('Высота, px', numberField({ path: 'banner.height', value: data.height })),
      ),
      field('srcset (необязательно)', textField({ path: 'banner.srcset', value: data.srcset, placeholder: 'assets/a-480.jpg 480w, assets/a-960.jpg 960w' })),
    ),
  ];
}

function renderSections() {
  if (!Array.isArray(state.content.sections)) state.content.sections = [];
  const sections = state.content.sections;

  const items = sections.map((section, index) =>
    listItem({
      index,
      title: section.title,
      canUp: index > 0,
      canDown: index < sections.length - 1,
      onUp: () => moveItem(sections, index, -1),
      onDown: () => moveItem(sections, index, 1),
      onRemove: () => {
        sections.splice(index, 1);
        commit();
      },
      children: el(
        'div',
        {},
        el(
          'div',
          { class: 'row' },
          field('Заголовок', textField({ path: `sections.${index}.title`, value: section.title })),
          field('Надзаголовок', textField({ path: `sections.${index}.kicker`, value: section.kicker, placeholder: 'REAL LIFE' })),
        ),
        field('Текст', areaField({ path: `sections.${index}.text`, value: section.text, rows: 4 })),
        el(
          'div',
          { class: 'row' },
          field(
            'Раскладка',
            selectField({
              path: `sections.${index}.layout`,
              value: section.layout || 'half',
              options: [
                { value: 'half', label: 'Половина ширины' },
                { value: 'full', label: 'На всю ширину' },
                { value: 'split', label: 'Текст + изображение' },
              ],
            }),
          ),
          field('Служебный ключ', textField({ path: `sections.${index}.key`, value: section.key, small: true })),
        ),
        section.layout === 'split' ? splitMedia(index, section) : null,
        linksBlock(index, section),
      ),
    }),
  );

  return [
    panel(
      'Разделы профиля',
      'Порядок и содержание карточек. Номера 01, 02… подставляются сами.',
      ...items,
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            sections.push({ key: `section-${sections.length + 1}`, kicker: '', title: 'Новый раздел', text: '', layout: 'full' });
            commit();
          },
        },
        '+ Добавить раздел',
      ),
    ),
  ];
}

function splitMedia(index, section) {
  section.media ||= { src: '', alt: '', placeholder: { title: '', hint: '' } };
  section.media.placeholder ||= { title: '', hint: '' };
  return el(
    'div',
    {},
    imageField({
      path: `sections.${index}.media.src`,
      value: section.media.src,
      label: 'Изображение раздела',
      onPick: pickImage,
    }),
    el(
      'div',
      { class: 'row' },
      field('Alt-текст', textField({ path: `sections.${index}.media.alt`, value: section.media.alt })),
      field('Подпись заглушки', textField({ path: `sections.${index}.media.placeholder.title`, value: section.media.placeholder.title })),
      field('Пояснение', textField({ path: `sections.${index}.media.placeholder.hint`, value: section.media.placeholder.hint })),
    ),
  );
}

function linksBlock(index, section) {
  if (!Array.isArray(section.links)) section.links = [];
  return el(
    'div',
    {},
    el('span', { class: 'hint' }, 'Ссылки в карточке'),
    ...section.links.map((link, linkIndex) =>
      el(
        'div',
        { class: 'row' },
        field('Подпись', textField({ path: `sections.${index}.links.${linkIndex}.label`, value: link.label })),
        field('Адрес', textField({ path: `sections.${index}.links.${linkIndex}.href`, value: link.href, placeholder: 'https://…' })),
        el(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            title: 'Удалить ссылку',
            onclick: () => {
              section.links.splice(linkIndex, 1);
              commit();
            },
          },
          '×',
        ),
      ),
    ),
    el(
      'button',
      {
        class: 'btn btn--ghost',
        type: 'button',
        onclick: () => {
          section.links.push({ label: '', href: '' });
          commit();
        },
      },
      '+ ссылка',
    ),
  );
}

function renderGallery() {
  state.content.gallery ||= { eyebrow: '', title: '', intro: '', items: [] };
  const data = state.content.gallery;
  if (!Array.isArray(data.items)) data.items = [];

  const items = data.items.map((item, index) =>
    listItem({
      index,
      title: item.title,
      canUp: index > 0,
      canDown: index < data.items.length - 1,
      onUp: () => moveItem(data.items, index, -1),
      onDown: () => moveItem(data.items, index, 1),
      onRemove: () => {
        data.items.splice(index, 1);
        commit();
      },
      children: el(
        'div',
        {},
        el(
          'div',
          { class: 'row' },
          field('Подпись', textField({ path: `gallery.items.${index}.title`, value: item.title })),
          field('Пояснение', textField({ path: `gallery.items.${index}.caption`, value: item.caption })),
        ),
        imageField({
          path: `gallery.items.${index}.src`,
          value: item.src,
          label: 'Изображение',
          onPick: pickImage,
        }),
        field('Alt-текст', textField({ path: `gallery.items.${index}.alt`, value: item.alt })),
      ),
    }),
  );

  return [
    panel(
      'Галерея',
      'Без файла плитка показывает заглушку «добавим арт».',
      el(
        'div',
        { class: 'row' },
        field('Надзаголовок', textField({ path: 'gallery.eyebrow', value: data.eyebrow })),
        field('Заголовок', textField({ path: 'gallery.title', value: data.title })),
      ),
      field('Вступление', textField({ path: 'gallery.intro', value: data.intro })),
      ...items,
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            data.items.push({ title: `Изображение ${String(data.items.length + 1).padStart(2, '0')}`, caption: '', src: '', alt: '' });
            commit();
          },
        },
        '+ Добавить изображение',
      ),
    ),
  ];
}

function renderCredits() {
  if (!Array.isArray(state.content.credits)) state.content.credits = [];
  const credits = state.content.credits;

  return [
    panel(
      'Кредиты',
      'Строка «Изображения: …» под фризом. Указывайте источник и лицензию.',
      ...credits.map((credit, index) =>
        el(
          'div',
          { class: 'row' },
          field('Подпись', textField({ path: `credits.${index}.text`, value: credit.text })),
          field('Ссылка', textField({ path: `credits.${index}.href`, value: credit.href })),
          el(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              title: 'Удалить',
              onclick: () => {
                credits.splice(index, 1);
                commit();
              },
            },
            '×',
          ),
        ),
      ),
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            credits.push({ text: '', href: '' });
            commit();
          },
        },
        '+ Добавить кредит',
      ),
    ),
  ];
}

function moveItem(array, from, delta) {
  const to = from + delta;
  if (to < 0 || to >= array.length) return;
  const [item] = array.splice(from, 1);
  array.splice(to, 0, item);
  commit();
}

/* ============================ изображения ============================ */

async function pickImage(file, path, input, options = {}) {
  try {
    note('Готовлю изображение…');
    const prepared = await prepareImage(file);

    let value;
    if (supabase.configured && supabase.getSession()) {
      value = await supabase.uploadImage(prepared.blob, { ext: prepared.ext });
    } else {
      const name = localFileName(prepared.ext);
      downloadBlob(prepared.blob, name);
      value = `assets/${name}`;
      note(`Файл ${name} скачан в «Загрузки» — положите его в папку assets.`, 'ok');
    }

    setDeep(state.content, path, value);
    if (options.setSize && prepared.width) options.setSize(prepared.width, prepared.height);
    if (input) input.value = value;

    markDirty();
    openTab(state.tab);
    note(`Изображение готово: ${value}`, 'ok');
  } catch (error) {
    note('Не удалось подготовить изображение: ' + error.message, 'error');
  }
}

/* ============================ предпросмотр ============================ */

function schedulePreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(updatePreview, 260);
}

function previewHtml() {
  const siteData = state.content.site || {};
  const footer = siteData.footer || {};
  const body =
    state.preview === 'gallery' ? renderGalleryContent(state.content) : renderProfileContent(state.content);

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="site-shell">
<header>
  <a class="brand" href="#">${esc(siteData.name || '')}<small>${esc(siteData.brandNote || '')}</small></a>
  <nav aria-label="Навигация"><a href="#profile" aria-current="page">Профиль</a><a href="#gallery">Галерея</a></nav>
</header>
<main>${body}</main>
<footer><span>${esc(footer.left || '')}</span><span>${esc(footer.right || '')}</span></footer>
</div>
</body>
</html>`;
}

function updatePreview() {
  try {
    dom.preview.srcdoc = previewHtml();
  } catch (error) {
    dom.preview.srcdoc = `<p style="font-family:Arial;padding:20px">Ошибка рендера: ${esc(error.message)}</p>`;
  }
  fitPreview();
}

function fitPreview() {
  const width = dom.previewWrap.clientWidth;
  if (!width) return;
  const scale = Math.max(0.3, Math.min(1, width / 1100));
  dom.preview.style.width = '1100px';
  dom.preview.style.height = '1600px';
  dom.preview.style.transform = `scale(${scale})`;
  dom.previewWrap.style.height = `${Math.round(1600 * scale)}px`;
}

/* ============================ проверка ============================ */

function runChecks(announce) {
  const issues = [];
  const data = state.content;

  const required = (value, name) => {
    if (!value || !String(value).trim()) issues.push(`Не заполнено: ${name}`);
  };

  required(data.site && data.site.title, 'заголовок вкладки');
  required(data.site && data.site.description, 'описание для поисковиков');
  required(data.character && data.character.name, 'имя персонажа');
  required(data.character && data.character.intro, 'приветствие');

  if (data.site && data.site.url && !/^https?:\/\/.+\/$/.test(data.site.url)) {
    issues.push('Адрес сайта должен начинаться с http(s):// и заканчиваться слэшем');
  }

  if (!Array.isArray(data.sections) || !data.sections.length) issues.push('Нет ни одного раздела');
  (data.sections || []).forEach((section, index) => {
    if (!section.title) issues.push(`Раздел ${index + 1}: нет заголовка`);
    if (!section.text) issues.push(`Раздел ${index + 1}: нет текста`);
  });

  if (!Array.isArray(data.gallery && data.gallery.items) || !data.gallery.items.length) {
    issues.push('Галерея пуста');
  }

  try {
    renderProfileContent(data);
    renderGalleryContent(data);
  } catch (error) {
    issues.push('Рендер падает: ' + error.message);
  }

  dom.issues.hidden = false;
  if (issues.length) {
    dom.issues.className = 'issues';
    dom.issues.replaceChildren(
      el('strong', {}, `Найдено проблем: ${issues.length}`),
      el('ul', {}, ...issues.map((issue) => el('li', {}, issue))),
    );
    if (announce) note('Есть замечания — см. список сверху', 'error');
  } else {
    dom.issues.className = 'issues issues--ok';
    dom.issues.textContent = 'Всё на месте: обязательные поля заполнены, рендер проходит.';
    if (announce) note('Проверка пройдена', 'ok');
  }
}

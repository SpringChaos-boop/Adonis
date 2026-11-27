/**
 * admin/ui.js — крошечный набор DOM-хелперов для формы админки.
 * Без фреймворков: createElement + привязка к пути в объекте контента.
 */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name === 'html') node.innerHTML = value;
    else if (name === 'dataset') Object.assign(node.dataset, value);
    else if (name.startsWith('on') && typeof value === 'function') {
      node.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, String(value));
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** value по пути вида "sections.2.title". */
export function getPath(object, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/** Записывает value по пути, создавая недостающие объекты. */
export function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = object;
  for (const key of keys) {
    if (target[key] == null || typeof target[key] !== 'object') target[key] = /^\d+$/.test(key) ? [] : {};
    target = target[key];
  }
  target[last] = value;
}

export function field(label, control, hint) {
  return el(
    'label',
    { class: 'field' },
    el('span', {}, label),
    control,
    hint ? el('small', { class: 'hint' }, hint) : null,
  );
}

export function textField({ path, value = '', placeholder = '', type = 'text', small = false, readonly = false }) {
  return el('input', {
    class: `input${small ? ' input--small' : ''}`,
    type,
    'data-path': path,
    value: value ?? '',
    placeholder,
    readonly,
  });
}

export function numberField({ path, value = '', placeholder = '' }) {
  return el('input', {
    class: 'input input--small',
    type: 'number',
    'data-type': 'number',
    'data-path': path,
    value: value ?? '',
    placeholder,
  });
}

export function areaField({ path, value = '', rows = 4, placeholder = '' }) {
  const node = el('textarea', { class: 'input input--area', 'data-path': path, rows, placeholder });
  node.value = value ?? '';
  return node;
}

/* ---------- текст с форматированием ---------- */

const WRAP = {
  bold: { before: '**', after: '**', placeholder: 'жирный' },
  italic: { before: '*', after: '*', placeholder: 'курсив' },
  underline: { before: '__', after: '__', placeholder: 'подчёркнутый' },
  strike: { before: '~~', after: '~~', placeholder: 'зачёркнутый' },
  link: { before: '[', after: '](https://example.com)', placeholder: 'текст ссылки' },
};

function wrapSelection(textarea, before, after, placeholder) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const value = textarea.value;
  const selected = value.slice(start, end) || placeholder;
  textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
  textarea.focus();
  textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Текстовое поле с панелью форматирования (жирный, курсив, подчёркнутый, ссылка). */
export function richAreaField({ path, value = '', rows = 5, label = 'Текст', hint = '' }) {
  const textarea = el('textarea', { class: 'input input--area', 'data-path': path, rows });
  textarea.value = value ?? '';

  const button = (text, key, title) =>
    el(
      'button',
      {
        class: 'rich-btn',
        type: 'button',
        title,
        onclick: () => {
          const pair = WRAP[key];
          wrapSelection(textarea, pair.before, pair.after, pair.placeholder);
        },
      },
      text,
    );

  const toolbar = el(
    'div',
    { class: 'rich-toolbar', role: 'toolbar', 'aria-label': 'Форматирование текста' },
    button('Ж', 'bold', 'Жирный — Ctrl+B'),
    button('К', 'italic', 'Курсив — Ctrl+I'),
    button('Ч', 'underline', 'Подчёркнутый — Ctrl+U'),
    button('З', 'strike', 'Зачёркнутый'),
    button('Ссылка', 'link', 'Вставить ссылку'),
  );

  textarea.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()];
    if (!key) return;
    event.preventDefault();
    const pair = WRAP[key];
    wrapSelection(textarea, pair.before, pair.after, pair.placeholder);
  });

  const formatting =
    'Форматирование: **жирный**, *курсив*, __подчёркнутый__, ~~зачёркнутый~~, [ссылка](https://…). ' +
    'Enter — перенос строки.';

  return el(
    'div',
    { class: 'field' },
    el('span', {}, label),
    toolbar,
    textarea,
    el('small', { class: 'hint' }, hint ? `${hint} ${formatting}` : formatting),
  );
}

export function selectField({ path, value = '', options = [] }) {
  const node = el('select', { class: 'input', 'data-path': path });
  for (const option of options) {
    node.append(el('option', { value: option.value, selected: option.value === value }, option.label));
  }
  return node;
}

/**
 * Поле изображения: путь + превью + «Загрузить…».
 * onPick(file, path, input) выбирает, что делать с файлом (Supabase или скачивание).
 */
export function imageField({ path, value = '', label = 'Изображение', hint = '', onPick }) {
  const input = el('input', {
    class: 'input',
    'data-path': path,
    value: value ?? '',
    placeholder: 'assets/… или https://…',
  });
  const image = el('img', { alt: '' });
  const empty = el('span', {}, 'нет файла');
  const thumb = el('div', { class: 'image-field__thumb' }, image, empty);

  const sync = () => {
    const src = input.value.trim();
    if (src) {
      image.src = src;
      image.hidden = false;
      empty.hidden = true;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      empty.hidden = false;
    }
  };
  input.addEventListener('input', sync);
  image.hidden = true;
  sync();

  const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const pick = el('button', { class: 'btn', type: 'button' }, 'Загрузить…');
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files && file.files[0];
    if (chosen) onPick(chosen, path, input);
    file.value = '';
  });

  const clear = el('button', { class: 'btn btn--ghost', type: 'button' }, 'Убрать');
  clear.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  return el(
    'div',
    { class: 'field' },
    el('span', {}, label),
    el(
      'div',
      { class: 'image-field' },
      thumb,
      el('div', {}, input, el('div', { class: 'image-field__actions' }, pick, clear), hint ? el('small', { class: 'hint' }, hint) : null),
    ),
  );
}

/** Карточка элемента списка с кнопками перемещения и удаления. */
export function listItem({ index, title, onUp, onDown, onRemove, canUp = true, canDown = true, children }) {
  return el(
    'div',
    { class: 'list-item' },
    el(
      'div',
      { class: 'list-item__head' },
      el('div', { class: 'list-item__title' }, el('span', {}, String(index + 1).padStart(2, '0')), title || 'Без названия'),
      el(
        'div',
        { class: 'list-actions' },
        el('button', { class: 'icon-btn', type: 'button', title: 'Выше', disabled: !canUp, onclick: onUp }, '↑'),
        el('button', { class: 'icon-btn', type: 'button', title: 'Ниже', disabled: !canDown, onclick: onDown }, '↓'),
        el('button', { class: 'icon-btn', type: 'button', title: 'Удалить', onclick: onRemove }, '×'),
      ),
    ),
    children,
  );
}

export function panel(title, hint, ...children) {
  return el(
    'section',
    { class: 'panel' },
    title ? el('h2', {}, title) : null,
    hint ? el('p', { class: 'hint' }, hint) : null,
    ...children,
  );
}

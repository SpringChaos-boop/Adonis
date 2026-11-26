#!/usr/bin/env node
/**
 * server.mjs — локальный статический сервер без зависимостей.
 *
 * Нужен потому, что content.json подгружается через fetch:
 * при открытии index.html как file:// браузер блокирует такой запрос.
 * Запуск: node server.mjs [порт]   (или npm run dev)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const notFoundPage = await readFile(resolve(root, '404.html'), 'utf8').catch(() => null);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
    const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const filePath = resolve(root, `.${normalize(requested)}`);

    if (!filePath.startsWith(root)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('403');
      return;
    }

    let body;
    try {
      body = await readFile(filePath);
    } catch {
      response.writeHead(404, { 'Content-Type': TYPES['.html'] });
      response.end(notFoundPage || '404');
      return;
    }

    response.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`500: ${error.message}`);
  }
});

server.listen(port, () => {
  console.log(`Сайт доступен: http://localhost:${port}/`);
  console.log('Остановить сервер: Ctrl+C');
});

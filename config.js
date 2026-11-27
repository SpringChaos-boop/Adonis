/**
 * config.js — единственный файл, который нужно заполнить руками,
 * чтобы сайт и админка переключились с content.json на Supabase.
 *
 * Где взять значения: Supabase → Project Settings → API
 *   url     — Project URL, вида https://abcdefgh.supabase.co
 *   anonKey — ключ "anon public" (он публичный по замыслу)
 *
 * Пока значения пустые, сайт читает content.json, а админка
 * работает в локальном режиме: черновик в браузере + выгрузка файла.
 *
 * Сервисный ключ (service_role) сюда класть нельзя ни при каких условиях.
 */

export const supabaseConfig = {
  url: 'https://oemuwnzfuzbgzmzcdwkz.supabase.co',
  anonKey: 'sb_publishable__atvhrQcEWXNzpRml67u4Q_czP0BJV_',
};

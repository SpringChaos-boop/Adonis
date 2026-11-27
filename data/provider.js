/**
 * data/provider.js — единая точка доступа к контенту.
 *
 * Если в config.js заполнены url и anonKey — читаем из Supabase,
 * иначе (или если Supabase недоступен) — из content.json.
 * Остальной код о разнице не знает.
 */

import { supabaseConfig } from '../config.js';
import { createClient } from './supabase.js';

export const supabase = createClient(supabaseConfig);

export async function loadContent() {
  if (supabase.configured) {
    try {
      const data = await supabase.fetchContent();
      if (data) return data;
      console.warn('Supabase: контент ещё не сохранён, читаю content.json');
    } catch (error) {
      console.warn('Supabase недоступен, читаю content.json:', error.message);
    }
  }

  const response = await fetch('content.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`content.json: HTTP ${response.status}`);
  return response.json();
}

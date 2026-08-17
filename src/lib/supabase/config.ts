// Configuração e detecção do modo Supabase (integração híbrida).
// Sem as variáveis definidas, o app permanece em modo demo (localStorage).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE || "demo";

export const isSupabaseConfigured = DATA_MODE === "supabase" && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

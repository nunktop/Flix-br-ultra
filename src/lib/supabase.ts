/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sgpheellaheyizlunyoz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncGhlZWxsYWhleWl6bHVueW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjQyNzcsImV4cCI6MjA5MTE0MDI3N30.f9HRVlf3S3-9laqm4VCTYYwicvf7-fJEw_Wngo-K92Y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

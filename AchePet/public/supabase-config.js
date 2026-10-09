// supabase-config.js
const supabaseUrl = 'https://nmalotrlutjetnutzyqz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tYWxvdHJsdXRqZXRudXR6eXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MDQ4ODAsImV4cCI6MjEwNzA4MDg4MH0.scPzIIHTCEqTNx_kS_70Wu23R4Fbq9vfLep8yflcfww';

// MUDANÇA AQUI: Chamamos de clienteSupabase para não dar conflito
const clienteSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);
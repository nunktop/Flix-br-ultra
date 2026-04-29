import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Play, X } from 'lucide-react';
import { motion } from 'motion/react';

interface AuthFormProps {
  onClose?: () => void;
  onSuccess?: () => void;
}

export function AuthForm({ onClose, onSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Se precisar de verificação de email, pode avisar aqui
      }
      
      if (onSuccess) onSuccess();
    } catch (err: any) {
      let errorMessage = err.message || 'Ocorreu um erro na autenticação.';
      if (errorMessage.toLowerCase().includes('invalid login credentials')) {
        errorMessage = 'E-mail ou senha incorretos.';
      } else if (errorMessage.toLowerCase().includes('email not confirmed')) {
        errorMessage = 'Por favor, confirme seu e-mail antes de fazer login.';
      } else if (errorMessage.toLowerCase().includes('already registered')) {
        errorMessage = 'Este e-mail já está cadastrado.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white flex items-center justify-center p-4 fixed inset-0 z-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 p-8 rounded-2xl border border-white/10 w-full max-w-md relative"
      >
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <Play className="w-8 h-8 text-red-600 fill-red-600" />
            <span className="text-2xl font-black italic tracking-tighter">
              FLIX <span className="text-orange-500">BR</span><span className="text-red-600"> ULTRA+</span>
            </span>
          </div>
        </div>
        
        <h2 className="text-xl font-bold text-center mb-6">
          {isLogin ? 'Acesse sua conta' : 'Crie sua conta'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
              placeholder="Digite seu email"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
              placeholder="Digite sua senha"
            />
          </div>
          
          {error && (
            <div className="text-red-500 text-sm font-bold text-center bg-red-500/10 py-2 rounded">
              {error}
            </div>
          )}
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 disabled:opacity-50 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-all mt-6 shadow-[0_0_20px_rgba(249,115,22,0.3)] active:scale-95 focus:outline-none focus:ring-4 focus:ring-orange-500/50"
          >
            {loading ? 'Aguarde...' : (isLogin ? 'Entrar Agora' : 'Criar Conta')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entre'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

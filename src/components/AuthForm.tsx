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
      setError(err.message || 'Ocorreu um erro na autenticação.');
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
              FLIX BR<span className="text-red-600"> ULTRA+</span>
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
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:border-red-600 outline-none transition-colors"
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
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:border-red-600 outline-none transition-colors"
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
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black uppercase tracking-widest py-3 rounded-lg transition-colors mt-4"
          >
            {loading ? 'Aguarde...' : (isLogin ? 'Entrar' : 'Cadastrar')}
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

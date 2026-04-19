import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  User, 
  Menu, 
  X, 
  ChevronRight, 
  Shield, 
  ArrowRight, 
  LogOut, 
  LayoutGrid, 
  Download,
  CreditCard,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Plus,
  Edit,
  Sun,
  Moon,
  Loader2,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { supabase } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import AdminDashboard from './components/AdminDashboard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// --- Types ---
interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  file_url: string;
  is_active: boolean;
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  total_amount: number;
  created_at: string;
  product?: Product;
}

// --- Components ---

const Navbar = ({ user, theme, onThemeToggle, onAuthClick, onDashboardClick, onHomeClick, onSearch, searchQuery }: { 
  user: SupabaseUser | null, 
  theme: 'light' | 'dark',
  onThemeToggle: () => void,
  onAuthClick: () => void,
  onDashboardClick: (v: 'dashboard' | 'admin') => void,
  onHomeClick: () => void,
  onSearch: (q: string) => void,
  searchQuery: string
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
        <button onClick={onHomeClick} className="text-xl md:text-2xl font-serif tracking-tighter hover:opacity-70 transition-opacity dark:text-white">S.Art</button>
        
        <div className="flex items-center gap-2 md:gap-8">
          <div className="hidden lg:flex items-center gap-6">
            <div className="relative group">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="PESQUISAR..."
                className="bg-transparent border-b border-black/10 dark:border-white/10 py-1 pl-2 pr-8 text-[10px] uppercase tracking-[0.25em] outline-none w-40 focus:w-60 focus:border-luxury-gold transition-all duration-700 font-medium dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20"
              />
              <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30 group-focus-within:text-luxury-gold transition-colors" />
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4 pl-0 md:pl-4 md:border-l border-black/10 dark:border-white/10">
            <button 
              onClick={onThemeToggle} 
              className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white transition-all duration-500 cursor-pointer"
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <div className="hidden md:flex items-center gap-2 md:gap-3">
              {user ? (
                <>
                  {ADMIN_IDS.includes(user.id) && (
                    <Button variant="ghost" size="icon" onClick={() => onDashboardClick('admin')} className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-luxury-gold">
                      <Shield size={18} />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => onDashboardClick('dashboard')} className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white">
                    <LayoutGrid size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white">
                    <LogOut size={16} />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="icon" onClick={onAuthClick} className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white">
                  <User size={18} />
                </Button>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white transition-all"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white dark:bg-black border-b border-black/5 dark:border-white/5 overflow-hidden"
          >
            <div className="px-6 py-8 space-y-8">
              <div className="relative group w-full">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="PESQUISAR NA BOUTIQUE..."
                  className="w-full bg-transparent border-b border-black/10 dark:border-white/10 py-3 text-[10px] uppercase tracking-[0.2em] outline-none font-medium dark:text-white"
                />
                <Search size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {user ? (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => { onDashboardClick('dashboard'); setIsMobileMenuOpen(false); }}
                      className="rounded-none border-black/10 dark:border-white/10 dark:text-white h-12 uppercase tracking-widest text-[9px]"
                    >
                      <LayoutGrid size={14} className="mr-2" /> Biblioteca
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => { supabase.auth.signOut(); setIsMobileMenuOpen(false); }}
                      className="rounded-none border-black/10 dark:border-white/10 dark:text-white h-12 uppercase tracking-widest text-[9px]"
                    >
                      <LogOut size={14} className="mr-2" /> Sair
                    </Button>
                    {ADMIN_IDS.includes(user.id) && (
                      <Button 
                        variant="outline" 
                        onClick={() => { onDashboardClick('admin'); setIsMobileMenuOpen(false); }}
                        className="rounded-none border-luxury-gold/30 text-luxury-gold col-span-2 h-12 uppercase tracking-widest text-[9px]"
                      >
                        <Shield size={14} className="mr-2" /> Painel Admin
                      </Button>
                    )}
                  </>
                ) : (
                  <Button 
                    onClick={() => { onAuthClick(); setIsMobileMenuOpen(false); }}
                    className="rounded-none bg-black dark:bg-white text-white dark:text-black col-span-2 h-12 uppercase tracking-widest text-[9px]"
                  >
                    <User size={14} className="mr-2" /> Iniciar Sessão
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

function ProductCard({ product, onBuy, isProcessing }: { product: Product, onBuy: (p: Product) => any, isProcessing?: boolean }) {
  const getImageUrl = (url: string) => {
    if (!url) return 'https://picsum.photos/seed/ebook/600/800';
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('covers').getPublicUrl(url);
    return data.publicUrl;
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="group flex flex-col h-full bg-white dark:bg-zinc-900/80 p-3 border border-black/5 dark:border-white/10 hover:border-luxury-gold dark:hover:border-luxury-gold hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_20px_40px_rgba(212,175,55,0.05)] transition-all duration-500 rounded-sm"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100 dark:bg-zinc-800 shadow-inner rounded-sm">
        <img 
          src={getImageUrl(product.image_url)} 
          alt={product.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-500 flex items-center justify-center opacity-0 group-hover:opacity-100 p-4 text-center backdrop-blur-[1px]">
          <Button 
            disabled={isProcessing}
            onClick={(e) => { e.stopPropagation(); onBuy(product); }}
            className={`bg-white text-black hover:bg-luxury-gold hover:text-white rounded-none px-6 py-4 text-[10px] font-bold uppercase tracking-[0.25em] transition-all duration-500 transform ${isProcessing ? 'translate-y-0 opacity-100' : 'translate-y-8'} group-hover:translate-y-0 w-full max-w-[140px] shadow-2xl border-none`}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Processar...
              </span>
            ) : 'Adquirir'}
          </Button>
        </div>
        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md text-[8px] text-white px-2 py-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          S.Art Boutique
        </div>
      </div>
      <div className="mt-5 px-1 pb-2 space-y-1.5 flex-grow flex flex-col justify-end">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-serif text-[13px] leading-tight line-clamp-2 group-hover:text-luxury-gold transition-colors duration-300 dark:text-zinc-100">{product.title}</h3>
          <span className="text-[11px] font-black tracking-tight dark:text-luxury-gold">€{product.price}</span>
        </div>
        <div className="h-[1px] w-0 group-hover:w-full bg-expensive-gold transition-all duration-700 opacity-40 bg-luxury-gold" />
        <p className="text-[9px] text-black/40 dark:text-zinc-400 line-clamp-1 uppercase tracking-tighter pt-1 font-medium">
          {product.description}
        </p>
      </div>
    </motion.div>
  );
}

const ADMIN_IDS = [
  '3d596215-583e-498f-9fd5-36b83d8bccf5',
  '00d44feb-0b51-405e-86f7-31b67edfb7b6'
];

const AuthDialog = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSubmit = async () => {
    if (mode === 'register' && password !== confirmPassword) {
      toast.error('As passwords não coincidem.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Bem-vindo de volta.');
        onClose();
      } else {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: { full_name: fullName }
          }
        });
        if (error) throw error;
        
        // Create profile record
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: email,
            full_name: fullName
          });
        }

        toast.success('Conta criada. Verifique o seu email se necessário.');
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 rounded-none border-none shadow-2xl p-6 md:p-12 w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors duration-500">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="font-serif text-3xl mb-2 dark:text-white">S.Art Atelier</DialogTitle>
          <p className="text-[10px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40">
            {mode === 'login' ? 'Entrar na Boutique Digital' : 'Criar Conta Exclusiva'}
          </p>
        </DialogHeader>
        
        <div className="space-y-6 mt-8">
          <Button 
            onClick={handleGoogleLogin}
            variant="outline"
            className="w-full flex items-center justify-center gap-3 rounded-none h-12 border-black/10 dark:border-white/10 text-[10px] uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black dark:text-white transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar com Google
          </Button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-black/5 dark:border-white/5"></div>
            <span className="flex-shrink mx-4 text-[9px] uppercase tracking-widest text-black/30 dark:text-white/30">ou usar email</span>
            <div className="flex-grow border-t border-black/5 dark:border-white/5"></div>
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">Nome Completo</label>
              <input 
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white"
                placeholder="Ex: Maria Antonieta"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">Endereço de Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white"
              placeholder="vogue@sart.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">Palavra-passe</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white"
              placeholder="••••••••"
            />
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">Confirmar Palavra-passe</label>
              <input 
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white"
                placeholder="••••••••"
              />
            </div>
          )}

          <Button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-none h-14 uppercase tracking-widest text-[10px] cursor-pointer"
          >
            {loading ? 'A processar...' : (mode === 'login' ? 'Entrar na Boutique' : 'Criar Conta')}
          </Button>

          <button 
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="w-full text-center text-[9px] text-black/40 dark:text-white/40 uppercase tracking-widest hover:text-black dark:hover:text-white transition-colors"
          >
            {mode === 'login' ? 'Não tem conta? Registe-se' : 'Já tem conta? Inicie sessão'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CheckoutModal = ({ 
  isOpen, 
  onClose, 
  product, 
  userEmail, 
  onConfirm, 
  isProcessing 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  product: Product | null, 
  userEmail: string,
  onConfirm: (email: string) => void,
  isProcessing: boolean
}) => {
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (isOpen) setEmail(userEmail || '');
  }, [userEmail, isOpen]);

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] w-[95vw] rounded-none border-none dark:bg-zinc-900 p-6 md:p-8 shadow-2xl backdrop-blur-xl bg-white/95 transition-all duration-500">
        <DialogHeader className="space-y-4">
          <DialogTitle className="text-3xl font-serif dark:text-white tracking-tight">Destino da sua Obra</DialogTitle>
          <div className="flex gap-4 items-center p-4 bg-neutral-50/50 dark:bg-zinc-800/30 border border-black/5 dark:border-white/5">
            <div className="w-14 h-20 bg-neutral-200 dark:bg-zinc-700 flex-shrink-0 overflow-hidden shadow-md">
               <img src={product.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-[0.3em] text-black/30 dark:text-white/30 font-bold">Investimento Digital</p>
              <p className="text-sm font-serif dark:text-white leading-tight">{product.title}</p>
              <p className="text-xs font-black tracking-tight dark:text-luxury-gold pt-1">€{product.price}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-8 pt-6">
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-[0.25em] font-bold text-black/50 dark:text-white/50 pl-1">
              Endereço de Entrega (Email)
            </label>
            <div className="relative group">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@atelier.com"
                className="w-full bg-neutral-100/50 dark:bg-zinc-800/50 border border-transparent focus:border-luxury-gold/30 px-5 py-4 text-sm outline-none dark:text-white transition-all duration-300 rounded-sm"
              />
              <div className="absolute bottom-0 left-0 h-[1px] bg-luxury-gold w-0 group-focus-within:w-full transition-all duration-700" />
            </div>
            <p className="text-[9px] text-black/40 dark:text-zinc-500 italic pl-1 flex items-center gap-1.5">
              <span className="w-1 h-1 bg-luxury-gold rounded-full" />
              O link de acesso vitalício será enviado para este destino.
            </p>
          </div>

          <Button 
            onClick={() => onConfirm(email)}
            disabled={isProcessing || !email || !email.includes('@')}
            className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-luxury-gold dark:hover:bg-luxury-gold hover:text-white rounded-none h-14 text-[11px] font-bold uppercase tracking-[0.3em] transition-all duration-500 shadow-xl disabled:opacity-50"
          >
            {isProcessing ? (
               <span className="flex items-center gap-3">
                 <Loader2 size={16} className="animate-spin" />
                 A Iniciar Protocolo Stripe...
               </span>
            ) : (
              <span className="flex items-center gap-2">
                Concluir Aquisição <ArrowRight size={14} />
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [view, setView] = useState<'home' | 'dashboard' | 'success' | 'admin'>('home');
  const [purchasedProducts, setPurchasedProducts] = useState<Order[]>([]);
  const [successProduct, setSuccessProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sart-theme');
      return (saved as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    
    // Atualiza o estado da UI imediatamente para resposta rápida
    setTheme(newTheme);
    localStorage.setItem('sart-theme', newTheme);
    
    if (user) {
      try {
        // 1. Tenta salvar no banco de dados (profiles)
        const { error: dbError } = await supabase.from('profiles').upsert({
          id: user.id,
          theme: newTheme,
          email: user.email!
        }, { onConflict: 'id' });
        
        // 2. Sempre tenta salvar nos metadados do utilizador (backup garantido no banco de dados do Auth)
        const { error: authError } = await supabase.auth.updateUser({
          data: { theme: newTheme }
        });

        if (dbError) {
          console.warn("Aviso: Coluna 'theme' pode estar em falta na tabela profiles. Use os metadados como fallback.", dbError);
        }
        
        if (authError) {
          console.error("Erro ao atualizar metadados do utilizador:", authError);
        }
      } catch (err) {
        console.error("Erro inesperado ao sincronizar tema:", err);
      }
    }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleDownload = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/download`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('Erro ao gerar link de download.');
      }
    } catch (err) {
      toast.error('Erro na ligação ao servidor.');
    }
  };

  const getImageUrl = (url: string) => {
    if (!url) return 'https://picsum.photos/seed/ebook/600/800';
    if (url.startsWith('http')) return url;
    const { data } = supabase.storage.from('covers').getPublicUrl(url);
    return data.publicUrl;
  };

  useEffect(() => {
    if (window.location.pathname === '/admin') {
      if (user && !ADMIN_IDS.includes(user.id)) {
        setView('home');
        window.history.replaceState({}, '', '/');
        toast.error('Acesso restrito ao Administrador.');
      } else {
        setView('admin');
      }
    }
  }, [user]);

  // Gerir subscrição em tempo real separadamente para evitar conflitos de bloqueio
  useEffect(() => {
    if (!user) return;

    const channelName = `user-orders-realtime-${user.id}`;
    const ordersChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        table: 'orders', 
        filter: `user_id=eq.${user.id}` 
      }, (payload: any) => {
        if (payload.new.status === 'completed') {
          fetchDashboardData(user.id);
          toast.success('Pagamento confirmado! O seu e-book já está na biblioteca.', {
            duration: 5000,
            icon: <CheckCircle2 className="text-emerald-500" size={18} />
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[REALTIME] Subscribed to ${channelName}`);
        }
      });

    return () => {
      console.log(`[REALTIME] Unsubscribing from ${channelName}`);
      supabase.removeChannel(ordersChannel);
    };
  }, [user?.id]);

  useEffect(() => {
    // Escuta mudanças de autenticação
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        fetchDashboardData(currentUser.id);
        fetchProfile(currentUser.id);
      }
      
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        fetchProducts();
      }
    });

    fetchProducts();
    checkUrlParams();

    return () => {
      authSub.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    // Tenta primeiro os metadados do utilizador (mais rápido e sempre presente)
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser?.user_metadata?.theme) {
      const metaTheme = currentUser.user_metadata.theme as 'light' | 'dark';
      setTheme(metaTheme);
      localStorage.setItem('sart-theme', metaTheme);
      return;
    }

    // Se não houver nos metadados, tenta na tabela profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('theme')
      .eq('id', userId)
      .single();
    
    if (!error && data?.theme) {
      setTheme(data.theme as 'light' | 'dark');
      localStorage.setItem('sart-theme', data.theme);
    }
  };

  const checkUrlParams = async () => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const success = params.get('success');

    if (sessionId) {
      setView('success');
      try {
        const res = await fetch(`/api/session-status?session_id=${sessionId}`);
        const data = await res.json();
        if (data.status === 'paid') {
          setSuccessProduct(data.product);
          toast.success('Compra realizada com sucesso!');
          // Refresh dashboard to show the new book
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            fetchDashboardData(session.user.id);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        toast.error('Erro ao carregar produtos do atelier.');
        console.error(error);
      }
      if (data) setProducts(data.filter(p => p.is_active !== false));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async (userId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, product:products(*)')
      .eq('user_id', userId)
      .eq('status', 'completed');
    
    if (!error && data) setPurchasedProducts(data);
  };

  const handleBuy = async (product: Product) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    
    setSelectedProduct(product);
    setIsCheckoutModalOpen(true);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (view !== 'home' && query.trim() !== '') {
      setView('home');
    }
  };

  const handleCheckoutConfirm = async (email: string) => {
    if (!selectedProduct || !user) return;

    setCheckoutLoading(selectedProduct.id);
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          userId: user.id,
          email: email
        })
      });
      
      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Resposta do servidor não é JSON válido: ${responseText.substring(0, 50)}...`);
      }
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        const errorMsg = data.error || 'Erro ao processar checkout.';
        toast.error(errorMsg);
        console.error('[STRIPE CHECKOUT ERROR]', data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Ocorreu um erro ao conectar com o servidor.');
      console.error('[NETWORK ERROR]', err);
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div className={`h-screen flex items-center justify-center ${theme === 'dark' ? 'dark bg-black text-white' : 'bg-white text-black'}`}>
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-3xl font-serif tracking-tighter"
        >
          S.Art
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''} bg-background text-foreground font-sans selection:bg-primary-foreground selection:text-primary transition-colors duration-700`}>
      <Navbar 
        user={user} 
        theme={theme}
        onThemeToggle={toggleTheme}
        onAuthClick={() => setIsAuthOpen(true)} 
        onDashboardClick={(v) => setView(v)}
        onHomeClick={() => {
          setView('home');
          setSearchQuery('');
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
      />

      <CheckoutModal 
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        product={selectedProduct}
        userEmail={user?.email || ''}
        isProcessing={!!checkoutLoading}
        onConfirm={handleCheckoutConfirm}
      />

      <main className="pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === 'admin' && user && ADMIN_IDS.includes(user.id) && (
            <AdminDashboard user={user} onBack={() => {
              setView('home');
              fetchProducts();
            }} />
          )}

          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="space-y-12 w-full min-h-[60vh]"
            >
              <section className="text-center max-w-2xl mx-auto space-y-6">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl sm:text-5xl md:text-7xl font-serif tracking-tight px-4"
                >
                  Boutique de <br />Conhecimento Digital
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-[11px] uppercase tracking-[0.3em] text-neutral-400 font-medium"
                >
                  Curadoria de E-Books de Alta Estirpe & Atemporalidade
                </motion.p>
              </section>

              {/* Category Filter Bar */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 py-6 md:py-8 border-y border-black/5 dark:border-white/5">
                {(['Todos', 'Moda', 'Saúde', 'Tecnologia'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 sm:px-8 py-2 text-[8px] sm:text-[10px] uppercase tracking-[0.2em] transition-all duration-300 ${
                      selectedCategory === cat 
                        ? 'bg-black dark:bg-white text-white dark:text-black font-bold' 
                        : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white border border-transparent hover:border-black/10 dark:hover:border-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10 pt-8">
                {products
                  .filter(p => {
                    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
                    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                         p.description.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesCategory && matchesSearch;
                  })
                  .map((product) => (
                    <div key={product.id}>
                      <ProductCard 
                        product={product} 
                        onBuy={handleBuy} 
                        isProcessing={checkoutLoading === product.id}
                      />
                    </div>
                  ))}
              </div>

              {products.filter(p => selectedCategory === 'Todos' || p.category === selectedCategory).length === 0 && (
                <div className="py-32 text-center space-y-4 animate-in fade-in duration-1000">
                  <p className="font-serif text-2xl italic text-neutral-300">Novos e-books de {selectedCategory} em breve.</p>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400">A nossa curadoria está em processo de seleção.</p>
                </div>
              )}
            </motion.div>
          )}

          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-black/5 dark:border-white/5 pb-8 gap-6">
                <div>
                  <h2 className="text-3xl sm:text-4xl font-serif dark:text-white">Biblioteca Privada</h2>
                  <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 mt-2">Os Seus Ativos Digitais</p>
                </div>
                <Button variant="outline" className="rounded-none text-[9px] uppercase tracking-widest h-10 w-full sm:w-auto dark:text-white dark:border-white/10" onClick={() => setView('home')}>
                  Voltar à Coleção
                </Button>
              </div>

              {purchasedProducts.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-black/10 dark:border-white/10">
                  <BookOpen className="mx-auto mb-4 text-black/20 dark:text-white/20" size={32} />
                  <p className="text-xs uppercase tracking-widest text-black/40 dark:text-white/40">Ainda não possui e-books na sua biblioteca.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {purchasedProducts.map((order) => (
                    order.product && (
                      <Card key={order.id} className="rounded-none border-none bg-neutral-50 dark:bg-zinc-900 overflow-hidden group">
                        <CardContent className="p-0">
                          <div className="aspect-[3/4] overflow-hidden">
                            <img src={getImageUrl(order.product.image_url)} alt={order.product.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <div className="p-6 space-y-4">
                            <h3 className="font-serif text-lg dark:text-white">{order.product.title}</h3>
                            <Button 
                              onClick={() => handleDownload(order.id)}
                              className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-100 rounded-none inline-flex gap-2"
                            >
                              <Download size={14} />
                              <span className="text-[10px] uppercase tracking-widest">Descarregar PDF</span>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl mx-auto py-24 text-center space-y-12"
            >
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12 }}
                className="w-24 h-24 bg-luxury-gold rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-luxury-gold/20"
              >
                <CheckCircle2 size={40} className="text-white" />
              </motion.div>

              <div className="space-y-6 md:space-y-8">
                <h2 className="text-4xl md:text-6xl font-serif dark:text-white leading-[1.1] px-4">Aquisição <br />Concluída.</h2>
                <div className="h-px w-24 bg-luxury-gold mx-auto opacity-50" />
                <p className="text-[11px] uppercase tracking-[0.4em] text-black/40 dark:text-white/40 max-w-sm mx-auto leading-relaxed px-6">
                  A sua obra já está disponível para download imediato na sua biblioteca e foi enviada para o seu destino digital.
                </p>
              </div>

              {successProduct && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-none border border-black/5 dark:border-white/5 bg-neutral-50 dark:bg-zinc-900 overflow-hidden shadow-2xl mx-auto max-w-sm"
                >
                  <div className="flex bg-white dark:bg-black/20 p-6 gap-6 text-left items-center">
                    <div className="shadow-xl flex-shrink-0">
                      <img src={getImageUrl(successProduct.image_url)} className="w-20 h-28 object-cover" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-luxury-gold">Novo Ativo</p>
                      <h4 className="font-serif text-xl dark:text-white leading-tight">{successProduct.title}</h4>
                      <div className="pt-2">
                        <Button 
                          onClick={() => setView('dashboard')} 
                          variant="ghost" 
                          className="p-0 h-auto text-[10px] uppercase tracking-[0.2em] font-bold text-black/60 dark:text-white/60 hover:text-luxury-gold dark:hover:text-luxury-gold transition-all"
                        >
                          Ir para Biblioteca Privada <ArrowRight size={12} className="ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
                <Button 
                  onClick={() => setView('dashboard')}
                  className="bg-black dark:bg-white text-white dark:text-black px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-xl hover:bg-luxury-gold dark:hover:bg-luxury-gold hover:text-white transition-all duration-500"
                >
                  Aceder à Minha Obra
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setView('home')}
                  className="border-black/10 dark:border-white/10 px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-500"
                >
                  Mais Coleções
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-black/5 dark:border-white/5 py-20 px-6 bg-white dark:bg-black transition-colors duration-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
          <div className="space-y-4">
            <h3 className="text-3xl font-serif tracking-tighter dark:text-white">S.Art</h3>
            <p className="text-[9px] uppercase tracking-[0.3em] text-black/40 dark:text-white/40">© 2026 Boutique S.Art | S.Art-full.pt</p>
          </div>
          <div className="flex gap-8 text-[9px] uppercase tracking-[0.2em] font-medium text-black/60 dark:text-white/60">
            <a href="#" className="hover:text-black dark:hover:text-white transition-colors">Instagram</a>
            <a href="#" className="hover:text-black dark:hover:text-white transition-colors">Privacidade</a>
            <a href="#" className="hover:text-black dark:hover:text-white transition-colors">Termos</a>
          </div>
        </div>
      </footer>

      <AuthDialog isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <Toaster position="bottom-center" toastOptions={{
        style: { borderRadius: 0, fontFamily: 'serif', padding: '1.5rem' }
      }} />
    </div>
  );
}

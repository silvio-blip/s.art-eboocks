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
  Edit
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { supabase } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
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

const Navbar = ({ user, onAuthClick, onDashboardClick, onHomeClick }: { 
  user: SupabaseUser | null, 
  onAuthClick: () => void,
  onDashboardClick: (v: 'dashboard' | 'admin') => void,
  onHomeClick: () => void
}) => (
  <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
    <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <button onClick={onHomeClick} className="text-2xl font-serif tracking-tighter hover:opacity-70 transition-opacity">S.Art</button>
      
      <div className="flex items-center gap-8">
        <div className="hidden md:flex gap-8 text-[11px] uppercase tracking-[0.2em] font-medium text-black/60">
          <button onClick={onHomeClick} className="hover:text-black transition-colors">Coleção</button>
          <button className="hover:text-black transition-colors">Manifesto</button>
        </div>
        
        <div className="flex items-center gap-4 pl-4 border-l border-black/10">
          {user ? (
            <div className="flex items-center gap-3">
              {user.id === ADMIN_ID && (
                <Button variant="ghost" size="icon" onClick={() => onDashboardClick('admin')} className="rounded-full hover:bg-black/5 text-luxury-gold">
                  <Shield size={18} />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onDashboardClick('dashboard')} className="rounded-full hover:bg-black/5">
                <LayoutGrid size={18} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} className="rounded-full hover:bg-black/5">
                <LogOut size={16} />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" onClick={onAuthClick} className="rounded-full hover:bg-black/5">
              <User size={18} />
            </Button>
          )}
        </div>
      </div>
    </div>
  </nav>
);

function ProductCard({ product, onBuy }: { product: Product, onBuy: (p: Product) => any }) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100 border border-black/5">
        <img 
          src={product.image_url} 
          alt={product.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-500 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Button 
            onClick={() => onBuy(product)}
            className="bg-white text-black hover:bg-black hover:text-white rounded-none px-8 py-6 text-xs uppercase tracking-widest transition-all duration-300"
          >
            Adquirir Agora
          </Button>
        </div>
      </div>
      <div className="mt-6 space-y-2">
        <div className="flex justify-between items-start">
          <h3 className="font-serif text-lg leading-tight">{product.title}</h3>
          <span className="text-sm font-medium">€{product.price}</span>
        </div>
        <p className="text-xs text-black/50 line-clamp-2 uppercase tracking-wide leading-relaxed">
          {product.description}
        </p>
      </div>
    </motion.div>
  );
}

const ADMIN_ID = 'f86cf7f4-0f86-4f89-952f-0cb62f6dc93d';

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
      <DialogContent className="sm:max-w-md bg-white rounded-none border-none shadow-2xl p-12 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="font-serif text-3xl mb-2">S.Art Atelier</DialogTitle>
          <p className="text-[10px] uppercase tracking-[0.2em] text-black/40">
            {mode === 'login' ? 'Entrar na Boutique Digital' : 'Criar Conta Exclusiva'}
          </p>
        </DialogHeader>
        
        <div className="space-y-6 mt-8">
          <Button 
            onClick={handleGoogleLogin}
            variant="outline"
            className="w-full flex items-center justify-center gap-3 rounded-none h-12 border-black/10 text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all cursor-pointer"
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
            <div className="flex-grow border-t border-black/5"></div>
            <span className="flex-shrink mx-4 text-[9px] uppercase tracking-widest text-black/30">ou usar email</span>
            <div className="flex-grow border-t border-black/5"></div>
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50">Nome Completo</label>
              <input 
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black transition-colors"
                placeholder="Ex: Maria Antonieta"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-black/50">Endereço de Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black transition-colors"
              placeholder="vogue@sart.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-black/50">Palavra-passe</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black transition-colors"
              placeholder="••••••••"
            />
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50">Confirmar Palavra-passe</label>
              <input 
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black transition-colors"
                placeholder="••••••••"
              />
            </div>
          )}

          <Button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-black text-white hover:bg-neutral-800 rounded-none h-14 uppercase tracking-widest text-[10px] cursor-pointer"
          >
            {loading ? 'A processar...' : (mode === 'login' ? 'Entrar na Boutique' : 'Criar Conta')}
          </Button>

          <button 
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="w-full text-center text-[9px] text-black/40 uppercase tracking-widest hover:text-black transition-colors"
          >
            {mode === 'login' ? 'Não tem conta? Registe-se' : 'Já tem conta? Inicie sessão'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AdminPanel = ({ user, products, onProductUpdate }: { 
  user: SupabaseUser, 
  products: Product[],
  onProductUpdate: () => void
}) => {
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const isNew = !editingProduct?.id;
      const url = isNew ? '/api/admin/products' : `/api/admin/products/${editingProduct?.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingProduct, userId: user.id })
      });

      if (!res.ok) throw new Error('Erro ao guardar produto.');
      
      toast.success(isNew ? 'Produto criado!' : 'Produto atualizado!');
      setEditingProduct(null);
      onProductUpdate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza?')) return;
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      if (!res.ok) throw new Error('Erro ao eliminar.');
      toast.success('Produto desativado.');
      onProductUpdate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex justify-between items-end border-b border-black/5 pb-8">
        <div>
          <h2 className="text-4xl font-serif">Curadoria Administrative</h2>
          <p className="text-[10px] uppercase tracking-widest text-black/40 mt-2">Gestão da Boutique S.Art</p>
        </div>
        <Button 
          onClick={() => setEditingProduct({ title: '', price: 0, description: '', image_url: '', file_url: '' })}
          className="bg-black text-white rounded-none px-6 h-12 text-[10px] uppercase tracking-widest"
        >
          <Plus size={16} className="mr-2" /> Novo Ativo Digital
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {products.map((p) => (
          <div key={p.id} className="flex flex-col md:flex-row gap-6 p-6 border border-black/5 bg-neutral-50 group hover:bg-neutral-100 transition-colors">
            <img src={p.image_url} alt={p.title} className="w-24 h-32 object-cover border border-black/10" />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <h3 className="font-serif text-xl">{p.title}</h3>
                <span className="font-medium">€{p.price}</span>
              </div>
              <p className="text-xs text-black/50 line-clamp-1">{p.description}</p>
              <div className="flex gap-4 pt-4">
                <Button variant="outline" size="sm" className="rounded-none text-[9px] uppercase tracking-widest" onClick={() => setEditingProduct(p)}>
                  <Edit size={12} className="mr-1" /> Editar
                </Button>
                <Button variant="outline" size="sm" className="rounded-none text-[9px] uppercase tracking-widest text-red-500 hover:text-red-600" onClick={() => handleDelete(p.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="sm:max-w-xl bg-white rounded-none border-none shadow-2xl p-12 max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogTitle className="font-serif text-2xl mb-6">Configuração do E-Book</DialogTitle>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-widest text-black/50">Título</label>
                <input 
                  value={editingProduct?.title || ''}
                  onChange={e => setEditingProduct({ ...editingProduct!, title: e.target.value })}
                  className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-widest text-black/50">Preço (€)</label>
                <input 
                  type="number"
                  value={editingProduct?.price || ''}
                  onChange={e => setEditingProduct({ ...editingProduct!, price: parseFloat(e.target.value) })}
                  className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50">Descrição Breve</label>
              <textarea 
                value={editingProduct?.description || ''}
                onChange={e => setEditingProduct({ ...editingProduct!, description: e.target.value })}
                className="w-full border border-black/10 p-3 text-xs min-h-[100px] outline-none focus:border-black"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50">URL da Imagem (Capa)</label>
              <input 
                value={editingProduct?.image_url || ''}
                onChange={e => setEditingProduct({ ...editingProduct!, image_url: e.target.value })}
                className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50">URL do Ficheiro (PDF)</label>
              <input 
                value={editingProduct?.file_url || ''}
                onChange={e => setEditingProduct({ ...editingProduct!, file_url: e.target.value })}
                className="w-full border-b border-black/10 py-3 text-xs outline-none focus:border-black"
              />
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full bg-black text-white rounded-none h-14 uppercase tracking-widest text-[10px]">
              {loading ? 'A processar...' : 'Confirmar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchDashboardData(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchDashboardData(session.user.id);
    });

    fetchProducts();
    checkUrlParams();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true);
    
    if (!error && data) setProducts(data);
    setLoading(false);
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

    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          userId: user.id,
          email: user.email
        })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast.error('Erro ao processar checkout.');
    } catch (err) {
      toast.error('Ocorreu um erro.');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
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
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      <Navbar 
        user={user} 
        onAuthClick={() => setIsAuthOpen(true)} 
        onDashboardClick={(v) => setView(v)}
        onHomeClick={() => setView('home')}
      />

      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'admin' && user && user.id === ADMIN_ID && (
            <AdminPanel user={user} products={products} onProductUpdate={fetchProducts} />
          )}

          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-20"
            >
              <section className="text-center max-w-2xl mx-auto space-y-6">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-5xl md:text-7xl font-serif tracking-tight"
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-20">
                {products.map((product) => (
                  <div key={product.id}>
                    <ProductCard product={product} onBuy={handleBuy} />
                  </div>
                ))}
              </div>
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
              <div className="flex justify-between items-end border-b border-black/5 pb-8">
                <div>
                  <h2 className="text-4xl font-serif">Biblioteca Privada</h2>
                  <p className="text-[10px] uppercase tracking-widest text-black/40 mt-2">Os Seus Ativos Digitais</p>
                </div>
                <Button variant="outline" className="rounded-none text-[9px] uppercase tracking-widest h-10" onClick={() => setView('home')}>
                  Voltar à Coleção
                </Button>
              </div>

              {purchasedProducts.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-black/10">
                  <BookOpen className="mx-auto mb-4 text-black/20" size={32} />
                  <p className="text-xs uppercase tracking-widest text-black/40">Ainda não possui e-books na sua biblioteca.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {purchasedProducts.map((order) => (
                    order.product && (
                      <Card key={order.id} className="rounded-none border-none bg-neutral-50 overflow-hidden group">
                        <CardContent className="p-0">
                          <div className="aspect-[3/4] overflow-hidden">
                            <img src={order.product.image_url} alt={order.product.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <div className="p-6 space-y-4">
                            <h3 className="font-serif text-lg">{order.product.title}</h3>
                            <Button 
                              asChild
                              className="w-full bg-black text-white hover:bg-neutral-800 rounded-none inline-flex gap-2"
                            >
                              <a href={order.product.file_url} target="_blank" rel="noreferrer">
                                <Download size={14} />
                                <span className="text-[10px] uppercase tracking-widest">Descarregar PDF</span>
                              </a>
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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto py-20 text-center space-y-8"
            >
              <div className="flex justify-center">
                <CheckCircle2 size={64} strokeWidth={1} className="text-black" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-serif">A sua encomenda está pronta.</h2>
                <p className="text-xs uppercase tracking-widest leading-relaxed text-black/60">
                  Confirmamos o seu pagamento. O link de download também foi enviado para o seu email através da nossa boutique.
                </p>
              </div>

              {successProduct && (
                <Card className="rounded-none border-black/5 bg-neutral-50 shadow-none p-6">
                  <div className="flex gap-4 text-left items-center">
                    <img src={successProduct.image_url} className="w-16 h-20 object-cover border border-black/10" />
                    <div>
                      <h4 className="font-serif">{successProduct.title}</h4>
                      <Button asChild variant="link" className="p-0 h-auto text-[10px] uppercase tracking-widest text-black/60 hover:text-black">
                        <a href={successProduct.file_url} target="_blank" rel="noreferrer" className="inline-flex gap-1 items-center">
                          Descarregar Agora <ExternalLink size={10} />
                        </a>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <div className="pt-8">
                <Button 
                  onClick={() => setView('dashboard')}
                  className="bg-black text-white px-12 h-14 rounded-none uppercase tracking-widest text-[10px]"
                >
                  Ir para a minha Biblioteca
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-black/5 py-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
          <div className="space-y-4">
            <h3 className="text-3xl font-serif tracking-tighter">S.Art</h3>
            <p className="text-[9px] uppercase tracking-[0.3em] text-black/40">© 2026 Boutique S.Art | S.Art-full.pt</p>
          </div>
          <div className="flex gap-8 text-[9px] uppercase tracking-[0.2em] font-medium text-black/60">
            <a href="#" className="hover:text-black transition-colors">Instagram</a>
            <a href="#" className="hover:text-black transition-colors">Privacidade</a>
            <a href="#" className="hover:text-black transition-colors">Termos</a>
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

import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Download, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Clock,
  ArrowLeft,
  Search,
  Upload,
  FileText,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/src/lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';

const ADMIN_ID = '3d596215-583e-498f-9fd5-36b83d8bccf5';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image_url: string;
  file_url: string;
  is_active: boolean;
  created_at?: string;
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  total_amount: number;
  customer_email: string;
  created_at: string;
  product?: Product;
}

export default function AdminDashboard({ user, onBack }: { user: SupabaseUser, onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [tab, setTab] = useState<'overview' | 'products' | 'orders'>('overview');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user.id !== ADMIN_ID) {
      onBack();
      return;
    }

    fetchData();

    // Real-time subscription for orders
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', table: 'orders' }, () => {
        fetchDashboardData();
        toast.info('Novas atividades de vendas detectadas!');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchProducts(), fetchDashboardData()]);
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (data) setProducts(data);
  };

  const fetchDashboardData = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, product:products(*)')
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  const handleSaveProduct = async () => {
    if (!editingProduct?.title || !editingProduct?.price) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    try {
      const isNew = !editingProduct.id;
      const res = await fetch(isNew ? '/api/admin/products' : `/api/admin/products/${editingProduct.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingProduct, userId: user.id })
      });

      if (!res.ok) throw new Error('Erro ao salvar produto.');
      
      toast.success(isNew ? 'E-book adicionado à boutique.' : 'Ativo atualizado.');
      setEditingProduct(null);
      fetchProducts();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'pdf') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${type === 'image' ? 'covers' : 'ebooks'}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('assets') // Assuming a bucket named 'assets' exists
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('assets')
        .getPublicUrl(filePath);

      setEditingProduct(prev => ({
        ...prev!,
        [type === 'image' ? 'image_url' : 'file_url']: publicUrl
      }));
      
      toast.success(`${type === 'image' ? 'Capa' : 'PDF'} carregado com sucesso.`);
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Esta ação desativará o e-book. Continuar?')) return;
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      if (res.ok) {
        toast.success('Produto desativado.');
        fetchProducts();
      }
    } catch (e) {
      toast.error('Erro ao eliminar.');
    }
  };

  // Processing chart data
  const chartData = orders.reduce((acc: any[], order) => {
    const date = new Date(order.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
    const existingDate = acc.find(d => d.date === date);
    if (existingDate) {
      existingDate.value += Number(order.total_amount);
      existingDate.sales += 1;
    } else {
      acc.push({ date, value: Number(order.total_amount), sales: 1 });
    }
    return acc;
  }, []).reverse().slice(-7);

  const totalRevenue = orders.reduce((acc, o) => acc + Number(o.total_amount), 0);
  const completedSales = orders.filter(o => o.status === 'completed').length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-luxury-black text-white">
        <Loader2 className="animate-spin" size={48} strokeWidth={1} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-luxury-black text-luxury-white font-sans selection:bg-luxury-gold selection:text-black">
      {/* Admin Sidebar/Toprail */}
      <div className="border-b border-white/5 bg-luxury-dark/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button onClick={onBack} className="text-luxury-gold hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-serif tracking-tight">S.Art <span className="text-luxury-gold italic">Admin</span></h1>
          </div>
          
          <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
            {(['overview', 'products', 'orders'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-6 py-2 rounded-full text-[10px] uppercase tracking-widest transition-all ${
                  tab === t ? 'bg-luxury-gold text-black font-semibold' : 'text-white/40 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        {tab === 'overview' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-luxury-dark border-white/5 rounded-none p-8">
                <CardHeader className="p-0 pb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Faturamento Bruto</p>
                </CardHeader>
                <div className="flex items-end justify-between">
                  <h3 className="text-4xl font-serif">€{totalRevenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</h3>
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-full">
                    <TrendingUp size={20} />
                  </div>
                </div>
              </Card>
              
              <Card className="bg-luxury-dark border-white/5 rounded-none p-8">
                <CardHeader className="p-0 pb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Vendas Concluídas</p>
                </CardHeader>
                <div className="flex items-end justify-between">
                  <h3 className="text-4xl font-serif">{completedSales}</h3>
                  <div className="p-3 bg-luxury-gold/10 text-luxury-gold rounded-full">
                    <ShoppingBag size={20} />
                  </div>
                </div>
              </Card>

              <Card className="bg-luxury-dark border-white/5 rounded-none p-8">
                <CardHeader className="p-0 pb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Valor Médio</p>
                </CardHeader>
                <div className="flex items-end justify-between">
                  <h3 className="text-4xl font-serif">€{(totalRevenue / (completedSales || 1)).toFixed(2)}</h3>
                  <div className="p-3 bg-blue-500/10 text-blue-500 rounded-full">
                    <DollarSign size={20} />
                  </div>
                </div>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h3 className="text-sm font-medium uppercase tracking-widest text-white/50">Fluxo de Faturamento (7 Dias)</h3>
                <div className="h-[300px] w-full bg-luxury-dark/30 border border-white/5 p-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                        itemStyle={{ color: '#D4AF37' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#D4AF37" fillOpacity={1} fill="url(#colorVal)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-sm font-medium uppercase tracking-widest text-white/50">Volume de Vendas</h3>
                <div className="h-[300px] w-full bg-luxury-dark/30 border border-white/5 p-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                      />
                      <Bar dataKey="sales" fill="#fff" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Recent Orders Table */}
            <div className="space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-widest text-white/50">Últimas Transações</h3>
              <div className="overflow-x-auto border border-white/5">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">ID Ordem</th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">Produto</th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">Cliente</th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">Data</th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">Valor</th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orders.slice(0, 5).map(order => (
                      <tr key={order.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono text-[10px] text-white/50">{order.id.slice(0, 8)}...</td>
                        <td className="px-6 py-4 font-serif">{order.product?.title || 'Produto Removido'}</td>
                        <td className="px-6 py-4 text-white/60">{order.customer_email}</td>
                        <td className="px-6 py-4 text-white/40">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 font-medium">€{order.total_amount}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-widest font-bold ${
                            order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {order.status === 'completed' ? <CheckCircle size={8} className="mr-1" /> : <Clock size={8} className="mr-1" />}
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'products' && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-3xl font-serif">Gestão de Portfólio Digital</h2>
                <p className="text-[10px] uppercase tracking-widest text-white/30 mt-2">Adicione ou edite e-books exclusivos</p>
              </div>
              <Button 
                onClick={() => setEditingProduct({ title: '', price: 0, description: '', image_url: '', file_url: '' })}
                className="bg-luxury-gold text-black hover:bg-white rounded-none h-12 px-8 uppercase tracking-widest text-[10px] font-bold"
              >
                <Plus size={16} className="mr-2" /> Novo Ativo Digital
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(p => (
                <Card key={p.id} className="bg-luxury-dark border-white/5 rounded-none group overflow-hidden">
                  <div className="aspect-[3/4] relative overflow-hidden">
                    <img 
                      src={p.image_url} 
                      alt={p.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <Button variant="outline" className="border-white/20 rounded-none h-10 px-4 text-[9px] uppercase tracking-widest hover:bg-white hover:text-black" onClick={() => setEditingProduct(p)}>
                        <Edit size={14} className="mr-2" /> Editar
                      </Button>
                      <Button variant="outline" className="border-white/20 rounded-none h-10 px-4 text-[9px] uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white" onClick={() => handleDeleteProduct(p.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-6 space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-serif text-lg">{p.title}</h3>
                      <span className="text-luxury-gold font-medium">€{p.price}</span>
                    </div>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest">Digital E-Book</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Product Editor Inline (Full Screen/Wide Overlap) */}
            {editingProduct && (
              <div className="fixed inset-0 z-[60] bg-luxury-black/95 backdrop-blur-md flex items-center justify-center p-6">
                <Card className="max-w-4xl w-full bg-luxury-dark border-white/10 rounded-none p-12 space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="flex justify-between items-center">
                    <h3 className="text-3xl font-serif">{editingProduct.id ? 'Editar E-Book' : 'Novo Lançamento'}</h3>
                    <button onClick={() => setEditingProduct(null)} className="text-white/30 hover:text-white"><ArrowLeft /></button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-widest text-white/40">Título do Produto</label>
                        <input 
                          value={editingProduct.title}
                          onChange={e => setEditingProduct({ ...editingProduct, title: e.target.value })}
                          className="w-full bg-transparent border-b border-white/10 py-4 text-xl outline-none focus:border-luxury-gold transition-colors"
                          placeholder="Ex: O Código da Elegância"
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-widest text-white/40">Preço (€)</label>
                        <input 
                          type="number"
                          value={editingProduct.price}
                          onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })}
                          className="w-full bg-transparent border-b border-white/10 py-4 text-xl outline-none focus:border-luxury-gold transition-colors font-mono"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase tracking-widest text-white/40">Manifesto / Descrição</label>
                        <textarea 
                          value={editingProduct.description}
                          onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                          className="w-full bg-transparent border border-white/10 p-4 text-sm min-h-[150px] outline-none focus:border-luxury-gold transition-colors"
                          placeholder="Descreva a exclusividade deste conteúdo..."
                        />
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <label className="text-[10px] uppercase tracking-widest text-white/40 block">Capa (JPG/PNG)</label>
                          <div className="relative aspect-[3/4] border-2 border-dashed border-white/10 hover:border-luxury-gold cursor-pointer group transition-all">
                            {editingProduct.image_url ? (
                              <img src={editingProduct.image_url} className="w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                                <Upload size={32} strokeWidth={1} />
                                <span className="text-[8px] uppercase mt-4">Upload Imagem</span>
                              </div>
                            )}
                            <input 
                              type="file" 
                              accept="image/*"
                              onChange={(e) => handleFileUpload(e, 'image')}
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] uppercase tracking-widest text-white/40 block">Ficheiro (PDF)</label>
                          <div className="relative aspect-[3/4] border-2 border-dashed border-white/10 hover:border-blue-500 cursor-pointer group transition-all">
                            {editingProduct.file_url ? (
                              <div className="w-full h-full flex flex-col items-center justify-center text-blue-400 bg-blue-500/5">
                                <FileText size={48} strokeWidth={1} />
                                <span className="text-[8px] uppercase mt-4">PDF Pronto</span>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                                <Download size={32} strokeWidth={1} />
                                <span className="text-[8px] uppercase mt-4">Upload PDF</span>
                              </div>
                            )}
                            <input 
                              type="file" 
                              accept=".pdf"
                              onChange={(e) => handleFileUpload(e, 'pdf')}
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}
                          </div>
                        </div>
                      </div>

                      <div className="pt-8">
                        <Button onClick={handleSaveProduct} className="w-full bg-luxury-gold text-black hover:bg-white rounded-none h-16 uppercase tracking-widest font-bold">
                          Guardar Alterações do Ativo
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div>
              <h2 className="text-3xl font-serif">Livro de Ordens</h2>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mt-2">Relatório completo de aquisições digitais</p>
            </div>

            <div className="overflow-x-auto border border-white/5 bg-luxury-dark/30">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">ID da Ordem</th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">Produto Adquirido</th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">Email do Cliente</th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">Data de Venda</th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">Total</th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">Stripe Ref</th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-8 py-6 font-mono text-[10px] text-white/40">{order.id}</td>
                      <td className="px-8 py-6">
                        <div className="font-serif text-base">{order.product?.title || 'Expurgado'}</div>
                        <div className="text-[9px] uppercase tracking-widest text-white/20 mt-1">Ref: {order.product_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-8 py-6 text-luxury-gold/80">{order.customer_email}</td>
                      <td className="px-8 py-6 text-white/40">{new Date(order.created_at).toLocaleString()}</td>
                      <td className="px-8 py-6 font-medium text-lg">€{order.total_amount}</td>
                      <td className="px-8 py-6 font-mono text-[9px] text-white/30">{(order as any).stripe_session_id?.slice(0, 15) || 'N/A'}...</td>
                      <td className="px-8 py-6">
                        <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[9px] uppercase tracking-widest font-black ${
                          order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                        }`}>
                          {order.status === 'completed' ? <CheckCircle size={10} className="mr-2" /> : <XCircle size={10} className="mr-2" />}
                          {order.status === 'completed' ? 'Liquidado' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

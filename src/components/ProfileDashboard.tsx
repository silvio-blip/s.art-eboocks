import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  BookOpen, 
  ShoppingBag, 
  Edit, 
  Save, 
  Camera, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Package,
  ChevronRight,
  Download,
  Book
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  file_url: string;
  product_type?: 'digital' | 'physical';
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  shipping_status: string;
  total_amount: number;
  created_at: string;
  product?: Product;
  selected_options?: { size?: string, color?: string };
}

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string;
  description: string;
  custom_id: string;
}

interface ReadingProgress {
  book_id: string;
  last_page_read: number;
  total_pages: number;
}

interface ProfileDashboardProps {
  user: any;
  purchasedProducts: Order[];
  readingProgress: Record<string, ReadingProgress>;
  onRead: (product: Product, orderId: string, purchasedAt: string) => void;
  onProfileUpdate: (data: { full_name: string, avatar_url: string }) => void;
  onRefundRequest: (order: Order) => void;
}

const getImageUrl = (url: string) => {
  if (!url) return 'https://picsum.photos/seed/user/200/200';
  if (url.startsWith('http')) return url;
  try {
    const { data } = supabase.storage.from('assets').getPublicUrl(url);
    return data?.publicUrl || 'https://picsum.photos/seed/user/200/200';
  } catch (err) {
    console.warn('Error generating public URL in dashboard:', err);
    return 'https://picsum.photos/seed/user/200/200';
  }
};

export default function ProfileDashboard({ user, purchasedProducts, readingProgress, onRead, onProfileUpdate, onRefundRequest }: ProfileDashboardProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'library' | 'orders'>('general');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', description: '', avatar_url: '' });
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'sent' | 'delivered' | 'refunded'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      const profileData = {
        id: data.id,
        full_name: data.full_name || '',
        avatar_url: data.avatar_url || '',
        description: data.description || '',
        custom_id: data.custom_id || `SART-${data.id.substring(0, 4).toUpperCase()}`
      };

      setProfile(profileData);
      setEditForm({
        full_name: profileData.full_name,
        description: profileData.description,
        avatar_url: profileData.avatar_url
      });

      // If custom_id is missing in DB, update it
      if (!data.custom_id) {
        await supabase.from('profiles').update({ custom_id: profileData.custom_id }).eq('id', user.id);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter menos de 2MB.');
      return;
    }

    setIsUploading(true);
    const uploadToast = toast.loading('A atualizar avatar...');
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setEditForm(prev => ({ ...prev, avatar_url: filePath }));
      setProfile(prev => prev ? { ...prev, avatar_url: filePath } : null);
      onProfileUpdate({ full_name: editForm.full_name, avatar_url: filePath });
      toast.success('Avatar atualizado.', { id: uploadToast });
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload.', { id: uploadToast });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          description: editForm.description,
          avatar_url: editForm.avatar_url
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...editForm } : null);
      onProfileUpdate({ full_name: editForm.full_name, avatar_url: editForm.avatar_url });
      setIsEditing(false);
      toast.success('Perfil atualizado com sucesso.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar perfil.');
    }
  };

  const filteredOrders = purchasedProducts.filter(o => {
    if (orderFilter === 'all') return true;
    if (orderFilter === 'refunded') return o.status === 'refunded' || o.status === 'refund_pending';
    return o.shipping_status === orderFilter;
  });

  const libraryItems = purchasedProducts.filter(o => 
    (o.status === 'completed' || o.status === 'refund_pending') && 
    (o.product?.product_type === 'digital' || (!o.product?.product_type && o.product?.category === 'E-books'))
  );

  if (loading) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Tab Navigation */}
      <div className="flex border-b border-black/5 dark:border-white/5 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveTab('general')}
          className={`px-8 py-4 text-[10px] uppercase tracking-[0.25em] font-bold transition-all border-b-2 ${activeTab === 'general' ? 'border-luxury-gold text-black dark:text-white' : 'border-transparent text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
        >
          Geral
        </button>
        <button 
          onClick={() => setActiveTab('library')}
          className={`px-8 py-4 text-[10px] uppercase tracking-[0.25em] font-bold transition-all border-b-2 ${activeTab === 'library' ? 'border-luxury-gold text-black dark:text-white' : 'border-transparent text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
        >
          Minha Biblioteca
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={`px-8 py-4 text-[10px] uppercase tracking-[0.25em] font-bold transition-all border-b-2 ${activeTab === 'orders' ? 'border-luxury-gold text-black dark:text-white' : 'border-transparent text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
        >
          Meus Pedidos
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'general' && (
          <motion.div 
            key="general"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <div className="md:col-span-1 space-y-6">
              <div className="relative group">
                <div className="aspect-square w-full bg-neutral-100 dark:bg-zinc-800 rounded-none overflow-hidden border border-black/5 dark:border-white/5 shadow-2xl">
                  <img src={getImageUrl(profile?.avatar_url || '')} alt="Avatar" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
                {isEditing && (
                  <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] uppercase tracking-widest gap-2 cursor-pointer z-10 backdrop-blur-[2px]">
                    <Camera size={20} /> 
                    <span>{isUploading ? 'A carregar...' : 'Alterar Foto'}</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                  </label>
                )}
              </div>
              <div className="p-4 bg-neutral-50 dark:bg-zinc-900 border border-black/5 dark:border-white/5 text-center">
                <p className="text-[9px] uppercase tracking-[0.25em] text-luxury-gold font-bold mb-1">ID Exclusivo</p>
                <p className="text-xl font-serif dark:text-white">{profile?.custom_id}</p>
              </div>
            </div>

            <div className="md:col-span-2 space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-serif dark:text-white">Informações da Conta</h2>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)}
                  className="rounded-none text-[9px] uppercase tracking-widest h-10 border-black/10 dark:border-white/10 dark:text-white"
                >
                  {isEditing ? <><Save className="mr-2" size={12} /> Salvar Alterações</> : <><Edit className="mr-2" size={12} /> Editar Perfil</>}
                </Button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">Nome Completo</label>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editForm.full_name} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full bg-transparent border-b border-black/10 dark:border-white/10 py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                    />
                  ) : (
                    <p className="text-lg font-serif dark:text-white py-2">{profile?.full_name || 'Sem nome definido'}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">Descrição / Biografia Artistica</label>
                  {isEditing ? (
                    <textarea 
                      value={editForm.description} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full bg-transparent border border-black/10 dark:border-white/10 p-4 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white h-32 resize-none"
                    />
                  ) : (
                    <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed font-serif italic py-2">
                      {profile?.description || 'Adicione uma pequena descrição sobre si ou sobre o seu interesse artístico.'}
                    </p>
                  )}
                </div>

                <div className="pt-4 grid grid-cols-2 gap-4">
                  <div className="p-4 border border-black/5 dark:border-white/5 rounded-none">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-1">E-mail de Acesso</p>
                    <p className="text-xs font-medium dark:text-white">{user.email}</p>
                  </div>
                  <div className="p-4 border border-black/5 dark:border-white/5 rounded-none">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-1">Membro desde</p>
                    <p className="text-xs font-medium dark:text-white">{new Date(user.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'library' && (
          <motion.div 
            key="library"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-serif dark:text-white">Minha Coleção</h2>
                <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 mt-1">Conhecimento Digital de Alta Estirpe</p>
              </div>
            </div>

            {libraryItems.length === 0 ? (
              <div className="py-24 text-center border border-dashed border-black/10 dark:border-white/10 rounded-none bg-neutral-50/30 dark:bg-zinc-900/10">
                <BookOpen className="mx-auto mb-4 text-black/10 dark:text-white/10" size={48} />
                <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40">A sua biblioteca está vazia.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {libraryItems.map((order) => {
                  const progress = readingProgress[order.product_id];
                  const progressPercent = progress && progress.total_pages > 0 
                    ? Math.round((progress.last_page_read / progress.total_pages) * 100) 
                    : 0;
                    
                  const purchaseDate = new Date(order.created_at);
                  const releaseDate = new Date(purchaseDate.getTime() + (14 * 24 * 60 * 60 * 1000));
                  const daysSincePurchase = (new Date().getTime() - purchaseDate.getTime()) / (1000 * 3600 * 24);
                  const isWarrantyActive = daysSincePurchase <= 14;
                  const isRefundPending = order.status === 'refund_pending';

                  return order.product && (
                    <div key={order.id} className="group relative">
                      <div className="aspect-[3/4] bg-neutral-100 dark:bg-zinc-800 overflow-hidden relative shadow-md">
                        <img src={getImageUrl(order.product.image_url)} alt={order.product.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                        
                        {isRefundPending && (
                          <div className="absolute top-2 right-2 bg-amber-500 text-white text-[7px] font-bold uppercase tracking-widest px-2 py-1 shadow-xl">
                            Pendente
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 gap-3 text-center">
                          <Button 
                            onClick={() => onRead(order.product!, order.id, order.created_at)}
                            className="w-full rounded-none bg-white text-black hover:bg-luxury-gold hover:text-white text-[9px] uppercase tracking-widest h-10 transition-all font-bold"
                          >
                            <Book size={12} className="mr-2" /> Ler Agora
                          </Button>
                          
                          <Button 
                            disabled={isWarrantyActive}
                            variant="outline"
                            className="w-full rounded-none border-white/40 text-white hover:bg-white hover:text-black text-[9px] uppercase tracking-widest h-10 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                          >
                            <Download size={12} className="mr-2" /> {isWarrantyActive ? 'Em Proteção' : 'Download PDF'}
                          </Button>

                          {isWarrantyActive && !isRefundPending && (
                            <Button
                              variant="ghost"
                              onClick={() => onRefundRequest(order)}
                              className="w-full rounded-none text-red-400 hover:text-red-500 hover:bg-red-500/10 text-[8px] uppercase tracking-widest h-8 transition-all font-medium"
                            >
                              Solicitar Reembolso
                            </Button>
                          )}
                          
                          {isWarrantyActive && (
                            <p className="text-[7px] text-white/80 uppercase tracking-[0.2em] mt-1 leading-relaxed">
                              Disponível para download em:<br />
                              <span className="text-luxury-gold font-bold">{releaseDate.toLocaleDateString()}</span>
                            </p>
                          )}
                        </div>

                        {progressPercent > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                            <div className="h-full bg-luxury-gold transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-1">
                        <h4 className="font-serif text-sm dark:text-zinc-100 line-clamp-1">{order.product.title}</h4>
                        <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40">
                          {isRefundPending ? 'Aprocessar Reembolso' : progressPercent > 0 ? `${progressPercent}% Lido` : 'Não Lido'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div 
            key="orders"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h2 className="text-3xl font-serif dark:text-white">Meus Pedidos</h2>
                <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 mt-1">Histórico de Aquisições</p>
              </div>
              <div className="flex bg-neutral-50 dark:bg-zinc-900 p-1 border border-black/5 dark:border-white/5 overflow-x-auto no-scrollbar">
                {(['all', 'pending', 'sent', 'delivered', 'refunded'] as const).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setOrderFilter(f)}
                    className={`px-4 py-2 text-[8px] uppercase tracking-[0.15em] font-bold transition-all whitespace-nowrap ${orderFilter === f ? 'bg-black dark:bg-white text-white dark:text-black shadow-md' : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
                  >
                    {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendentes' : f === 'sent' ? 'Enviados' : f === 'delivered' ? 'Concluídos' : 'Reembolsos'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filteredOrders.length === 0 ? (
                <div className="py-24 text-center bg-neutral-50/50 dark:bg-zinc-900/30 border border-black/5 dark:border-white/5">
                  <Package className="mx-auto mb-4 text-black/10 dark:text-white/10" size={40} />
                  <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40">Nenhum pedido encontrado com este filtro.</p>
                </div>
              ) : (
                filteredOrders.map((order) => (
                  <div key={order.id} className="group bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5 overflow-hidden hover:border-luxury-gold/30 transition-all duration-500">
                    <div className="p-4 md:p-6 flex items-center gap-6">
                      <div className="w-16 h-20 bg-neutral-100 dark:bg-zinc-800 flex-shrink-0">
                        <img src={getImageUrl(order.product?.image_url || '')} alt="" className="w-full h-full object-cover" />
                      </div>
                      
                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        <div className="md:col-span-2">
                          <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40 mb-1">Produto</p>
                          <h4 className="font-serif text-sm dark:text-white truncate">{order.product?.title || 'Obra Removida'}</h4>
                          {order.selected_options && (order.selected_options.size || order.selected_options.color) && (
                            <div className="text-[9px] text-luxury-gold uppercase tracking-tighter mt-0.5 font-bold">
                              {order.selected_options.size && `Tam: ${order.selected_options.size}`}
                              {order.selected_options.size && order.selected_options.color && ' | '}
                              {order.selected_options.color && `Cor: ${order.selected_options.color}`}
                            </div>
                          )}
                          <p className="text-[10px] font-black text-luxury-gold mt-1">€{order.total_amount}</p>
                          <p className="text-[8px] uppercase tracking-widest text-black/30 dark:text-white/30 mt-2 font-mono select-all" title="Utilize este ID caso precise de suporte.">
                            ID: {order.id}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40 mb-1">Data</p>
                          <p className="text-[10px] dark:text-zinc-300">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        
                        <div className="flex justify-end md:justify-center gap-2">
                          {order.status === 'refund_pending' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[8px] uppercase tracking-widest font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/20 shadow-sm border border-amber-100 dark:border-amber-900/50">
                              Reembolso Solicitado
                            </span>
                          )}
                          {order.status === 'refunded' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[8px] uppercase tracking-widest font-bold bg-red-50 text-red-600 dark:bg-red-950/20 shadow-sm border border-red-100 dark:border-red-900/50">
                              Reembolsado
                            </span>
                          )}
                          {order.status === 'completed' && (() => {
                            const isDigital = order.product?.product_type === 'digital' || (!order.product?.product_type && order.product?.category === 'E-books');
                            const effectiveStatus = isDigital ? 'delivered' : (order.shipping_status || 'pending');
                            
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[8px] uppercase tracking-widest font-bold shadow-sm ${
                                effectiveStatus === 'delivered' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 shadow-emerald-500/5' :
                                effectiveStatus === 'sent' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 shadow-blue-500/5' :
                                effectiveStatus === 'processing' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 shadow-amber-500/5' :
                                effectiveStatus === 'pago' ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 shadow-emerald-500/5' :
                                'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                              }`}>
                                {effectiveStatus === 'delivered' ? <CheckCircle2 size={10} /> : 
                                 effectiveStatus === 'sent' ? <Truck size={10} /> : 
                                 effectiveStatus === 'pago' ? <CheckCircle2 size={10} /> :
                                 <Clock size={10} />}
                                {effectiveStatus === 'delivered' ? 'Concluído' : 
                                 effectiveStatus === 'sent' ? 'Em Trânsito' : 
                                 effectiveStatus === 'processing' ? 'Armazém / Processando' :
                                 effectiveStatus === 'pago' ? 'Pago' : 'Pendente'}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="icon" className="hidden md:flex text-black/20 dark:text-white/20 group-hover:text-luxury-gold transition-colors">
                        <ChevronRight size={18} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

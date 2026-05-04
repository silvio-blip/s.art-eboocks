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
  Book,
  X,
  FileText,
  Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

interface Product {
  id: string;
  title: string;
  description: string;
  pvp: number;
  category: string;
  image_url: string;
  file_url: string;
  is_active?: boolean;
  product_type?: 'digital' | 'physical';
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  shipping_status: string;
  payment_status?: string;
  shipping_status_metadata?: {
    trackingNumber?: string;
    trackingUrl?: string;
    lastUpdate?: string;
  };
  dropea_order_id?: string;
  total_amount: number;
  created_at: string;
  product?: Product;
  customer_email?: string;
  user_id?: string;
  selected_options?: { size?: string, color?: string, shipping_details?: any };
  stripe_session_id?: string;
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

export default function ProfileDashboard({ user, purchasedProducts, onProfileUpdate, onRefundRequest }: ProfileDashboardProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'orders'>('general');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', description: '', avatar_url: '', notification_email: '' });
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'sent' | 'delivered' | 'refunded' | 'canceled'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncOrder = async (orderId: string) => {
    setIsSyncing(true);
    const toastId = toast.loading('Sincronizando status com Dropea...');
    try {
      const res = await fetch(`/api/orders/${orderId}/sync`, { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar');
      
      if (data.success) {
        toast.success('Status atualizado com sucesso!', { id: toastId });
        // Update local state if it's the selected order
        if (selectedOrder && selectedOrder.id === orderId) {
          // Relativamente hacky mas funciona para atualizar o modal sem recarregar tudo
          // Idealmente recarregaríamos a lista de orders do pai
          window.location.reload(); 
        }
      } else {
        toast.info('Nenhuma atualização disponível no momento.', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

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
        custom_id: data.custom_id || `SART-${data.id.substring(0, 4).toUpperCase()}`,
        notification_email: data.notification_email || user.email || ''
      };

      setProfile(profileData);
      setEditForm({
        full_name: profileData.full_name,
        description: profileData.description,
        avatar_url: profileData.avatar_url,
        notification_email: profileData.notification_email
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
      const filePath = `avatars/${fileName}`; // Usando pasta avatars dentro do bucket assets

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
          avatar_url: editForm.avatar_url,
          notification_email: editForm.notification_email
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
    if (orderFilter === 'canceled') return ['canceled', 'cancelled', 'refunded', 'refund_pending'].includes(o.status || '');
    return o.shipping_status === orderFilter;
  });

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
                  <img 
                    src={getImageUrl(profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '')} 
                    alt="Avatar" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                  />
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
                  <label className="text-[9px] uppercase tracking-widest text-luxury-gold font-bold">Email para Notificações</label>
                  {isEditing ? (
                    <input 
                      type="email"
                      value={editForm.notification_email}
                      onChange={e => setEditForm(prev => ({ ...prev, notification_email: e.target.value }))}
                      className="w-full bg-transparent border-b border-black/10 dark:border-white/10 py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                      placeholder="seu@email.com"
                    />
                  ) : (
                    <p className="text-lg font-serif dark:text-white py-2">{profile?.notification_email || user?.email || 'Nenhum definido'}</p>
                  )}
                </div>

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
                {(['all', 'pending', 'sent', 'delivered', 'refunded', 'canceled'] as const).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setOrderFilter(f)}
                    className={`px-4 py-2 text-[8px] uppercase tracking-[0.15em] font-bold transition-all whitespace-nowrap ${orderFilter === f ? 'bg-black dark:bg-white text-white dark:text-black shadow-md' : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
                  >
                    {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendentes' : f === 'sent' ? 'Enviados' : f === 'delivered' ? 'Concluídos' : f === 'refunded' ? 'Reembolsos' : 'Cancelados'}
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
                  <div 
                    key={order.id} 
                    onClick={() => setSelectedOrder(order)}
                    className="group bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5 overflow-hidden hover:border-luxury-gold/30 transition-all duration-500 cursor-pointer"
                  >
                    <div className="p-4 md:p-6 flex items-center gap-6">
                      <div className="w-16 h-20 bg-neutral-100 dark:bg-zinc-800 flex-shrink-0">
                        <img 
                          src={getImageUrl(order.product?.image_url || '')} 
                          referrerPolicy="no-referrer"
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
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
                            ID: SART-{order.id.split('-')[0].toUpperCase()}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40 mb-1">Data</p>
                          <p className="text-[10px] dark:text-zinc-300">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        
                        <div className="md:col-span-1 flex flex-col items-center gap-1">
                          {/* Order Status */}
                          <div className="flex flex-col items-center gap-1 w-full">
                            <p className="text-[7px] uppercase tracking-widest text-black/40 dark:text-white/40">Pedido</p>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[8px] uppercase tracking-widest font-black w-full justify-center border ${
                              order.status === 'canceled' || order.status === 'cancelled'
                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                : order.status === 'refunded'
                                  ? "bg-slate-500/10 text-slate-500 border-slate-500/20"
                                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            }`}>
                              {order.shipping_status === 'delivered' ? 'Entregue' : 
                               order.shipping_status === 'sent' ? 'Em Trânsito' : 
                               (order.status === 'canceled' || order.status === 'cancelled') ? 'Cancelado' :
                               (order.status === 'refunded' || order.payment_status === 'refunded' || order.status === 'reembolsado') ? 'Reembolsado' : 
                               ['paid', 'succeeded', 'completed'].includes(order.status || "") ? 'Preparando' : 'Em Processamento'}
                            </span>
                          </div>

                          {/* Payment Status (Only show if paid or refunded or canceled) */}
                          <div className="flex flex-col items-center gap-1 w-full">
                            <p className="text-[7px] uppercase tracking-widest text-black/40 dark:text-white/40">Pagamento</p>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[8px] uppercase tracking-widest font-black w-full justify-center border ${
                              (order.payment_status === 'refunded' || order.status === 'refunded')
                                ? "bg-red-500 text-white border-red-600"
                                : (order.payment_status === 'paid' || order.status === 'paid' || order.status === 'completed' || order.status === 'succeeded')
                                  ? "bg-emerald-500 text-white border-emerald-600"
                                  : "bg-amber-500 text-white border-amber-600"
                            }`}>
                              {(order.payment_status === 'refunded' || order.status === 'refunded') ? 'Reembolsado' :
                               (order.payment_status === 'paid' || order.status === 'paid' || order.status === 'completed' || order.status === 'succeeded') ? 'Pago' :
                               order.status === 'refund_pending' ? 'Estornando' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                        
                        <Button variant="ghost" size="icon" className="hidden md:flex text-black/20 dark:text-white/20 group-hover:text-luxury-gold transition-colors">
                          <ChevronRight size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Detail Modal for User */}
      <AnimatePresence>
        {selectedOrder && (() => {
          const shippingData = (() => {
            if (!selectedOrder.shipping_details) return selectedOrder.selected_options?.shipping_details;
            if (typeof selectedOrder.shipping_details === 'object') return selectedOrder.shipping_details;
            try {
              return JSON.parse(selectedOrder.shipping_details);
            } catch(e) {
              return null;
            }
          })();

          return (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setSelectedOrder(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-[#121212] w-full max-w-2xl border border-black/5 dark:border-white/5 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center p-6 border-b border-black/5 dark:border-white/5">
                  <h3 className="text-xl font-serif dark:text-white">Detalhes do Pedido</h3>
                  <button onClick={() => setSelectedOrder(null)} className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
                  {/* Product Info */}
                  <div className="flex gap-6 items-start">
                    <div className="w-24 h-32 bg-neutral-100 dark:bg-zinc-800 flex-shrink-0 border border-black/5 dark:border-white/5">
                      <img 
                        src={getImageUrl(selectedOrder.product?.image_url || '')} 
                        alt="" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40">Item de Luxo</p>
                      <h4 className="text-2xl font-serif dark:text-white leading-tight">{selectedOrder.product?.title || 'Obra Removida'}</h4>
                      {selectedOrder.selected_options && (selectedOrder.selected_options.size || selectedOrder.selected_options.color) && (
                        <div className="text-xs text-luxury-gold uppercase tracking-widest font-bold">
                          {selectedOrder.selected_options.size && `Tam: ${selectedOrder.selected_options.size} `}
                          {selectedOrder.selected_options.color && `| Cor: ${selectedOrder.selected_options.color}`}
                        </div>
                      )}
                      <p className="text-lg font-black text-luxury-gold pt-2">€{selectedOrder.total_amount}</p>
                    </div>
                  </div>

                  {/* Shipping Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="text-[10px] uppercase tracking-widest text-luxury-gold font-bold flex items-center gap-2">
                        <Truck size={14} /> Detalhes de Envio
                      </div>
                      {shippingData ? (
                        <div className="text-sm space-y-3 dark:text-white/80">
                          <div>
                            <p className="text-[9px] uppercase text-black/40 dark:text-white/40 tracking-wider">Destinatário</p>
                            <p className="font-medium">{shippingData.fullName || `${shippingData.firstName || ''} ${shippingData.lastName || ''}`.trim() || shippingData.name || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-black/40 dark:text-white/40 tracking-wider">Morada</p>
                            <p>{shippingData.address || 'N/A'}</p>
                            <p>{shippingData.postalCode || shippingData.zip || ''} {shippingData.city || ''}</p>
                            <p className="uppercase tracking-widest text-[10px] mt-1">{shippingData.country || 'PT'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase text-black/40 dark:text-white/40 tracking-wider">Contacto</p>
                            <p>{shippingData.phone || 'N/A'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-neutral-50 dark:bg-zinc-900/50 border border-black/5 dark:border-white/5 border-dashed text-center">
                          <p className="text-xs text-black/40 dark:text-white/40 italic">Informação de envio não disponível para itens digitais ou processamento pendente.</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="text-[10px] uppercase tracking-widest text-luxury-gold font-bold flex items-center gap-2">
                        <FileText size={14} /> Resumo do Status
                      </div>
                      <div className="space-y-4 text-sm">
                        <div className="p-4 bg-neutral-100 dark:bg-zinc-800/50 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] uppercase tracking-wider text-black/50 dark:text-white/50">Status Pagamento</span>
                            <span className="text-[9px] uppercase bg-emerald-500/10 text-emerald-500 px-2 py-0.5 font-bold">{selectedOrder.status === 'paid' ? 'Liquidado' : selectedOrder.status}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] uppercase tracking-wider text-black/50 dark:text-white/50">Estado do Pedido</span>
                              <span className="text-[9px] uppercase font-bold dark:text-white">
                                {selectedOrder.status === 'completed' ? 'Concluído' : 
                                 selectedOrder.status === 'paid' ? 'Pago' : 
                                 selectedOrder.status === 'canceled' ? 'Cancelado' :
                                 selectedOrder.status === 'refunded' ? 'Reembolsado' :
                                 selectedOrder.status === 'pending' ? 'Pendente' : 
                                 selectedOrder.status}
                              </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] uppercase tracking-wider text-black/50 dark:text-white/50">Estado Envio</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] uppercase font-bold dark:text-white">
                                {selectedOrder.shipping_status === 'sent' ? 'Enviado' : 
                                 selectedOrder.shipping_status === 'delivered' ? 'Entregue' : 
                                 selectedOrder.shipping_status || 'A Processar'}
                              </span>
                              {selectedOrder.dropea_order_id && (
                                <button 
                                  onClick={() => handleSyncOrder(selectedOrder.id)}
                                  disabled={isSyncing}
                                  className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors disabled:opacity-50"
                                  title="Sincronizar com Dropea"
                                >
                                  <Clock size={10} className={`${isSyncing ? 'animate-spin' : ''}`} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-black/5 dark:border-white/5 mt-2">
                             <div className="flex items-center gap-2">
                               <Mail size={12} className="text-luxury-gold" />
                               <span className="text-[9px] uppercase tracking-wider text-black/50 dark:text-white/50">Alertas por E-mail</span>
                             </div>
                             <button
                               onClick={async () => {
                                 try {
                                   const newValue = !(selectedOrder.notifications_enabled !== false);
                                   const { error } = await supabase
                                     .from('orders')
                                     .update({ notifications_enabled: newValue })
                                     .eq('id', selectedOrder.id);
                                   
                                   if (error) throw error;
                                   
                                   // Update UI
                                   setSelectedOrder(prev => prev ? { ...prev, notifications_enabled: newValue } : null);
                                   toast.success(newValue ? "Notificações ativadas" : "Notificações desativadas");
                                   
                                   // Optional: reload to sync list state
                                   setTimeout(() => window.location.reload(), 1000);
                                 } catch (err: any) {
                                   toast.error("Erro ao atualizar preferências: " + err.message);
                                 }
                               }}
                               className={`w-8 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${ (selectedOrder.notifications_enabled !== false) ? 'bg-emerald-500' : 'bg-black/20 dark:bg-white/20' }`}
                             >
                               <div className={`w-3 h-3 bg-white rounded-full transition-transform ${ (selectedOrder.notifications_enabled !== false) ? 'translate-x-4' : 'translate-x-0' } shadow-sm`} />
                             </button>
                          </div>
                          {selectedOrder.shipping_status_metadata?.trackingNumber && (
                            <div className="pt-2 mt-2 border-t border-black/5 dark:border-white/5 space-y-1">
                              <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40">Código de Rastreio</p>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono font-bold dark:text-white">{selectedOrder.shipping_status_metadata.trackingNumber}</span>
                                {selectedOrder.shipping_status_metadata.trackingUrl && (
                                  <a 
                                    href={selectedOrder.shipping_status_metadata.trackingUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[8px] uppercase tracking-widest text-luxury-gold hover:underline font-bold"
                                  >
                                    Seguir Objeto
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-[9px] text-black/40 dark:text-white/40 font-mono space-y-1">
                          <p>ORDEM: SART-{selectedOrder.id.toUpperCase()}</p>
                          <p>DATA: {new Date(selectedOrder.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-4">
                    <Button 
                      className="flex-1 rounded-none h-12 bg-black dark:bg-white text-white dark:text-black text-[10px] uppercase tracking-widest font-bold"
                      onClick={() => setSelectedOrder(null)}
                    >
                      Fechar Detalhes
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  ShoppingBag, 
  Edit, 
  Save, 
  Camera, 
  Truck, 
  Clock,
  ChevronRight,
  X,
  FileText,
  Mail,
  LogOut,
  ArrowUpRight,
  MapPin,
  Calendar,
  CreditCard,
  Hash,
  Crown,
  Shield,
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
  provider_order_id?: string;
  total_amount: number;
  created_at: string;
  product?: Product;
  customer_email?: string;
  user_id?: string;
  selected_options?: { size?: string, color?: string, shipping_details?: any };
  shipping_details?: any;
  notifications_enabled?: boolean;
}

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string;
  description: string;
  custom_id: string;
  notification_email: string;
  is_admin?: boolean;
  is_employee?: boolean;
  products_count?: number;
  saved_address?: {
    full_name?: string;
    address?: string;
    city?: string;
    zip?: string;
    phone?: string;
  };
}

interface ProfileDashboardProps {
  user: any;
  purchasedProducts: Order[];
  onProfileUpdate: (data: { full_name?: string, avatar_url?: string, custom_cursor_enabled?: boolean }) => void;
  onRefundRequest: (order: Order) => void;
  onLogout: () => void;
  formatPrice?: (price: number) => string;
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

export default function ProfileDashboard({ user, purchasedProducts, onProfileUpdate, onRefundRequest, onLogout, formatPrice }: ProfileDashboardProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'orders'>('general');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editForm, setEditForm] = useState({ 
    full_name: '', 
    description: '', 
    avatar_url: '', 
    notification_email: ''
  });
  const [cursorEnabled, setCursorEnabled] = useState(true);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'sent' | 'delivered' | 'refunded' | 'canceled'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    address: '',
    city: '',
    zip: '',
    phone: '',
    email: ''
  });
  const [isUpdatingAddress, setIsUpdatingAddress] = useState(false);
  const [isEditingSavedAddress, setIsEditingSavedAddress] = useState(false);
  const [savedAddressForm, setSavedAddressForm] = useState({
    full_name: '',
    address: '',
    city: '',
    zip: '',
    phone: ''
  });
  const [isSavingSavedAddress, setIsSavingSavedAddress] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      loadProfile();
      // Load cursor preference from localStorage
      const saved = localStorage.getItem('luxury_cursor_enabled');
      setCursorEnabled(saved !== 'false');
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
      
      const { count: pCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id);
      
      const profileData: Profile = {
        id: data.id,
        full_name: data.full_name || '',
        avatar_url: data.avatar_url || '',
        description: data.description || '',
        custom_id: data.custom_id || `Sart-${data.id.substring(0, 4).toUpperCase()}`,
        notification_email: data.notification_email || user.email || '',
        is_admin: data.is_admin,
        is_employee: data.is_employee,
        products_count: pCount || 0,
        saved_address: data.saved_address || {}
      };

      setProfile(profileData);
      setEditForm({
        full_name: profileData.full_name,
        description: profileData.description,
        avatar_url: profileData.avatar_url,
        notification_email: profileData.notification_email,
      });

      setSavedAddressForm({
        full_name: profileData.saved_address?.full_name || '',
        address: profileData.saved_address?.address || '',
        city: profileData.saved_address?.city || '',
        zip: profileData.saved_address?.zip || '',
        phone: profileData.saved_address?.phone || ''
      });

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

  const handleUpdateAddress = async () => {
    if (!selectedOrder || !user) return;
    
    setIsUpdatingAddress(true);
    const tid = toast.loading('A atualizar morada de envio...');
    
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/address`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          ...addressForm
        })
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar morada');

      toast.success('Morada atualizada com sucesso!', { id: tid });
      setIsEditingAddress(false);
      
      // Atualizar o estado local da ordem
      const updatedOrder = {
        ...selectedOrder,
        shipping_details: {
          ...selectedOrder.shipping_details,
          address: addressForm.address,
          city: addressForm.city,
          zip: addressForm.zip,
          phone: addressForm.phone,
          email: addressForm.email
        },
        customer_email: addressForm.email
      };
      
      setSelectedOrder(updatedOrder);
      
      // Também seria ideal atualizar a lista de produtos comprados no componente pai
      // mas como o estado local já foi atualizado, o modal refletirá a mudança.
      
    } catch (err: any) {
      toast.error(err.message, { id: tid });
    } finally {
      setIsUpdatingAddress(false);
    }
  };

  const startEditingAddress = (order: Order) => {
    let details = order.shipping_details || {};
    
    // Handle stringified JSON from older records or database anomalies
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch (e) {
        console.error("Failed to parse shipping_details:", e);
        details = {};
      }
    }

    setAddressForm({
      address: details.address || '',
      city: details.city || '',
      zip: details.zip || details.postalCode || '',
      phone: details.phone || '',
      email: order.customer_email || details.email || ''
    });
    setIsEditingAddress(true);
  };

  const handleSaveProfile = async () => {
    const toastId = toast.loading('Salvando alterações...');
    try {
      // Ensure we have the user ID
      if (!user?.id) throw new Error('Utilizador não autenticado');

      const { data: updateData, error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          description: editForm.description,
          avatar_url: editForm.avatar_url,
          notification_email: editForm.notification_email,
        })
        .eq('id', user.id)
        .select();

      if (error) {
        throw error;
      }

      setProfile(prev => prev ? { ...prev, ...editForm } : null);
      onProfileUpdate({ 
        full_name: editForm.full_name, 
        avatar_url: editForm.avatar_url,
        custom_cursor_enabled: cursorEnabled
      });
      setIsEditing(false);
      toast.success('Perfil atualizado com sucesso.', { id: toastId });
    } catch (err: any) {
      console.error('Final error in handleSaveProfile:', err);
      toast.error(err.message || 'Erro ao salvar perfil.', { id: toastId });
    }
  };

  const handleSaveSavedAddress = async () => {
    if (!user) return;
    setIsSavingSavedAddress(true);
    const tid = toast.loading('A guardar endereço predefinido...');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          saved_address: savedAddressForm
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, saved_address: savedAddressForm } : null);
      setIsEditingSavedAddress(false);
      toast.success('Endereço guardado com sucesso!', { id: tid });
      
      // Update app state if needed
      onProfileUpdate({ full_name: editForm.full_name }); // Just to trigger any refresh
    } catch (err: any) {
      toast.error(err.message, { id: tid });
    } finally {
      setIsSavingSavedAddress(false);
    }
  };

  const filteredOrders = purchasedProducts.filter(o => {
    if (orderFilter === 'all') return true;
    if (orderFilter === 'refunded') return o.status === 'refunded' || o.status === 'refund_pending';
    if (orderFilter === 'canceled') return ['canceled', 'cancelled'].includes(o.status || '');
    return o.shipping_status === orderFilter;
  });

  if (loading) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Profile Visual Header - Removed Logo */}
      <div className="pt-8"></div>

      {/* Premium Tab Navigation */}
      <div className="flex flex-col items-center gap-8 border-b border-white/5 pb-8 relative overflow-hidden">
        <div className="flex p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full">
          <button 
            onClick={() => setActiveTab('general')}
            className={`relative px-8 py-3 text-[10px] uppercase tracking-[0.3em] font-black transition-all duration-500 rounded-full overflow-hidden ${
              activeTab === 'general' ? 'text-black' : 'text-white/40 hover:text-white'
            }`}
          >
            {activeTab === 'general' && (
              <motion.div 
                layoutId="nav-bg"
                className="absolute inset-0 bg-luxury-gold"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <User size={14} /> GERAL
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            className={`relative px-8 py-3 text-[10px] uppercase tracking-[0.3em] font-black transition-all duration-500 rounded-full overflow-hidden ${
              activeTab === 'orders' ? 'text-black' : 'text-white/40 hover:text-white'
            }`}
          >
            {activeTab === 'orders' && (
              <motion.div 
                layoutId="nav-bg"
                className="absolute inset-0 bg-luxury-gold"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <ShoppingBag size={14} /> PEDIDOS
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'general' && (
          <motion.div 
            key="general"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-12"
          >
            {/* Profile Visual Sidebar */}
            <div className="lg:col-span-4 space-y-8">
              <div className="relative group">
                <div className="aspect-[4/5] w-full bg-white/5 overflow-hidden border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]">
                  <motion.img 
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    src={getImageUrl(profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '')} 
                    alt="Avatar" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                  
                  {isEditing && (
                    <label className="absolute inset-x-0 bottom-0 py-12 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center text-white text-[9px] uppercase tracking-[0.4em] gap-3 cursor-pointer z-10 transition-all duration-500 group-hover:bg-luxury-gold group-hover:text-black">
                      <Camera size={20} className="animate-pulse" /> 
                      <span className="font-black">{isUploading ? 'PROCESSANDO...' : 'ATUALIZAR FOTOGRAFIA'}</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                    </label>
                  )}
                </div>

                {/* Exclusive ID Tag */}
                <div className="absolute -top-4 -right-4 bg-luxury-gold text-black p-4 md:p-6 shadow-2xl group-hover:scale-105 transition-transform duration-500">
                  <p className="text-[7px] uppercase tracking-[0.4em] font-black opacity-60 mb-1">MEMBRO ELITE</p>
                  <p className="text-sm font-mono font-black">{profile?.custom_id}</p>
                </div>
              </div>

              {/* Stats/Quick Actions */}
              <div className={`grid grid-cols-1 ${profile?.is_admin || profile?.is_employee ? 'md:grid-cols-2' : ''} gap-4`}>
                <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-md">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-luxury-gold/20 flex items-center justify-center text-luxury-gold">
                       <ShoppingBag size={18} />
                     </div>
                     <div>
                       <p className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Total Gastos</p>
                       <p className="text-xl font-serif text-white">{formatPrice ? formatPrice(purchasedProducts.reduce((acc, curr) => acc + (curr.total_amount || 0), 0)) : `€${purchasedProducts.reduce((acc, curr) => acc + (curr.total_amount || 0), 0).toFixed(2)}`}</p>
                     </div>
                   </div>
                </div>

                {(profile?.is_admin || profile?.is_employee) && (
                  <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-md">
                     <div className="flex items-center gap-4">
                       <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                         <FileText size={18} />
                       </div>
                       <div>
                         <p className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Produtos Carregados</p>
                         <p className="text-xl font-serif text-white">{profile?.products_count || 0}</p>
                       </div>
                     </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Content Area */}
            <div className="lg:col-span-8 space-y-12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/5">
                <div className="space-y-2">
                  <span className="text-luxury-gold text-[9px] uppercase tracking-[0.5em] font-black">Área de Membros</span>
                  <h2 className="text-4xl md:text-5xl font-serif italic text-white tracking-tight flex items-center gap-4">
                    {profile?.full_name || 'Eminente Convidado'}
                    {profile?.is_admin && (
                      <Crown size={24} className="text-luxury-gold fill-luxury-gold/20 animate-pulse shrink-0" />
                    )}
                    {profile?.is_employee && !profile?.is_admin && (
                      <Shield size={24} className="text-blue-500 fill-blue-500/20 animate-pulse shrink-0" />
                    )}
                  </h2>
                </div>
                <Button 
                  onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)}
                  className={`rounded-none h-12 px-8 text-[9px] uppercase tracking-[0.3em] font-black transition-all duration-500 border ${
                    isEditing 
                      ? 'bg-luxury-gold text-black border-luxury-gold hover:bg-white hover:border-white' 
                      : 'bg-transparent text-white border-white/20 hover:border-luxury-gold hover:text-luxury-gold'
                  }`}
                >
                  {isEditing ? <><Save className="mr-3" size={14} /> GUARDAR</> : <><Edit className="mr-3" size={14} /> EDITAR PERFIL</>}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                <div className="space-y-3">
                  <label className="text-[9px] uppercase tracking-[0.4em] text-luxury-gold font-black block">Identidade Visual</label>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editForm.full_name} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 p-4 text-sm text-white focus:border-luxury-gold outline-none transition-all font-serif"
                    />
                  ) : (
                    <p className="text-lg text-white/80 font-serif border-b border-white/5 pb-2">{profile?.full_name || 'N/A'}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] uppercase tracking-[0.4em] text-luxury-gold font-black block">E-mail de Notificações</label>
                  {isEditing ? (
                    <input 
                      type="email"
                      value={editForm.notification_email}
                      onChange={e => setEditForm(prev => ({ ...prev, notification_email: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 p-4 text-sm text-white focus:border-luxury-gold outline-none transition-all font-mono"
                    />
                  ) : (
                    <p className="text-lg text-white/80 font-mono border-b border-white/5 pb-2 truncate">{profile?.notification_email || user.email}</p>
                  )}
                </div>

                <div className="md:col-span-2 space-y-3">
                  <label className="text-[9px] uppercase tracking-[0.4em] text-luxury-gold font-black block">Manifesto Artistico (Bio)</label>
                  {isEditing ? (
                    <textarea 
                      value={editForm.description} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 p-6 text-sm text-white focus:border-luxury-gold outline-none transition-all h-40 resize-none font-serif italic"
                      placeholder="Descreva a sua essência artística..."
                    />
                  ) : (
                    <p className="text-sm text-white/50 leading-relaxed font-serif italic bg-white/5 p-6 border-l-2 border-luxury-gold/30">
                      {profile?.description || 'A sua voz artística ainda não foi manifestada. Edite o seu perfil para partilhar a sua visão.'}
                    </p>
                  )}
                </div>

                {/* Predefined Shipping Address */}
                <div className="md:col-span-2 pt-8 border-t border-white/5 space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] uppercase tracking-[0.4em] text-luxury-gold font-black block">Endereço de Entrega Predefinido</label>
                    <button 
                      onClick={() => isEditingSavedAddress ? handleSaveSavedAddress() : setIsEditingSavedAddress(true)}
                      className="text-[8px] uppercase tracking-widest text-white/40 hover:text-luxury-gold transition-colors flex items-center gap-2"
                    >
                      {isEditingSavedAddress ? <><Save size={12} /> GUARDAR</> : <><Edit size={12} /> ALTERAR</>}
                    </button>
                  </div>
                  
                  {isEditingSavedAddress ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/5 p-6 border border-white/10 animate-in fade-in duration-500">
                      <div className="space-y-2">
                        <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Nome de Recibo</label>
                        <input 
                          type="text" 
                          placeholder="Nome completo para envio"
                          value={savedAddressForm.full_name} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, full_name: e.target.value})}
                          className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Telefone</label>
                        <input 
                          type="text" 
                          placeholder="+351 912 345 678"
                          value={savedAddressForm.phone} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, phone: e.target.value})}
                          className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Morada</label>
                        <input 
                          type="text" 
                          placeholder="Rua, Número, Andar..."
                          value={savedAddressForm.address} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, address: e.target.value})}
                          className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Cidade</label>
                        <input 
                          type="text" 
                          placeholder="Lisboa"
                          value={savedAddressForm.city} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, city: e.target.value})}
                          className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Código Postal</label>
                        <input 
                          type="text" 
                          placeholder="1000-001"
                          value={savedAddressForm.zip} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, zip: e.target.value})}
                          className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none font-mono"
                        />
                      </div>
                      <div className="md:col-span-2 pt-4">
                        <Button 
                          onClick={handleSaveSavedAddress}
                          className="w-full bg-luxury-gold text-black rounded-none h-12 text-[10px] font-black uppercase tracking-[0.3em]"
                          disabled={isSavingSavedAddress}
                        >
                          {isSavingSavedAddress ? 'A GUARDAR...' : 'CONFIRMAR ENDEREÇO PREDEFINIDO'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-white/5 border border-white/10 group hover:border-luxury-gold/30 transition-all duration-500 relative overflow-hidden">
                       <MapPin className="absolute -right-4 -bottom-4 w-24 h-24 text-white/[0.03] group-hover:text-luxury-gold/[0.05] transition-colors" />
                       
                       {profile?.saved_address?.address ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                               <div>
                                 <p className="text-[7px] uppercase tracking-widest text-white/30 font-black mb-1">Destinatário</p>
                                 <p className="text-sm text-white font-serif italic">{profile.saved_address.full_name || 'N/A'}</p>
                               </div>
                               <div>
                                 <p className="text-[7px] uppercase tracking-widest text-white/30 font-black mb-1">Localização</p>
                                 <p className="text-sm text-white/80 leading-relaxed font-serif">
                                   {profile.saved_address.address}<br />
                                   {profile.saved_address.zip} {profile.saved_address.city}
                                 </p>
                               </div>
                            </div>
                            <div className="space-y-4">
                               <div>
                                 <p className="text-[7px] uppercase tracking-widest text-white/30 font-black mb-1">Contacto</p>
                                 <p className="text-sm text-white font-mono">{profile.saved_address.phone || 'N/A'}</p>
                               </div>
                               <div>
                                 <p className="text-[7px] uppercase tracking-widest text-white/30 font-black mb-1">Estado</p>
                                 <div className="flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                   <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Pronto para Checkout</p>
                                 </div>
                               </div>
                            </div>
                         </div>
                       ) : (
                         <div className="py-8 text-center space-y-4">
                            <p className="text-xs text-white/40 font-serif italic">Ainda não definiu um endereço predefinido para as suas aquisições.</p>
                            <Button 
                              onClick={() => setIsEditingSavedAddress(true)}
                              className="bg-transparent border border-white/20 text-white rounded-none text-[8px] uppercase tracking-widest font-black hover:border-luxury-gold hover:text-luxury-gold"
                            >
                              CONFIGURAR AGORA
                            </Button>
                         </div>
                       )}
                    </div>
                  )}
                </div>

                {/* Navigation Preference (Cursor) */}
                <div className="md:col-span-2 pt-8 mt-4 border-t border-white/5 space-y-6">
                  <label className="text-[9px] uppercase tracking-[0.4em] text-luxury-gold font-black block">Preferências de Visualização</label>
                  <div className="flex items-center justify-between p-6 bg-white/5 border border-white/10 group hover:border-luxury-gold/30 transition-all duration-500">
                    <div className="space-y-1">
                      <p className="text-xs text-white font-serif">Cursor de Fluxo Artístico</p>
                      <p className="text-[9px] text-white/40 uppercase tracking-widest">Habilita a partícula de luxo que segue os seus movimentos</p>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !cursorEnabled;
                        setCursorEnabled(newVal);
                        localStorage.setItem('luxury_cursor_enabled', String(newVal));
                        onProfileUpdate({ custom_cursor_enabled: newVal });
                        toast.success(newVal ? 'Cursor de fluxo ativado' : 'Cursor de fluxo desativado', {
                          style: { background: '#0a0a0a', border: '1px solid #D4AF37', color: '#fff' }
                        });
                      }}
                      className={`relative w-12 h-6 rounded-full transition-all duration-500 ${
                        cursorEnabled ? 'bg-luxury-gold' : 'bg-white/10'
                      }`}
                    >
                      <motion.div 
                        animate={{ x: cursorEnabled ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Security & Access Section */}
              <div className="pt-12 mt-12 border-t border-white/5">
                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex gap-10">
                    <div className="space-y-1">
                      <p className="text-[8px] uppercase tracking-[0.3em] text-white/30 font-bold">Membro Desde</p>
                      <p className="text-xs text-white/70">{new Date(user.created_at).toLocaleDateString('pt-PT', { year: 'numeric', month: 'long' })}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] uppercase tracking-[0.3em] text-white/30 font-bold">Tipo de Assinante</p>
                      <p className="text-xs text-white/70">Prestígio</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={onLogout}
                    className="group flex items-center gap-4 px-10 py-5 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-red-500 hover:text-white transition-all duration-700 w-full md:w-auto overflow-hidden relative"
                  >
                     <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        whileHover={{ x: 0, opacity: 1 }}
                        className="absolute left-4"
                     >
                       <LogOut size={16} />
                     </motion.div>
                     <span className="group-hover:pl-4 transition-all duration-500">TERMINAR SESSÃO</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div 
            key="orders"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="space-y-12"
          >
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 pb-8 border-b border-white/5">
              <div className="space-y-2">
                <span className="text-luxury-gold text-[9px] uppercase tracking-[0.5em] font-black">Historial de Aquisições</span>
                <h2 className="text-4xl font-serif text-white italic">Manifestações de Arte</h2>
              </div>
              
              <div className="flex bg-white/5 backdrop-blur-md p-1 border border-white/10 rounded-full overflow-x-auto no-scrollbar w-full lg:w-auto">
                {(['all', 'pending', 'sent', 'delivered'] as const).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setOrderFilter(f)}
                    className={`relative px-6 py-2 text-[8px] uppercase tracking-[0.2em] font-black transition-all rounded-full whitespace-nowrap ${
                      orderFilter === f ? 'text-black' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {orderFilter === f && (
                      <motion.div 
                        layoutId="order-filter-bg"
                        className="absolute inset-0 bg-white"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">
                      {f === 'all' ? 'TODOS' : f === 'pending' ? 'PENDENTES' : f === 'sent' ? 'TRANSITO' : 'ENTREGUE'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {filteredOrders.length === 0 ? (
                <div className="py-40 text-center flex flex-col items-center justify-center space-y-6">
                  <div className="w-20 h-20 rounded-full border border-white/5 flex items-center justify-center text-white/5">
                    <ShoppingBag size={40} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-white/30 font-black">Nenhuma obra encontrada</p>
                    <p className="text-sm text-white/10 font-serif italic">A sua galeria pessoal aguarda o primeiro manifesto.</p>
                  </div>
                </div>
              ) : (
                filteredOrders.map((order) => (
                  <motion.div 
                    key={order.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.01 }}
                    className="group relative bg-[#0a0a0a] border border-white/5 hover:border-luxury-gold/40 transition-all duration-700 cursor-pointer overflow-hidden p-4 md:p-0"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex flex-col md:flex-row items-stretch min-h-[120px]">
                      {/* Product Visual */}
                      <div className="w-full md:w-32 lg:w-40 h-48 md:h-auto bg-white/5 overflow-hidden shrink-0">
                        <img 
                          src={getImageUrl(order.product?.image_url || '')} 
                          alt="" 
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                        />
                      </div>

                      {/* Content Row */}
                      <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1 min-w-0 space-y-3 text-center md:text-left">
                          <div className="flex flex-col md:flex-row items-center gap-3">
                            <span className={`text-[7px] md:text-[8px] uppercase tracking-[0.3em] font-black py-1 px-2 border rounded-sm ${
                              ['canceled', 'cancelled'].includes(order.status || '') ? 'text-red-500 border-red-500/20' :
                              ['refunded', 'reembolsado', 'refund_pending'].includes(order.status || '') ? 'text-zinc-500 border-zinc-500/20' :
                              order.shipping_status === 'delivered' ? 'text-emerald-500 border-emerald-500/20' : 
                              order.shipping_status === 'out_for_delivery' ? 'text-amber-500 border-amber-500/20' :
                              order.shipping_status === 'sent' ? 'text-blue-500 border-blue-500/20' :
                              order.shipping_status === 'incident' ? 'text-orange-500 border-orange-500/20' :
                              order.shipping_status === 'lost' ? 'text-red-700 border-red-700/20' :
                              'text-luxury-gold border-luxury-gold/20'
                            }`}>
                              {order.shipping_status === 'delivered' ? 'ENTREGADOS' : 
                               order.shipping_status === 'out_for_delivery' ? 'EM ENTREGA' :
                               ['canceled', 'cancelled'].includes(order.status || '') ? 'CANCELADOS' : 
                               order.shipping_status === 'sent' ? 'EM TRÂNSITO' :
                               order.shipping_status === 'confirmed' ? 'CONFIRMADOS' :
                               order.shipping_status === 'preparing' ? 'EM PREPARAÇÃO' :
                               order.shipping_status === 'ready' ? 'PREPARADOS' :
                               order.shipping_status === 'incident' ? 'COM INCIDENTE' :
                               order.shipping_status === 'rejected' ? 'REJEITADOS' :
                               order.shipping_status === 'review' ? 'COM ERRO E REVISÃO' :
                               order.shipping_status === 'lost' ? 'EXTRAVIADO' :
                               order.shipping_status === 'pending_confirmation' ? 'PEND. DE CONFIRMAÇÃO' :
                               ['refunded', 'reembolsado', 'refund_pending'].includes(order.status || '') ? 'REEMBOLSADO' :
                               'EM PROCESSAMENTO'}
                            </span>
                            <p className="text-[7px] font-mono text-white/20 uppercase tracking-widest whitespace-nowrap">ID: Sart-{order.id.split('-')[0].toUpperCase()}</p>
                          </div>
                          <h4 className="text-lg md:text-xl font-serif text-white truncate max-w-[200px] lg:max-w-xs group-hover:text-luxury-gold transition-colors duration-500">
                            {order.product?.title?.length > 50 ? `${order.product.title.slice(0, 47)}...` : (order.product?.title || 'Manifestação Sem Nome')}
                          </h4>
                          <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold mb-4 md:mb-0">
                            <div className="flex items-center gap-2"><Calendar size={12} className="text-luxury-gold" /> {new Date(order.created_at).toLocaleDateString()}</div>
                            <div className="flex items-center gap-2 font-mono font-black text-white">{formatPrice ? formatPrice(order.total_amount) : `€${order.total_amount.toFixed(2)}`}</div>
                          </div>
                        </div>

                        {/* Status Pillars */}
                        <div className="flex flex-row md:flex-col lg:flex-row items-center gap-3 md:gap-4 w-full md:w-auto shrink-0 md:ml-auto">
                           <div className="flex-1 md:w-32 shrink-0 p-3 bg-white/5 border border-white/10 text-center space-y-1">
                              <p className="text-[7px] uppercase tracking-widest text-white/30 font-black">LOGÍSTICA</p>
                              <p className={`text-[9px] font-black uppercase tracking-widest truncate ${
                                order.shipping_status === 'delivered' ? 'text-emerald-500' : 
                                ['canceled', 'cancelled'].includes(order.status || '') ? 'text-red-500' :
                                'text-luxury-gold'
                              }`}>
                                {['canceled', 'cancelled'].includes(order.status || '') ? 'CANCELADOS' :
                                 order.shipping_status === 'delivered' ? 'ENTREGADOS' : 
                                 order.shipping_status === 'sent' ? 'EM TRÂNSITO' :
                                 order.shipping_status === 'preparing' ? 'EM PREPARAÇÃO' :
                                 order.shipping_status === 'ready' ? 'PREPARADOS' :
                                 order.shipping_status === 'incident' ? 'COM INCIDENTE' :
                                 order.shipping_status === 'lost' ? 'EXTRAVIADO' :
                                 order.shipping_status === 'rejected' ? 'REJEITADOS' :
                                 order.shipping_status === 'review' ? 'ERRO E REVISÃO' :
                                 'PRODUÇÃO'}
                              </p>
                           </div>
                           <div className="flex-1 md:w-32 shrink-0 p-3 bg-white/5 border border-white/10 text-center space-y-1">
                              <p className="text-[7px] uppercase tracking-widest text-white/30 font-black">FINANCEIRO</p>
                              <p className={`text-[9px] font-black uppercase tracking-widest truncate ${
                                ['canceled', 'cancelled'].includes(order.status || '') ? 'text-red-500' : 'text-emerald-500'
                              }`}>
                                {['canceled', 'cancelled'].includes(order.status || '') ? 'Cancelado' : 'Satisfeito'}
                              </p>
                           </div>
                        </div>

                        <div className="hidden lg:flex items-center justify-center w-12 h-12 rounded-full border border-white/5 group-hover:border-luxury-gold/40 group-hover:bg-luxury-gold group-hover:text-black transition-all duration-700">
                          <ArrowUpRight size={20} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Order Detail Slide-over / Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[#050505] w-full max-w-4xl max-h-[90vh] border border-white/10 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] relative flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Luxury Detail Header */}
              <div className="relative h-48 md:h-64 shrink-0 overflow-hidden">
                <img 
                  src={getImageUrl(selectedOrder.product?.image_url || '')} 
                  alt="" 
                  className="w-full h-full object-cover grayscale opacity-40 hover:grayscale-0 hover:opacity-70 transition-all duration-1000" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                <button 
                  onClick={() => setSelectedOrder(null)} 
                  className="absolute top-4 right-4 md:top-8 md:right-8 w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white hover:bg-luxury-gold hover:text-black hover:border-luxury-gold transition-all duration-500 z-50"
                >
                  <X size={20} />
                </button>
                
                <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 space-y-1">
                   <p className="text-luxury-gold text-[8px] md:text-[10px] uppercase tracking-[0.5em] font-black">Manifesto Detalhado</p>
                   <h3 className="text-2xl md:text-4xl font-serif italic text-white leading-none line-clamp-2 md:line-clamp-3 overflow-hidden">
                      {selectedOrder.product?.title || 'Manifestação Sem Nome'}
                   </h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto luxury-scrollbar">
                <div className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
                  {/* Secondary details */}
                  <div className="md:col-span-7 space-y-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-luxury-gold">
                          <Truck size={18} />
                          <span className="text-[10px] uppercase tracking-[0.4em] font-black">LOGÍSTICA DE LUXO</span>
                        </div>
                        {selectedOrder.shipping_status === 'pending' && !isEditingAddress && (
                          <button 
                            onClick={() => startEditingAddress(selectedOrder)}
                            className="text-[9px] uppercase tracking-widest text-luxury-gold hover:text-white transition-colors flex items-center gap-2 border border-luxury-gold/20 px-3 py-1 rounded-sm"
                          >
                            <Edit size={12} /> ALTERAR MORADA
                          </button>
                        )}
                      </div>
                        {selectedOrder.shipping_details ? (() => {
                          const details = typeof selectedOrder.shipping_details === 'string' 
                            ? (JSON.parse(selectedOrder.shipping_details) || {}) 
                            : selectedOrder.shipping_details;
                          
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 md:p-8 bg-white/5 border border-white/10 border-l-luxury-gold border-l-2 relative">
                              {isEditingAddress ? (
                                <div className="col-span-2 space-y-6 animate-in fade-in zoom-in-95 duration-500">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Morada</label>
                                      <input 
                                        type="text" 
                                        value={addressForm.address} 
                                        onChange={e => setAddressForm({...addressForm, address: e.target.value})}
                                        className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Cidade</label>
                                      <input 
                                        type="text" 
                                        value={addressForm.city} 
                                        onChange={e => setAddressForm({...addressForm, city: e.target.value})}
                                        className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Cód. Postal</label>
                                      <input 
                                        type="text" 
                                        value={addressForm.zip} 
                                        onChange={e => setAddressForm({...addressForm, zip: e.target.value})}
                                        className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Telefone</label>
                                      <input 
                                        type="text" 
                                        value={addressForm.phone} 
                                        onChange={e => setAddressForm({...addressForm, phone: e.target.value})}
                                        className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                                      />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                      <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Email de Contacto</label>
                                      <input 
                                        type="email" 
                                        value={addressForm.email} 
                                        onChange={e => setAddressForm({...addressForm, email: e.target.value})}
                                        className="w-full bg-black border border-white/10 p-3 text-xs text-white focus:border-luxury-gold outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-4 pt-4">
                                    <Button 
                                      onClick={handleUpdateAddress}
                                      disabled={isUpdatingAddress}
                                      className="flex-1 bg-luxury-gold text-black rounded-none h-10 text-[9px] font-black uppercase tracking-widest"
                                    >
                                      {isUpdatingAddress ? 'A SALVAR...' : 'GUARDAR ALTERAÇÕES'}
                                    </Button>
                                    <Button 
                                      onClick={() => setIsEditingAddress(false)}
                                      variant="outline"
                                      className="flex-1 bg-transparent border-white/10 text-white rounded-none h-10 text-[9px] font-black uppercase tracking-widest"
                                    >
                                      CANCELAR
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="space-y-3">
                                    <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Destinatário</p>
                                    <p className="text-sm text-white font-serif italic leading-relaxed">
                                      {details.fullName || 
                                       `${details.firstName || ''} ${details.lastName || ''}`.trim() || 
                                       'Nome Preservado'}
                                    </p>
                                  </div>
                                  <div className="space-y-3">
                                    <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Residência de Entrega</p>
                                    <p className="text-sm text-white/70 font-mono leading-relaxed">
                                      {details.address}<br />
                                      {details.zip || details.postalCode} {details.city}<br />
                                      <span className="text-luxury-gold">{details.country || 'PT'}</span>
                                    </p>
                                  </div>
                                  <div className="md:col-span-2 space-y-3 border-t border-white/5 pt-4">
                                     <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Contacto Seguro</p>
                                     <p className="text-sm text-white font-mono">{details.phone || 'Privado'}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })() : (
                          <p className="text-sm text-white/20 font-serif italic bg-white/5 p-6 border border-white/10">Os detalhes logísticos estão em fase de digitalização.</p>
                        )}
                    </div>

                  <div className="space-y-4">
                     <div className="flex items-center gap-3 text-luxury-gold">
                        <FileText size={18} />
                        <span className="text-[10px] uppercase tracking-[0.4em] font-black">Rastreamento de Elite</span>
                     </div>
                     <div className="p-6 md:p-8 bg-white/5 border border-white/10 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                           <div className="space-y-1">
                              <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Estado Atual</p>
                              <p className="text-xs text-white font-black uppercase tracking-widest">
                                {selectedOrder.shipping_status === 'out_for_delivery' ? 'EM DISTRIBUIÇÃO' : 
                                 selectedOrder.shipping_status === 'sent' ? 'EM TRÂNSITO' :
                                 selectedOrder.shipping_status === 'delivered' ? 'ENTREGUE' :
                                 ['confirmed', 'confirmed_order'].includes(selectedOrder.shipping_status || '') ? 'CONFIRMADO' :
                                 ['preparing', 'ready'].includes(selectedOrder.shipping_status || '') ? 'EM PREPARAÇÃO' :
                                 selectedOrder.shipping_status || 'Aguardando Verificação'}
                              </p>
                           </div>
                           {selectedOrder.shipping_status_metadata?.lastExternalStatus && (
                             <div className="space-y-1">
                                <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Status Logística</p>
                                <p className="text-xs text-orange-500 font-black uppercase tracking-widest">
                                  {selectedOrder.shipping_status_metadata.lastExternalStatus}
                                </p>
                             </div>
                           )}
                           <div className="space-y-1">
                              <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">SLA Estimado</p>
                              <p className="text-xs text-luxury-gold font-black uppercase tracking-widest">Premium (4-7 Dias)</p>
                           </div>
                        </div>
                        
                        {(selectedOrder.shipping_status_metadata?.trackingNumber || selectedOrder.shipping_tracking_code) && (
                          <div className="pt-6 border-t border-white/10 space-y-4">
                             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-black/40 p-4 rounded-sm border border-white/5 gap-4 overflow-hidden">
                                <span className="font-mono text-sm md:text-base xl:text-lg text-white tracking-tighter break-all w-full">{selectedOrder.shipping_status_metadata?.trackingNumber || selectedOrder.shipping_tracking_code}</span>
                                {(selectedOrder.shipping_status_metadata?.trackingUrl || selectedOrder.shipping_tracking_url) && (
                                  <a 
                                    href={selectedOrder.shipping_status_metadata?.trackingUrl || selectedOrder.shipping_tracking_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-luxury-gold text-[9px] uppercase tracking-widest font-black hover:text-white transition-colors whitespace-nowrap pt-2 xl:pt-0"
                                  >
                                    RASTREAR <ArrowUpRight size={14} />
                                  </a>
                                )}
                             </div>
                          </div>
                        )}
                     </div>
                  </div>
                </div>

                {/* Vertical Info Pillar */}
                <div className="md:col-span-5 space-y-8">
                   <div className="p-8 bg-luxury-gold text-black space-y-6">
                      <div className="flex items-center gap-3 opacity-60">
                         <CreditCard size={18} />
                         <span className="text-[10px] uppercase tracking-[0.4em] font-black">INVESTIMENTO</span>
                      </div>
                      <div className="space-y-1">
                         <p className="text-5xl font-serif font-black tracking-tighter">{formatPrice ? formatPrice(selectedOrder.total_amount) : `€${selectedOrder.total_amount.toFixed(2)}`}</p>
                         <p className="text-[9px] uppercase tracking-widest font-black">Total Transacionado</p>
                      </div>
                      <div className="pt-6 border-t border-black/10 flex flex-col gap-4">
                         <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
                            <span>Status</span>
                            <span className="bg-white/20 px-2 py-0.5">
                               {['canceled', 'cancelled'].includes(selectedOrder.status || '') ? 'CANCELADO' :
                                ['refunded', 'reembolsado', 'refund_pending'].includes(selectedOrder.status || '') ? 'REEMBOLSADO' :
                                'COMPLETO'}
                            </span>
                         </div>
                         <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
                            <span>Tópico</span>
                            <span>AQUISIÇÃO ÚNICA</span>
                         </div>
                      </div>
                   </div>

                   <div className="p-6 md:p-8 bg-white/5 border border-white/10 space-y-6">
                      <div className="flex items-center gap-3 text-luxury-gold">
                         <Hash size={18} />
                         <span className="text-[10px] uppercase tracking-[0.4em] font-black">METADADOS</span>
                      </div>
                      <div className="space-y-4 text-[10px] font-mono text-white/40 leading-relaxed max-w-full overflow-hidden">
                         <div className="grid grid-cols-2 gap-4">
                            <span className="uppercase tracking-widest">REFERÊNCIA</span>
                            <span className="text-white select-all text-right break-all">Sart-{selectedOrder.id.toUpperCase()}</span>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <span className="uppercase tracking-widest">HORÁRIO</span>
                            <span className="text-white text-right">{new Date(selectedOrder.created_at).toLocaleTimeString()}</span>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <span className="uppercase tracking-widest">DATA</span>
                            <span className="text-white text-right">{new Date(selectedOrder.created_at).toLocaleDateString()}</span>
                         </div>
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
                             setSelectedOrder(prev => prev ? { ...prev, notifications_enabled: newValue } : null);
                             toast.success(newValue ? "Alertas de luxo ativados" : "Alertas silenciados");
                           } catch (err: any) {
                             toast.error("Erro na comunicação segura: " + err.message);
                           }
                         }}
                         className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] uppercase tracking-[0.3em] font-black text-white/60 transition-all flex items-center justify-center gap-4"
                      >
                         <Mail size={12} className={selectedOrder.notifications_enabled !== false ? 'text-luxury-gold' : ''} />
                         {selectedOrder.notifications_enabled !== false ? 'ALERTAS ATIVOS' : 'ALERTAS DESATIVADOS'}
                      </button>
                   </div>
                 </div>
               </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="p-8 bg-white/5 border-t border-white/10 flex flex-col md:flex-row gap-4 items-center justify-between">
                 <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold italic">A qualidade da sua aquisição é garantida pela curadoria da S.art.</p>
                 <Button 
                   onClick={() => setSelectedOrder(null)}
                   className="w-full md:w-auto h-14 px-12 bg-white text-black rounded-none text-[10px] uppercase tracking-[0.4em] font-black hover:bg-luxury-gold transition-all duration-500"
                 >
                   REGRESSAR À GALERIA
                 </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

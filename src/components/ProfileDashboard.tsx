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
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  HelpCircle,
  CornerDownLeft
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
    country?: string;
    identification?: string;
  };
}

interface ProfileDashboardProps {
  user: any;
  purchasedProducts: Order[];
  onProfileUpdate: (data: { 
    full_name?: string, 
    avatar_url?: string, 
    custom_cursor_enabled?: boolean,
    saved_address?: any 
  }) => void;
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
  const [activeTab, setActiveTab] = useState<'general' | 'orders' | 'refunds'>('general');
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
    phone: '',
    country: 'Portugal',
    identification: ''
  });
  const [isSavingSavedAddress, setIsSavingSavedAddress] = useState(false);

  // Refund modal state
  const [refundModalOrder, setRefundModalOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('Arrependimento de Compra (Prazo de 14 Dias)');
  const [refundDetails, setRefundDetails] = useState('');
  const [refundIban, setRefundIban] = useState('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

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
        phone: profileData.saved_address?.phone || '',
        country: profileData.saved_address?.country || 'Portugal',
        identification: profileData.saved_address?.identification || ''
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

  const startEditingSavedAddress = () => {
    const current = profile?.saved_address || {};
    setSavedAddressForm({
      full_name: current.full_name || profile?.full_name || editForm.full_name || '',
      address: current.address || '',
      city: current.city || '',
      zip: current.zip || '',
      phone: current.phone || '',
      country: current.country || 'Portugal',
      identification: current.identification || ''
    });
    setIsEditingSavedAddress(true);
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

      if (error) {
        console.warn('Supabase profile update warning, trying API fallback:', error);
        const res = await fetch('/api/profile/address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            savedAddress: savedAddressForm
          })
        });
        const apiData = await res.json();
        if (!res.ok) throw new Error(apiData.error || error.message);
      }

      setProfile(prev => prev ? { ...prev, saved_address: savedAddressForm } : null);
      setIsEditingSavedAddress(false);
      toast.success('Endereço predefinido guardado com sucesso!', { id: tid });
      
      // Update app state with the new address immediately
      onProfileUpdate({ 
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        saved_address: savedAddressForm 
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao guardar endereço.', { id: tid });
    } finally {
      setIsSavingSavedAddress(false);
    }
  };

  const handleOpenRefundModal = (order: Order) => {
    setRefundModalOrder(order);
    setRefundReason('Arrependimento de Compra (Prazo de 14 Dias)');
    setRefundDetails('');
    setRefundIban('');
  };

  const handleSubmitRefund = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!refundModalOrder || !user) return;

    setIsSubmittingRefund(true);
    const tid = toast.loading('A registar solicitação de reembolso...');
    try {
      const response = await fetch('/api/request-refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: refundModalOrder.id,
          userId: user.id,
          reason: `${refundReason}: ${refundDetails || 'Nenhum detalhe adicional'}`
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar solicitação de reembolso.');
      }

      toast.success('Solicitação de reembolso enviada com sucesso! A equipa financeira entrará em contacto.', { id: tid });

      // Instantly update local order states to avoid waiting for fetch latency
      const updatedStatus = 'refund_requested';
      
      if (selectedOrder && selectedOrder.id === refundModalOrder.id) {
        setSelectedOrder(prev => prev ? { 
          ...prev, 
          status: updatedStatus, 
          payment_status: updatedStatus,
          refund_reason: `${refundReason}: ${refundDetails || 'Nenhum detalhe adicional'}`
        } : null);
      }

      if (onRefundRequest) {
        onRefundRequest({
          ...refundModalOrder,
          status: updatedStatus,
          payment_status: updatedStatus
        });
      }
      
      setRefundModalOrder(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao solicitar reembolso.', { id: tid });
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const refundOrders = purchasedProducts.filter(o => {
    const isRefunded = ['refunded', 'reembolsado'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refunded';
    const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refund_pending';
    const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(o.status?.toLowerCase() || '');
    return isRefunded || isRefundPending || isCanceled;
  });

  const pendingRefundsCount = purchasedProducts.filter(o => {
    return ['refund_pending', 'waiting_refund', 'refund_requested'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refund_pending';
  }).length;

  const totalRefundedAmount = purchasedProducts.reduce((sum, o) => {
    const isRefunded = ['refunded', 'reembolsado'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refunded';
    return isRefunded ? sum + (o.total_amount || 0) : sum;
  }, 0);

  const eligibleOrdersForRefund = purchasedProducts.filter(o => {
    const isRefunded = ['refunded', 'reembolsado'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refunded';
    const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refund_pending';
    const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(o.status?.toLowerCase() || '');
    return !isRefunded && !isRefundPending && !isCanceled;
  });

  const filteredOrders = purchasedProducts.filter(o => {
    if (orderFilter === 'all') return true;
    if (orderFilter === 'refunded') return ['refunded', 'reembolsado', 'refund_pending', 'waiting_refund', 'refund_requested'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refunded' || o.payment_status === 'refund_pending';
    if (orderFilter === 'canceled') return ['canceled', 'cancelled', 'cancelado'].includes(o.status?.toLowerCase() || '');
    return o.shipping_status === orderFilter;
  });

  if (loading) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Profile Visual Header - Removed Logo */}
      <div className="pt-8"></div>

      {/* Premium Tab Navigation */}
      <div className="flex flex-col items-center gap-8 border-b border-neutral-700/80 pb-8 relative overflow-hidden">
        <div className="flex w-full max-w-md sm:w-auto p-1 sm:p-1.5 bg-neutral-900 border-2 border-neutral-700 rounded-full shadow-xl">
          <button 
            onClick={() => setActiveTab('general')}
            className={`relative flex-1 sm:flex-initial flex items-center justify-center px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 text-[9px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.3em] font-black transition-all duration-500 rounded-full overflow-hidden whitespace-nowrap ${
              activeTab === 'general' ? 'text-black' : 'text-neutral-200 hover:text-amber-400'
            }`}
          >
            {activeTab === 'general' && (
              <motion.div 
                layoutId="nav-bg"
                className="absolute inset-0 bg-amber-400"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
              <User size={13} className="sm:w-3.5 sm:h-3.5" /> GERAL
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            className={`relative flex-1 sm:flex-initial flex items-center justify-center px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 text-[9px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.3em] font-black transition-all duration-500 rounded-full overflow-hidden whitespace-nowrap ${
              activeTab === 'orders' ? 'text-black' : 'text-neutral-200 hover:text-amber-400'
            }`}
          >
            {activeTab === 'orders' && (
              <motion.div 
                layoutId="nav-bg"
                className="absolute inset-0 bg-amber-400"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
              <ShoppingBag size={13} className="sm:w-3.5 sm:h-3.5" /> PEDIDOS
              {purchasedProducts.length > 0 && (
                <span className={`text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-black ${activeTab === 'orders' ? 'bg-black text-amber-400' : 'bg-neutral-800 text-neutral-200 border border-neutral-700'}`}>
                  {purchasedProducts.length}
                </span>
              )}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('refunds')}
            className={`relative flex-1 sm:flex-initial flex items-center justify-center px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 text-[9px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.3em] font-black transition-all duration-500 rounded-full overflow-hidden whitespace-nowrap ${
              activeTab === 'refunds' ? 'text-black' : 'text-neutral-200 hover:text-amber-400'
            }`}
          >
            {activeTab === 'refunds' && (
              <motion.div 
                layoutId="nav-bg"
                className="absolute inset-0 bg-amber-400"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
              <RotateCcw size={13} className="sm:w-3.5 sm:h-3.5" /> REEMBOLSOS
              {refundOrders.length > 0 && (
                <span className={`text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-black ${activeTab === 'refunds' ? 'bg-black text-amber-400' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}`}>
                  {refundOrders.length}
                </span>
              )}
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
                <div className="aspect-[4/5] w-full bg-neutral-900 overflow-hidden border-2 border-neutral-700 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]">
                  <motion.img 
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    src={getImageUrl(profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '')} 
                    alt="Avatar" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-70" />
                  
                  {isEditing && (
                    <label className="absolute inset-x-0 bottom-0 py-12 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-white text-[9px] uppercase tracking-[0.4em] gap-3 cursor-pointer z-10 transition-all duration-500 hover:bg-amber-400 hover:text-black">
                      <Camera size={20} className="animate-pulse" /> 
                      <span className="font-black">{isUploading ? 'PROCESSANDO...' : 'ATUALIZAR FOTOGRAFIA'}</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                    </label>
                  )}
                </div>

                {/* Exclusive ID Tag */}
                <div className="absolute -top-4 -right-4 bg-amber-400 text-black p-4 md:p-6 shadow-2xl group-hover:scale-105 transition-transform duration-500 border-2 border-black">
                  <p className="text-[8px] uppercase tracking-[0.4em] font-black opacity-80 mb-1">MEMBRO ELITE</p>
                  <p className="text-sm font-mono font-black">{profile?.custom_id}</p>
                </div>
              </div>

              {/* Stats/Quick Actions */}
              <div className={`grid grid-cols-1 ${profile?.is_admin || profile?.is_employee ? 'md:grid-cols-2' : ''} gap-4`}>
                <div className="p-6 bg-neutral-900 border-2 border-neutral-700 shadow-lg">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                       <ShoppingBag size={20} />
                     </div>
                     <div>
                       <p className="text-[9px] uppercase tracking-widest text-neutral-300 font-bold">Total Gastos</p>
                       <p className="text-xl font-serif text-white font-black">{formatPrice ? formatPrice(purchasedProducts.reduce((acc, curr) => acc + (curr.total_amount || 0), 0)) : `€${purchasedProducts.reduce((acc, curr) => acc + (curr.total_amount || 0), 0).toFixed(2)}`}</p>
                     </div>
                   </div>
                </div>

                {(profile?.is_admin || profile?.is_employee) && (
                  <div className="p-6 bg-neutral-900 border-2 border-neutral-700 shadow-lg">
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                         <FileText size={20} />
                       </div>
                       <div>
                         <p className="text-[9px] uppercase tracking-widest text-neutral-300 font-bold">Produtos Carregados</p>
                         <p className="text-xl font-serif text-white font-black">{profile?.products_count || 0}</p>
                       </div>
                     </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Content Area */}
            <div className="lg:col-span-8 space-y-12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-neutral-700">
                <div className="space-y-2">
                  <span className="text-amber-400 text-[10px] uppercase tracking-[0.5em] font-black">Área de Membros</span>
                  <h2 className="text-4xl md:text-5xl font-serif italic text-white tracking-tight flex items-center gap-4 font-bold">
                    {profile?.full_name || 'Eminente Convidado'}
                    {profile?.is_admin && (
                      <Crown size={26} className="text-amber-400 fill-amber-400/20 animate-pulse shrink-0" />
                    )}
                    {profile?.is_employee && !profile?.is_admin && (
                      <Shield size={26} className="text-blue-400 fill-blue-400/20 animate-pulse shrink-0" />
                    )}
                  </h2>
                </div>
                <Button 
                  onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)}
                  className={`rounded-none h-12 px-8 text-[10px] uppercase tracking-[0.3em] font-black transition-all duration-500 border-2 ${
                    isEditing 
                      ? 'bg-amber-400 text-black border-amber-400 hover:bg-white hover:border-white shadow-xl' 
                      : 'bg-neutral-900 text-white border-neutral-600 hover:border-amber-400 hover:text-amber-400 hover:bg-neutral-800 shadow-md'
                  }`}
                >
                  {isEditing ? <><Save className="mr-3" size={15} /> GUARDAR</> : <><Edit className="mr-3" size={15} /> EDITAR PERFIL</>}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.4em] text-amber-400 font-black block">Identidade Visual</label>
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editForm.full_name} 
                      onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full bg-neutral-900 border-2 border-neutral-700 p-4 text-base text-white focus:border-amber-400 outline-none transition-all font-serif"
                    />
                  ) : (
                    <p className="text-xl text-white font-serif border-b-2 border-neutral-800 pb-2 font-bold">{profile?.full_name || 'N/A'}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.4em] text-amber-400 font-black block">E-mail de Notificações</label>
                  {isEditing ? (
                    <input 
                      type="email"
                      value={editForm.notification_email}
                      onChange={e => setEditForm(prev => ({ ...prev, notification_email: e.target.value }))}
                      className="w-full bg-neutral-900 border-2 border-neutral-700 p-4 text-base text-white focus:border-amber-400 outline-none transition-all font-mono"
                    />
                  ) : (
                    <p className="text-lg text-neutral-100 font-mono border-b-2 border-neutral-800 pb-2 truncate font-semibold">{profile?.notification_email || user.email}</p>
                  )}
                </div>

                {/* Predefined Shipping Address */}
                <div className="md:col-span-2 pt-8 border-t border-white/10 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.4em] text-amber-400 font-black block">Endereço de Entrega Predefinido</label>
                      <p className="text-xs text-neutral-300 font-serif italic mt-1">Endereço global utilizado automaticamente nas suas encomendas</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditingSavedAddress ? (
                        <>
                          <Button 
                            type="button"
                            onClick={() => setIsEditingSavedAddress(false)}
                            className="bg-neutral-800 text-white hover:bg-neutral-700 text-[10px] uppercase tracking-widest font-bold px-4 h-11 rounded-none border border-neutral-600 transition-all"
                          >
                            CANCELAR
                          </Button>
                          <Button 
                            type="button"
                            onClick={handleSaveSavedAddress}
                            disabled={isSavingSavedAddress}
                            className="bg-amber-400 text-black hover:bg-white text-[10px] uppercase tracking-[0.2em] font-black px-6 h-11 rounded-none transition-all flex items-center gap-2 shadow-lg"
                          >
                            <Save size={14} /> {isSavingSavedAddress ? 'A GUARDAR...' : 'GUARDAR ENDEREÇO'}
                          </Button>
                        </>
                      ) : (
                        <Button 
                          type="button"
                          onClick={startEditingSavedAddress}
                          className="bg-amber-400 text-black hover:bg-white hover:text-black text-[10px] uppercase tracking-[0.2em] font-black px-6 h-11 rounded-none transition-all flex items-center gap-2 shadow-xl"
                        >
                          <Edit size={14} /> {profile?.saved_address?.address ? 'ALTERAR ENDEREÇO' : 'CONFIGURAR ENDEREÇO'}
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {isEditingSavedAddress ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-950 p-6 md:p-8 border-2 border-amber-500/50 rounded-none animate-in fade-in duration-500 shadow-2xl text-white">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Nome de Recibo / Destinatário</label>
                        <input 
                          type="text" 
                          placeholder="Nome completo para envio"
                          value={savedAddressForm.full_name} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, full_name: e.target.value})}
                          className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white placeholder-neutral-500 focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Telefone de Contacto</label>
                        <input 
                          type="text" 
                          placeholder="+351 912 345 678"
                          value={savedAddressForm.phone} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, phone: e.target.value})}
                          className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white placeholder-neutral-500 focus:border-amber-400 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Morada Completa</label>
                        <input 
                          type="text" 
                          placeholder="Rua, Número, Andar, Bloco..."
                          value={savedAddressForm.address} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, address: e.target.value})}
                          className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white placeholder-neutral-500 focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Cidade</label>
                        <input 
                          type="text" 
                          placeholder="Lisboa"
                          value={savedAddressForm.city} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, city: e.target.value})}
                          className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white placeholder-neutral-500 focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">País de Destino</label>
                        <select 
                          value={savedAddressForm.country} 
                          onChange={e => setSavedAddressForm({
                            ...savedAddressForm, 
                            country: e.target.value,
                            identification: '' // Reset when country changes
                          })}
                          className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white focus:border-amber-400 outline-none"
                        >
                          <option value="Portugal">Portugal</option>
                          <option value="Brasil">Brasil</option>
                          <option value="Espanha">Espanha</option>
                          <option value="Estados Unidos">Estados Unidos</option>
                          <option value="Alemanha">Alemanha</option>
                          <option value="Itália">Itália</option>
                          <option value="França">França</option>
                          <option value="Reino Unido">Reino Unido</option>
                          <option value="Holanda">Holanda</option>
                          <option value="Canadá">Canadá</option>
                          <option value="Austrália">Austrália</option>
                          <option value="Japão">Japão</option>
                          <option value="Coreia do Sul">Coreia do Sul</option>
                          <option value="Chile">Chile</option>
                          <option value="México">México</option>
                        </select>
                      </div>

                      {/* Dynamic Identification Field */}
                      {(savedAddressForm.country === 'Brasil' || 
                        savedAddressForm.country === 'Espanha' || 
                        savedAddressForm.country === 'Itália' ||
                        savedAddressForm.country === 'México' ||
                        savedAddressForm.country === 'Chile' ||
                        savedAddressForm.country === 'Coreia do Sul') && (
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">
                            {savedAddressForm.country === 'Brasil' ? 'CPF' : 
                             savedAddressForm.country === 'Espanha' ? 'DNI/NIE' : 
                             savedAddressForm.country === 'Itália' ? 'Codice Fiscale' :
                             savedAddressForm.country === 'México' ? 'RFC' :
                             savedAddressForm.country === 'Chile' ? 'RUT' :
                             'ID de Identificação'}
                          </label>
                          <input 
                            type="text" 
                            placeholder={savedAddressForm.country === 'Brasil' ? "000.000.000-00" : "Identificação"}
                            value={savedAddressForm.identification} 
                            onChange={e => setSavedAddressForm({...savedAddressForm, identification: e.target.value})}
                            className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white placeholder-neutral-500 focus:border-amber-400 outline-none font-mono"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Código Postal</label>
                        <input 
                          type="text" 
                          placeholder="1000-001"
                          value={savedAddressForm.zip} 
                          onChange={e => setSavedAddressForm({...savedAddressForm, zip: e.target.value})}
                          className="w-full bg-black border border-neutral-700 p-3.5 text-xs text-white placeholder-neutral-500 focus:border-amber-400 outline-none font-mono"
                        />
                      </div>
                      <div className="md:col-span-2 pt-4 flex flex-col sm:flex-row gap-3">
                        <Button 
                          onClick={handleSaveSavedAddress}
                          className="flex-1 bg-amber-400 text-black hover:bg-white rounded-none h-12 text-[10px] font-black uppercase tracking-[0.3em] shadow-lg transition-all"
                          disabled={isSavingSavedAddress}
                        >
                          {isSavingSavedAddress ? 'A GUARDAR...' : 'CONFIRMAR E GUARDAR ENDEREÇO PREDEFINIDO'}
                        </Button>
                        <Button 
                          type="button"
                          onClick={() => setIsEditingSavedAddress(false)}
                          className="bg-neutral-800 border border-neutral-600 text-white rounded-none h-12 px-6 text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-700"
                        >
                          CANCELAR
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 md:p-8 bg-neutral-950 border-2 border-neutral-800 group hover:border-amber-500/60 transition-all duration-500 relative overflow-hidden shadow-2xl text-white">
                       <MapPin className="absolute -right-4 -bottom-4 w-32 h-32 text-amber-500/10 pointer-events-none" />
                       
                       {profile?.saved_address?.address ? (
                         <div className="space-y-6 relative z-10">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="space-y-5">
                                 <div>
                                   <p className="text-[10px] uppercase tracking-widest text-amber-400 font-black mb-1">Destinatário</p>
                                   <p className="text-lg text-white font-serif italic font-bold">{profile.saved_address.full_name || 'N/A'}</p>
                                 </div>
                                 <div>
                                   <p className="text-[10px] uppercase tracking-widest text-amber-400 font-black mb-1">Localização</p>
                                   <div className="text-sm text-neutral-200 leading-relaxed font-serif bg-black p-4 border border-neutral-800">
                                     <p className="text-white font-semibold">{profile.saved_address.address}</p>
                                     <p className="text-neutral-300">{profile.saved_address.zip} {profile.saved_address.city}</p>
                                     <p className="text-amber-300 font-bold mt-1">{profile.saved_address.country || 'Portugal'}</p>
                                     {profile.saved_address.identification && (
                                       <p className="mt-2 pt-2 border-t border-neutral-800 text-xs text-neutral-300">
                                         <span className="text-amber-400 font-bold uppercase tracking-wider mr-1">
                                           {profile.saved_address.country === 'Brasil' ? 'CPF: ' : 'ID: '}
                                         </span>
                                         <span className="font-mono text-white">{profile.saved_address.identification}</span>
                                       </p>
                                     )}
                                   </div>
                                 </div>
                              </div>
                              <div className="space-y-5">
                                 <div>
                                   <p className="text-[10px] uppercase tracking-widest text-amber-400 font-black mb-1">Contacto</p>
                                   <p className="text-base text-white font-mono bg-black p-3 border border-neutral-800 inline-block">{profile.saved_address.phone || 'N/A'}</p>
                                 </div>
                                 <div>
                                   <p className="text-[10px] uppercase tracking-widest text-amber-400 font-black mb-1">Estado</p>
                                   <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/40 px-3.5 py-2 inline-flex">
                                     <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                     <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Pronto para Checkout Automático</p>
                                   </div>
                                 </div>
                              </div>
                           </div>
                         </div>
                       ) : (
                         <div className="py-10 text-center space-y-5 relative z-10">
                            <p className="text-base text-neutral-200 font-serif italic">Ainda não definiu um endereço predefinido para as suas aquisições.</p>
                            <Button 
                              type="button"
                              onClick={startEditingSavedAddress}
                              className="bg-amber-400 text-black hover:bg-white hover:text-black text-[10px] font-black uppercase tracking-[0.25em] px-8 h-12 rounded-none shadow-xl transition-all inline-flex items-center gap-2"
                            >
                              <Edit size={14} /> CONFIGURAR ENDEREÇO PREDEFINIDO AGORA
                            </Button>
                         </div>
                       )}
                    </div>
                  )}
                </div>

                {/* Navigation Preference (Cursor) */}
                <div className="md:col-span-2 pt-8 mt-4 border-t border-neutral-700 space-y-6">
                  <label className="text-[10px] uppercase tracking-[0.4em] text-amber-400 font-black block">Preferências de Visualização</label>
                  <div className="flex items-center justify-between p-6 bg-neutral-900 border-2 border-neutral-700 hover:border-amber-400/50 transition-all duration-500 shadow-md">
                    <div className="space-y-1">
                      <p className="text-sm text-white font-serif font-bold">Cursor de Fluxo Artístico</p>
                      <p className="text-[10px] text-neutral-300 uppercase tracking-widest font-semibold">Habilita a partícula de luxo que segue os seus movimentos</p>
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
                      className={`relative w-14 h-7 rounded-full transition-all duration-500 border-2 ${
                        cursorEnabled ? 'bg-amber-400 border-amber-300' : 'bg-neutral-800 border-neutral-600'
                      }`}
                    >
                      <motion.div 
                        animate={{ x: cursorEnabled ? 28 : 4 }}
                        className="absolute top-0.5 w-5 h-5 bg-black rounded-full shadow-lg"
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Security & Access Section */}
              <div className="pt-12 mt-12 border-t border-neutral-700">
                <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-neutral-900 p-6 md:p-8 border-2 border-neutral-700 shadow-xl">
                  <div className="flex gap-10">
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-amber-400 font-black">Membro Desde</p>
                      <p className="text-sm text-white font-serif font-bold">{new Date(user.created_at).toLocaleDateString('pt-PT', { year: 'numeric', month: 'long' })}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-amber-400 font-black">Tipo de Assinante</p>
                      <p className="text-sm text-white font-serif font-bold">Prestígio VIP</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={onLogout}
                    className="group flex items-center gap-4 px-8 py-4 bg-red-500/10 border-2 border-red-500/40 text-red-400 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-red-500 hover:text-white transition-all duration-500 w-full md:w-auto overflow-hidden relative shadow-lg"
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
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 pb-8 border-b border-neutral-700">
              <div className="space-y-2">
                <span className="text-amber-400 text-[10px] uppercase tracking-[0.5em] font-black">Historial de Aquisições</span>
                <h2 className="text-4xl font-serif text-white italic font-bold">Manifestações de Arte</h2>
              </div>
              
              <div className="flex bg-neutral-900 p-1.5 border-2 border-neutral-700 rounded-full overflow-x-auto no-scrollbar w-full lg:w-auto shadow-lg">
                {(['all', 'pending', 'sent', 'delivered', 'refunded', 'canceled'] as const).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setOrderFilter(f)}
                    className={`relative px-5 py-2.5 text-[9px] uppercase tracking-[0.2em] font-black transition-all rounded-full whitespace-nowrap ${
                      orderFilter === f ? 'text-black' : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    {orderFilter === f && (
                      <motion.div 
                        layoutId="order-filter-bg"
                        className="absolute inset-0 bg-amber-400"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 font-black">
                      {f === 'all' ? 'TODOS' : f === 'pending' ? 'PENDENTES' : f === 'sent' ? 'TRÂNSITO' : f === 'delivered' ? 'ENTREGUE' : f === 'refunded' ? 'REEMBOLSOS' : 'CANCELADOS'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {filteredOrders.length === 0 ? (
                <div className="py-28 text-center flex flex-col items-center justify-center space-y-6 bg-neutral-900 border-2 border-neutral-800 p-8 shadow-xl">
                  <div className="w-20 h-20 rounded-full border-2 border-neutral-700 flex items-center justify-center text-amber-400 bg-neutral-950">
                    <ShoppingBag size={36} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.4em] text-white font-black">Nenhuma obra encontrada</p>
                    <p className="text-base text-neutral-300 font-serif italic">A sua galeria pessoal aguarda o primeiro manifesto.</p>
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
                    className="group relative bg-neutral-950 border-2 border-neutral-800 hover:border-amber-400/80 transition-all duration-500 cursor-pointer overflow-hidden p-4 md:p-0 shadow-2xl"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex flex-col md:flex-row items-stretch min-h-[130px]">
                      {/* Product Visual */}
                      <div className="w-full md:w-36 lg:w-44 h-48 md:h-auto bg-neutral-900 overflow-hidden shrink-0 border-r border-neutral-800">
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
                            {(() => {
                              const isRefunded = ['refunded', 'reembolsado'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refunded';
                              const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refund_pending';
                              const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(order.status?.toLowerCase() || '') || ['canceled', 'cancelled'].includes(order.shipping_status?.toLowerCase() || '');
                              
                              let badgeColor = 'text-amber-400 border-amber-500/40 bg-amber-500/10 font-black';
                              let badgeText = 'EM PROCESSAMENTO';

                              if (isRefunded) {
                                badgeColor = 'text-rose-400 border-rose-500/50 bg-rose-500/20 font-black';
                                badgeText = 'REEMBOLSADO';
                              } else if (isRefundPending) {
                                badgeColor = 'text-amber-300 border-amber-400/50 bg-amber-400/20 font-black';
                                badgeText = 'REEMBOLSO EM ANÁLISE';
                              } else if (isCanceled) {
                                badgeColor = 'text-red-400 border-red-500/50 bg-red-500/20 font-black';
                                badgeText = 'CANCELADO';
                              } else if (order.shipping_status === 'delivered') {
                                badgeColor = 'text-emerald-400 border-emerald-500/50 bg-emerald-500/20 font-black';
                                badgeText = 'ENTREGUE';
                              } else if (order.shipping_status === 'out_for_delivery') {
                                badgeColor = 'text-amber-300 border-amber-400/50 bg-amber-400/20 font-black';
                                badgeText = 'EM ENTREGA';
                              } else if (order.shipping_status === 'sent') {
                                badgeColor = 'text-blue-400 border-blue-500/50 bg-blue-500/20 font-black';
                                badgeText = 'EM TRÂNSITO';
                              } else if (order.shipping_status === 'confirmed') {
                                badgeColor = 'text-amber-400 border-amber-400/50 bg-amber-400/20 font-black';
                                badgeText = 'CONFIRMADO';
                              } else if (order.shipping_status === 'preparing') {
                                badgeColor = 'text-amber-400 border-amber-400/50 bg-amber-400/20 font-black';
                                badgeText = 'EM PREPARAÇÃO';
                              } else if (order.shipping_status === 'ready') {
                                badgeColor = 'text-amber-400 border-amber-400/50 bg-amber-400/20 font-black';
                                badgeText = 'PREPARADO';
                              } else if (order.shipping_status === 'incident') {
                                badgeColor = 'text-orange-400 border-orange-500/50 bg-orange-500/20 font-black';
                                badgeText = 'COM INCIDENTE';
                              } else if (order.shipping_status === 'lost') {
                                badgeColor = 'text-red-400 border-red-700/50 bg-red-700/20 font-black';
                                badgeText = 'EXTRAVIADO';
                              }

                              return (
                                <span className={`text-[8px] md:text-[9px] uppercase tracking-[0.3em] font-black py-1 px-3 border rounded-none ${badgeColor}`}>
                                  {badgeText}
                                </span>
                              );
                            })()}
                            <p className="text-[8px] font-mono text-neutral-300 uppercase tracking-widest whitespace-nowrap font-bold bg-neutral-900 px-2 py-0.5 border border-neutral-700">ID: Sart-{order.id.split('-')[0].toUpperCase()}</p>
                          </div>
                          <h4 className="text-xl md:text-2xl font-serif text-white font-bold truncate max-w-[240px] lg:max-w-md group-hover:text-amber-400 transition-colors duration-500">
                            {order.product?.title?.length > 50 ? `${order.product.title.slice(0, 47)}...` : (order.product?.title || 'Manifestação Sem Nome')}
                          </h4>
                          <div className="flex flex-wrap justify-center md:justify-start items-center gap-5 text-[10px] uppercase tracking-[0.2em] text-neutral-200 font-bold mb-4 md:mb-0">
                            <div className="flex items-center gap-2"><Calendar size={14} className="text-amber-400" /> {new Date(order.created_at).toLocaleDateString()}</div>
                            <div className="flex items-center gap-2 font-mono font-black text-amber-400 text-base">{formatPrice ? formatPrice(order.total_amount) : `€${order.total_amount.toFixed(2)}`}</div>
                          </div>
                        </div>

                        {/* Status Pillars */}
                        <div className="flex flex-row md:flex-col lg:flex-row items-center gap-3 md:gap-4 w-full md:w-auto shrink-0 md:ml-auto">
                           <div className="flex-1 md:w-36 shrink-0 p-3.5 bg-neutral-900 border-2 border-neutral-800 text-center space-y-1">
                              <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-black">LOGÍSTICA</p>
                              {(() => {
                                const isRefunded = ['refunded', 'reembolsado'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refunded';
                                const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(order.status?.toLowerCase() || '') || ['canceled', 'cancelled'].includes(order.shipping_status?.toLowerCase() || '');
                                
                                if (isRefunded) {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-rose-400">Cancelado</p>;
                                }
                                if (isCanceled) {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-red-400">Cancelado</p>;
                                }
                                if (order.shipping_status === 'delivered') {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-emerald-400 font-bold">Entregue</p>;
                                }
                                if (order.shipping_status === 'sent') {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-blue-400 font-bold">Em Trânsito</p>;
                                }
                                if (order.shipping_status === 'preparing') {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-amber-400 font-bold">Em Preparação</p>;
                                }
                                return <p className="text-[10px] font-black uppercase tracking-widest truncate text-amber-400 font-bold">Produção</p>;
                              })()}
                           </div>
                           <div className="flex-1 md:w-36 shrink-0 p-3.5 bg-neutral-900 border-2 border-neutral-800 text-center space-y-1">
                              <p className="text-[8px] uppercase tracking-widest text-neutral-400 font-black">FINANCEIRO</p>
                              {(() => {
                                const isRefunded = ['refunded', 'reembolsado'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refunded';
                                const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refund_pending';
                                const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(order.status?.toLowerCase() || '');
                                
                                if (isRefunded) {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-rose-400 font-bold">Reembolsado</p>;
                                }
                                if (isRefundPending) {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-amber-300 font-bold">Reembolso em Curso</p>;
                                }
                                if (isCanceled) {
                                  return <p className="text-[10px] font-black uppercase tracking-widest truncate text-red-400 font-bold">Cancelado</p>;
                                }
                                return <p className="text-[10px] font-black uppercase tracking-widest truncate text-emerald-400 font-bold">Pago</p>;
                              })()}
                           </div>
                        </div>

                        <div className="hidden lg:flex items-center justify-center w-12 h-12 rounded-full border-2 border-neutral-700 bg-neutral-900 group-hover:border-amber-400 group-hover:bg-amber-400 group-hover:text-black transition-all duration-500 shrink-0 text-white">
                          <ArrowUpRight size={22} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'refunds' && (
          <motion.div 
            key="refunds"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="space-y-12"
          >
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-8 border-b border-neutral-700">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-amber-400 text-[10px] uppercase tracking-[0.5em] font-black">Centro de Garantia & Reembolsos</span>
                  <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5">PROTEÇÃO TOTAL</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-serif text-white italic font-bold">Devoluções & Estornos</h2>
                <p className="text-xs md:text-sm text-neutral-300 font-medium max-w-2xl">
                  Transparência absoluta em cada transação. Acompanhe os seus processos de estorno ou submeta uma nova solicitação de devolução para peças elegíveis.
                </p>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-6 bg-neutral-950 border-2 border-neutral-800 space-y-3">
                <div className="flex justify-between items-center text-rose-400">
                  <RotateCcw size={20} />
                  <span className="text-[8px] uppercase tracking-[0.3em] font-black bg-rose-500/10 border border-rose-500/30 px-2 py-0.5">TOTAL DEVOLVIDO</span>
                </div>
                <p className="text-2xl md:text-3xl font-mono font-black text-white">{formatPrice ? formatPrice(totalRefundedAmount) : `€${totalRefundedAmount.toFixed(2)}`}</p>
                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold">{refundOrders.filter(o => ['refunded', 'reembolsado'].includes(o.status?.toLowerCase() || '') || o.payment_status === 'refunded').length} Processo(s) Concluído(s)</p>
              </div>

              <div className="p-6 bg-neutral-950 border-2 border-neutral-800 space-y-3">
                <div className="flex justify-between items-center text-amber-400">
                  <Clock size={20} />
                  <span className="text-[8px] uppercase tracking-[0.3em] font-black bg-amber-400/10 border border-amber-400/30 px-2 py-0.5">EM ANÁLISE</span>
                </div>
                <p className="text-2xl md:text-3xl font-mono font-black text-amber-400">{pendingRefundsCount}</p>
                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold">Sob Revisão da Curadoria</p>
              </div>

              <div className="p-6 bg-neutral-950 border-2 border-neutral-800 space-y-3">
                <div className="flex justify-between items-center text-emerald-400">
                  <Shield size={20} />
                  <span className="text-[8px] uppercase tracking-[0.3em] font-black bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5">ELEGÍVEIS</span>
                </div>
                <p className="text-2xl md:text-3xl font-mono font-black text-white">{eligibleOrdersForRefund.length}</p>
                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold">Pedidos com Direito a Troca</p>
              </div>

              <div className="p-6 bg-amber-400 text-black border-2 border-amber-300 space-y-3 shadow-xl">
                <div className="flex justify-between items-center">
                  <Crown size={20} />
                  <span className="text-[8px] uppercase tracking-[0.3em] font-black bg-black text-amber-400 px-2 py-0.5">GARANTIA S.ART</span>
                </div>
                <p className="text-2xl md:text-3xl font-serif font-black tracking-tight">14 a 30 DIAS</p>
                <p className="text-[10px] uppercase tracking-widest font-black text-black/80">Livre Resolução Assegurada</p>
              </div>
            </div>

            {/* Section 1: Processos de Reembolso Ativos / Concluídos */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-serif text-white font-bold italic">Processos de Reembolso & Historial</h3>
                <span className="h-px flex-1 bg-neutral-800"></span>
              </div>

              {refundOrders.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center space-y-4 bg-neutral-950 border-2 border-neutral-800 p-8">
                  <div className="w-16 h-16 rounded-full border-2 border-neutral-700 flex items-center justify-center text-neutral-400 bg-neutral-900">
                    <RotateCcw size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.4em] text-white font-black">Nenhum reembolso registado</p>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto font-medium">Todas as suas aquisições na galeria estão ativas, confirmadas ou entregues sem pedidos de cancelamento.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {refundOrders.map((order) => {
                    const isRefunded = ['refunded', 'reembolsado'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refunded';
                    const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(order.status?.toLowerCase() || '') || order.payment_status === 'refund_pending';

                    return (
                      <div 
                        key={order.id}
                        className="bg-neutral-950 border-2 border-neutral-800 hover:border-neutral-700 transition-all p-6 md:p-8 space-y-6 shadow-xl"
                      >
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-neutral-800">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-neutral-900 overflow-hidden shrink-0 border border-neutral-700">
                              <img 
                                src={getImageUrl(order.product?.image_url || '')} 
                                alt="" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <span className={`text-[8px] uppercase tracking-[0.3em] font-black px-2.5 py-1 border ${
                                  isRefunded 
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' 
                                    : isRefundPending 
                                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' 
                                    : 'bg-red-500/20 text-red-400 border-red-500/40'
                                }`}>
                                  {isRefunded ? 'ESTORNO CONCLUÍDO' : isRefundPending ? 'SOLICITAÇÃO EM ANÁLISE' : 'CANCELAMENTO PROCESSADO'}
                                </span>
                                <span className="text-[9px] font-mono font-bold text-neutral-400">ID: Sart-{order.id.split('-')[0].toUpperCase()}</span>
                              </div>
                              <h4 className="text-lg md:text-xl font-serif text-white font-bold">{order.product?.title || 'Manifestação S.art'}</h4>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-6 text-right">
                            <div>
                              <p className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">VALOR A REEMBOLSAR</p>
                              <p className="text-xl md:text-2xl font-mono font-black text-amber-400">{formatPrice ? formatPrice(order.total_amount) : `€${order.total_amount.toFixed(2)}`}</p>
                            </div>
                            <Button 
                              onClick={() => setSelectedOrder(order)}
                              className="h-11 px-6 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-white hover:text-amber-400 text-[9px] font-black uppercase tracking-[0.2em]"
                            >
                              VER DETALHES
                            </Button>
                          </div>
                        </div>

                        {/* Visual Progress Steps */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                          <div className="p-4 bg-neutral-900 border border-neutral-800 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shrink-0">
                              ✓
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-widest text-neutral-300 font-black">1. Pedido Registado</p>
                              <p className="text-[10px] text-neutral-400 font-semibold">{new Date(order.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>

                          <div className={`p-4 border flex items-center gap-3 ${
                            isRefunded || isRefundPending 
                              ? 'bg-neutral-900 border-neutral-800' 
                              : 'bg-neutral-900/50 border-neutral-800/50 opacity-60'
                          }`}>
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${
                              isRefunded 
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                                : isRefundPending 
                                ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 animate-pulse' 
                                : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                            }`}>
                              {isRefunded ? '✓' : '2'}
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-widest text-neutral-300 font-black">2. Análise da Curadoria</p>
                              <p className="text-[10px] text-neutral-400 font-semibold">{isRefunded ? 'Aprovado' : isRefundPending ? 'Em avaliação bancária' : 'Pendente'}</p>
                            </div>
                          </div>

                          <div className={`p-4 border flex items-center gap-3 ${
                            isRefunded 
                              ? 'bg-neutral-900 border-neutral-800' 
                              : 'bg-neutral-900/50 border-neutral-800/50 opacity-60'
                          }`}>
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${
                              isRefunded 
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                                : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                            }`}>
                              {isRefunded ? '✓' : '3'}
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-widest text-neutral-300 font-black">3. Estorno Concluído</p>
                              <p className="text-[10px] text-neutral-400 font-semibold">{isRefunded ? 'Revertido na conta original' : 'Até 3-5 dias úteis'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 2: Pedidos Elegíveis para Devolução */}
            {eligibleOrdersForRefund.length > 0 && (
              <div className="space-y-6 pt-6">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-serif text-white font-bold italic">Obras Elegíveis para Solicitar Reembolso</h3>
                  <span className="h-px flex-1 bg-neutral-800"></span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {eligibleOrdersForRefund.map((order) => (
                    <div 
                      key={order.id}
                      className="bg-neutral-950 border-2 border-neutral-800 p-6 flex flex-col justify-between gap-6 hover:border-amber-400/60 transition-all shadow-xl"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-20 h-20 bg-neutral-900 overflow-hidden shrink-0 border border-neutral-700">
                          <img 
                            src={getImageUrl(order.product?.image_url || '')} 
                            alt="" 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-mono text-neutral-400 uppercase tracking-widest font-bold">Sart-{order.id.split('-')[0].toUpperCase()}</span>
                          <h4 className="text-lg font-serif text-white font-bold leading-tight">{order.product?.title || 'Manifestação S.art'}</h4>
                          <p className="text-base font-mono font-black text-amber-400">{formatPrice ? formatPrice(order.total_amount) : `€${order.total_amount.toFixed(2)}`}</p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-4">
                        <span className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">Comprado a {new Date(order.created_at).toLocaleDateString()}</span>
                        <Button 
                          onClick={() => handleOpenRefundModal(order)}
                          className="h-10 px-5 bg-amber-400 hover:bg-white text-black text-[9px] font-black uppercase tracking-[0.2em] rounded-none transition-all flex items-center gap-2"
                        >
                          <RotateCcw size={13} /> SOLICITAR REEMBOLSO
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 3: Políticas & Garantias */}
            <div className="bg-neutral-950 border-2 border-neutral-800 p-8 space-y-6 shadow-2xl">
              <div className="flex items-center gap-3 text-amber-400">
                <Shield size={20} />
                <span className="text-[11px] uppercase tracking-[0.4em] font-black">POLÍTICA DE REEMBOLSO & CONFIANÇA S.ART</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-neutral-300 text-xs leading-relaxed font-medium">
                <div className="p-5 bg-neutral-900 border border-neutral-800 space-y-2">
                  <p className="text-white font-bold uppercase tracking-widest text-[10px]">14 Dias de Resolução</p>
                  <p className="text-neutral-400">Direito legal e incondicional de cancelamento ou devolução no prazo de 14 dias a contar da data de entrega da peça.</p>
                </div>
                <div className="p-5 bg-neutral-900 border border-neutral-800 space-y-2">
                  <p className="text-white font-bold uppercase tracking-widest text-[10px]">Estorno Integral</p>
                  <p className="text-neutral-400">O montante total transacionado é restituído diretamente através do mesmo método de pagamento utilizado na compra.</p>
                </div>
                <div className="p-5 bg-neutral-900 border border-neutral-800 space-y-2">
                  <p className="text-white font-bold uppercase tracking-widest text-[10px]">Suporte Concierge</p>
                  <p className="text-neutral-400">A nossa curadoria acompanha pessoalmente a recolha da peça e o processo financeiro junto da instituição bancária.</p>
                </div>
              </div>
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
            className="fixed inset-0 z-[10000] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-[#0c0c0c] w-full max-w-5xl max-h-[92vh] border border-neutral-800 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] relative flex flex-col rounded-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Luxury Detail Header */}
              <div className="relative h-56 md:h-72 shrink-0 overflow-hidden border-b border-neutral-800">
                <img 
                  src={getImageUrl(selectedOrder.product?.image_url || '')} 
                  alt="" 
                  className="w-full h-full object-cover grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-1000" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/40 to-transparent" />
                <button 
                  onClick={() => setSelectedOrder(null)} 
                  className="absolute top-6 right-6 md:top-8 md:right-8 w-11 h-11 rounded-none bg-black/80 border border-neutral-700 flex items-center justify-center text-white hover:bg-amber-400 hover:text-black hover:border-amber-400 transition-all duration-300 z-50"
                >
                  <X size={18} />
                </button>
                
                <div className="absolute bottom-8 left-8 md:bottom-12 md:left-12 space-y-2">
                   <p className="text-amber-400 text-[9px] uppercase tracking-[0.6em] font-black">MEMBRO EXCLUSIVO</p>
                   <h3 className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-none line-clamp-2 font-light">
                      {selectedOrder.product?.title || 'Manifestação S.art'}
                   </h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto luxury-scrollbar bg-[#080808]">
                <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
                  {/* Secondary details */}
                  <div className="md:col-span-7 space-y-10">
                    
                    {/* Logística de Luxo Card */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-amber-400">
                          <Truck size={18} className="stroke-[1.5]" />
                          <span className="text-[10px] uppercase tracking-[0.4em] font-black">LOGÍSTICA DE LUXO</span>
                        </div>
                        {selectedOrder.shipping_status === 'pending' && !isEditingAddress && (
                          <button 
                            onClick={() => startEditingAddress(selectedOrder)}
                            className="text-[9px] uppercase tracking-[0.2em] text-amber-400 hover:text-white transition-colors flex items-center gap-2 border border-amber-400/35 bg-[#121212] px-4 py-2 font-bold"
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
                          <div className="p-6 md:p-8 bg-[#121212] border border-neutral-800 relative shadow-xl">
                            {isEditingAddress ? (
                              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">Morada</label>
                                    <input 
                                      type="text" 
                                      value={addressForm.address} 
                                      onChange={e => setAddressForm({...addressForm, address: e.target.value})}
                                      className="w-full bg-[#181818] border border-neutral-700 p-4 text-xs font-semibold uppercase tracking-wider text-white focus:border-amber-400 outline-none rounded-none focus:ring-1 focus:ring-amber-400 transition-all"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">Cidade</label>
                                    <input 
                                      type="text" 
                                      value={addressForm.city} 
                                      onChange={e => setAddressForm({...addressForm, city: e.target.value})}
                                      className="w-full bg-[#181818] border border-neutral-700 p-4 text-xs font-semibold uppercase tracking-wider text-white focus:border-amber-400 outline-none rounded-none focus:ring-1 focus:ring-amber-400 transition-all"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">Código Postal</label>
                                    <input 
                                      type="text" 
                                      value={addressForm.zip} 
                                      onChange={e => setAddressForm({...addressForm, zip: e.target.value})}
                                      className="w-full bg-[#181818] border border-neutral-700 p-4 text-xs font-semibold uppercase tracking-wider text-white focus:border-amber-400 outline-none rounded-none focus:ring-1 focus:ring-amber-400 transition-all"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">Telemóvel</label>
                                    <input 
                                      type="text" 
                                      value={addressForm.phone} 
                                      onChange={e => setAddressForm({...addressForm, phone: e.target.value})}
                                      className="w-full bg-[#181818] border border-neutral-700 p-4 text-xs font-semibold uppercase tracking-wider text-white focus:border-amber-400 outline-none rounded-none focus:ring-1 focus:ring-amber-400 transition-all"
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2">
                                    <label className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">Email de Contacto</label>
                                    <input 
                                      type="email" 
                                      value={addressForm.email} 
                                      onChange={e => setAddressForm({...addressForm, email: e.target.value})}
                                      className="w-full bg-[#181818] border border-neutral-700 p-4 text-xs font-semibold uppercase tracking-wider text-white focus:border-amber-400 outline-none rounded-none focus:ring-1 focus:ring-amber-400 transition-all"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-4 pt-4">
                                  <Button 
                                    onClick={handleUpdateAddress}
                                    disabled={isUpdatingAddress}
                                    className="flex-1 bg-amber-400 text-black font-black rounded-none h-12 text-[10px] uppercase tracking-widest hover:bg-white"
                                  >
                                    {isUpdatingAddress ? 'A SALVAR...' : 'GUARDAR ALTERAÇÕES'}
                                  </Button>
                                  <Button 
                                    onClick={() => setIsEditingAddress(false)}
                                    variant="outline"
                                    className="flex-1 bg-neutral-900 border border-neutral-700 text-white rounded-none h-12 text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800"
                                  >
                                    CANCELAR
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                  <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">Destinatário</p>
                                  <p className="text-base text-white font-serif italic font-bold">
                                    {details.fullName || 
                                     `${details.firstName || ''} ${details.lastName || ''}`.trim() || 
                                     'Nome Preservado'}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">Residência de Entrega</p>
                                  <p className="text-sm text-neutral-200 font-mono leading-relaxed font-semibold">
                                    {details.address}<br />
                                    {details.zip || details.postalCode} {details.city}<br />
                                    <span className="text-amber-400 font-bold">{details.country || 'PT'}</span>
                                  </p>
                                </div>
                                <div className="md:col-span-2 space-y-1 border-t border-neutral-800 pt-4">
                                   <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">Contacto Seguro</p>
                                   <p className="text-sm text-neutral-100 font-mono font-bold">{details.phone || 'Privado'}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-sm text-neutral-400 font-serif italic bg-[#121212] p-6 border border-neutral-800">Os detalhes logísticos estão em fase de digitalização.</p>
                      )}
                    </div>

                    {/* Rastreamento de Elite Card */}
                    <div className="space-y-4">
                       <div className="flex items-center gap-3 text-amber-400">
                          <FileText size={18} className="stroke-[1.5]" />
                          <span className="text-[10px] uppercase tracking-[0.4em] font-black">RASTREAMENTO DE ELITE</span>
                       </div>
                       <div className="p-6 md:p-8 bg-[#121212] border border-neutral-800 space-y-6 shadow-xl">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                             <div className="space-y-1">
                                <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">Estado Atual</p>
                                <p className="text-xs font-black uppercase tracking-widest">
                                  {(() => {
                                    const isRefunded = ['refunded', 'reembolsado'].includes(selectedOrder.status?.toLowerCase() || '') || selectedOrder.payment_status === 'refunded';
                                    const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(selectedOrder.status?.toLowerCase() || '') || selectedOrder.payment_status === 'refund_pending';
                                    const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(selectedOrder.status?.toLowerCase() || '') || ['canceled', 'cancelled'].includes(selectedOrder.shipping_status?.toLowerCase() || '');

                                    if (isRefunded) return <span className="text-rose-400">REEMBOLSADO</span>;
                                    if (isRefundPending) return <span className="text-amber-400">EM ANÁLISE</span>;
                                    if (isCanceled) return <span className="text-red-400">CANCELADO</span>;
                                    if (selectedOrder.shipping_status === 'delivered') return <span className="text-emerald-400">ENTREGUE</span>;
                                    if (selectedOrder.shipping_status === 'out_for_delivery') return <span className="text-amber-400">DISTRIBUIÇÃO</span>;
                                    if (selectedOrder.shipping_status === 'sent') return <span className="text-blue-400">EM TRÂNSITO</span>;
                                    if (['confirmed', 'confirmed_order'].includes(selectedOrder.shipping_status || '')) return <span className="text-white">CONFIRMADO</span>;
                                    if (['preparing', 'ready'].includes(selectedOrder.shipping_status || '')) return <span className="text-white">EM PREPARAÇÃO</span>;
                                    return <span className="text-white">{selectedOrder.shipping_status || 'Verificando'}</span>;
                                  })()}
                                </p>
                             </div>
                             {selectedOrder.shipping_status_metadata?.lastExternalStatus && (
                               <div className="space-y-1">
                                  <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">Status Logística</p>
                                  <p className="text-xs text-orange-400 font-black uppercase tracking-widest">
                                    {selectedOrder.shipping_status_metadata.lastExternalStatus}
                                  </p>
                               </div>
                             )}
                             <div className="space-y-1">
                                <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">SLA Estimado</p>
                                <p className="text-xs text-amber-400 font-black uppercase tracking-widest">Premium (4-7 Dias)</p>
                             </div>
                          </div>
                          
                          {(selectedOrder.shipping_status_metadata?.trackingNumber || selectedOrder.shipping_tracking_code) && (
                            <div className="pt-6 border-t border-neutral-800 space-y-4">
                               <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-black p-4 rounded-none border border-neutral-800 gap-4 overflow-hidden">
                                  <span className="font-mono text-sm md:text-base xl:text-lg text-white font-bold tracking-tighter break-all w-full">{selectedOrder.shipping_status_metadata?.trackingNumber || selectedOrder.shipping_tracking_code}</span>
                                  {(selectedOrder.shipping_status_metadata?.trackingUrl || selectedOrder.shipping_tracking_url) && (
                                    <a 
                                      href={selectedOrder.shipping_status_metadata?.trackingUrl || selectedOrder.shipping_tracking_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 text-amber-400 text-[10px] uppercase tracking-widest font-black hover:text-white transition-colors whitespace-nowrap pt-2 xl:pt-0"
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
                  <div className="md:col-span-5 space-y-10">
                     
                     {/* Elegant Investimento Card */}
                     <div className="p-8 bg-gradient-to-br from-amber-400 to-amber-500 text-black space-y-6 shadow-2xl border border-amber-300 relative overflow-hidden group">
                        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6 pointer-events-none group-hover:scale-105 transition-transform duration-1000">
                          <CreditCard size={180} />
                        </div>
                        <div className="flex items-center gap-3 opacity-90 relative z-10">
                           <CreditCard size={18} className="text-black" />
                           <span className="text-[10px] uppercase tracking-[0.4em] font-black text-black">INVESTIMENTO SEGURO</span>
                        </div>
                        <div className="space-y-1 relative z-10">
                           <p className="text-5xl font-serif font-black tracking-tighter text-black">
                             {formatPrice ? formatPrice(selectedOrder.total_amount) : `€${selectedOrder.total_amount.toFixed(2)}`}
                           </p>
                           <p className="text-[9px] uppercase tracking-widest font-black text-black/80">Total Transacionado</p>
                        </div>
                        <div className="pt-6 border-t border-black/15 flex flex-col gap-4 relative z-10">
                           <div className="flex justify-between items-center text-[9px] uppercase tracking-widest font-black">
                              <span className="text-black/70">Status</span>
                              <span className="bg-black text-amber-400 px-3 py-1 text-[8px] font-black">
                                 {(() => {
                                   const isRefunded = ['refunded', 'reembolsado'].includes(selectedOrder.status?.toLowerCase() || '') || selectedOrder.payment_status === 'refunded';
                                   const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(selectedOrder.status?.toLowerCase() || '') || selectedOrder.payment_status === 'refund_pending';
                                   const isCanceled = ['canceled', 'cancelled', 'cancelado'].includes(selectedOrder.status?.toLowerCase() || '');

                                   if (isRefunded) return 'REEMBOLSADO';
                                   if (isRefundPending) return 'EM ANÁLISE';
                                   if (isCanceled) return 'CANCELADO';
                                   return 'PAGO / CONFIRMADO';
                                 })()}
                              </span>
                           </div>
                           <div className="flex justify-between items-center text-[9px] uppercase tracking-widest font-black">
                              <span className="text-black/70">Tópico</span>
                              <span className="font-black text-black">AQUISIÇÃO ÚNICA</span>
                           </div>
                        </div>
                     </div>

                     {/* Metadados Card */}
                     <div className="p-6 md:p-8 bg-[#121212] border border-neutral-800 space-y-6 shadow-xl">
                        <div className="flex items-center gap-3 text-amber-400">
                           <Hash size={18} className="stroke-[1.5]" />
                           <span className="text-[10px] uppercase tracking-[0.4em] font-black">METADADOS SECRETO</span>
                        </div>
                        <div className="space-y-4 text-[11px] font-mono text-neutral-300 leading-relaxed max-w-full overflow-hidden font-semibold">
                           <div className="grid grid-cols-2 gap-4 border-b border-neutral-800 pb-2">
                              <span className="uppercase tracking-[0.1em] text-neutral-500 font-bold">REFERÊNCIA</span>
                              <span className="text-white select-all text-right break-all font-bold">Sart-{selectedOrder.id.toUpperCase()}</span>
                           </div>
                           <div className="grid grid-cols-2 gap-4 border-b border-neutral-800 pb-2">
                              <span className="uppercase tracking-[0.1em] text-neutral-500 font-bold">HORÁRIO</span>
                              <span className="text-white text-right font-bold">{new Date(selectedOrder.created_at).toLocaleTimeString()}</span>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <span className="uppercase tracking-[0.1em] text-neutral-500 font-bold">DATA</span>
                              <span className="text-white text-right font-bold">{new Date(selectedOrder.created_at).toLocaleDateString()}</span>
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
                           className="w-full py-4 bg-[#181818] hover:bg-neutral-800 border border-neutral-800 text-[9px] uppercase tracking-[0.3em] font-black text-neutral-200 transition-all flex items-center justify-center gap-4 rounded-none"
                        >
                           <Mail size={13} className={selectedOrder.notifications_enabled !== false ? 'text-amber-400' : ''} />
                           {selectedOrder.notifications_enabled !== false ? 'ALERTAS ATIVOS' : 'ALERTAS DESATIVADOS'}
                        </button>
                     </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="p-8 bg-[#121212] border-t border-neutral-800 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
                 <div className="flex items-center gap-3 w-full md:w-auto">
                    {(() => {
                      const isRefunded = ['refunded', 'reembolsado'].includes(selectedOrder.status?.toLowerCase() || '') || selectedOrder.payment_status === 'refunded';
                      const isRefundPending = ['refund_pending', 'waiting_refund', 'refund_requested'].includes(selectedOrder.status?.toLowerCase() || '') || selectedOrder.payment_status === 'refund_pending';
                      
                      if (isRefunded) {
                        return (
                          <span className="flex items-center gap-2 text-rose-400 text-xs font-black uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-4 py-2.5">
                            <RotateCcw size={14} /> ESTORNO CONCLUÍDO
                          </span>
                        );
                      }
                      if (isRefundPending) {
                        return (
                          <span className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest bg-amber-400/10 border border-amber-400/20 px-4 py-2.5">
                            <Clock size={14} /> REEMBOLSO EM ANÁLISE
                          </span>
                        );
                      }
                      return (
                        <button
                          onClick={() => handleOpenRefundModal(selectedOrder)}
                          className="flex items-center gap-2 text-neutral-300 hover:text-amber-400 text-[9px] font-black uppercase tracking-[0.25em] bg-[#1a1a1a] hover:bg-[#222] border border-neutral-850 px-5 py-3 transition-all rounded-none"
                        >
                          <RotateCcw size={13} /> SOLICITAR REEMBOLSO
                        </button>
                      );
                    })()}
                 </div>
                 <Button 
                   onClick={() => setSelectedOrder(null)}
                   className="w-full md:w-auto h-12 md:h-13 px-10 bg-amber-400 text-black rounded-none text-[9px] uppercase tracking-[0.4em] font-black hover:bg-white transition-all duration-300 shadow-xl"
                 >
                   REGRESSAR À GALERIA
                 </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Refund Request Modal */}
      <AnimatePresence>
        {refundModalOrder && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[11000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4"
            onClick={() => setRefundModalOrder(null)}
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="bg-neutral-950 border-2 border-neutral-700 w-full max-w-xl p-8 space-y-8 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start border-b border-neutral-800 pb-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 text-[10px] uppercase tracking-[0.4em] font-black">
                    <RotateCcw size={14} /> SOLICITAÇÃO DE REEMBOLSO
                  </div>
                  <h3 className="text-2xl font-serif text-white font-bold">Devolução de Obra</h3>
                  <p className="text-xs text-neutral-400 font-medium">Referência: Sart-{refundModalOrder.id.split('-')[0].toUpperCase()}</p>
                </div>
                <button 
                  onClick={() => setRefundModalOrder(null)}
                  className="w-10 h-10 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Order Mini Info */}
              <div className="flex items-center gap-4 p-4 bg-neutral-900 border border-neutral-800">
                <div className="w-14 h-14 bg-black overflow-hidden shrink-0 border border-neutral-700">
                  <img 
                    src={getImageUrl(refundModalOrder.product?.image_url || '')} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <p className="text-white font-serif font-bold text-sm truncate">{refundModalOrder.product?.title || 'Obra S.art'}</p>
                  <p className="text-amber-400 font-mono font-black text-sm">{formatPrice ? formatPrice(refundModalOrder.total_amount) : `€${refundModalOrder.total_amount.toFixed(2)}`}</p>
                </div>
              </div>

              <form onSubmit={handleSubmitRefund} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-neutral-300 font-black">Motivo da Devolução</label>
                  <select 
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full p-4 bg-neutral-900 border-2 border-neutral-700 text-white text-xs font-semibold focus:border-amber-400 focus:outline-none"
                  >
                    <option value="Arrependimento de Compra (Prazo de 14 Dias)">Arrependimento de Compra (Prazo de 14 Dias)</option>
                    <option value="Peça Danificada no Transporte">Peça Danificada no Transporte</option>
                    <option value="Defeito de Fabrico / Acabamento">Defeito de Fabrico / Acabamento</option>
                    <option value="Dimensões ou Características Diferentes">Dimensões ou Características Diferentes</option>
                    <option value="Atraso Excessivo na Entrega">Atraso Excessivo na Entrega</option>
                    <option value="Outro Motivo">Outro Motivo</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-neutral-300 font-black">Detalhes ou Observações Adicionais</label>
                  <textarea 
                    rows={3}
                    value={refundDetails}
                    onChange={(e) => setRefundDetails(e.target.value)}
                    placeholder="Descreva brevemente o estado da peça ou observações para a curadoria..."
                    className="w-full p-4 bg-[#121212] border border-neutral-800 text-white text-xs font-medium focus:border-amber-400 focus:outline-none placeholder:text-neutral-500 rounded-none"
                  />
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-end">
                  <Button
                    type="button"
                    onClick={() => setRefundModalOrder(null)}
                    disabled={isSubmittingRefund}
                    className="h-12 px-6 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 text-[10px] font-black uppercase tracking-widest rounded-none"
                  >
                    CANCELAR
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmittingRefund}
                    className="h-12 px-8 bg-amber-400 hover:bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-none shadow-xl transition-all"
                  >
                    {isSubmittingRefund ? 'A ENVIAR...' : 'CONFIRMAR SOLICITAÇÃO'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

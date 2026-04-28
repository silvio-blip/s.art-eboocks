import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
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
  Loader2,
  ExternalLink,
  RefreshCw,
  Truck,
  X,
  Users,
  Undo2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";

const getImageUrl = (url: string) => {
  if (!url) return "https://picsum.photos/seed/ebook/600/800";
  if (url.startsWith("http")) return url;
  try {
    const { data } = supabase.storage.from("assets").getPublicUrl(url);
    return data?.publicUrl || "https://picsum.photos/seed/ebook/600/800";
  } catch (err) {
    console.warn("Error generating public URL in admin:", err);
    return "https://picsum.photos/seed/ebook/600/800";
  }
};

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  file_url: string;
  is_active: boolean;
  created_at?: string;
  product_type?: "digital" | "physical";
  sizes?: string;
  colors?: string;
  sizes_enabled?: boolean;
  colors_enabled?: boolean;
  admin_link?: string;
  extra_images?: string; // Comma separated links
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  total_amount: number;
  customer_email: string;
  created_at: string;
  product?: Product;
  selected_options?: { size?: string; color?: string };
  shipping_status?: string;
  shipping_details?: {
    fullName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
  };
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  custom_id?: string;
}

export default function AdminDashboard({
  user,
  onBack,
  theme,
}: {
  user: SupabaseUser;
  onBack: () => void;
  theme: "light" | "dark";
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(
    null,
  );
  const [tab, setTab] = useState<"overview" | "products" | "orders" | "users" | "refunds">(
    "overview",
  );
  const [timeRange, setTimeRange] = useState<"weekly" | "monthly" | "yearly">(
    "weekly",
  );
  const [uploading, setUploading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    checkAdminAccess();

    // Real-time subscription for orders - unique name per admin to avoid "steal" conflict
    const channelName = `admin-updates-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchDashboardData();
          toast.info("Novas atividades de vendas detectadas!");
        }
      )
      .subscribe((status) => {
        console.log(`[REALTIME] Subscription status for orders: ${status}`);
        if (status === 'SUBSCRIBED') {
          toast.success("Conectado ao painel em tempo real.");
        } else if (status === 'CHANNEL_ERROR') {
          toast.error("Erro na conexão em tempo real.");
        }
      });

    // Polling fallback every 30 seconds to ensure data freshness
    const pollInterval = setInterval(() => {
      console.log("[POLLING] Refreshing dashboard data...");
      fetchDashboardData();
    }, 30000);

    const productsChannel = supabase
      .channel("products-admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(productsChannel);
      clearInterval(pollInterval);
    };
  }, [user.id]);

  useEffect(() => {
    if (tab === "users") {
      fetchUsers();
    }
  }, [tab]);

  const checkAdminAccess = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      const HARDCODED_ADMINS = ["3d596215-583e-498f-9fd5-36b83d8bccf5", "00d44feb-0b51-405e-86f7-31b67edfb7b6"];
      if (!HARDCODED_ADMINS.includes(user.id)) {
        onBack();
        return;
      }
    }
    fetchData();
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchProducts(), fetchDashboardData(), fetchUsers()]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("Error fetching users:", e);
    }
  };

  const toggleAdminRole = async (targetUser: Profile) => {
    try {
      const newRole = !targetUser.is_admin;
      const res = await fetch(`/api/admin/users/${targetUser.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, is_admin: newRole }),
      });

      if (res.ok) {
        toast.success(`Permissões de ${targetUser.full_name || targetUser.email} atualizadas.`);
        fetchUsers();
      } else {
        toast.error("Erro ao atualizar permissões.");
      }
    } catch (e) {
      toast.error("Erro na comunicação com o servidor.");
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setProducts(data);
  };

  const fetchDashboardData = async () => {
    try {
      console.log("[DEBUG] Obtendo dados do painel para:", user.id);
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.error("[DEBUG] Erro ao buscar pedidos:", ordersError);
        throw ordersError;
      }

      if (ordersData) {
        console.log(`[DEBUG] ${ordersData.length} pedidos encontrados.`);
        if (ordersData.length === 0) {
          setOrders([]);
          return;
        }

        const productIds = Array.from(
          new Set(ordersData.map((o) => o.product_id).filter(Boolean)),
        );

        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("*")
          .in("id", productIds);

        if (productsError) {
          console.error("[DEBUG] Erro ao buscar produtos dos pedidos:", productsError);
        }

        const merged = ordersData.map((order) => ({
          ...order,
          product: productsData?.find((p) => p.id === order.product_id) || null,
        }));

        setOrders(merged as any);
      }
    } catch (e: any) {
      console.error("[DEBUG] Erro fatal no Dashboard:", e);
      toast.error(e.message || "Erro ao carregar dados. Verifique o RLS no Supabase.");
    }
  };

  const handleSaveProduct = async () => {
    if (!editingProduct?.title) {
      toast.error("O Título é obrigatório.");
      return;
    }

    try {
      const isNew = !editingProduct.id;
      const res = await fetch(
        isNew
          ? "/api/admin/products"
          : `/api/admin/products/${editingProduct.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...editingProduct, userId: user.id }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar produto.");

      toast.success(
        isNew ? "E-book adicionado à boutique." : "Ativo atualizado.",
      );
      setEditingProduct(null);
      fetchProducts();
    } catch (e: any) {
      toast.error(e.message);
      console.error("Save product error:", e);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "pdf",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const slug = editingProduct?.title
        ? editingProduct.title
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .substring(0, 50)
        : "arquivo";

      const fileName = `${slug}-${Date.now()}.${fileExt}`;

      const bucketName = "assets";
      const folderPath =
        type === "image" ? `covers/${fileName}` : `ebook/${fileName}`;

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(folderPath, file);

      if (error) throw error;

      setEditingProduct((prev) => ({
        ...prev!,
        [type === "image" ? "image_url" : "file_url"]: folderPath,
      }));

      toast.success(
        `${type === "image" ? "Capa" : "PDF"} carregado com sucesso.`,
      );
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    setProductToDelete(product);
    setDeleteConfirmName("");
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    if (deleteConfirmName !== productToDelete.title) {
      toast.error(`Ação cancelada: nome incorreto.`);
      return;
    }
    
    try {
      const res = await fetch(`/api/admin/products/${productToDelete.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast.success("Produto desativado.");
        fetchProducts();
      } else {
        toast.error("Erro ao eliminar o produto.");
      }
    } catch (e) {
      toast.error("Erro ao eliminar.");
    } finally {
      setProductToDelete(null);
      setDeleteConfirmName("");
    }
  };

  // Correct financial calculations
  const successfulOrders = orders.filter((o) => ["paid", "completed", "pago", "delivered"].includes(o.status?.toLowerCase() || ""));
  const refundedOrders = orders.filter((o) => o.status?.toLowerCase() === "refunded");
  const refundedOrdersCount = refundedOrders.length;
  const requestedRefundsCount = orders.filter((o) => ["refund_requested", "refund_pending"].includes(o.status?.toLowerCase() || "")).length;

  const totalSuccessful = successfulOrders.reduce(
    (sum, o) => sum + (parseFloat(o.total_amount?.toString() || '0')),
    0,
  );
  const totalRefunded = refundedOrders.reduce(
    (sum, o) => sum + (parseFloat(o.total_amount?.toString() || '0')),
    0,
  );

  // Gross Revenue = All money that entered (Paid transactions + those pending refund)
  const totalGrossRevenue = totalSuccessful + totalRefunded;
  // Net Profit = Money currently in account
  const netProfit = totalSuccessful;
  const completedSales = successfulOrders.length; 

  // Processing chart data with safety for NaN and invalid dates
  const getChartData = () => {
    try {
      if (timeRange === "weekly") {
        const days = [
          "Segunda",
          "Terça",
          "Quarta",
          "Quinta",
          "Sexta",
          "Sábado",
          "Domingo",
        ];
        const data = days.map((day) => ({ name: day, value: 0, sales: 0 }));

        successfulOrders.forEach((order) => {
          if (!order.created_at) return;
          const date = new Date(order.created_at);
          if (isNaN(date.getTime())) return;
          
          const dayIndex = (date.getDay() + 6) % 7; 
          const amt = typeof order.total_amount === 'string' ? parseFloat(order.total_amount) : Number(order.total_amount);
          data[dayIndex].value += amt || 0;
          data[dayIndex].sales += 1;
        });
        return data;
      }

    if (timeRange === "monthly") {
      const months = [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ];
      const currentYear = new Date().getFullYear();
      const data = months.map((month) => ({ name: month, value: 0, sales: 0 }));

      successfulOrders.forEach((order) => {
        if (!order.created_at) return;
        const date = new Date(order.created_at);
        if (isNaN(date.getTime())) return;

        if (date.getFullYear() === currentYear) {
          const monthIndex = date.getMonth();
          const amt = typeof order.total_amount === 'string' ? parseFloat(order.total_amount) : Number(order.total_amount);
          data[monthIndex].value += amt || 0;
          data[monthIndex].sales += 1;
        }
      });
      return data;
    }

    if (timeRange === "yearly") {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
      const data = years.map((year) => ({
        name: year.toString(),
        value: 0,
        sales: 0,
      }));

      successfulOrders.forEach((order) => {
        if (!order.created_at) return;
        const date = new Date(order.created_at);
        if (isNaN(date.getTime())) return;

        const year = date.getFullYear();
        const yearData = data.find((d) => d.name === year.toString());
        if (yearData) {
          const amt = typeof order.total_amount === 'string' ? parseFloat(order.total_amount) : Number(order.total_amount);
          yearData.value += amt || 0;
          yearData.sales += 1;
        }
      });
      return data;
    }

    return [{ name: "N/A", value: 0, sales: 0 }];
    } catch (e) {
      console.error("Error generating chart data:", e);
      return [{ name: "Erro", value: 0, sales: 0 }];
    }
  };

  const displayData = getChartData();

  const filteredOrders = orders.filter((order) => {
    const searchLower = orderSearch.toLowerCase();
    const formattedOrderId = `SART-${order.id.split("-")[0].toUpperCase()}`;
    const matchSearch =
      order.id.toLowerCase().includes(searchLower) ||
      formattedOrderId.toLowerCase().includes(searchLower) ||
      order.customer_email?.toLowerCase().includes(searchLower) ||
      (order.shipping_details?.fullName &&
        order.shipping_details.fullName.toLowerCase().includes(searchLower));

    if (!matchSearch) return false;

    if (orderDateFilter === "today") {
      return (
        new Date(order.created_at).toDateString() === new Date().toDateString()
      );
    }
    if (orderDateFilter === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(order.created_at) >= weekAgo;
    }
    if (orderDateFilter === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return new Date(order.created_at) >= monthAgo;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-luxury-black text-white">
        <Loader2 className="animate-spin" size={48} strokeWidth={1} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-luxury-gold selection:text-black ${
      theme === "dark" 
        ? "bg-black text-white" 
        : "bg-white text-black"
    }`}>
      {/* Admin Sidebar/Toprail */}
      <div className="border-b border-white/5 bg-luxury-dark/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <button
              onClick={onBack}
              className="text-luxury-gold hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg md:text-xl font-serif tracking-tight">
              S.Art <span className="text-luxury-gold italic">Admin</span>
            </h1>
          </div>

          <div className="hidden sm:flex bg-white/5 rounded-full p-1 border border-white/5">
            {(["overview", "products", "orders", "refunds", "users"] as const).map((t) => (
              <button
                key={t}
                id={t === "users" ? "tab-users" : undefined}
                onClick={() => setTab(t)}
                className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group ${
                  tab === t
                    ? "bg-luxury-gold text-black font-semibold shadow-[0_10px_20px_rgba(212,175,55,0.2)]"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="relative z-10 flex items-center gap-2">
                  <span>
                    {t === "overview"
                      ? "Visão Geral"
                      : t === "products"
                        ? "Produtos"
                        : t === "orders"
                          ? "Ordens"
                          : t === "refunds"
                            ? "Reembolsos"
                            : "Utilizadores"}
                  </span>
                  {t === "refunds" && <Undo2 size={12} className="text-white/20" />}
                  {t === "refunds" && orders.filter(o => o.status === 'refund_requested').length > 0 && (
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
                {tab === t && (
                  <motion.div 
                    layoutId="tab-underline"
                    className="absolute inset-0 bg-luxury-gold z-0"
                    transition={{ type: "linear", duration: 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="sm:hidden flex border-t border-white/5">
          {(["overview", "products", "orders", "refunds", "users"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-[9px] uppercase tracking-widest border-b-2 transition-all ${
                tab === t
                  ? "border-luxury-gold text-luxury-gold bg-luxury-gold/5 font-bold"
                  : "border-transparent text-white/40"
              }`}
            >
              {t === "overview"
                  ? "Geral"
                  : t === "products"
                    ? "Ativos"
                    : t === "orders"
                      ? "Vendas"
                      : t === "refunds"
                        ? "Reembolsos"
                        : "Users"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-12">
        {tab === "overview" && (
          <div className="space-y-12 animate-in fade-in duration-700">
            {/* Stats Grid */}
            <div className="flex justify-end mb-4">
              <Button 
                onClick={fetchDashboardData} 
                variant="outline" 
                size="sm"
                className="bg-white/5 border-white/10 text-white/60 hover:text-luxury-gold hover:bg-white/10 text-[9px] uppercase tracking-widest h-8"
              >
                <RefreshCw size={12} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar Dados
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <Card id="stats-revenue" className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8 hover:border-luxury-gold/30 transition-all duration-500 group">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 group-hover:text-luxury-gold/50 transition-colors">
                    Vendas Brutas
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-luxury-gold drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                    €
                    {totalGrossRevenue.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                  <div className="p-2 md:p-3 bg-luxury-gold/10 text-luxury-gold rounded-full border border-luxury-gold/20">
                    <TrendingUp size={18} />
                  </div>
                </div>
              </Card>

              <Card id="stats-refunds" className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8 hover:border-red-500/30 transition-all duration-500 group">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-red-400 font-bold group-hover:text-red-400 transition-colors">
                    Total Reembolsado
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    €
                    {totalRefunded.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                  <div className="p-2 md:p-3 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
                    <XCircle size={18} />
                  </div>
                </div>
              </Card>

              <Card id="stats-profit" className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8 sm:col-span-1 hover:border-emerald-500/30 transition-all duration-500 group border-l-4 border-l-emerald-500/20">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 group-hover:text-emerald-400/50 transition-colors">
                    Lucro Líquido
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                    €
                    {netProfit.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                  <div className="p-2 md:p-3 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20">
                    <ShieldCheck size={18} />
                  </div>
                </div>
              </Card>

              <Card id="stats-pending-refunds" className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8 sm:col-span-1 hover:border-amber-500/30 transition-all duration-500 group border-l-4 border-l-amber-500/20">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500 group-hover:text-amber-400 transition-colors">
                    Reembolsos Solicitados
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    {requestedRefundsCount}
                  </h3>
                  <div className="p-2 md:p-3 bg-amber-500/10 text-amber-500 rounded-full border border-amber-500/20">
                    <Clock size={18} />
                  </div>
                </div>
                <div className="mt-4 text-[9px] uppercase tracking-widest text-white/20">
                  Aguardando confirmação no separador "Ordens"
                </div>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-widest text-white/50">
                  Fluxo de Desempenho
                </h3>
                <div className="flex bg-white/5 rounded-none p-1 border border-white/5">
                  {(["weekly", "monthly", "yearly"] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-4 py-1.5 text-[8px] uppercase tracking-widest transition-all ${
                        timeRange === range
                          ? "bg-luxury-gold text-black font-bold"
                          : "text-white/40 hover:text-white"
                      }`}
                    >
                      {range === "weekly"
                        ? "Semanal"
                        : range === "monthly"
                          ? "Mensal"
                          : "Anual"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                    Faturamento por Período
                  </div>
                  <div className="h-[350px] w-full bg-luxury-dark/30 border border-white/5 p-8 relative min-h-[350px] group">
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={displayData}>
                        <defs>
                          <linearGradient
                            id="colorVal"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#D4AF37"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor="#D4AF37"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="rgba(255,255,255,0.03)"
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{
                            stroke: "rgba(212,175,55,0.2)",
                            strokeWidth: 1,
                          }}
                          contentStyle={{
                            backgroundColor: "#0A0A0A",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "0px",
                          }}
                          itemStyle={{
                            color: "#D4AF37",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                          }}
                          labelStyle={{
                            color: "#fff",
                            fontSize: "10px",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.2em",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#D4AF37"
                          fillOpacity={1}
                          fill="url(#colorVal)"
                          strokeWidth={2}
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                    Volume de Transações
                  </div>
                  <div className="h-[350px] w-full bg-luxury-dark/30 border border-white/5 p-8 relative min-h-[350px]">
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={displayData}>
                        <defs>
                          <linearGradient
                            id="colorSales"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#FFFFFF"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor="#FFFFFF"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="rgba(255,255,255,0.03)"
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{
                            stroke: "rgba(255,255,255,0.1)",
                            strokeWidth: 1,
                          }}
                          contentStyle={{
                            backgroundColor: "#0A0A0A",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "0px",
                          }}
                          itemStyle={{
                            color: "#fff",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                          }}
                          labelStyle={{
                            color: "#fff",
                            fontSize: "10px",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.2em",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="#FFFFFF"
                          fillOpacity={1}
                          fill="url(#colorSales)"
                          strokeWidth={2}
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Orders Table */}
            <div className="space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-widest text-white/50">
                Últimas Transações
              </h3>
              <div className="overflow-x-auto border border-white/5">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th id="th-orderid" className="px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        ID Ordem
                      </th>
                      <th id="th-product" className="px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        Produto
                      </th>
                      <th id="th-client" className="px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        Cliente
                      </th>
                      <th id="th-details" className="px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        Detalhes
                      </th>
                      <th id="th-date" className="px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        Data
                      </th>
                      <th id="th-value" className="px-8 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        Valor
                      </th>
                      <th id="th-status" className="px-8 py-6 font-normal text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/5 hover:text-luxury-gold transition-colors duration-300">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orders.slice(0, 5).map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-6 py-4 font-mono text-[10px] text-white/50">
                          SART-{order.id.split('-')[0].toUpperCase()}
                        </td>
                        <td className="px-6 py-4 font-serif">
                          {order.product?.title || "Produto Removido"}
                        </td>
                        <td className="px-6 py-4 text-white/60">
                          {order.customer_email}
                        </td>
                        <td className="px-6 py-4 text-white/40">
                          <Button 
                            variant="ghost" 
                            onClick={() => setViewingOrder(order)}
                            className="h-6 px-3 text-[8px] uppercase tracking-widest text-luxury-gold hover:bg-luxury-gold/10 hover:text-white border border-luxury-gold/20"
                          >
                            Ver Detalhes
                          </Button>
                        </td>
                        <td className="px-6 py-4 text-white/40">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          €{order.total_amount}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-widest font-bold ${
                              order.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : order.status === "refunded"
                                  ? "bg-red-500/10 text-red-500"
                                  : order.status === "refund_pending"
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-amber-500/10 text-amber-500"
                            }`}
                          >
                            {order.status === "completed" ? (
                              <>
                                <CheckCircle size={8} className="mr-1" />{" "}
                                Liquidado
                              </>
                            ) : order.status === "refunded" ? (
                              <>
                                <XCircle size={8} className="mr-1" />{" "}
                                Reembolsado
                              </>
                            ) : order.status === "refund_pending" ? (
                              <>
                                <Clock size={8} className="mr-1" /> Reembolso
                                Solicitado
                              </>
                            ) : (
                              <>
                                <Clock size={8} className="mr-1" /> Aguardando
                              </>
                            )}
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

        {tab === "products" && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-serif">
                  Gestão de Portfólio Digital
                </h2>
                <div className="text-[10px] uppercase tracking-widest text-white/30 mt-2">
                  Adicione ou edite e-books exclusivos
                </div>
              </div>
              <Button
                onClick={() =>
                  setEditingProduct({
                    title: "",
                    price: 0,
                    description: "",
                    category: "Geral",
                    image_url: "",
                    file_url: "",
                    product_type: "digital",
                    sizes_enabled: false,
                    colors_enabled: false,
                    sizes: "",
                    colors: "",
                    admin_link: "",
                    extra_images: "",
                    is_active: true,
                  })
                }
                className="w-full sm:w-auto bg-luxury-gold text-black hover:bg-white rounded-none h-12 px-8 uppercase tracking-widest text-[10px] font-bold"
              >
                <Plus size={16} className="mr-2" /> Criar Produto
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {products.map((p) => (
                <Card
                  key={p.id}
                  className="bg-luxury-dark border-white/5 rounded-none group overflow-hidden"
                >
                  <div className="aspect-[3/4] relative overflow-hidden">
                    <img
                      src={getImageUrl(p.image_url)}
                      alt={p.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        className="border-white/20 rounded-none h-8 w-8 p-0 text-[10px] uppercase tracking-widest hover:bg-white hover:text-black"
                        onClick={() => setEditingProduct(p)}
                      >
                        <Edit size={12} />
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/20 rounded-none h-8 w-8 p-0 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white"
                        onClick={() => handleDeleteProduct(p)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-serif text-sm truncate flex-1">
                        {p.title}
                      </h3>
                      {p.product_type === "physical" && (
                        <span className="bg-luxury-gold text-black text-[7px] uppercase font-bold px-1 py-0.5 rounded-sm">
                          Físico
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-luxury-gold text-xs">€{p.price}</div>
                      {p.admin_link && (
                        <a
                          href={p.admin_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[8px] text-white/30 hover:text-luxury-gold uppercase tracking-widest flex items-center gap-1"
                        >
                          <ExternalLink size={8} /> Gestão
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Product Editor Inline (Full Screen/Wide Overlap) */}

            {editingProduct && (
              <div className="fixed inset-0 z-[60] bg-luxury-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                <Card className="max-w-4xl w-full bg-luxury-dark border-white/10 rounded-none p-6 md:p-12 space-y-6 md:space-y-8 animate-in zoom-in-95 duration-500 my-auto">
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl md:text-3xl font-serif">
                      {editingProduct.id ? "Editar Produto" : "Novo Produto"}
                    </h3>
                    <button
                      onClick={() => setEditingProduct(null)}
                      className="text-white/30 hover:text-white p-2"
                    >
                      <XCircle size={24} />
                    </button>
                  </div>

                  <div className="flex bg-white/5 p-1 border border-white/10 self-start">
                    {(["digital", "physical"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          setEditingProduct({
                            ...editingProduct,
                            product_type: type as any,
                          })
                        }
                        className={`px-6 py-2 text-[9px] uppercase tracking-widest transition-all ${
                          (editingProduct.product_type || "digital") === type
                            ? "bg-luxury-gold text-black font-bold"
                            : "text-white/40 hover:text-white"
                        }`}
                      >
                        {type === "digital"
                          ? "Produto Digital (E-Book)"
                          : "Produto Físico"}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                    <div className="space-y-4 md:space-y-6">
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/40">
                          Nome do Produto
                        </label>
                        <input
                          value={editingProduct.title}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              title: e.target.value,
                            })
                          }
                          className="w-full bg-transparent border-b border-white/10 py-2 md:py-4 text-lg md:text-xl outline-none focus:border-luxury-gold transition-colors"
                          placeholder="Ex: O Código da Elegância"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/40">
                          Preço (€)
                        </label>
                        <input
                          type="number"
                          value={
                            isNaN(editingProduct.price) ||
                            editingProduct.price === undefined
                              ? ""
                              : editingProduct.price
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingProduct({
                              ...editingProduct,
                              price: val === "" ? 0 : parseFloat(val),
                            });
                          }}
                          className="w-full bg-transparent border-b border-white/10 py-2 md:py-4 text-lg md:text-xl outline-none focus:border-luxury-gold transition-colors font-mono"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/40">
                          Categoria
                        </label>
                        <select
                          value={editingProduct.category || "Geral"}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              category: e.target.value,
                            })
                          }
                          className="w-full bg-luxury-dark border border-white/10 p-3 md:p-4 text-sm outline-none focus:border-luxury-gold transition-colors text-white"
                        >
                          <option value="Moda">Moda</option>
                          <option value="Saúde">Saúde</option>
                          <option value="Tecnologia">Tecnologia</option>
                          <option value="Geral">Geral</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/40">
                          Manifesto / Descrição
                        </label>
                        <textarea
                          value={editingProduct.description}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              description: e.target.value,
                            })
                          }
                          className="w-full bg-transparent border border-white/10 p-4 text-sm min-h-[120px] md:min-h-[150px] outline-none focus:border-luxury-gold transition-colors"
                          placeholder="Descreva a exclusividade deste conteúdo..."
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-sm">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-white block mb-1">
                            Disponível para Compra?
                          </label>
                          <p className="text-[8px] text-white/40 uppercase tracking-widest">
                            Se inativo, será exibido como Esgotado ou oculto.
                          </p>
                        </div>
                        <button
                          onClick={() => setEditingProduct({ ...editingProduct, is_active: !editingProduct.is_active })}
                          className={`w-10 h-5 relative rounded-full transition-colors ${editingProduct.is_active ? "bg-emerald-500" : "bg-white/10"}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.is_active ? "left-6" : "left-1"}`} />
                        </button>
                      </div>

                      {editingProduct.product_type === "physical" && (
                        <div className="space-y-6 p-6 bg-white/5 border border-white/10 rounded-sm">
                          <div className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-bold flex items-center gap-2">
                            <div className="w-1 h-1 bg-luxury-gold rounded-full" />
                            Configuração de Venda Física
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-3 bg-white/5 rounded-sm">
                                <label className="text-[9px] uppercase tracking-widest text-white/60">
                                  Habilitar Tamanhos
                                </label>
                                <button
                                  onClick={() =>
                                    setEditingProduct({
                                      ...editingProduct,
                                      sizes_enabled:
                                        !editingProduct.sizes_enabled,
                                    })
                                  }
                                  className={`w-10 h-5 relative rounded-full transition-colors ${editingProduct.sizes_enabled ? "bg-luxury-gold" : "bg-white/10"}`}
                                >
                                  <div
                                    className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.sizes_enabled ? "left-6" : "left-1"}`}
                                  />
                                </button>
                              </div>
                              {editingProduct.sizes_enabled && (
                                <div className="space-y-1 ml-2">
                                  <label className="text-[8px] uppercase text-white/30 tracking-widest pl-1">
                                    Lista de Tamanhos
                                  </label>
                                  <input
                                    value={editingProduct.sizes || ""}
                                    onChange={(e) =>
                                      setEditingProduct({
                                        ...editingProduct,
                                        sizes: e.target.value,
                                      })
                                    }
                                    className="w-full bg-transparent border-b border-white/10 py-2 text-xs outline-none focus:border-luxury-gold"
                                    placeholder="S, M, L, XL (Vírgula para separar)"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-3 bg-white/5 rounded-sm">
                                <label className="text-[9px] uppercase tracking-widest text-white/60">
                                  Habilitar Cores
                                </label>
                                <button
                                  onClick={() =>
                                    setEditingProduct({
                                      ...editingProduct,
                                      colors_enabled:
                                        !editingProduct.colors_enabled,
                                    })
                                  }
                                  className={`w-10 h-5 relative rounded-full transition-colors ${editingProduct.colors_enabled ? "bg-luxury-gold" : "bg-white/10"}`}
                                >
                                  <div
                                    className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.colors_enabled ? "left-6" : "left-1"}`}
                                  />
                                </button>
                              </div>
                              {editingProduct.colors_enabled && (
                                <div className="space-y-1 ml-2">
                                  <label className="text-[8px] uppercase text-white/30 tracking-widest pl-1">
                                    Opções de Cores
                                  </label>
                                  <input
                                    value={editingProduct.colors || ""}
                                    onChange={(e) =>
                                      setEditingProduct({
                                        ...editingProduct,
                                        colors: e.target.value,
                                      })
                                    }
                                    className="w-full bg-transparent border-b border-white/10 py-2 text-xs outline-none focus:border-luxury-gold"
                                    placeholder="White / Black / Gold (Use '/' ou ',')"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                            <label className="text-[9px] uppercase tracking-widest text-white/40 block">
                              Link de Gestão Externa (Shopify/Printful/etc)
                            </label>
                            <div className="relative group">
                              <input
                                value={editingProduct.admin_link || ""}
                                onChange={(e) =>
                                  setEditingProduct({
                                    ...editingProduct,
                                    admin_link: e.target.value,
                                  })
                                }
                                className="w-full bg-transparent border-b border-white/10 py-3 text-xs outline-none focus:border-luxury-gold transition-colors font-mono"
                                placeholder="https://admin.shopify.com/store/sart/products/..."
                              />
                              <ExternalLink
                                size={12}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-luxury-gold"
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <label className="text-[9px] uppercase tracking-widest text-white/40 block">
                              Imagens Adicionais (Galeria)
                            </label>
                            <textarea
                              value={editingProduct.extra_images || ""}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  extra_images: e.target.value,
                                })
                              }
                              className="w-full bg-transparent border border-white/10 p-3 text-[10px] min-h-[80px] outline-none focus:border-luxury-gold font-mono"
                              placeholder="URL 1, URL 2, URL 3 (Separados por vírgula)"
                            />
                            <div className="text-[8px] text-white/20 uppercase tracking-[0.2em] italic">
                              * Estas imagens aparecerão no carrossel de
                              detalhes do produto.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6 md:space-y-8">
                      <div className="grid grid-cols-2 gap-4 md:gap-6">
                        <div className="space-y-3">
                          <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/40 block">
                            Foto Principal (Capa)
                          </label>
                          <label
                            htmlFor="image-upload"
                            className="relative block aspect-[3/4] border-2 border-dashed border-white/10 hover:border-luxury-gold cursor-pointer transition-all overflow-hidden bg-white/5"
                          >
                            {editingProduct.image_url ? (
                              <img
                                src={getImageUrl(editingProduct.image_url)}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                                <Upload size={24} strokeWidth={1} />
                                <span className="text-[7px] md:text-[8px] uppercase mt-2">
                                  Upload Capa
                                </span>
                              </div>
                            )}
                            <input
                              id="image-upload"
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileUpload(e, "image")}
                              className="hidden"
                            />
                            {uploading && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="animate-spin text-luxury-gold" />
                              </div>
                            )}
                          </label>
                          <input
                            value={editingProduct.image_url || ""}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                image_url: e.target.value,
                              })
                            }
                            className="w-full bg-transparent border-b border-white/10 py-2 text-[10px] outline-none focus:border-luxury-gold transition-colors"
                            placeholder="Link da imagem principal..."
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/40 block">
                            {editingProduct.product_type === "digital"
                              ? "Ficheiro (PDF)"
                              : "Galeria de Fotos"}
                          </label>
                          {editingProduct.product_type === "digital" ? (
                            <>
                              <div className="relative aspect-[3/4] border-2 border-dashed border-white/10 hover:border-blue-500 cursor-pointer group transition-all bg-white/5">
                                {editingProduct.file_url ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-blue-400 bg-blue-500/5">
                                    <FileText size={48} strokeWidth={1} />
                                    <span className="text-[7px] md:text-[8px] uppercase mt-2">
                                      PDF Pronto
                                    </span>
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                                    <Download size={24} strokeWidth={1} />
                                    <span className="text-[7px] md:text-[8px] uppercase mt-2">
                                      Upload PDF
                                    </span>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept=".pdf"
                                  onChange={(e) => handleFileUpload(e, "pdf")}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                {uploading && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="animate-spin text-luxury-gold" />
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="space-y-4">
                              <div className="aspect-[3/4] border border-white/10 bg-white/5 p-4 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                                <p className="text-[8px] text-white/40 uppercase tracking-widest mb-2">
                                  Fotos Adicionais
                                </p>
                                <textarea
                                  value={editingProduct.extra_images || ""}
                                  onChange={(e) =>
                                    setEditingProduct({
                                      ...editingProduct,
                                      extra_images: e.target.value,
                                    })
                                  }
                                  placeholder="Cole aqui links das fotos, separados por vírgula..."
                                  className="flex-1 bg-transparent border-none text-[9px] outline-none resize-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] uppercase tracking-widest text-white/40">
                            Link Privado de Gestão (Apenas Admin)
                          </label>
                          <input
                            value={editingProduct.admin_link || ""}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                admin_link: e.target.value,
                              })
                            }
                            className="w-full bg-transparent border-b border-white/10 py-3 text-xs outline-none focus:border-luxury-gold transition-colors"
                            placeholder="Site do fornecedor / Link de gestão..."
                          />
                        </div>
                      </div>

                      <div className="pt-4 md:pt-8 flex flex-col sm:flex-row gap-4">
                        <Button
                          onClick={handleSaveProduct}
                          className="flex-1 bg-luxury-gold text-black hover:bg-white rounded-none h-14 md:h-16 uppercase tracking-widest font-bold"
                        >
                          Guardar Produto
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingProduct(null)}
                          className="flex-1 border-white/10 rounded-none h-14 md:h-16 uppercase tracking-widest text-[9px]"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div>
              <h2 className="text-3xl font-serif">
                Gestão de Pedidos e Solicitações
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mt-2">
                Relatório completo de aquisições digitais e envios físicos
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input
                type="text"
                placeholder="Pesquisar por ID da Ordem, Email ou Nome..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="bg-luxury-dark border border-white/5 py-4 px-6 text-[10px] uppercase tracking-widest text-white outline-none focus:border-luxury-gold flex-1 transition-colors"
              />
              <select
                value={orderDateFilter}
                onChange={(e) => setOrderDateFilter(e.target.value as any)}
                className="bg-luxury-dark border border-white/5 py-4 px-6 text-[10px] uppercase tracking-widest text-white outline-none focus:border-luxury-gold min-w-[200px] transition-colors cursor-pointer appearance-none selection:bg-luxury-black"
                style={{ WebkitAppearance: "none" }}
              >
                <option value="all" className="bg-luxury-black">
                  Todas as Datas
                </option>
                <option value="today" className="bg-luxury-black">
                  Hoje
                </option>
                <option value="week" className="bg-luxury-black">
                  Últimos 7 dias
                </option>
                <option value="month" className="bg-luxury-black">
                  Últimos 30 dias
                </option>
              </select>
            </div>

            <div className="overflow-x-auto border border-white/5 bg-luxury-dark/30">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      ID da Ordem
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Produto Adquirido
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Email do Cliente
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Detalhes
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Data de Venda
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Total
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Progresso Logístico
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/30">
                      Pagamento
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="px-8 py-6 font-mono text-[10px] text-white/40">
                        SART-{order.id.split('-')[0].toUpperCase()}
                      </td>
                      <td className="px-8 py-6">
                        <div className="font-serif text-base flex items-center gap-2 truncate max-w-[150px] md:max-w-[250px]" title={order.product?.title}>
                          {order.product?.title || "Expurgado"}
                          {order.product?.admin_link && (
                            <a href={order.product.admin_link} target="_blank" rel="noopener noreferrer" className="text-luxury-gold hover:text-white transition-colors" title="Acessar link do produto (Fornecedor)">
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                        {order.selected_options &&
                          (order.selected_options.size ||
                            order.selected_options.color) && (
                            <div className="text-[9px] text-luxury-gold uppercase tracking-tighter mt-1 font-bold">
                              {order.selected_options.size &&
                                `Tam: ${order.selected_options.size}`}
                              {order.selected_options.size &&
                                order.selected_options.color &&
                                " | "}
                              {order.selected_options.color &&
                                `Cor: ${order.selected_options.color}`}
                            </div>
                          )}
                        <div className="text-[9px] uppercase tracking-widest text-white/20 mt-1">
                          Ref: {order.product_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-luxury-gold/80">
                        {order.customer_email}
                      </td>
                      <td className="px-8 py-6">
                        <Button 
                          variant="ghost" 
                          onClick={() => setViewingOrder(order)}
                          className="h-8 px-4 text-[9px] uppercase tracking-widest text-luxury-gold hover:bg-luxury-gold/10 hover:text-white border border-luxury-gold/20"
                        >
                          Ver Detalhes
                        </Button>
                      </td>
                      <td className="px-8 py-6 text-white/40">
                        {order.created_at ? format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}
                      </td>
                      <td className="px-8 py-6 font-medium text-lg">
                        €{order.total_amount}
                      </td>
                      <td className="px-8 py-6">
                        {order.product?.product_type === "digital" ? (
                          <span className="text-emerald-500 font-bold text-[9px] uppercase tracking-widest inline-block py-1">
                            Sem Logística (Digital)
                          </span>
                        ) : (
                          <select
                            value={order.shipping_status || "pending"}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              try {
                                const response = await fetch(
                                  `/api/admin/orders/${order.id}/shipping`,
                                  {
                                    method: "PUT",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-user-id": user.id,
                                    },
                                    body: JSON.stringify({
                                      shipping_status: newStatus,
                                    }),
                                  },
                                );

                                if (!response.ok) {
                                  const errInfo = await response.json();
                                  throw new Error(
                                    errInfo.error ||
                                      "Erro ao atualizar a ordem.",
                                  );
                                }

                                const data = await response.json();
                                if (
                                  order.status === "pending" &&
                                  (data.status === "paid" || data.status === "completed")
                                ) {
                                  toast.success(
                                    "Status logístico atualizado (e pagamento sincronizado auto).",
                                  );
                                } else {
                                  toast.success("Status logístico atualizado.");
                                }
                                fetchDashboardData();
                              } catch (err: any) {
                                toast.error(err.message);
                              }
                            }}
                            className={`bg-luxury-dark border border-white/5 py-1 px-2 text-[9px] uppercase tracking-widest font-bold outline-none cursor-pointer hover:border-luxury-gold transition-colors selection:bg-luxury-black ${
                              order.shipping_status === "delivered"
                                ? "text-emerald-500"
                                : order.shipping_status === "sent"
                                  ? "text-blue-500"
                                  : order.shipping_status === "processing"
                                    ? "text-amber-500"
                                    : "text-white/50"
                            }`}
                            style={{ WebkitAppearance: "none" }}
                          >
                            <option value="pending" className="bg-luxury-black">
                              Pendente
                            </option>
                            <option value="processing" className="bg-luxury-black">
                              Armazém / Processamento
                            </option>
                            <option value="sent" className="bg-luxury-black">
                              Em Trânsito
                            </option>
                            <option
                              value="delivered"
                              className="bg-luxury-black"
                            >
                              Entregue
                            </option>
                          </select>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className={`px-3 py-1.5 rounded-full text-[9px] uppercase tracking-widest font-black border ${
                            (order.status === "paid" || order.status === "completed")
                              ? "text-emerald-500 border-emerald-500/20"
                              : order.status === "refunded"
                                ? "text-red-500 border-red-500/20"
                                : "text-amber-500 border-amber-500/20"
                          }`}>
                            {order.status === "pending" ? "Pendente" :
                             (order.status === "paid" || order.status === "completed") ? "Pago" :
                             order.status === "refund_requested" ? "Em Análise" :
                             order.status === "refund_pending" ? "Estornando (Stripe)" :
                             order.status === "refunded" ? "Reembolsado" :
                             "Cancelado"}
                          </div>

                          {order.status === 'pending' && (
                            <button
                               onClick={async () => {
                                 try {
                                   const response = await fetch(`/api/admin/orders/${order.id}/sync_payment`, {
                                     method: 'POST',
                                     headers: {
                                       'Content-Type': 'application/json',
                                       'x-user-id': user.id
                                     }
                                   });
                                   const data = await response.json();
                                   if (data.status === 'paid' || data.status === 'completed') {
                                     toast.success('Pagamento confirmado no Stripe!');
                                     fetchDashboardData();
                                   } else {
                                     toast.info(data.message || 'Ainda não pago no Stripe.');
                                   }
                                 } catch(e) {
                                   toast.error('Erro de sincronização.');
                                 }
                               }}
                               title="Forçar verificação de pagamento no Stripe"
                               className="text-white/40 hover:text-luxury-gold p-1.5 rounded-full transition-colors flex bg-white/5 hover:bg-white/10"
                             >
                               <RefreshCw size={12} />
                             </button>
                          )}

                          {(order.status === 'refund_pending' || order.status === 'paid' || order.status === 'completed') && (
                            <button
                               onClick={async () => {
                                 if (!confirm("Deseja realmente processar o reembolso total desta ordem via Stripe?")) return;
                                 try {
                                   const response = await fetch(`/api/admin/orders/${order.id}/refund`, {
                                     method: 'POST',
                                     headers: {
                                       'Content-Type': 'application/json',
                                       'x-user-id': user.id
                                     }
                                   });
                                   const data = await response.json();
                                   if (data.success) {
                                     toast.success(`Reembolso Stripe processado: ${data.stripe_status}`);
                                     fetchDashboardData();
                                   } else {
                                     toast.error(data.error || 'Erro ao processar reembolso.');
                                   }
                                 } catch(e) {
                                   toast.error('Erro de rede ao processar reembolso.');
                                 }
                               }}
                               title="Processar Reembolso no Stripe"
                               className="text-red-500 hover:text-red-400 p-1.5 rounded-full transition-colors flex bg-red-500/10 hover:bg-red-500/20"
                             >
                               <Undo2 size={12} />
                             </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-8 py-12 text-center text-white/40 text-xs uppercase tracking-widest"
                      >
                        Nenhuma ordem encontrada para a pesquisa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "refunds" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div>
                <h2 className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-none">
                  Gestão de <span className="text-red-500 italic">Reembolsos</span>
                </h2>
                <p className="text-[10px] md:text-[11px] uppercase tracking-[0.3em] text-white/30 mt-4 font-light max-w-xl leading-relaxed">
                  Controle as solicitações de devolução de membros. A aprovação administrativa inicia o processo de estorno seguro via Stripe.
                </p>
              </div>

              <div className="bg-luxury-dark border border-white/5 rounded-none overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.3em] text-white/30 bg-white/[0.02]">
                        <th className="px-8 py-8 font-normal">Ordem / Produto</th>
                        <th className="px-8 py-8 font-normal">Cliente</th>
                        <th className="px-8 py-8 font-normal">Data Solicitação</th>
                        <th className="px-8 py-8 font-normal">Motivo</th>
                        <th className="px-8 py-8 font-normal">Estatuto</th>
                        <th className="px-8 py-8 font-normal text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {orders.filter(o => ['refund_requested', 'refund_pending', 'refunded'].includes(o.status)).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-8 py-20 text-center text-white/20 text-xs uppercase tracking-[0.2em]">
                            Nenhuma solicitação de reembolso encontrada.
                          </td>
                        </tr>
                      ) : (
                        orders
                          .filter(o => ['refund_requested', 'refund_pending', 'refunded'].includes(o.status))
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((order) => (
                            <tr key={order.id} className="group hover:bg-white/[0.02] transition-colors">
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-14 bg-white/5 flex-shrink-0">
                                    <img 
                                      src={getImageUrl(order.product?.image_url || '')} 
                                      className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all" 
                                    />
                                  </div>
                                  <div>
                                    <div className="text-[11px] text-white/90 font-medium tracking-wide">
                                      {order.product?.title || 'Produto Indisponível'}
                                    </div>
                                    <div className="text-[9px] text-white/30 mt-1 uppercase tracking-widest font-mono">
                                      SART-{order.id.split('-')[0].toUpperCase()}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="text-[11px] text-white/70">{order.customer_email || 'Anonimizado'}</div>
                                <div className="text-[9px] text-white/30 uppercase tracking-widest mt-1">Ref: {order.shipping_details?.fullName || 'N/A'}</div>
                              </td>
                              <td className="px-8 py-6 text-[10px] text-white/40 uppercase tracking-widest">
                                {order.selected_options?.refund_requested_at ? format(new Date(order.selected_options.refund_requested_at), "dd MMM yyyy", { locale: ptBR }) : 'N/A'}
                              </td>
                              <td className="px-8 py-6">
                                <div className="text-[10px] text-white/60 max-w-[200px] truncate" title={order.selected_options?.refund_reason}>
                                  {order.selected_options?.refund_reason || 'Não especificado'}
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className={`inline-flex px-3 py-1 rounded-full text-[8px] uppercase tracking-widest font-black ${
                                  order.status === 'refund_requested' 
                                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                                    : order.status === 'refund_pending'
                                      ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse'
                                      : order.status === 'refund_rejected'
                                        ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                        : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                }`}>
                                  {order.status === 'refund_requested' ? 'Em Análise' : order.status === 'refund_pending' ? 'Processando Estorno' : order.status === 'refund_rejected' ? 'Solicitação Rejeitada' : 'Reembolso Concluído'}
                                </div>
                              </td>
                              <td className="px-8 py-6 text-right">
                                    <div className="flex gap-2 justify-end">
                                      {order.status === 'refund_requested' && (
                                        <>
                                          <Button
                                            onClick={async () => {
                                              if (!confirm("Deseja realmente aprovar e processar o reembolso via Stripe?")) return;
                                              try {
                                                const response = await fetch(`/api/admin/orders/${order.id}/refund`, {
                                                  method: 'POST',
                                                  headers: {
                                                    'Content-Type': 'application/json',
                                                    'x-user-id': user.id
                                                  }
                                                });
                                                const data = await response.json();
                                                if (data.success) {
                                                  toast.success(data.message);
                                                  fetchDashboardData();
                                                } else {
                                                  toast.error(data.error || "Erro ao processar");
                                                }
                                              } catch(e) {
                                                toast.error("Erro de rede");
                                              }
                                            }}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] uppercase tracking-widest h-8 px-4 rounded-none"
                                          >
                                            Confirmar
                                          </Button>
                                          <Button
                                            onClick={async () => {
                                              if (!confirm("Deseja realmente recusar esta solicitação de reembolso?")) return;
                                              try {
                                                const response = await fetch(`/api/admin/orders/${order.id}/cancel-refund`, {
                                                  method: 'POST',
                                                  headers: {
                                                    'Content-Type': 'application/json',
                                                    'x-user-id': user.id
                                                  }
                                                });
                                                const data = await response.json();
                                                if (data.success) {
                                                  toast.success("Solicitação recusada com sucesso.");
                                                  fetchDashboardData();
                                                } else {
                                                  toast.error(data.error || "Erro ao recusar");
                                                }
                                              } catch(e) {
                                                toast.error("Erro de rede");
                                              }
                                            }}
                                            variant="outline"
                                            className="border-white/20 text-white/60 hover:bg-white/10 text-[9px] uppercase tracking-widest h-8 px-4 rounded-none"
                                          >
                                            Recusar
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                {order.status === 'refund_pending' && (
                                  <div className="text-[9px] text-white/30 uppercase tracking-widest flex items-center justify-end gap-2">
                                    <Loader2 size={12} className="animate-spin text-blue-500" />
                                    Aguardando Stripe...
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        )}

        {tab === "users" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h2 id="title-management" className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-none">
                  Gestão de <span className="text-luxury-gold italic">Utilizadores</span>
                </h2>
                <p id="desc-management" className="text-[10px] md:text-[11px] uppercase tracking-[0.3em] text-white/30 mt-4 font-light max-w-xl leading-relaxed">
                  Controle absoluto sobre os membros da boutique. Gestão de acessos, privilégios e histórico de compromisso com a excelência.
                </p>
              </div>
              <div className="w-full md:max-w-xs relative group">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-luxury-gold transition-colors" />
                <input
                  type="text"
                  placeholder="Pesquisar utilizador..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 py-3 pl-12 pr-4 text-[10px] uppercase tracking-widest text-white outline-none focus:border-luxury-gold transition-all"
                />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/30 bg-white/[0.02]">
                    <th className="px-8 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Utilizador</th>
                    <th className="px-8 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">E-mail Corporativo</th>
                    <th className="px-8 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Membro Desde</th>
                    <th className="px-8 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Estatuto</th>
                    <th className="px-8 py-8 font-normal text-right">Ações de Controlo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users
                    .filter(u => {
                      const s = userSearch.toLowerCase();
                      return (
                        u.full_name?.toLowerCase().includes(s) ||
                        u.email?.toLowerCase().includes(s) ||
                        u.id.toLowerCase().includes(s) ||
                        u.custom_id?.toLowerCase().includes(s)
                      );
                    })
                    .map((profile) => (
                    <tr key={profile.id} className="group hover:bg-white/5 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
                            {profile.avatar_url ? (
                              <img 
                                src={getImageUrl(profile.avatar_url || profile.email)} 
                                referrerPolicy="no-referrer"
                                alt="" 
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-luxury-gold text-xs font-bold uppercase">
                                {profile.full_name?.substring(0, 2) || "U"}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">{profile.full_name || "Sem Nome"}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] text-luxury-gold font-mono font-bold tracking-widest uppercase">{profile.custom_id || `SART-${profile.id.substring(0, 4).toUpperCase()}`}</p>
                              <span className="text-white/10">|</span>
                              <p className="text-[8px] text-white/20 font-mono tracking-tighter truncate max-w-[100px]">{profile.id}</p>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-sm text-white/60">{profile.email || "N/D"}</td>
                      <td className="px-8 py-5 text-sm text-white/60">
                        {profile.created_at ? format(new Date(profile.created_at), "dd/MM/yyyy") : "-"}
                      </td>
                      <td className="px-8 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[8px] uppercase tracking-widest font-bold ${
                          profile.is_admin 
                            ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30" 
                            : "bg-white/5 text-white/40 border border-white/10"
                        }`}>
                          {profile.is_admin ? <ShieldCheck size={10} /> : <Users size={10} />}
                          {profile.is_admin ? "Administrador" : "Cliente"}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {profile.id !== user.id && (
                          <Button 
                            onClick={() => toggleAdminRole(profile)}
                            variant="outline" 
                            size="sm"
                            className={`rounded-none text-[8px] uppercase tracking-widest h-8 border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-all ${
                              profile.is_admin ? "hover:border-red-500 hover:text-red-500" : ""
                            }`}
                          >
                            {profile.is_admin ? (
                              <><ShieldAlert size={10} className="mr-2" /> Revogar Admin</>
                            ) : (
                              <><ShieldCheck size={10} className="mr-2" /> Tornar Admin</>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {viewingOrder && (() => {
        const shippingData = viewingOrder.shipping_details || viewingOrder.selected_options?.shipping_details;
        return (
        <div className="fixed inset-0 z-[60] bg-luxury-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full bg-luxury-dark border-white/10 rounded-sm p-8 space-y-6 animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <h3 className="text-xl font-serif text-luxury-gold">Detalhes do Pedido</h3>
              <Button variant="ghost" onClick={() => setViewingOrder(null)} className="text-white/40 hover:text-white">
                <X size={20} />
              </Button>
            </div>
            
            <div className="space-y-6">
              <div className="flex gap-4 items-start pb-4 border-b border-white/10">
                {viewingOrder.product?.image_url && (
                  <div className="w-20 h-24 bg-white/5 border border-white/10 flex-shrink-0">
                    <img 
                      src={getImageUrl(viewingOrder.product.image_url)} 
                      referrerPolicy="no-referrer"
                      alt="Produto" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Produto Adquirido</p>
                  <h4 className="font-serif text-lg text-white">{viewingOrder.product?.title || "Produto Removido"}</h4>
                  {viewingOrder.selected_options && (
                    <p className="text-white/60 mt-1 uppercase text-[10px] tracking-widest">
                      {viewingOrder.selected_options.size && `Tamanho: ${viewingOrder.selected_options.size} `}
                      {viewingOrder.selected_options.color && `| Cor: ${viewingOrder.selected_options.color}`}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Cliente</p>
                <div className="text-base text-white">{viewingOrder.customer_email}</div>
                {shippingData && (
                  <div className="text-sm text-white/80 mt-1">{shippingData.fullName}</div>
                )}
              </div>

              {shippingData ? (
                <div className="p-4 border border-white/10 bg-white/5 space-y-3">
                  <div className="text-[10px] uppercase tracking-widest text-luxury-gold flex items-center gap-2">
                    <Truck size={14} /> Morada de Envio Completa
                  </div>
                  <div className="text-sm space-y-1 text-white/80">
                    <p><span className="text-white/40">Morada:</span> {shippingData.address}</p>
                    <p><span className="text-white/40">Código Postal:</span> {shippingData.postalCode}</p>
                    <p><span className="text-white/40">Localidade:</span> {shippingData.city}</p>
                    <p><span className="text-white/40">País:</span> {shippingData.country}</p>
                    <p><span className="text-white/40">Telemóvel:</span> {shippingData.phone}</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-white/10 bg-white/5 space-y-3">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                    <FileText size={14} /> Produto Digital
                  </div>
                  <div className="text-sm text-white/60">
                    Nenhuma morada associada a este pedido.
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Identificadores do Sistema</p>
                <div className="p-4 border border-white/10 bg-black/20 text-xs font-mono space-y-2">
                  <div className="select-all block"><span className="text-white/40 select-none">Ordem ID:</span> SART-{viewingOrder.id.split('-')[0].toUpperCase()} ({viewingOrder.id})</div>
                  <div className="select-all block"><span className="text-white/40 select-none">Produto ID:</span> {viewingOrder.product_id}</div>
                  <div className="select-all block"><span className="text-white/40 select-none">Stripe Session:</span> {viewingOrder.stripe_session_id || "N/A"}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        );
      })()}

      {productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setProductToDelete(null)} />
          <div className="bg-[#1A1A1A] border border-white/10 w-full max-w-md p-6 relative z-10 space-y-6 shadow-2xl">
            <div className="space-y-2 text-center">
              <h3 className="text-xl font-serif text-red-500">Excluir Produto</h3>
              <p className="text-xs text-white/60">
                Esta ação irá desativar e excluir permanentemente este ativo.
                Para prosseguir, digite exatamente o nome abaixo.
              </p>
            </div>
            
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-center font-serif text-sm">
              {productToDelete.title}
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                autoFocus
                placeholder="Insira o nome exacto"
                className="w-full bg-black/50 border border-white/20 p-3 text-sm focus:border-red-500 focus:outline-none transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (deleteConfirmName === productToDelete.title) {
                      confirmDeleteProduct();
                    }
                  }
                }}
              />

              <div className="flex gap-3 pt-2">
                <Button 
                  onClick={() => setProductToDelete(null)}
                  variant="outline"
                  className="flex-1 border-white/20 hover:border-white/40 rounded-none h-12 uppercase tracking-widest text-[10px]"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmDeleteProduct}
                  className="flex-1 bg-red-500 text-white hover:bg-red-600 rounded-none h-12 uppercase tracking-widest text-[10px] font-bold"
                  disabled={deleteConfirmName !== productToDelete.title}
                >
                  Excluir Ativo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

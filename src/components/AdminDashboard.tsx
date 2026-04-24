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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";

const ADMIN_IDS = [
  "3d596215-583e-498f-9fd5-36b83d8bccf5",
  "00d44feb-0b51-405e-86f7-31b67edfb7b6",
];

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

export default function AdminDashboard({
  user,
  onBack,
}: {
  user: SupabaseUser;
  onBack: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(
    null,
  );
  const [tab, setTab] = useState<"overview" | "products" | "orders">(
    "overview",
  );
  const [timeRange, setTimeRange] = useState<"weekly" | "monthly" | "yearly">(
    "weekly",
  );
  const [uploading, setUploading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState<
    "all" | "today" | "week" | "month"
  >("all");

  useEffect(() => {
    if (!ADMIN_IDS.includes(user.id)) {
      onBack();
      return;
    }

    fetchData();

    // Real-time subscription for orders - unique name per admin to avoid "steal" conflict
    const channelName = `admin-updates-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", table: "orders" }, () => {
        fetchDashboardData();
        toast.info("Novas atividades de vendas detectadas!");
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
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setProducts(data);
  };

  const fetchDashboardData = async () => {
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (ordersData) {
      if (ordersData.length === 0) {
        setOrders([]);
        return;
      }

      const productIds = Array.from(
        new Set(ordersData.map((o) => o.product_id).filter(Boolean)),
      );

      const { data: productsData } = await supabase
        .from("products")
        .select("*")
        .in("id", productIds);

      const merged = ordersData.map((order) => ({
        ...order,
        product: productsData?.find((p) => p.id === order.product_id) || null,
      }));

      setOrders(merged as any);
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

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Esta ação desativará o e-book. Continuar?")) return;
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        toast.success("Produto desativado.");
        fetchProducts();
      }
    } catch (e) {
      toast.error("Erro ao eliminar.");
    }
  };

  // Consider completed and refunded orders for financial calculations
  const grossOrders = orders.filter(
    (o) => o.status === "completed" || o.status === "refunded",
  );
  const refundedOrders = orders.filter((o) => o.status === "refunded");

  const totalGrossRevenue = grossOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0,
  );
  const totalRefunded = refundedOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0,
  );
  const netProfit = totalGrossRevenue - totalRefunded;
  const completedSales = grossOrders.length; // Including refunds in total transaction count

  // Processing chart data with safety for NaN
  const getChartData = () => {
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

      grossOrders.forEach((order) => {
        const date = new Date(order.created_at);
        const dayIndex = (date.getDay() + 6) % 7; // Convert 0-6 (Sun-Sat) to 0-6 (Mon-Sun)
        data[dayIndex].value += Number(order.total_amount) || 0;
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

      grossOrders.forEach((order) => {
        const date = new Date(order.created_at);
        if (date.getFullYear() === currentYear) {
          const monthIndex = date.getMonth();
          data[monthIndex].value += Number(order.total_amount) || 0;
          data[monthIndex].sales += 1;
        }
      });
      return data;
    }

    if (timeRange === "yearly") {
      // Get last 5 years
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
      const data = years.map((year) => ({
        name: year.toString(),
        value: 0,
        sales: 0,
      }));

      grossOrders.forEach((order) => {
        const date = new Date(order.created_at);
        const year = date.getFullYear();
        const yearData = data.find((d) => d.name === year.toString());
        if (yearData) {
          yearData.value += Number(order.total_amount) || 0;
          yearData.sales += 1;
        }
      });
      return data;
    }

    return [{ name: "N/A", value: 0, sales: 0 }];
  };

  const displayData = getChartData();

  const filteredOrders = orders.filter((order) => {
    const searchLower = orderSearch.toLowerCase();
    const matchSearch =
      order.id.toLowerCase().includes(searchLower) ||
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
    <div className="min-h-screen bg-luxury-black text-luxury-white font-sans selection:bg-luxury-gold selection:text-black">
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
            {(["overview", "products", "orders"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${
                  tab === t
                    ? "bg-luxury-gold text-black font-semibold"
                    : "text-white/40 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="sm:hidden flex border-t border-white/5">
          {(["overview", "products", "orders"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-[9px] uppercase tracking-widest border-b-2 transition-all ${
                tab === t
                  ? "border-luxury-gold text-luxury-gold bg-luxury-gold/5 font-bold"
                  : "border-transparent text-white/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-12">
        {tab === "overview" && (
          <div className="space-y-12 animate-in fade-in duration-700">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <Card className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                    Vendas Brutas
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-4xl font-serif">
                    €
                    {totalGrossRevenue.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                  <div className="p-2 md:p-3 bg-emerald-500/10 text-emerald-500 rounded-full">
                    <TrendingUp size={18} />
                  </div>
                </div>
              </Card>

              <Card className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-red-400">
                    Total Reembolsado
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-4xl font-serif text-red-500">
                    €
                    {totalRefunded.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                  <div className="p-2 md:p-3 bg-red-500/10 text-red-500 rounded-full">
                    <XCircle size={18} />
                  </div>
                </div>
              </Card>

              <Card className="bg-luxury-dark border-white/5 rounded-none p-6 md:p-8 sm:col-span-2 lg:col-span-1">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                    Lucro Líquido
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-4xl font-serif text-luxury-gold">
                    €
                    {netProfit.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                  <div className="p-2 md:p-3 bg-luxury-gold/10 text-luxury-gold rounded-full">
                    <DollarSign size={18} />
                  </div>
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
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
                        ID Ordem
                      </th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
                        Produto
                      </th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
                        Cliente
                      </th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
                        Morada
                      </th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
                        Data
                      </th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
                        Valor
                      </th>
                      <th className="px-6 py-4 font-normal text-[10px] uppercase tracking-widest text-white/30">
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
                          {order.id.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4 font-serif">
                          {order.product?.title || "Produto Removido"}
                        </td>
                        <td className="px-6 py-4 text-white/60">
                          {order.customer_email}
                        </td>
                        <td className="px-6 py-4 text-white/40">
                          {order.shipping_details ? (
                            <div className="text-[9px] truncate max-w-[100px]">
                              {order.shipping_details.city},{" "}
                              {order.shipping_details.country}
                            </div>
                          ) : (
                            "-"
                          )}
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
                        onClick={() => handleDeleteProduct(p.id)}
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
              <div className="fixed inset-0 z-[60] bg-luxury-black/95 backdrop-blur-md flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
                <Card className="max-w-4xl w-full bg-luxury-dark border-white/10 rounded-none p-6 md:p-12 my-8 space-y-6 md:space-y-8 animate-in zoom-in-95 duration-500">
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
                      Morada de Envio
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
                        {order.id}
                      </td>
                      <td className="px-8 py-6">
                        <div className="font-serif text-base">
                          {order.product?.title || "Expurgado"}
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
                      <td className="px-8 py-6 text-white/50 max-w-xs">
                        {order.shipping_details ? (
                          <div className="space-y-1">
                            <div className="font-bold text-[10px] text-white/80">
                              {order.shipping_details.fullName}
                            </div>
                            <div className="text-[10px]">
                              {order.shipping_details.address}
                            </div>
                            <div className="text-[10px]">
                              {order.shipping_details.city},{" "}
                              {order.shipping_details.postalCode}
                            </div>
                            <div className="text-[10px]">
                              {order.shipping_details.country}
                            </div>
                            <div className="text-[9px] text-luxury-gold/60">
                              {order.shipping_details.phone}
                            </div>
                          </div>
                        ) : (
                          <span className="italic text-white/20">
                            Produto Digital
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-white/40">
                        {new Date(order.created_at).toLocaleString()}
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
                                  data.status === "completed"
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
                          <span
                            className={`inline-flex items-center px-4 py-1.5 rounded-full text-[9px] uppercase tracking-widest font-black ${
                              order.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            }`}
                          >
                            {order.status === "completed" ? (
                              <CheckCircle size={10} className="mr-2" />
                            ) : (
                              <Clock size={10} className="mr-2" />
                            )}
                            {order.status === "completed" ? "Pago" : "Pendente"}
                          </span>

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
                                  if (data.status === 'completed') {
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
      </div>
    </div>
  );
}

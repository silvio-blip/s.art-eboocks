import React, { useState, useEffect, useMemo } from "react";
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
  AlertTriangle,
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
  RefreshCcw,
  Truck,
  Check,
  X,
  Mail,
  Users,
  Undo2,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Zap,
  Crown,
  Key,
  Terminal,
  Copy,
  Eye,
  Bell,
  Video,
  Image as ImageIcon,
  Film,
  Monitor,
  Smartphone,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { AliExpressService } from "../services/AliExpressService";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { CreateManualProduct } from "./CreateManualProduct";
import { CouponManager } from "./CouponManager";

const getImageUrl = (url: string) => {
  if (!url) return "https://picsum.photos/seed/ebook/600/800";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
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
  pvp: number;
  price?: number;
  category: string;
  image_url: string;
  file_url: string;
  is_active: boolean;
  is_featured?: boolean;
  created_at?: string;
  product_type?: "physical" | "digital";
  sizes?: string;
  colors?: string;
  sizes_enabled?: boolean;
  colors_enabled?: boolean;
  admin_link?: string;
  extra_images?: string; // Comma separated links
  aliexpress_id?: string | number;
  sku?: string;
  provider?: "aliexpress";
  supabase_id?: string;
  price_markup?: number;
  last_aliexpress_sync?: string;
  metadata?: any;
  free_shipping?: boolean;
  discount_percent?: number;
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  shipping_status?: string;
  payment_status?: string;
  total_amount: number;
  customer_email: string;
  created_at: string;
  email_paid_sent?: boolean;
  email_shipped_sent?: boolean;
  email_review_sent?: boolean;
  email_canceled_sent?: boolean;
  email_refunded_sent?: boolean;
  email_delivered_sent?: boolean;
  provider_order_id?: string;
  shipping_tracking_code?: string;
  shipping_tracking_url?: string;
  product?: Product;
  selected_options?: { size?: string; color?: string; shipping_details?: any };
  shipping_status_metadata?: {
    trackingNumber?: string;
    trackingUrl?: string;
    lastSync?: string;
    manual_update?: boolean;
  };
  shipping_details?: {
    fullName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
    name?: string; // Fallback
  };
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  is_admin: boolean;
  is_employee: boolean;
  created_at: string;
  custom_id?: string;
  products_count?: number;
}

export default function AdminDashboard({
  user,
  onBack,
  formatPrice,
  siteTheme,
  onThemeChange,
  unreadCount = 0,
  onNotificationClick,
}: {
  user: SupabaseUser;
  onBack: () => void;
  formatPrice?: (price: number) => string;
  siteTheme?: { active: string };
  onThemeChange?: (theme: { active: string }) => void;
  unreadCount?: number;
  onNotificationClick?: () => void;
}) {
  const renderPrice = (val: number) => {
    const rounded = Math.round(val * 100) / 100;
    return formatPrice ? formatPrice(rounded) : `€${rounded.toFixed(2)}`;
  };
  const roundValue = (v: number) => Math.round(v * 100) / 100;
  const theme: string = "dark";
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [localTheme, setLocalTheme] = useState<string>("luxury");

  useEffect(() => {
    if (siteTheme?.active) {
      setLocalTheme(siteTheme.active);
    }
  }, [siteTheme]);

  // Cleanup/Stop any active speech synthesis (audio chat reader) and hide floating chat/audio widgets
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      
      const selectors = [
        "#cyberextract-floating-button-container",
        "[id*='chat']",
        "[class*='chat']",
        "[id*='whatsapp']",
        "[class*='whatsapp']",
        "[id*='audio']",
        "[class*='audio']",
        "#jivo-iframe-container",
        "#smartsupp-widget",
        ".widget-visible"
      ];
      
      const hiddenElements: { el: HTMLElement; originalDisplay: string }[] = [];
      
      selectors.forEach(sel => {
        document.querySelectorAll<HTMLElement>(sel).forEach(el => {
          hiddenElements.push({ el, originalDisplay: el.style.display });
          el.style.display = "none";
        });
      });

      return () => {
        hiddenElements.forEach(({ el, originalDisplay }) => {
          if (el) el.style.display = originalDisplay;
        });
      };
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(
    null,
  );
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"overview" | "products" | "orders" | "users" | "refunds" | "coupons" | "pontuação" | "api">(
    "overview",
  );

  // API Integration States & Handlers
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; token: string; created_at: string }[]>([]);
  const [apiLang, setApiLang] = useState<"js" | "py" | "php" | "go" | "curl">("js");
  const [newKeyName, setNewKeyName] = useState("");
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});

  const fetchApiKeys = async () => {
    setLoadingApiKeys(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        headers: { "x-user-id": user.id }
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data);
      } else {
        toast.error("Erro ao buscar chaves de API.");
      }
    } catch (err) {
      console.error("Fetch API keys error:", err);
      toast.error("Erro ao carregar chaves de API.");
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error("Por favor, introduza um nome para a chave.");
      return;
    }
    setGeneratingKey(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id
        },
        body: JSON.stringify({ name: newKeyName })
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeys([data, ...apiKeys]);
        setNewKeyName("");
        toast.success("Chave de API gerada com sucesso!");
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Erro ao gerar chave de API.");
      }
    } catch (err) {
      console.error("Generate API key error:", err);
      toast.error("Erro de rede ao gerar chave.");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!window.confirm("Tem a certeza que deseja eliminar esta chave de API? Todas as aplicações que a utilizam perderão o acesso.")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, {
        method: "DELETE",
        headers: { "x-user-id": user.id }
      });
      if (res.ok) {
        setApiKeys(apiKeys.filter(k => k.id !== id));
        toast.success("Chave de API eliminada!");
      } else {
        toast.error("Erro ao eliminar chave.");
      }
    } catch (err) {
      console.error("Delete API key error:", err);
      toast.error("Erro de rede ao eliminar chave.");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    toast.success("Chave de API copiada!");
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeyIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (tab === "api" && currentUserProfile?.is_admin) {
      fetchApiKeys();
    }
  }, [tab, currentUserProfile]);

  const availableTabs = useMemo(() => {
    if (!currentUserProfile) return ["overview"];
    if (currentUserProfile.is_admin) {
      return ["overview", "products", "orders", "refunds", "users", "coupons", "pontuação", "api"];
    }
    if (currentUserProfile.is_employee) {
      // Employees ONLY see Products and Pontuação (Ranking)
      // Removed orders and users as requested
      return ["products", "pontuação"];
    }
    return [];
  }, [currentUserProfile]);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0] as any);
    }
  }, [availableTabs, tab]);
  const [timeRange, setTimeRange] = useState<"weekly" | "monthly" | "yearly">(
    "weekly",
  );
  const [uploading, setUploading] = useState(false);
  const [aiOrganizing, setAiOrganizing] = useState(false);

  const handleOrganizeWithAI = async () => {
    if (!editingProduct) return;
    setAiOrganizing(true);
    const loadingToast = toast.loading("🤖 A Inteligência Artificial está a organizar os atributos...");
    try {
      const res = await fetch("/api/admin/products/organize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id
        },
        body: JSON.stringify({
          title: editingProduct.title || "",
          description: editingProduct.description || "",
          colors: Array.isArray(editingProduct.colors) ? editingProduct.colors.join(", ") : (editingProduct.colors || ""),
          sizes: Array.isArray(editingProduct.sizes) ? editingProduct.sizes.join(", ") : (editingProduct.sizes || "")
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ocorreu um erro ao correr a IA.");
      }

      setEditingProduct({
        ...editingProduct,
        title: data.title || editingProduct.title,
        description: data.description || editingProduct.description,
        colors: data.colors || editingProduct.colors,
        sizes: data.sizes || editingProduct.sizes,
        sizes_enabled: data.sizes ? true : editingProduct.sizes_enabled,
        colors_enabled: data.colors ? true : editingProduct.colors_enabled
      });

      toast.success("✨ Atributos e descrição organizados com sucesso!", { id: loadingToast });
    } catch (err: any) {
      console.error("[GEMINI CLIENT ERROR]", err);
      toast.error(`Falha ao organizar com IA: ${err.message}`, { id: loadingToast });
    } finally {
      setAiOrganizing(false);
    }
  };

  const [orderSearch, setOrderSearch] = useState("");
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [orderDateFilter, setOrderDateFilter] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [importAliExpressId, setImportAliExpressId] = useState("");
  const [importMarkup, setImportMarkup] = useState<number>(10.00); // Default markup
  const [importing, setImporting] = useState(false);
  const [isSyncingAllAliExpress, setIsSyncingAllAliExpress] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [isProductCreateModalOpen, setIsProductCreateModalOpen] = useState(false);
  const [creationSupplier, setCreationSupplier] = useState<"aliexpress" | null>(null);
  const [testEmailInput, setTestEmailInput] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [productFeaturedFilter, setProductFeaturedFilter] = useState<"all" | "featured" | "standard">("all");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isSiteSettingsOpen, setIsSiteSettingsOpen] = useState(false);
  const [stripeCheckToggle, setStripeCheckToggle] = useState(false);
  const [manualStatus, setManualStatus] = useState("");
  const [manualShippingStatus, setManualShippingStatus] = useState("");
  const [manualTrackingCode, setManualTrackingCode] = useState("");
  const [manualTrackingUrl, setManualTrackingUrl] = useState("");
  const [manualProviderOrderId, setManualProviderOrderId] = useState("");
  const [selectedUserForProducts, setSelectedUserForProducts] = useState<Profile | null>(null);
  const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);
  const [cyberLoading, setCyberLoading] = useState(false);
  const [cyberStatus, setCyberStatus] = useState("⚡ PROCESSAR PEDIDO");

  // Email Dispatch Modal States
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedUserIdsForEmail, setSelectedUserIdsForEmail] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState("S.art Boutique | Comunicado Exclusivo");
  const [emailMessage, setEmailMessage] = useState("Estimado cliente,\n\nGostaríamos de partilhar consigo as mais recentes novidades e destaques exclusivos na S.art Boutique.\n\nExplore abaixo as nossas sugestões selecionadas especialmente para si:");
  const [selectedProductIdsForEmail, setSelectedProductIdsForEmail] = useState<string[]>([]);
  const [emailProductSearch, setEmailProductSearch] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailTabMode, setEmailTabMode] = useState<"compose" | "preview" | "code">("compose");

  const toggleSelectUserForEmail = (userId: string) => {
    setSelectedUserIdsForEmail(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAllUsersForEmail = (filteredList: Profile[]) => {
    if (selectedUserIdsForEmail.length === filteredList.length && filteredList.length > 0) {
      setSelectedUserIdsForEmail([]);
    } else {
      setSelectedUserIdsForEmail(filteredList.map(u => u.id));
    }
  };

  const openEmailModalWithUsers = (userIds: string[]) => {
    if (userIds.length > 0) {
      setSelectedUserIdsForEmail(userIds);
    } else {
      setSelectedUserIdsForEmail(users.map(u => u.id));
    }
    setIsEmailModalOpen(true);
  };

  const generateEmailTemplate = (
    subjectStr: string,
    messageStr: string,
    selectedProds: Product[]
  ) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sart-full.pt";
    const formattedMessage = (messageStr || "")
      .split("\n")
      .map(p => p.trim() ? `<p style="margin: 0 0 16px 0; color: #27272a; font-size: 15px; line-height: 1.6;">${p}</p>` : '')
      .join("");

    let productsGridHtml = "";
    if (selectedProds && selectedProds.length > 0) {
      const cardsHtml = selectedProds.map(prod => {
        const rawImg = prod.image_url;
        const imgUrl = rawImg ? (rawImg.startsWith("http") ? rawImg : `${origin}${rawImg}`) : "https://i.imgur.com/bkuoZcP.png";
        const shortTitle = prod.title && prod.title.length > 36 ? prod.title.substring(0, 36) + "..." : (prod.title || "Produto Exclusivo");
        const displayPrice = prod.price ?? prod.pvp;
        const formattedPrice = displayPrice ? `€${Number(displayPrice).toFixed(2)}` : "";
        const prodUrl = `${origin}/p/${prod.id}`;

        return `
          <td width="50%" align="center" valign="top" style="padding: 8px; box-sizing: border-box;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; overflow: hidden; table-layout: fixed;">
              <tr>
                <td align="center" style="padding: 12px; background-color: #fafafa;">
                  <div style="width: 100%; height: 150px; background-color: #ffffff; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    <img src="${imgUrl}" alt="${shortTitle}" style="max-width: 100%; max-height: 140px; object-fit: contain; margin: 0 auto; display: block;" />
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 10px 12px 4px 12px;">
                  <div style="font-size: 12px; font-weight: 700; color: #09090b; min-height: 32px; max-height: 36px; overflow: hidden; text-overflow: ellipsis; line-height: 1.35;">
                    ${shortTitle}
                  </div>
                </td>
              </tr>
              ${formattedPrice ? `
              <tr>
                <td align="center" style="padding: 4px 12px 6px 12px;">
                  <div style="font-size: 14px; font-weight: 800; color: #D4AF37;">${formattedPrice}</div>
                </td>
              </tr>
              ` : ''}
              <tr>
                <td align="center" style="padding: 4px 12px 14px 12px;">
                  <a href="${prodUrl}" target="_blank" style="display: inline-block; background-color: #000000; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; padding: 8px 14px; text-decoration: none; border-radius: 4px;">
                    Ver Produto
                  </a>
                </td>
              </tr>
            </table>
          </td>
        `;
      });

      let rowsHtml = "";
      for (let i = 0; i < cardsHtml.length; i += 2) {
        const chunk = cardsHtml.slice(i, i + 2);
        while (chunk.length < 2) {
          chunk.push(`<td width="50%" style="padding: 8px;"></td>`);
        }
        rowsHtml += `<tr>${chunk.join('')}</tr>`;
      }

      productsGridHtml = `
        <div style="margin-top: 32px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #D4AF37; margin-bottom: 16px; border-bottom: 1px solid #f4f4f5; padding-bottom: 8px;">
            ✨ Destaques da Boutique
          </div>
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout: fixed;">
            ${rowsHtml}
          </table>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subjectStr}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #18181b;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 20px; background-color: #ffffff;">
    
    <!-- Header -->
    <div style="text-align: center; padding-bottom: 28px; border-bottom: 2px solid #D4AF37; margin-bottom: 28px;">
      <img src="https://i.imgur.com/bkuoZcP.png" alt="S.art Boutique" style="height: 52px; width: auto; margin-bottom: 10px; display: inline-block;" />
      <div style="color: #09090b; font-size: 20px; font-weight: 300; letter-spacing: 6px; text-transform: uppercase; margin-top: 4px;">S.ART BOUTIQUE</div>
      <div style="color: #D4AF37; font-size: 9px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px;">Moda & Estilo Exclusivo</div>
    </div>

    <!-- Body Content -->
    <div style="padding: 0 4px;">
      ${formattedMessage}
      ${productsGridHtml}
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding-top: 28px; margin-top: 36px; border-top: 1px solid #f4f4f5;">
      <p style="font-size: 11px; color: #71717a; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin: 0;">
        © 2026 SART BOUTIQUE | PORTO - PORTUGAL
      </p>
      <p style="font-size: 10px; color: #a1a1aa; margin-top: 8px; margin-bottom: 0;">
        Mensagem enviada pelo canal oficial de comunicação ao cliente da S.art Boutique.
      </p>
    </div>

  </div>
</body>
</html>`;
  };

  const handleSendBatchEmail = async () => {
    if (selectedUserIdsForEmail.length === 0) {
      toast.error("Por favor, selecione pelo menos um utilizador para enviar e-mail.");
      return;
    }
    if (!emailSubject.trim()) {
      toast.error("Insira o assunto do e-mail.");
      return;
    }

    setSendingEmail(true);

    try {
      const targetRecipients = users
        .filter(u => selectedUserIdsForEmail.includes(u.id))
        .map(u => ({
          email: u.email,
          name: u.full_name || u.email
        }))
        .filter(u => u.email && u.email.includes("@"));

      if (targetRecipients.length === 0) {
        toast.error("Nenhum e-mail válido encontrado nos utilizadores selecionados.");
        setSendingEmail(false);
        return;
      }

      const selectedProds = products.filter(p => selectedProductIdsForEmail.includes(p.id));
      const htmlContent = generateEmailTemplate(emailSubject, emailMessage, selectedProds);

      const res = await fetch("/api/admin/send-batch-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          userId: user.id,
          recipients: targetRecipients,
          subject: emailSubject,
          message: emailMessage,
          html: htmlContent,
          products: selectedProds
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao disparar e-mails");
      }

      toast.success(`E-mails disparados com sucesso! (${data.count || targetRecipients.length} enviados)`);
      setIsEmailModalOpen(false);
    } catch (err: any) {
      console.error("Erro no envio de e-mails:", err);
      toast.error(err.message || "Erro de ligação ao servidor de e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };
  
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === "CYBER_EXT_BACKGROUND" && event.data.action === "ORDER_RECEIVED") {
        setCyberStatus("✓ INICIADO NA LOJA");
        setTimeout(() => {
          setCyberLoading(false);
          setCyberStatus("⚡ PROCESSAR PEDIDO");
        }, 3000);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  useEffect(() => {
    if (viewingOrder) {
      setManualStatus(viewingOrder.status);
      setManualShippingStatus(viewingOrder.shipping_status || "pending");
      setManualTrackingCode(viewingOrder.shipping_tracking_code || "");
      setManualTrackingUrl(viewingOrder.shipping_tracking_url || "");
      setManualProviderOrderId(viewingOrder.provider_order_id || "");
      setCyberLoading(false);
      setCyberStatus("⚡ PROCESSAR PEDIDO");
    }
  }, [viewingOrder]);

  const [siteHero, setSiteHero] = useState({
    image: "",
    image_mobile: "",
    video_url: "",
    video_mobile_url: "",
    title: "",
    subtitle: "",
    buttonText: ""
  });

  const [aliAppKey, setAliAppKey] = useState("533964");
  const [aliAppSecret, setAliAppSecret] = useState("Fmek9qAohE8K2tgkyGcAeC2tQ8dMZiq7");
  const [aliAccessToken, setAliAccessToken] = useState("");
  const [aliAuthCode, setAliAuthCode] = useState("");
  const [isExchangingAliCode, setIsExchangingAliCode] = useState(false);
  const [isTestingAliConnection, setIsTestingAliConnection] = useState(false);
  const [aliTestResult, setAliTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleExchangeAliCode = async () => {
    if (!aliAuthCode.trim()) {
      toast.error("Por favor, introduza o 'code' temporário gerado no AliExpress.");
      return;
    }
    setIsExchangingAliCode(true);
    try {
      const res = await fetch("/api/aliexpress/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: aliAuthCode.trim(),
          appKey: aliAppKey.trim() || "533964",
          appSecret: aliAppSecret.trim() || "Fmek9qAohE8K2tgkyGcAeC2tQ8dMZiq7",
          redirectUri: "https://sart-full.pt/"
        })
      });
      const data = await res.json();
      if (data.success && data.access_token) {
        setAliAccessToken(data.access_token);
        setAliAuthCode("");
        toast.success("✨ Token Oficial de Produção obtido e gravado com sucesso!");
        setAliTestResult({ success: true, message: `Conectado ao AliExpress (ID: ${data.user_id || data.user_nick || 'Produção'})` });
      } else {
        toast.error(data.error || "Falha ao trocar o código pelo token.");
        setAliTestResult({ success: false, message: data.error || "Erro na troca do código." });
      }
    } catch (err: any) {
      toast.error("Erro de rede ao conectar com o AliExpress.");
      setAliTestResult({ success: false, message: err.message });
    } finally {
      setIsExchangingAliCode(false);
    }
  };

  const handleTestAliConnection = async () => {
    setIsTestingAliConnection(true);
    setAliTestResult(null);
    try {
      const res = await fetch("/api/aliexpress/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.success) {
        toast.success("✅ Conexão com a API de Produção do AliExpress 100% Ativa!");
        setAliTestResult({ success: true, message: "API AliExpress Produção respondeu com sucesso (200 OK)!" });
      } else {
        toast.error(data.error || "Erro ao testar conexão.");
        setAliTestResult({ success: false, message: data.error || "Falha no teste da API." });
      }
    } catch (err: any) {
      toast.error("Erro ao testar conexão com AliExpress.");
      setAliTestResult({ success: false, message: err.message });
    } finally {
      setIsTestingAliConnection(false);
    }
  };

  // Categories are strictly managed from the categories table
  const allAvailableCategories = useMemo(() => {
    return categories.map(c => c.name).sort();
  }, [categories]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // 1. Restriction: Employees ONLY see active products
      if (currentUserProfile?.is_employee && !currentUserProfile?.is_admin) {
        if (!p.is_active) return false;
      }

      // 2. Search filter
      const searchLower = productSearch.toLowerCase().trim();
      const titleMatches = (p.title || "").toLowerCase().includes(searchLower);
      const categoryMatches = (p.category || "").toLowerCase().includes(searchLower);
      const idMatches = (p.aliexpress_id || "").toString().toLowerCase().includes(searchLower);
      const uuidMatches = (p.id || "").toLowerCase().includes(searchLower);
      if (!titleMatches && !categoryMatches && !idMatches && !uuidMatches) return false;

      // 3. Status filter (Featured/Standard)
      const isFeatured = !!p.is_featured;
      if (productFeaturedFilter === "featured") return isFeatured;
      if (productFeaturedFilter === "standard") return !isFeatured;
      
      return true;
    });
  }, [products, productSearch, productFeaturedFilter, currentUserProfile]);

  useEffect(() => {
    checkAdminAccess();
    fetchCategories();

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
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin && !profile?.is_employee) {
      const HARDCODED_ADMINS = ["3d596215-583e-498f-9fd5-36b83d8bccf5", "00d44feb-0b51-405e-86f7-31b67edfb7b6"];
      if (!HARDCODED_ADMINS.includes(user.id)) {
        onBack();
        return;
      }
      
      // If hardcoded admin, set a mock profile if one doesn't exist
      if (!profile) {
        setCurrentUserProfile({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email || "Admin",
          email: user.email || "",
          avatar_url: user.user_metadata?.avatar_url || "",
          is_admin: true,
          is_employee: false,
          created_at: new Date().toISOString()
        } as Profile);
      }
    } else {
      setCurrentUserProfile(profile as Profile);
    }
    fetchData();
  };

  const handleResyncCategories = async () => {
    const syncToast = toast.loading("Sincronizando tabela de categorias com produtos...");
    try {
      const res = await fetch('/api/admin/categories/resync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${data.added} novas categorias sincronizadas!`, { id: syncToast });
        fetchCategories(); // Refresh list
      } else {
        toast.error("Erro ao sincronizar categorias.");
      }
    } catch (err) {
      toast.error("Erro de rede na sincronização.");
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/admin/categories?userId=" + user.id, {
        headers: { "x-user-id": user.id }
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (e) {
      console.error("Error fetching categories:", e);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({ name: newCategoryName.trim(), userId: user.id }),
      });
      if (res.ok) {
        toast.success("Categoria adicionada!");
        setNewCategoryName("");
        fetchCategories();
      } else {
        toast.error("Erro ao adicionar categoria.");
      }
    } catch (e) {
      toast.error("Erro de rede.");
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({ name: editingCategoryName.trim(), userId: user.id }),
      });
      if (res.ok) {
        toast.success("Categoria atualizada!");
        setEditingCategoryId(null);
        setEditingCategoryName("");
        fetchCategories();
      } else {
        toast.error("Erro ao atualizar categoria.");
      }
    } catch (e) {
      toast.error("Erro de rede.");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/categories/${id}?userId=${user.id}`, {
        method: "DELETE",
        headers: { "x-user-id": user.id }
      });
      if (res.ok) {
        toast.success("Categoria removida.");
        setCategoryToDelete(null);
        fetchCategories();
      } else {
        toast.error("Erro ao remover categoria.");
      }
    } catch (e) {
      toast.error("Erro de rede.");
    }
  };

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [orderToRefund, setOrderToRefund] = useState<Order | null>(null);

  const confirmRefundAction = async () => {
    if (!orderToRefund) return;
    
    const refundToast = toast.loading('Processando Reembolso no Stripe...');
    try {
      const response = await fetch(`/api/admin/orders/${orderToRefund.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        }
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Reembolso efetuado com sucesso`, { id: refundToast });
        setIsRefundModalOpen(false);
        fetchDashboardData();
      } else {
        toast.error(data.error || 'Erro ao processar reembolso.', { id: refundToast });
      }
    } catch(e) {
      toast.error('Erro de rede ao processar reembolso.', { id: refundToast });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchProducts(), fetchDashboardData(), fetchUsers(), fetchCategories(), fetchSiteSettings()]);
    setLoading(false);
  };

  const fetchSiteSettings = async () => {
    try {
      const res = await fetch("/api/settings/hero");
      if (res.ok) {
        const data = await res.json();
        setSiteHero(data);
      }

      let aliData: any = null;
      try {
        const aliRes = await fetch(`/api/admin/settings/aliexpress_config`, {
          headers: { "x-user-id": user.id }
        });
        if (aliRes.ok) {
          aliData = await aliRes.json();
        }
      } catch (e) {
        // fallback
      }

      if (!aliData || !aliData.access_token) {
        try {
          const publicRes = await fetch(`/api/settings/aliexpress_config`);
          if (publicRes.ok) {
            aliData = await publicRes.json();
          }
        } catch (e) {
          // ignore
        }
      }

      if (aliData && Object.keys(aliData).length > 0) {
        if (aliData.app_key) setAliAppKey(aliData.app_key);
        if (aliData.app_secret) setAliAppSecret(aliData.app_secret);
        if (aliData.access_token) {
          setAliAccessToken(aliData.access_token);
          setAliTestResult({
            success: true,
            message: `Sessão Oficial Ativa: ${aliData.user_nick || aliData.user_id || aliData.account || 'silviok5000@gmail.com'} (Produção 200 OK)`
          });
        }
      }
    } catch (e) {
      console.error("Error fetching site settings:", e);
    }
  };

  const handleUpdateSiteSettings = async () => {
    try {
      const heroPromise = fetch("/api/admin/settings/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify(siteHero),
      });

      const themePromise = fetch("/api/admin/settings/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({ active: localTheme }),
      });

      const aliPromise = fetch("/api/admin/settings/aliexpress_config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({
          app_key: aliAppKey,
          app_secret: aliAppSecret,
          access_token: aliAccessToken
        }),
      });

      const [heroRes, themeRes, aliRes] = await Promise.all([heroPromise, themePromise, aliPromise]);

      if (heroRes.ok && themeRes.ok && aliRes.ok) {
        toast.success("Configurações salvas com sucesso!");
        if (onThemeChange) {
          onThemeChange({ active: localTheme });
        }
        setIsSiteSettingsOpen(false);
      } else {
        toast.error("Erro ao salvar configurações.");
      }
    } catch (e) {
      toast.error("Erro de rede.");
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users?userId=${user.id}`, {
        headers: {
          'x-user-id': user.id
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("Error fetching users:", e);
    }
  };

  const sendTestEmail = () => {
    setTestEmailInput(user.email || "");
    setIsTestEmailModalOpen(true);
  };

  const handleConfirmTestEmail = async () => {
    if (!testEmailInput) {
      toast.error("Por favor, insira um e-mail válido.");
      return;
    }

    setIsTestEmailModalOpen(false);
    const testToast = toast.loading(`Enviando e-mail de teste para ${testEmailInput}...`);
    
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ email: testEmailInput, userId: user.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("E-mail de teste enviado com sucesso!", { id: testToast });
      } else {
        toast.error(`Falha: ${data.error}`, { id: testToast });
      }
    } catch (e) {
      toast.error("Erro na comunicação com o servidor.", { id: testToast });
    }
  };

  const updateUserRole = async (targetUser: Profile, roleType: "admin" | "employee", value: boolean) => {
    // Restriction: Mutual exclusion between admin and employee roles
    if (roleType === "admin" && value === true && targetUser.is_employee) {
      toast.error("Remova o cargo de funcionário antes de tornar este utilizador administrador.");
      return;
    }
    if (roleType === "employee" && value === true && targetUser.is_admin) {
      toast.error("Remova o cargo de administrador antes de tornar este utilizador funcionário.");
      return;
    }

    try {
      const updatePayload: any = { userId: user.id };
      
      if (roleType === "admin") {
        updatePayload.is_admin = value;
        if (value) updatePayload.is_employee = false; // Exclusive: if admin, not employee
      } else {
        updatePayload.is_employee = value;
        if (value) updatePayload.is_admin = false; // Exclusive: if employee, not admin
      }

      const res = await fetch(`/api/admin/users/${targetUser.id}/role`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user.id
        },
        body: JSON.stringify(updatePayload),
      });

      if (res.ok) {
        toast.success(`Cargos de ${targetUser.full_name || targetUser.email} atualizados.`);
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao atualizar cargos.");
      }
    } catch (e) {
      toast.error("Erro na comunicação com o servidor.");
    }
  };

  useEffect(() => {
    // Background sync every 1 minute while admin is open
    const backgroundSync = setInterval(() => {
      if (tab === "orders" || tab === "overview") {
        console.log("[BACKGROUND SYNC] Checking for order updates...");
        syncAllPayments();
      }
    }, 60000); // 1 minute

    return () => clearInterval(backgroundSync);
  }, [tab, orders.length]);

  const syncAllPayments = async () => {
    // Sincronizar qualquer ordem que ainda não esteja em estado terminal (Entregue ou Reembolsado)
    const ordersToSync = orders.filter(o => {
      const s = o.status?.toLowerCase() || "";
      const ss = o.shipping_status?.toLowerCase() || "";
      const ps = o.payment_status?.toLowerCase() || "";
      
      // Se já está entregue E pago, ou Reembolsado, não precisa sincronizar
      if ((s === "completed" || s === "paid") && (ss === "delivered")) return false;
      if (s === "refunded" || ps === "refunded" || s === "reembolsado") return false;
      
      return true;
    });
    
    if (ordersToSync.length === 0) {
      toast.info("Nenhuma ordem aberta necessita de sincronização.");
      return;
    }
    
    const syncToast = toast.loading(`Iniciando verificação profunda de ${ordersToSync.length} ordens...`);
    let successCount = 0;
    let changeCount = 0;
    
    // Execução sequencial para respeitar limites de processamento
    for (const order of ordersToSync) {
      try {
        const res = await fetch(`/api/admin/orders/${order.id}/sync_payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.id
          }
        });
        if (res.ok) {
          successCount++;
          const data = await res.json();
          if (data.synced) changeCount++;
        }
      } catch (e) {
        console.error(`Error syncing order ${order.id}:`, e);
      }
    }
    
    if (changeCount > 0) {
      toast.success(`${successCount} ordens verificadas. ${changeCount} atualizações detectadas!`, { id: syncToast });
      fetchDashboardData();
    } else {
      toast.success(`${successCount} ordens verificadas. Tudo está atualizado.`, { id: syncToast });
    }
  };

  const handleSyncAllAliExpress = async () => {
    setIsSyncingAllAliExpress(true);
    const syncToast = toast.loading("Sincronizando todos os produtos com Logística Global...");
    try {
      const res = await fetch("/api/admin/products/sync-aliexpress-all", {
        method: "POST",
        headers: { "x-user-id": user.id }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Sincronização concluída! ${data.successCount} atualizados, ${data.deactivatedCount} desativados.`, { id: syncToast });
        fetchProducts();
      } else {
        toast.error("Erro na sincronização massiva.");
      }
    } catch (err) {
      toast.error("Erro de rede ao sincronizar Logística Global.");
    } finally {
      setIsSyncingAllAliExpress(false);
    }
  };

  const handleImportAliExpress = async () => {
    if (!importAliExpressId) {
      toast.error("Insira um Link ou ID válido.");
      return;
    }

    // Try to extract ID if it's a URL or has prefixes
    let productId = importAliExpressId.trim();
    const idMatch = productId.match(/(\d{10,18})/);
    if (idMatch) {
      productId = idMatch[1];
    } else {
      // Fallback: just remove non-digits
      productId = productId.replace(/[^0-9]/g, '');
    }
    
    setImporting(true);
    const impToast = toast.loading(`Importando produto ${productId} para a base de dados...`);
    
     try {
      // Use the markup from the current editing session if it exists, or the default import markup
      const markupValue = editingProduct?.price_markup !== undefined ? editingProduct.price_markup : importMarkup;

      // Call the new integrated endpoint
      const response = await fetch('/api/admin/products/import-aliexpress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ productId, markup: markupValue, userId: user.id })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao importar do fornecedor');
      }
      
      if (data._isUpdate) {
        toast.success(`PRODUTO ATUALIZADO!\nDados manuais (título/desc/preço) preservados.\n"${data.title?.substring(0, 40)}..."`, { 
          id: impToast, 
          duration: 8000 
        });
      } else {
        toast.success(`NOVO PRODUTO IMPORTADO!\n"${data.title?.substring(0, 40)}..."\nID: ${data.id}`, { 
           id: impToast, 
           duration: 8000 
        });
      }
      
      setImportAliExpressId("");
      await fetchProducts();
      
      // Open editor with SAVED data
      setEditingProduct({
        ...data,
        pvp: data.price || 0
      });

      // Close creation modal if it was open
      setIsProductCreateModalOpen(false);
      setCreationSupplier(null);

    } catch (e: any) {
      toast.error(e.message || "Erro ao conectar com API Internacional", { id: impToast });
    } finally {
      setImporting(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const dbRes = await fetch(`/api/admin/products?userId=${user.id}`, {
        headers: { 'x-user-id': user.id }
      });
      
      if (!dbRes.ok) {
        const errorData = await dbRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao carregar lista de produtos via API.");
      }

      const dbData = await dbRes.json();
      
      const merged = (dbData || []).map((supaProduct: any) => {
        // Produto digital/local ou vindo de fornecedor já no Supabase
        return {
          ...supaProduct,
          supabase_id: supaProduct.id,
          pvp: supaProduct.price || 0
        };
      }).filter((p: any) => p !== null);

      setProducts(merged);
    } catch (err: any) {
      console.error("Fatal error fetching products admin:", err);
      toast.error(`Erro ao carregar ativos: ${err.message}`);
    }
  };

  const fetchDashboardData = async () => {
    try {
      console.log("[DEBUG] Obtendo dados do painel para:", user.id);
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.warn("[S.ART DEBUG] Erro/Aviso ao buscar pedidos:", ordersError.message || ordersError);
        setOrders([]);
        return;
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
          headers: { 
            "Content-Type": "application/json",
            "x-user-id": user.id
          },
          body: JSON.stringify({ ...editingProduct, userId: user.id }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        console.error("[ADMIN SAVE ERROR]", data);
        throw new Error(data.error || "Erro ao salvar produto.");
      }

      toast.success(
        isNew ? "Ativo adicionado com sucesso." : "Ativo atualizado.",
      );
      setEditingProduct(null);
      fetchProducts();
    } catch (e: any) {
      toast.error(`ERRO: ${e.message}`, { duration: 5000 });
      console.error("Save product error details:", e);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "pdf" | "video" | "hero_image" | "hero_image_mobile" | "hero_video" | "hero_video_mobile",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const isHeroUpload = type.startsWith("hero_") || (!editingProduct && (type === "image" || type === "video"));
      const slug = isHeroUpload
        ? `site-hero-${type}`
        : editingProduct?.title
        ? editingProduct.title
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .substring(0, 50)
        : "hero-asset";

      const fileName = `${slug}-${Date.now()}.${fileExt}`;

      const bucketName = "assets";
      let folderPath = "";
      
      if (type === "video" || type === "hero_video" || type === "hero_video_mobile") {
        folderPath = `ebook/${fileName}`;
      } else {
        folderPath = `covers/${fileName}`;
      }

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(folderPath, file);

      if (error) throw error;

      const { data } = supabase.storage.from(bucketName).getPublicUrl(folderPath);

      if (type === "hero_video") {
        setSiteHero(prev => ({ ...prev, video_url: data.publicUrl }));
        toast.success("Vídeo Desktop do banner carregado!");
      } else if (type === "hero_video_mobile") {
        setSiteHero(prev => ({ ...prev, video_mobile_url: data.publicUrl }));
        toast.success("Vídeo Mobile do banner carregado!");
      } else if (type === "hero_image") {
        setSiteHero(prev => ({ ...prev, image: data.publicUrl }));
        toast.success("Imagem Desktop do herói carregada!");
      } else if (type === "hero_image_mobile") {
        setSiteHero(prev => ({ ...prev, image_mobile: data.publicUrl }));
        toast.success("Imagem Mobile do herói carregada!");
      } else if (type === "video" && isHeroUpload) {
        setSiteHero(prev => ({ ...prev, video_url: data.publicUrl }));
        toast.success("Vídeo do banner carregado!");
      } else if (type === "image" && isHeroUpload) {
        setSiteHero(prev => ({ ...prev, image: data.publicUrl }));
        toast.success("Imagem do herói carregada!");
      } else {
        setEditingProduct((prev) => ({
          ...prev!,
          [type === "image" ? "image_url" : "file_url"]: folderPath,
        }));
        toast.success(`${type === "image" ? "Capa" : "PDF"} carregado com sucesso.`);
      }
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
      // Clear input
      e.target.value = "";
    }
  };

  const handleDeleteProduct = (product: Product) => {
    if (!currentUserProfile?.is_admin) {
      toast.error("Você não tem permissão para eliminar produtos. Apenas administradores podem realizar esta ação.");
      return;
    }
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
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user.id
        },
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

  // Correct financial calculations - Standardizing Statuses
  const activeStatuses = ["paid", "completed", "pago", "delivered", "succeeded"];
  
  const refundedOrders = orders.filter((o) => 
    o.status?.toLowerCase() === "refunded" || 
    o.payment_status?.toLowerCase() === "refunded" ||
    o.status?.toLowerCase() === "reembolsado"
  );
  
  const successfulOrders = orders.filter((o) => {
    const s = o.status?.toLowerCase() || "";
    const p = o.payment_status?.toLowerCase() || "";
    // Exclude if explicitly refunded for "Active/Successful" list
    if (s === "refunded" || p === "refunded" || s === "reembolsado") return false;
    return activeStatuses.includes(s) || p === "paid";
  });

  // Gross Revenue = Successful + Refunded (Everything that originated money)
  const totalGrossRevenue = [...successfulOrders, ...refundedOrders].reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0,
  );
  
  const totalRefunded = refundedOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0,
  );

  const netProfit = totalGrossRevenue - totalRefunded;
  
  const completedSales = successfulOrders.length; 

  const refundedOrdersCount = refundedOrders.length;
  const requestedRefundsCount = orders.filter((o) => 
    ["refund_requested", "refund_pending"].includes(o.status?.toLowerCase() || "")
  ).length;

  // Re-calculating display data for charts using the same active statuses
  const getChartData = () => {
    try {
      if (timeRange === "weekly") {
        const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
        const data = days.map((day) => ({ name: day, value: 0, sales: 0 }));

        successfulOrders.forEach((order) => {
          if (!order.created_at) return;
          const date = new Date(order.created_at);
          if (isNaN(date.getTime())) return;
          const dayIndex = (date.getDay() + 6) % 7; 
          data[dayIndex].value += Number(order.total_amount) || 0;
          data[dayIndex].sales += 1;
        });
        return data;
      }

      if (timeRange === "monthly") {
        const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const currentYear = new Date().getFullYear();
        const data = months.map((month) => ({ name: month, value: 0, sales: 0 }));

        successfulOrders.forEach((order) => {
          if (!order.created_at) return;
          const date = new Date(order.created_at);
          if (isNaN(date.getTime())) return;
          if (date.getFullYear() === currentYear) {
            const monthIndex = date.getMonth();
            data[monthIndex].value += Number(order.total_amount) || 0;
            data[monthIndex].sales += 1;
          }
        });
        return data;
      }

      if (timeRange === "yearly") {
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
        const data = years.map((year) => ({ name: year.toString(), value: 0, sales: 0 }));

        successfulOrders.forEach((order) => {
          if (!order.created_at) return;
          const date = new Date(order.created_at);
          if (isNaN(date.getTime())) return;
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
    } catch (e) {
      return [{ name: "Erro", value: 0, sales: 0 }];
    }
  };

  const displayData = getChartData();

  const filteredOrders = orders.filter((order) => {
    const searchLower = orderSearch.toLowerCase();
    const formattedOrderId = `Sart-${order.id.split("-")[0].toUpperCase()}`;
    const matchSearch =
      order.id.toLowerCase().includes(searchLower) ||
      formattedOrderId.toLowerCase().includes(searchLower) ||
      order.customer_email?.toLowerCase().includes(searchLower) ||
      order.provider_order_id?.toLowerCase().includes(searchLower) ||
      (order.shipping_details?.fullName &&
        order.shipping_details.fullName.toLowerCase().includes(searchLower)) ||
      (order.shipping_details?.name &&
        order.shipping_details.name.toLowerCase().includes(searchLower)) ||
      (order.shipping_details?.phone &&
        order.shipping_details.phone.toString().includes(searchLower));

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

  const handleVerifyProduct = async (product: any) => {
    setVerifying(product.id);
    const provider = product.provider || 'aliexpress';
    const providerLabel = provider === 'aliexpress' ? 'Internacional' : 'Local';
    const vToast = toast.loading(`Verificando integridade de ${product.title} no ${providerLabel}...`);
    try {
      const res = await fetch(`/api/admin/products/${product.id}/verify`, { 
        method: 'POST',
        headers: { 'x-user-id': user.id }
      });
      const data = await res.json();
      if (data.exists) {
        toast.success(data.message || "Produto ativo no fornecedor.", { id: vToast });
      } else {
        toast.error(data.message || "Produto não encontrado ou inativo.", { id: vToast });
      }
    } catch (err) {
      toast.error("Erro na comunicação com o servidor.", { id: vToast });
    } finally {
      setVerifying(null);
    }
  };

  const handleCyberFulfillPress = (ord: Order) => {
    setCyberLoading(true);
    setCyberStatus("A INJETAR DADOS...");

    const shippingData = (() => {
      if (!ord.shipping_details) return ord.selected_options?.shipping_details;
      if (typeof ord.shipping_details === 'object') return ord.shipping_details;
      try {
        return JSON.parse(ord.shipping_details);
      } catch (e) {
        return null;
      }
    })();

    const orderData = {
      id: ord.id,
      productUrl: ord.product?.admin_link || "",
      corEscolhida: ord.selected_options?.color || "",
      tamanhoEscolhido: ord.selected_options?.size || "",
      cliente: {
        nome: shippingData?.fullName || `${shippingData?.firstName || ''} ${shippingData?.lastName || ''}`.trim() || shippingData?.name || ord.customer_email || "N/A",
        rua: shippingData?.address || "N/A",
        cidade: shippingData?.city || "N/A",
        codigoPostal: shippingData?.postalCode || shippingData?.zip || "N/A",
        pais: shippingData?.country || "N/A"
      }
    };

    window.postMessage({
      source: "CYBER_FULFILL_WEB",
      action: "START_AUTO_ORDER",
      orderData: orderData
    }, "*"); 
  };

  const handleManualFulfill = async (orderId: string) => {
    try {
      toast.loading("A enviar pedido manualmente...", { id: "fulfill" });
      const res = await fetch(`/api/admin/orders/${orderId}/fulfill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao conectar com fornecedor");
      
      const provider = viewingOrder?.provider || viewingOrder?.product?.provider || 'aliexpress';
      const providerLabel = provider === 'aliexpress' ? 'Internacional' : 'Local';
      
      toast.success(`Pedido ENVIADO com sucesso para ${providerLabel}!`, { id: "fulfill" });
      
      // Atualizar estado local
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder({
          ...viewingOrder,
          status: 'processing_at_supplier',
          provider_order_id: data.order.provider_order_id,
          provider: provider
        });
      }
      
      // Recarregar dados do dashboard
      fetchDashboardData();
    } catch (err: any) {
      console.error("[Manual Fulfill Error]", err);
      toast.error(err.message, { id: "fulfill" });
    }
  };

  const handleInternationalFulfill = async (orderId: string) => {
    const loadingToast = toast.loading('Sincronizando com Logística Global...');
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error("Ordem não encontrada.");

      // Parse shipping details
      let customerAddress;
      if (!order.shipping_details) {
         // Try selected_options.shipping_details fallback if exists
         customerAddress = order.selected_options?.shipping_details;
      } else if (typeof order.shipping_details === 'string') {
        try {
          customerAddress = JSON.parse(order.shipping_details);
        } catch(e) {
          customerAddress = order.shipping_details;
        }
      } else {
        customerAddress = order.shipping_details;
      }

      if (!customerAddress || typeof customerAddress === 'string') {
        throw new Error("Dados de entrega incompletos ou em formato inválido.");
      }

      const response = await AliExpressService.placeOrder(order, customerAddress);
      
      // Check for API errors
      if (response.error_response) {
        const err = response.error_response;
        // Code 27 is IllegalAccessToken, but also check for msg
        if (err.code === 27 || err.msg?.toLowerCase().includes('token') || err.msg?.toLowerCase().includes('permission')) {
           toast.error("API Pendente: Por favor, faça a encomenda manualmente no portal do parceiro usando a morada do cliente.", { id: loadingToast, duration: 6000 });
           return;
        }
        throw new Error(err.msg || "Erro na API Global");
      }

      // Extrair Order ID retornado pelo AliExpress com fallbacks robustos
      let aliOrderId = "";
      const respKeys = [
        "aliexpress_trade_buy_placeorder_response",
        "aliexpress_ds_trade_buy_placeorder_response"
      ];
      
      for (const key of respKeys) {
        const resp = response[key];
        if (resp && resp.result) {
          const result = resp.result;
          if (result.order_id) {
            aliOrderId = String(result.order_id);
          } else if (result.order_id_list && result.order_id_list.length > 0) {
            aliOrderId = String(result.order_id_list[0]);
          } else if (result.data && result.data.order_id) {
             aliOrderId = String(result.data.order_id);
          }
        }
        if (aliOrderId) break;
      }
      
      if (!aliOrderId) {
        console.warn("[ALIEXPRESS] Ordem colocada mas ID não encontrado no retorno:", response);
        // Tentar busca genérica se falhar as chaves conhecidas
        for (const k in response) {
          if (response[k]?.result?.order_id) aliOrderId = String(response[k].result.order_id);
          if (aliOrderId) break;
        }
      }

      // Success: Update status in Supabase
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          status: 'processing_provider',
          shipping_status: 'preparing',
          provider: 'aliexpress',
          provider_order_id: aliOrderId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      toast.success("🎉 Pedido enviado para logística global com sucesso!", { id: loadingToast });
      
      // Update local state if viewing
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder({
          ...viewingOrder,
          status: 'processing_provider',
          shipping_status: 'preparing'
        } as any);
      }
      
      fetchDashboardData();
    } catch (error: any) {
      console.error("[ALIEXPRESS_FULFILL_ERROR]", error);
      toast.error(`Falha no Processamento: ${error.message}`, { id: loadingToast });
    }
  };

  const handleSyncStatus = async (orderId: string) => {
    try {
      const order = orders.find(o => o.id === orderId);
      const product = order?.product;
      const initialProvider = order?.provider || product?.provider || 'aliexpress';
      const initialLabel = initialProvider === 'aliexpress' ? 'Internacional' : 'Local';
      
      toast.loading(`Sincronizando com ${initialLabel} e Stripe...`, { id: "sync" });
      const res = await fetch(`/api/orders/${orderId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        }
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[Sync] Non-JSON response received:", text.substring(0, 200));
        
        if (text.toLowerCase().includes("failed to fetch") || !text) {
           throw new Error("Erro de conexão: O servidor não respondeu. Tente novamente em instantes.");
        }
        
        if (text.includes("Starting Server") || text.includes("Vite + React")) {
          throw new Error("O servidor ainda está iniciando ou reiniciando. Aguarde 5-10 segundos e tente novamente.");
        }
        throw new Error("Resposta inválida do servidor (HTML). Isto geralmente indica um erro de rota ou servidor em reinicialização.");
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        const errorMsg = data.message || data.error || "Erro na sincronização";
        const providerName = data.provider || initialLabel;
        toast.error(`${providerName}: ${errorMsg}`, { id: "sync", duration: 5000 });
        return;
      }
      
      const syncedMsg = data.synced ? "Dados atualizados!" : "Já estava sincronizado.";
      toast.success(`[${data.provider || initialLabel}] ${syncedMsg} Status: ${data.external_status || 'OK'}`, { id: "sync" });
      
      if (data.updatedOrder) {
        // Garantir que mantemos o objeto product que o front espera
        setOrders(prev => prev.map(o => o.id === orderId ? { 
            ...o, 
            ...data.updatedOrder, 
            // Preservar ID se vier do back mas as colunas podem variar
            provider_order_id: data.updatedOrder.provider_order_id || o.provider_order_id,
            product: o.product 
        } : o));
        
        if (viewingOrder && viewingOrder.id === orderId) {
          setViewingOrder({ 
            ...viewingOrder, 
            ...data.updatedOrder,
            provider_order_id: data.updatedOrder.provider_order_id || viewingOrder.provider_order_id
          });
        }
      }
      
      // Fechar para atualizar
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder(null);
      }
      
      fetchDashboardData();
    } catch (err: any) {
      console.error("[Sync Detail Error]", err);
      const msg = err.message || "";
      if (msg.includes('não vinculado') || msg.includes('PEDIDO_NAO_ENCONTRADO')) {
         const ord = orders.find(o => o.id === orderId);
         const provider = viewingOrder?.provider || ord?.provider || "Global";
         toast.info(`Atenção: Este pedido ainda não está vinculado ao fornecedor ${provider}. Tente "Enviar para ${provider}" primeiro ou verifique o estado do pedido no painel do fornecedor.`, { id: "sync", duration: 8000 });
      } else {
         toast.error(`Falha na Verificação: ${msg}`, { id: "sync", duration: 6000 });
      }
    }
  };

  const handleRetriggerEmail = async (orderId: string, type: string) => {
    try {
      toast.loading("A disparar e-mail de notificação...", { id: "retrigger" });
      const res = await fetch(`/api/admin/orders/${orderId}/resend-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ type })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao disparar e-mail");
      
      toast.success("E-mail disparado com sucesso!", { id: "retrigger" });
    } catch (err: any) {
      console.error("[Email Notification Error]", err);
      toast.error(`Falha ao disparar e-mail: ${err.message}`, { id: "retrigger" });
    }
  };

  const handleManualStatusUpdate = async (orderId: string, newStatus: string, newShippingStatus?: string, verifyWithStripe: boolean = false) => {
    const loadingToast = toast.loading('A atualizar estado administrativamente...');
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/manual-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ 
          status: newStatus, 
          shipping_status: newShippingStatus,
          verify_stripe: verifyWithStripe,
          tracking_code: manualTrackingCode,
          tracking_url: manualTrackingUrl,
          provider_order_id: manualProviderOrderId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar');

      toast.success(data.message || 'Estado atualizado com sucesso!', { id: loadingToast });
      
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder({ 
          ...viewingOrder, 
          status: newStatus, 
          shipping_status: newShippingStatus || viewingOrder.shipping_status,
          shipping_tracking_code: manualTrackingCode,
          shipping_tracking_url: manualTrackingUrl,
          provider_order_id: manualProviderOrderId
        } as any);
      }
      
      fetchDashboardData();
    } catch (error: any) {
      console.error("[Manual Update Error]", error);
      toast.error(`Falha: ${error.message}`, { id: loadingToast });
    }
  };

  const chartGridColor = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const chartAxisColor = theme === "dark" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const chartGold = "#D4AF37";
  const chartSecondary = theme === "dark" ? "#FFFFFF" : "#101010";

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-luxury-black text-white">
        <Loader2 className="animate-spin" size={48} strokeWidth={1} />
      </div>
    );
  }

  return (
    <div className={`admin-dashboard-wrapper theme-${localTheme} min-h-screen font-sans selection:bg-luxury-gold selection:text-black dark ${
      theme === "dark" 
        ? "bg-luxury-bg text-white" 
        : "bg-white text-black"
    }`}>
      {/* Admin Sidebar/Toprail */}
      <div className={`border-b backdrop-blur-xl sticky top-0 z-50 ${theme === 'dark' ? 'border-white/5 bg-black/50' : 'border-black/5 bg-white/50'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <button
              onClick={onBack}
              className="text-luxury-gold hover:opacity-70 transition-opacity"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-xl font-serif tracking-tight">
                S.art <span className="text-luxury-gold italic">Admin</span>
              </h1>
            </div>
          </div>

          <div className={`hidden sm:flex rounded-full p-1 border ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
            {(availableTabs as any[]).map((t) => (
              <button
                key={t}
                id={t === "users" ? "tab-users" : undefined}
                onClick={() => setTab(t)}
                className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group ${
                  tab === t
                    ? "bg-luxury-gold text-black font-semibold shadow-[0_10px_20px_rgba(212,175,55,0.2)]"
                    : theme === 'dark' ? "text-white/90 hover:text-white hover:bg-white/5" : "text-black/40 hover:text-black hover:bg-black/5"
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
                            : t === "coupons"
                            ? "Cupons"
                            : t === "pontuação"
                            ? "Pontuação"
                            : t === "api"
                            ? "Integração API"
                            : "Utilizadores"}
                  </span>
                  {t === "refunds" && <Undo2 size={12} className={theme === 'dark' ? "text-white/70" : "text-black/20"} />}
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

          <div className="flex items-center gap-2">
            {onNotificationClick && (
              <button
                onClick={onNotificationClick}
                className="relative p-2 rounded-full border border-luxury-gold/20 hover:border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold/10 transition-all cursor-pointer mr-1 flex items-center justify-center h-8 w-8 bg-white/5"
                title="Notificações da Loja"
              >
                <Bell size={14} className="stroke-[2.5]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white font-mono text-[9px] font-black rounded-full flex items-center justify-center px-1 animate-pulse border border-black shadow">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            {currentUserProfile?.is_admin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSiteSettingsOpen(true)}
                  className="border-luxury-gold/30 text-luxury-gold hover:bg-luxury-gold hover:text-black gap-2 h-8 text-[10px] uppercase font-bold tracking-widest hidden lg:flex"
                  title="Ajustar Design e Hero"
                >
                  <Settings size={12} /> Configurações
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSiteSettingsOpen(true)}
                  className="border-white/10 text-white hover:text-luxury-gold hover:border-luxury-gold/50 h-8 w-8 p-0 flex items-center justify-center transition-all bg-white/5 lg:hidden"
                  title="Configurações do Site"
                >
                  <Settings size={14} />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={sendTestEmail}
                  className={`border-black/10 dark:border-white/10 opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 gap-2 h-8 text-[10px] uppercase font-bold tracking-widest hidden md:flex ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                >
                  <FileText size={12} /> Testar E-mail
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className={`sm:hidden flex border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
          {(availableTabs as any[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-[9px] uppercase tracking-widest border-b-2 transition-all ${
                tab === t
                  ? "border-luxury-gold text-luxury-gold bg-luxury-gold/5 font-bold"
                  : theme === 'dark' ? "border-transparent text-white/90" : "border-transparent text-black/40"
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
                        : t === "coupons"
                          ? "Cupons"
                          : t === "api"
                          ? "API"
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
                className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:text-luxury-gold hover:bg-black/10 dark:hover:bg-white/10 text-[9px] uppercase tracking-widest h-8"
              >
                <RefreshCw size={12} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar Dados
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <Card id="stats-revenue" className="bg-luxury-dark border-black/5 dark:border-white/5 rounded-none p-6 md:p-8 hover:border-luxury-gold/30 transition-all duration-500 group">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-black/30 dark:text-white/85 group-hover:text-luxury-gold transition-colors">
                    Vendas Brutas
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-luxury-gold drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                    {formatPrice ? formatPrice(totalGrossRevenue) : `€${totalGrossRevenue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`}
                  </h3>
                  <div className="p-2 md:p-3 bg-luxury-gold/10 text-luxury-gold rounded-full border border-luxury-gold/20">
                    <TrendingUp size={18} />
                  </div>
                </div>
              </Card>

              <Card id="stats-refunds" className="bg-luxury-dark border-black/5 dark:border-white/5 rounded-none p-6 md:p-8 hover:border-red-500/30 transition-all duration-500 group">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-red-500 font-bold group-hover:text-red-400 transition-colors">
                    Total Reembolsado
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    {formatPrice ? formatPrice(totalRefunded) : `€${totalRefunded.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`}
                  </h3>
                  <div className="p-2 md:p-3 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
                    <XCircle size={18} />
                  </div>
                </div>
              </Card>

              <Card id="stats-profit" className="bg-luxury-dark border-black/5 dark:border-white/5 rounded-none p-6 md:p-8 sm:col-span-1 hover:border-emerald-500/30 transition-all duration-500 group border-l-4 border-l-emerald-500/20">
                <div className="p-0 pb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-black/30 dark:text-white/85 group-hover:text-emerald-400/50 transition-colors">
                    Lucro Líquido
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl md:text-5xl font-serif text-emerald-500 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                    {formatPrice ? formatPrice(netProfit) : `€${netProfit.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`}
                  </h3>
                  <div className="p-2 md:p-3 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20">
                    <ShieldCheck size={18} />
                  </div>
                </div>
              </Card>

              <Card id="stats-pending-refunds" className="bg-luxury-dark border-black/5 dark:border-white/5 rounded-none p-6 md:p-8 sm:col-span-1 hover:border-amber-500/30 transition-all duration-500 group border-l-4 border-l-amber-500/20">
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
                <div className="mt-4 text-[9px] uppercase tracking-widest text-black/30 dark:text-white/70">
                  Aguardando confirmação no separador "Reembolsos"
                </div>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-medium uppercase tracking-widest ${theme === 'dark' ? 'text-white' : 'text-black/50'}`}>
                  Fluxo de Desempenho
                </h3>
                <div className={`flex rounded-none p-1 border ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                  {(["weekly", "monthly", "yearly"] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-4 py-1.5 text-[8px] uppercase tracking-widest transition-all ${
                        timeRange === range
                          ? "bg-luxury-gold text-black font-bold"
                          : theme === 'dark' ? "text-white/90 hover:text-white" : "text-black/40 hover:text-black"
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
                  <div className={`text-[10px] uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-white/85' : 'text-black/30'}`}>
                    Faturamento por Período
                  </div>
                  <div className="h-[350px] w-full bg-luxury-dark/30 border border-black/5 dark:border-white/5 p-8 relative min-h-[350px] group">
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
                              stopColor={chartGold}
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor={chartGold}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke={chartGridColor}
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: chartAxisColor, fontSize: 10 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: chartAxisColor, fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{
                            stroke: "rgba(212,175,55,0.2)",
                            strokeWidth: 1,
                          }}
                          contentStyle={{
                            backgroundColor: theme === 'dark' ? "#0A0A0A" : "#FFFFFF",
                            border: theme === 'dark' ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
                            borderRadius: "0px",
                          }}
                          itemStyle={{
                            color: chartGold,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                          }}
                          labelStyle={{
                            color: theme === 'dark' ? "#fff" : "#000",
                            fontSize: "10px",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.2em",
                          }}
                          formatter={(value: number) => [renderPrice(value), "Faturamento"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={chartGold}
                          fillOpacity={1}
                          fill="url(#colorVal)"
                          strokeWidth={3}
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className={`text-[10px] uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-white/85' : 'text-black/30'}`}>
                    Volume de Transações
                  </div>
                  <div className="h-[350px] w-full bg-luxury-dark/30 border border-black/5 dark:border-white/5 p-8 relative min-h-[350px]">
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
                              stopColor={chartSecondary}
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor={chartSecondary}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke={chartGridColor}
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: chartAxisColor, fontSize: 10 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: chartAxisColor, fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{
                            stroke: theme === 'dark' ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                            strokeWidth: 1,
                          }}
                          contentStyle={{
                            backgroundColor: theme === 'dark' ? "#0A0A0A" : "#FFFFFF",
                            border: theme === 'dark' ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
                            borderRadius: "0px",
                          }}
                          itemStyle={{
                            color: chartSecondary,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                          }}
                          labelStyle={{
                            color: theme === 'dark' ? "#fff" : "#000",
                            fontSize: "10px",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.2em",
                          }}
                          formatter={(value: number) => [`${value} Vendas`, "Volume"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke={chartSecondary}
                          fillOpacity={1}
                          fill="url(#colorSales)"
                          strokeWidth={3}
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
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium uppercase tracking-widest text-white">
                  Últimas Transações
                </h3>
                <Button
                  onClick={syncAllPayments}
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/10 text-luxury-gold hover:bg-luxury-gold hover:text-black text-[9px] uppercase tracking-widest h-8 px-4"
                >
                  <RefreshCw size={12} className="mr-2" />
                  Sincronizar Pendentes
                </Button>
              </div>
            <div className="overflow-x-auto border border-black/5 dark:border-white/5 bg-luxury-dark/30">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className={`border-b ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                      <th id="th-orderid" className={`px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        ID Ordem
                      </th>
                      <th id="th-product" className={`px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Produto
                      </th>
                      <th id="th-client" className={`px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Cliente
                      </th>
                      <th id="th-details" className={`px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Detalhes
                      </th>
                      <th id="th-date" className={`px-6 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Data
                      </th>
                      <th id="th-value" className={`px-8 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Valor
                      </th>
                      <th id="th-status" className={`px-8 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Status
                      </th>
                      <th id="th-actions" className={`px-8 py-6 font-normal text-[10px] uppercase tracking-[0.2em] border-b hover:text-luxury-gold transition-colors duration-300 ${theme === 'dark' ? 'text-white/85 border-white/5' : 'text-black/30 border-black/5'}`}>
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme === 'dark' ? 'divide-white/5' : 'divide-black/5'}`}>
                    {orders.slice(0, 10).map((order) => (
                      <tr
                        key={order.id}
                        className={`${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-black/5'} transition-colors`}
                      >
                        <td className="px-6 py-4 font-mono text-[10px] opacity-95">
                          SART-{order.id.split('-')[0].toUpperCase()}
                        </td>
                        <td className="px-6 py-4 font-serif">
                          {order.product?.title || "Produto Removido"}
                        </td>
                        <td className="px-6 py-4 opacity-60">
                          {order.customer_email}
                        </td>
                        <td className="px-6 py-4 opacity-95">
                          <Button 
                            variant="ghost" 
                            onClick={() => setViewingOrder(order)}
                            className="h-6 px-3 text-[8px] uppercase tracking-widest text-luxury-gold hover:bg-luxury-gold/10 hover:text-white border border-luxury-gold/20"
                          >
                            Ver Detalhes
                          </Button>
                        </td>
                        <td className="px-6 py-4 opacity-95">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>

                        <td className="px-6 py-4 font-medium">
                          {renderPrice(Number(order.total_amount))}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-widest font-bold ${
                              (order.status === "refunded" || order.payment_status === "refunded" || order.status === "reembolsado")
                                ? "bg-red-500/10 text-red-500"
                                : (activeStatuses.includes(order.status?.toLowerCase() || "") || order.payment_status === "paid")
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : ["refund_requested", "refund_pending"].includes(order.status || "")
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-amber-500/10 text-amber-500"
                            }`}
                          >
                            {(order.status === "refunded" || order.payment_status === "refunded" || order.status === "reembolsado") ? (
                              <>
                                <XCircle size={8} className="mr-1" />{" "}
                                Reembolsado
                              </>
                            ) : (activeStatuses.includes(order.status?.toLowerCase() || "") || order.payment_status === "paid") ? (
                              <>
                                <CheckCircle size={8} className="mr-1" />{" "}
                                Liquidado
                              </>
                            ) : ["refund_requested", "refund_pending"].includes(order.status || "") ? (
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
                        <td className="px-8 py-4">
                          {!activeStatuses.includes(order.status?.toLowerCase() || "") && order.status !== "refunded" && (
                            <Button
                              variant="outline"
                              size="sm"
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
                                  if (data.success) {
                                    toast.success(data.message || 'Sincronizado!');
                                    fetchDashboardData();
                                  } else {
                                    toast.info(data.message || 'Sem alterações.');
                                  }
                                } catch (e) {
                                  toast.error('Erro de conexão.');
                                }
                              }}
                              className="h-7 w-7 p-0 bg-white/5 border-white/10 hover:bg-luxury-gold hover:text-black rounded-none"
                              title="Sincronizar"
                            >
                              <RefreshCw size={12} />
                            </Button>
                          )}
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
                <div className="text-[10px] uppercase tracking-widest opacity-80 mt-2">
                  Adicione ou edite e-books exclusivos
                </div>
              </div>
              <Button
                onClick={() => setIsProductCreateModalOpen(true)}
                className="w-full sm:w-auto bg-luxury-gold text-black hover:bg-black hover:text-white rounded-none h-12 px-8 uppercase tracking-widest text-[10px] font-bold transition-all"
              >
                <Plus size={16} className="mr-2" /> Criar Produto
              </Button>
            </div>

            {/* Search and Category Management */}
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome ou categoria..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-12 py-3 text-sm outline-none focus:border-luxury-gold transition-all"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-luxury-gold text-luxury-gold text-[10px] uppercase tracking-widest h-12 px-6"
                >
                  Gerir Categorias
                </Button>

                <Button
                  variant="outline"
                  onClick={handleSyncAllAliExpress}
                  disabled={isSyncingAllAliExpress}
                  className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-orange-500 text-orange-500 text-[10px] uppercase tracking-widest h-12 px-6 flex items-center gap-2"
                >
                  {isSyncingAllAliExpress ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Sincronizar Global
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleResyncCategories}
                  title="Sincronizar categorias a partir da lista de produtos"
                  className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-white text-white/90 text-[10px] uppercase tracking-widest h-12 w-12 p-0 flex items-center justify-center transition-all"
                >
                  <RefreshCcw size={14} />
                </Button>
                
                <div className="flex rounded-none p-1 border border-black/5 dark:border-white/5 bg-black/5 dark:border-white/5 h-12 items-center">
                  {(["all", "featured", "standard"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setProductFeaturedFilter(mode)}
                      className={`px-4 py-1.5 h-full text-[8px] uppercase tracking-widest transition-all ${
                        productFeaturedFilter === mode
                          ? "bg-luxury-gold text-black font-bold shadow-lg"
                          : "text-white/90 hover:text-white"
                      }`}
                    >
                      {mode === "all" ? "Todos" : mode === "featured" ? "Destaques" : "Loja Base"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Category Management Modal */}
            {isCategoryModalOpen && (
              <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
                <Card className="max-w-md w-full bg-[#050505] border-luxury-gold/30 rounded-none p-6 md:p-10 space-y-6 md:space-y-8 animate-in zoom-in-95 duration-300 relative my-auto">
                  <div className="flex justify-between items-center border-b border-white/10 pb-6 shrink-0 pt-4 md:pt-0">
                    <h3 className="text-xl md:text-2xl font-serif text-luxury-gold italic">Gestão de Coleções</h3>
                    <button 
                      onClick={() => {
                        setIsCategoryModalOpen(false);
                        setEditingCategoryId(null);
                      }}
                      className="p-2 hover:bg-white/5 transition-colors absolute top-4 right-4 md:relative md:top-0 md:right-0"
                    >
                      <X size={20} className="text-white/90 hover:text-white transition-colors" />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="text-[10px] uppercase tracking-[0.4em] text-luxury-gold font-black">Adicionar à Boutique</label>
                    <div className="flex gap-2">
                      <input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="NOME DA CATEGORIA..."
                        className="flex-1 bg-white/[0.03] border border-white/10 px-5 py-3 text-[11px] uppercase tracking-widest outline-none focus:border-luxury-gold transition-all text-white"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                      />
                      <Button onClick={handleAddCategory} className="bg-luxury-gold text-black hover:bg-white rounded-none h-12 px-6 transition-all duration-500 font-black">
                        <Plus size={18} />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-6 pt-6">
                    <label className="text-[10px] uppercase tracking-[0.4em] text-white/85 font-bold block">Categorias Ativas</label>
                    <div className="max-h-[300px] md:max-h-[400px] overflow-y-auto space-y-3 pr-2 luxury-scrollbar">
                      {categories.map((cat) => (
                        <div key={cat.id} className="flex justify-between items-center bg-white/[0.02] p-4 group border border-white/5 hover:border-luxury-gold/40 transition-all duration-500">
                          {editingCategoryId === cat.id ? (
                            <div className="flex gap-2 w-full animate-in slide-in-from-left-4 duration-300">
                              <input
                                value={editingCategoryName}
                                onChange={(e) => setEditingCategoryName(e.target.value)}
                                className="flex-1 bg-black/60 border border-luxury-gold px-4 py-2 text-[11px] uppercase tracking-widest outline-none text-white font-bold"
                                autoFocus
                                onKeyPress={(e) => e.key === 'Enter' && handleUpdateCategory(cat.id)}
                              />
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleUpdateCategory(cat.id)}
                                  className="bg-emerald-500 text-white p-2.5 hover:bg-emerald-400 transition-all shadow-lg"
                                  title="Confirmar Edição"
                                >
                                  <Check size={18} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setEditingCategoryId(null);
                                    setEditingCategoryName("");
                                  }}
                                  className="bg-red-500/20 text-red-500 p-2.5 hover:bg-red-500 hover:text-white transition-all"
                                  title="Cancelar"
                                >
                                  <X size={18} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col">
                                <span className="text-[11px] uppercase tracking-[0.2em] text-white/90 font-medium">{cat.name}</span>
                              </div>
                              <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                                <button 
                                  onClick={() => {
                                    setEditingCategoryId(cat.id);
                                    setEditingCategoryName(cat.name);
                                  }}
                                  className="text-luxury-gold bg-luxury-gold/10 p-2 border border-luxury-gold/20 hover:bg-luxury-gold hover:text-black transition-all"
                                  title="Editar"
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  onClick={() => setCategoryToDelete(cat)}
                                  className="text-red-500 bg-red-500/10 p-2 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {categories.length === 0 && (
                        <div className="py-12 flex flex-col items-center justify-center opacity-20 bg-white/[0.01] border border-dashed border-white/10">
                          <Plus size={24} className="mb-2" />
                          <p className="text-[9px] uppercase tracking-[0.3em]">Vazio</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Category Delete Confirmation Overlay */}
                {categoryToDelete && (
                  <div className="absolute inset-0 bg-black/98 z-[80] flex flex-col items-center justify-center p-6 md:p-12 text-center animate-in fade-in zoom-in duration-500">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 md:mb-8 border border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                      <Trash2 size={32} className="text-red-500" />
                    </div>
                    <h4 className="text-2xl md:text-3xl font-serif text-white mb-4 italic">Confirmar Exclusão?</h4>
                    <p className="text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-white/90 mb-8 md:mb-10 max-w-sm leading-loose">
                      Tem a certeza absoluta que deseja eliminar a categoria <span className="text-luxury-gold font-black">"{categoryToDelete.name}"</span>?<br/>
                      <span className="text-red-500/50 mt-2 block">Produtos associados serão mantidos, mas a categoria será removida.</span>
                    </p>
                    <div className="flex gap-4 w-full max-w-xs">
                      <Button 
                        variant="outline" 
                        onClick={() => setCategoryToDelete(null)}
                        className="flex-1 border-white/20 text-white/60 hover:text-white h-12 md:h-14 text-[9px] md:text-[10px] uppercase tracking-[0.4em] rounded-none hover:bg-white/5 transition-all"
                      >
                        Manter
                      </Button>
                      <Button 
                        onClick={() => handleDeleteCategory(categoryToDelete.id)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white h-12 md:h-14 text-[9px] md:text-[10px] uppercase tracking-[0.4em] rounded-none shadow-2xl transition-all"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}



            {/* Sincronização Cloud (Internacional) */}
            <div className="bg-black/60 border border-luxury-gold/10 p-8 rounded-[2rem] space-y-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-luxury-gold/5 blur-[80px] rounded-full -mr-32 -mt-32 group-hover:bg-luxury-gold/10 transition-colors duration-700" />
              
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="max-w-md space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-luxury-gold/10 rounded-xl">
                      <Zap className="w-5 h-5 text-luxury-gold" />
                    </div>
                    <div>
                      <h3 className="text-lg font-serif text-white italic">International AliExpress Sync</h3>
                      <p className="text-[10px] uppercase tracking-widest text-luxury-gold font-bold">Importação via Link ou ID</p>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Importe produtos diretamente de estoques internacionais do AliExpress. Cole o link do produto ou apenas o ID numérico.
                    O sistema extrairá automaticamente a descrição, galeria de imagens e preços base com as vossas margens.
                  </p>
                </div>

                <div className="flex w-full md:w-auto gap-3 items-center min-w-[320px]">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-luxury-gold/30" />
                    <input
                      type="text"
                      placeholder="ID: 100500... ou Link"
                      value={importAliExpressId}
                      onChange={(e) => setImportAliExpressId(e.target.value)}
                      className="w-full h-14 bg-white/[0.03] border border-white/5 rounded-xl pl-12 pr-6 text-white font-mono text-[10px] tracking-widest outline-none focus:border-luxury-gold/30 transition-all"
                    />
                  </div>
                  <Button
                    onClick={handleImportAliExpress}
                    disabled={importing || !importAliExpressId}
                    className="h-14 px-8 bg-luxury-gold hover:bg-luxury-gold/80 text-black rounded-xl font-bold uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-lg shadow-luxury-gold/20"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : "Sincronizar"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Creation Modal */}
            {isProductCreateModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setIsProductCreateModalOpen(false)} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative w-full max-w-2xl bg-[#050505] border border-white/10 p-1 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)]"
                >
                  <div className="bg-black/50 p-8 md:p-12 rounded-[2rem] space-y-10">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-3xl font-serif text-white italic">Novo Produto</h3>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/85 font-medium mt-2">Selecione a origem logística para criação manual</p>
                      </div>
                      <button onClick={() => setIsProductCreateModalOpen(false)} className="text-white/70 hover:text-white transition-colors">
                        <X size={24} />
                      </button>
                    </div>

                    <div className="space-y-10">
                      <div className="flex items-center justify-between">
                        <div className="px-4 py-1.5 rounded-full border text-[9px] uppercase tracking-[0.2em] font-black bg-luxury-gold/10 border-luxury-gold/30 text-luxury-gold">
                          International Mode
                        </div>
                      </div>

                      <div className="space-y-4">
                        <p className="text-[10px] uppercase tracking-widest text-white/90 font-bold ml-1">Sincronização Automática (Recomendado)</p>
                        <div className="flex flex-col md:flex-row gap-3">
                           <div className="relative flex-1">
                             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" />
                             <input
                              type="text"
                              placeholder="Link ou ID Internacional..."
                              value={importAliExpressId}
                              onChange={(e) => setImportAliExpressId(e.target.value)}
                              className="w-full h-14 bg-white/[0.03] border border-white/5 rounded-xl pl-12 pr-6 text-white font-mono text-[11px] outline-none focus:border-luxury-gold/30 transition-all"
                            />
                           </div>
                           <div className="relative w-full md:w-32">
                             <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-luxury-gold/40" />
                             <input
                              type="number"
                              step="0.01"
                              placeholder="Margem"
                              value={importMarkup}
                              onChange={(e) => setImportMarkup(parseFloat(e.target.value) || 0)}
                              className="w-full h-14 bg-luxury-gold/5 border border-luxury-gold/20 rounded-xl pl-12 pr-4 text-luxury-gold font-mono text-[11px] outline-none focus:border-luxury-gold/40 transition-all"
                              title="Valor fixo que será somado ao preço de custo"
                            />
                           </div>
                          <Button
                            onClick={handleImportAliExpress}
                            disabled={importing || !importAliExpressId}
                            className="h-14 px-8 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all bg-luxury-gold text-black hover:bg-luxury-gold/80"
                          >
                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Extrair"}
                          </Button>
                        </div>
                        <p className="text-[8px] text-luxury-gold/40 uppercase tracking-[0.2em] ml-1 font-bold">
                          Dica: A margem de {renderPrice(importMarkup)} será somada automaticamente ao preço base do AliExpress.
                        </p>
                      </div>

                      <div className="relative h-px bg-white/5 flex items-center justify-center">
                        <span className="bg-black px-4 text-[9px] uppercase tracking-[0.3em] text-white/70 font-bold">Ou Criar Manualmente</span>
                      </div>

                      <div className="max-h-[50vh] overflow-y-auto luxury-scrollbar pr-2 pt-2">
                        <CreateManualProduct 
                          userId={user.id}
                          onSuccess={() => {
                            fetchProducts();
                            setIsProductCreateModalOpen(false);
                            setCreationSupplier(null);
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full py-20 text-center border border-dashed border-white/10">
                  <ShoppingBag className="mx-auto text-white/10 mb-4" size={48} />
                  <p className="text-white/90 text-sm italic">Nenhum produto encontrado.</p>
                  <p className="text-white/70 text-[10px] uppercase tracking-widest mt-2">
                    Ajuste os filtros.
                  </p>
                </div>
              ) : filteredProducts.map((p) => (
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

                    <div className="absolute inset-0 bg-black/60 opacity-0 md:group-hover:opacity-100 transition-opacity hidden md:flex items-center justify-center gap-2">
                       <Button
                        variant="outline"
                        className="border-white/20 rounded-none h-8 w-8 p-0 text-[10px] uppercase tracking-widest hover:bg-white hover:text-black"
                        onClick={() => handleVerifyProduct(p)}
                        title="Verificar Estoque/Link"
                        disabled={verifying === p.id}
                      >
                        {verifying === p.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/20 rounded-none h-8 w-8 p-0 text-[10px] uppercase tracking-widest hover:bg-white hover:text-black"
                        onClick={() => setEditingProduct(p)}
                        title="Editar Produto"
                      >
                        <Edit size={12} />
                      </Button>
                      {(currentUserProfile?.is_admin || currentUserProfile?.is_employee) && (
                        <Button
                          variant="outline"
                          className="border-white/20 rounded-none h-8 w-8 p-0 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white"
                          onClick={() => handleDeleteProduct(p)}
                          title="Eliminar Produto"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-serif text-sm truncate flex-1">
                        {p.title}
                      </h3>
                      <span className="bg-luxury-gold text-black text-[7px] uppercase font-bold px-1 py-0.5 rounded-sm">
                        Curadoria
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex justify-between items-center">
                        <div className="flex items-baseline gap-1.5">
                          <div className="text-luxury-gold text-xs font-bold font-mono">
                            {renderPrice(p.discount_percent && p.discount_percent > 0 ? Number(p.pvp || 0) * (1 - p.discount_percent / 100) : Number(p.pvp || 0))}
                          </div>
                          {p.discount_percent && p.discount_percent > 0 ? (
                            <span className="text-[8px] text-red-400 font-bold font-mono bg-red-500/10 px-1 rounded">
                              -{p.discount_percent}%
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          {p.metadata?.base_price && (
                            <span className="text-[7px] text-white/70 uppercase font-medium">
                              Base: {renderPrice(Number(p.metadata.base_price))}
                            </span>
                          )}
                          {p.admin_link && (
                            <a
                              href={p.admin_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[8px] text-white/85 hover:text-luxury-gold uppercase tracking-widest flex items-center gap-1"
                            >
                              <ExternalLink size={8} /> Gestão
                            </a>
                          )}
                        </div>
                      </div>
                      {p.price_markup > 0 && (
                        <div className="text-[7px] text-orange-500/60 uppercase font-medium mt-0.5">
                          Markup: +{renderPrice(Number(p.price_markup))}
                        </div>
                      )}
                      {p.free_shipping ? (
                        <div className="text-[7px] text-blue-500/80 uppercase font-bold mt-1 tracking-widest bg-blue-500/10 w-fit px-1">
                          Envio Grátis
                        </div>
                      ) : (
                        <div className="text-[7px] text-white/70 uppercase font-medium mt-1 tracking-widest">
                          +{renderPrice(1.15)} Envio
                        </div>
                      )}

                      {/* Ações Visíveis em Telas Menores / Touch */}
                      <div className="flex items-center gap-1 pt-2 mt-2 border-t border-white/10 md:hidden">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-white/20 rounded-none h-7 px-1 text-[9px] uppercase tracking-wider bg-white/5 hover:bg-white hover:text-black text-white flex items-center justify-center gap-1"
                          onClick={() => handleVerifyProduct(p)}
                          title="Verificar Estoque/Link"
                          disabled={verifying === p.id}
                        >
                          {verifying === p.id ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
                          <span className="truncate">Verificar</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-white/20 rounded-none h-7 px-1 text-[9px] uppercase tracking-wider bg-white/5 hover:bg-white hover:text-black text-white flex items-center justify-center gap-1"
                          onClick={() => setEditingProduct(p)}
                          title="Editar Produto"
                        >
                          <Edit size={10} />
                          <span className="truncate">Editar</span>
                        </Button>
                        {(currentUserProfile?.is_admin || currentUserProfile?.is_employee) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-500/30 rounded-none h-7 px-2 text-[9px] uppercase tracking-wider bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center"
                            onClick={() => handleDeleteProduct(p)}
                            title="Eliminar Produto"
                          >
                            <Trash2 size={10} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Product Editor Inline (Full Screen/Wide Overlap) */}

            {editingProduct && (
              <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                <Card className="max-w-4xl w-full bg-[#050505] border border-white/10 rounded-none p-6 md:p-12 space-y-6 md:space-y-8 animate-in zoom-in-95 duration-500 my-auto shadow-[0_0_100px_rgba(0,0,0,1)] max-h-[95vh] overflow-y-auto luxury-scrollbar">
                  <div className="flex justify-between items-center sticky top-0 bg-[#050505] z-10 pb-4">
                    <h3 className="text-2xl md:text-3xl font-serif">
                      {editingProduct.id ? "Editar Produto" : "Novo Produto"}
                    </h3>
                    <button
                      onClick={() => setEditingProduct(null)}
                      className="text-white/85 hover:text-white p-2"
                    >
                      <XCircle size={24} />
                    </button>
                  </div>

                  <div className="flex bg-[#111] p-4 border border-white/20 self-start">
                    <p className="text-[10px] uppercase tracking-widest text-luxury-gold font-bold">Logística Física (S.art Curatorship)</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                    <div className="space-y-4 md:space-y-6">
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
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
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
                          Fornecedor ID: International Code
                        </label>
                        <input
                          value={editingProduct.aliexpress_id || ""}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              aliexpress_id: e.target.value,
                            })
                          }
                          className="w-full bg-transparent border-b border-white/10 py-2 md:py-4 text-xs md:text-sm outline-none focus:border-luxury-gold transition-colors font-mono"
                          placeholder="ID original do produto"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
                          Referência Logística (SKU)
                        </label>
                        <input
                          value={editingProduct.sku || ""}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              sku: e.target.value,
                            })
                          }
                          className="w-full bg-transparent border-b border-white/10 py-2 md:py-4 text-xs md:text-sm outline-none focus:border-luxury-gold transition-colors font-mono"
                          placeholder="Ex: SKU-123..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
                          Fornecedor Ativo (Provider)
                        </label>
                        <select 
                          value={editingProduct.provider || "aliexpress"}
                          onChange={(e) => setEditingProduct({ ...editingProduct, provider: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 p-2 text-xs md:text-sm uppercase text-white outline-none focus:border-luxury-gold"
                        >
                          <option value="aliexpress">Global (International)</option>

                          <option value="none">Nenhum / Manual</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
                              Preço de Venda
                            </label>
                            {editingProduct.metadata?.base_price && (
                              <span className="text-[8px] text-white/90 uppercase font-bold">
                                Fornecedor: {renderPrice(Number(editingProduct.metadata.base_price))}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            value={
                              isNaN(editingProduct.pvp) ||
                              editingProduct.pvp === undefined
                                ? ""
                                : editingProduct.pvp
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              const numVal = val === "" ? 0 : roundValue(parseFloat(val));
                              setEditingProduct({
                                ...editingProduct,
                                pvp: numVal,
                                price: numVal
                              });
                            }}
                            className="w-full bg-transparent border-b border-white/10 py-2 md:py-4 text-lg md:text-xl outline-none focus:border-luxury-gold transition-colors font-mono"
                            placeholder="0.00"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
                              Margem Global
                            </label>
                            <div className="flex items-center gap-2">
                               {editingProduct.metadata?.base_price && (
                                 <button 
                                   onClick={() => {
                                     const base = Number(editingProduct.metadata.base_price || 0);
                                     const markup = Number(editingProduct.price_markup || 0);
                                     const suggested = roundValue(base + markup);
                                     setEditingProduct({
                                       ...editingProduct,
                                       pvp: suggested,
                                       price: suggested
                                     });
                                     toast.success(`Preço sugerido aplicado: ${renderPrice(suggested)}`);
                                   }}
                                   className="text-[8px] bg-luxury-gold/10 hover:bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30 px-2 py-0.5 uppercase font-bold transition-all"
                                 >
                                   Sugerir Preço
                                 </button>
                               )}
                               {editingProduct.last_aliexpress_sync && (
                                 <span className="text-[8px] text-orange-500 uppercase font-bold">
                                   Sync: {format(new Date(editingProduct.last_aliexpress_sync), "dd/MM/yyyy HH:mm")}
                                 </span>
                               )}
                            </div>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            value={editingProduct.price_markup || 0}
                            onChange={(e) => {
                              const val = e.target.value;
                              const numVal = val === "" ? 0 : roundValue(parseFloat(val));
                              
                              // Automatically update PVP if base_price exists
                              const basePrice = Number(editingProduct.metadata?.base_price || 0);
                              const updatedPvp = basePrice > 0 ? roundValue(basePrice + numVal) : editingProduct.pvp;

                              setEditingProduct({
                                ...editingProduct,
                                price_markup: numVal,
                                pvp: updatedPvp,
                                price: updatedPvp
                              });
                            }}
                            className="w-full bg-transparent border-b border-white/10 py-2 md:py-4 text-lg md:text-xl outline-none focus:border-orange-500 transition-colors font-mono text-orange-500"
                            placeholder="Valor a somar ao preço base"
                          />
                          <p className="text-[8px] text-white/70 uppercase tracking-widest leading-relaxed">
                            Este valor será somado ao preço original de importação durante a sincronização automática.
                          </p>
                        </div>

                        <div className="space-y-2 col-span-1 md:col-span-2 bg-amber-500/5 p-4 border border-amber-500/20 rounded-md">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
                              <Tag size={12} className="text-amber-400" />
                              Desconto de Promoção (%)
                            </label>
                            {editingProduct.discount_percent !== undefined && Number(editingProduct.discount_percent) > 0 && (
                              <span className="text-[9px] text-amber-300 font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                                Preço Final c/ Desconto: {renderPrice(Number(editingProduct.pvp || 0) * (1 - Number(editingProduct.discount_percent) / 100))}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={
                              editingProduct.discount_percent === undefined || editingProduct.discount_percent === null
                                ? ""
                                : editingProduct.discount_percent
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              const numVal = val === "" ? 0 : Math.min(100, Math.max(0, parseFloat(val)));
                              setEditingProduct({
                                ...editingProduct,
                                discount_percent: numVal,
                              });
                            }}
                            className="w-full bg-transparent border-b border-amber-500/40 py-2 text-lg outline-none focus:border-amber-400 transition-colors font-mono text-amber-300"
                            placeholder="Ex: 5 (% de desconto)"
                          />
                          <p className="text-[8px] text-amber-200/70 uppercase tracking-widest leading-relaxed">
                            Insira a porcentagem de desconto (ex: 5 para 5%). O produto exibirá a etiqueta animada "OFF" na loja e no carrinho.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
                          Categoria
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4 bg-black/40 border border-white/5 max-h-48 overflow-y-auto luxury-scrollbar">
                          {allAvailableCategories.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setEditingProduct({ ...editingProduct, category: cat })}
                              className={`px-3 py-2 text-[10px] uppercase tracking-widest border transition-all ${
                                editingProduct.category === cat
                                  ? "border-luxury-gold bg-luxury-gold/20 text-luxury-gold font-bold shadow-[0_0_15px_rgba(212,175,55,0.2)]"
                                  : "border-white/5 text-white/85 hover:border-white/20 hover:text-white"
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90">
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

                      <div className="flex items-center justify-between p-4 bg-[#111] border border-white/10 rounded-sm">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-white block mb-1">
                            Disponível para Compra?
                          </label>
                          <p className="text-[8px] text-white/90 uppercase tracking-widest">
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

                      <div className="flex items-center justify-between p-4 bg-[#111] border border-white/10 rounded-sm">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-white block mb-1">
                            Produto em Destaque?
                          </label>
                          <p className="text-[8px] text-white/90 uppercase tracking-widest">
                            Aparecerá na seção VIP do topo da loja.
                          </p>
                        </div>
                        <button
                          onClick={() => setEditingProduct({ ...editingProduct, is_featured: !editingProduct.is_featured })}
                          className={`w-10 h-5 relative rounded-full transition-colors ${editingProduct.is_featured ? "bg-luxury-gold" : "bg-white/10"}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.is_featured ? "left-6" : "left-1"}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-[#111] border border-white/10 rounded-sm">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-white block mb-1">
                            Envio Grátis?
                          </label>
                          <p className="text-[8px] text-white/90 uppercase tracking-widest">
                            Se ativo, o cliente não pagará a taxa de {renderPrice(1.15)}.
                          </p>
                        </div>
                        <button
                          onClick={() => setEditingProduct({ ...editingProduct, free_shipping: !editingProduct.free_shipping })}
                          className={`w-10 h-5 relative rounded-full transition-colors ${editingProduct.free_shipping ? "bg-blue-500" : "bg-white/10"}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.free_shipping ? "left-6" : "left-1"}`} />
                        </button>
                      </div>

                      <div className="space-y-6 p-6 bg-[#111] border border-white/10 rounded-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-3 gap-3">
                            <div className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-bold flex items-center gap-2">
                              <div className="w-1 h-1 bg-luxury-gold rounded-full" />
                              Configuração do Ativo
                            </div>
                            <button
                              type="button"
                              onClick={handleOrganizeWithAI}
                              disabled={aiOrganizing}
                              className={`text-[9px] uppercase tracking-wider font-bold py-1.5 px-3 border border-luxury-gold/50 rounded-sm transition-all focus:outline-none flex items-center justify-center gap-1.5 ${
                                aiOrganizing 
                                  ? "bg-white/5 text-white/90 border-white/10 cursor-not-allowed" 
                                  : "text-luxury-gold hover:bg-luxury-gold hover:text-black hover:border-luxury-gold"
                              }`}
                            >
                              {aiOrganizing ? (
                                <>
                                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Organizando...
                                </>
                              ) : (
                                <>
                                  <span className="text-[11px]">✨</span> Organizar com IA (Mais Leve)
                                </>
                              )}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-3 bg-black border border-white/5 rounded-sm">
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
                              <div className="space-y-1 ml-2">
                                <label className="text-[8px] uppercase text-white/85 tracking-widest pl-1">
                                  Lista de Tamanhos {editingProduct.sizes_enabled ? "(Ativa na Loja)" : "(Inativa na Loja)"}
                                </label>
                                <input
                                  value={Array.isArray(editingProduct.sizes) ? editingProduct.sizes.join(', ') : (editingProduct.sizes || "")}
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
                            </div>

                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-3 bg-black border border-white/5 rounded-sm">
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
                              <div className="space-y-1 ml-2">
                                <label className="text-[8px] uppercase text-white/85 tracking-widest pl-1">
                                  Opções de Cores {editingProduct.colors_enabled ? "(Ativas na Loja)" : "(Inativas na Loja)"}
                                </label>
                                <input
                                  value={Array.isArray(editingProduct.colors) ? editingProduct.colors.join(', ') : (editingProduct.colors || "")}
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
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                             <label className="text-[9px] uppercase tracking-widest text-white/90 block">
                               Link de Gestão Externa (Shopify/Externo/etc)
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
                                 placeholder="https://..."
                               />
                               <ExternalLink
                                 size={12}
                                 className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 group-focus-within:text-luxury-gold"
                               />
                             </div>
                           </div>

                           <div className="space-y-3">
                             <label className="text-[9px] uppercase tracking-widest text-white/90 block">
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
                             {editingProduct.extra_images && (
                               <div className="grid grid-cols-5 gap-2 mt-2">
                                 {editingProduct.extra_images.split(',').filter(url => url.trim()).map((url, i) => (
                                   <div key={i} className="aspect-square border border-white/10 relative group">
                                     <img 
                                       src={getImageUrl(url.trim())} 
                                       alt={`Gallery ${i}`} 
                                       className="w-full h-full object-cover"
                                       referrerPolicy="no-referrer"
                                     />
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                      </div>
                    </div>

                    <div className="space-y-6 md:space-y-8">
                       <div className="grid grid-cols-1 gap-6">
                         <div className="space-y-3">
                           <label className="text-[9px] md:text-[10px] uppercase tracking-widest text-white/90 block">
                             Foto Principal (Capa)
                           </label>
                           <label
                             htmlFor="image-upload"
                             className="relative block aspect-[4/5] border border-white/10 hover:border-luxury-gold cursor-pointer transition-all overflow-hidden bg-black"
                          >
                            {editingProduct.image_url ? (
                              <img
                                src={getImageUrl(editingProduct.image_url)}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
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

                       </div>
                    </div>
                  </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] uppercase tracking-widest text-white/90">
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
              <p className="text-[10px] uppercase tracking-widest text-white/85 mt-2">
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
              <Button
                variant="outline"
                onClick={syncAllPayments}
                className="h-auto px-6 text-[9px] uppercase tracking-widest font-black border-luxury-gold/30 text-luxury-gold hover:bg-luxury-gold/10"
              >
                <RefreshCw size={14} className="mr-2" />
                Sincronizar Tudo
              </Button>
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

            <div className="overflow-x-auto border border-white/5 bg-luxury-dark/30 luxury-scrollbar">
              <table className="w-full text-left text-sm min-w-[1200px]">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      ID da Ordem
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      Produto Adquirido
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      Email do Cliente
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      Detalhes
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      Data de Venda
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      Total
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
                      Progresso Logístico
                    </th>
                    <th className="px-8 py-6 font-normal text-[10px] uppercase tracking-widest text-white/85">
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
                      <td className="px-8 py-6 font-mono text-[10px] text-white/90">
                        SART-{order.id.split('-')[0].toUpperCase()}
                      </td>
                      <td className="px-8 py-6">
                        <div className="font-serif text-base flex items-center gap-2 truncate max-w-[150px] md:max-w-[250px]" title={order.product?.title}>
                          {order.product?.title || "Expurgado"}
                          <div className="flex items-center gap-2 ml-2">
                            {order.product?.admin_link && (
                              <a href={order.product.admin_link} target="_blank" rel="noopener noreferrer" className="text-luxury-gold hover:text-white transition-colors" title="Acessar link do produto (Fornecedor)">
                                <ExternalLink size={12} />
                              </a>
                            )}
                            <a href={`/product/${order.product_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-white transition-colors" title="Ver produto na loja (Público)">
                              <ShoppingBag size={12} />
                            </a>
                          </div>
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
                        <div className="text-[9px] uppercase tracking-widest text-white/70 mt-1 flex items-center gap-2 flex-wrap">
                          <span>Ref: {order.product_id?.slice(0, 8) || "N/A"}</span>
                          {order.provider_order_id && (
                            <>
                              <span className="text-white/10">|</span>
                              <span className="text-luxury-gold/70 font-bold bg-luxury-gold/5 px-1.5 py-0.5 rounded border border-luxury-gold/10">
                                ALI: {order.provider_order_id}
                              </span>
                            </>
                          )}
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
                      <td className="px-8 py-6 text-white/90">
                        {order.created_at ? format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}
                      </td>

                      <td className="px-8 py-6 font-medium text-lg">
                        {renderPrice(Number(order.total_amount))}
                      </td>
                      <td className="px-8 py-6">
                        {order.product?.product_type === "digital" ? (
                          <span className="text-emerald-500 font-bold text-[9px] uppercase tracking-widest inline-block py-1">
                            Sem Logística (Digital)
                          </span>
                        ) : (order.provider_order_id || (order.shipping_status && order.shipping_status !== 'pending') || order.shipping_status_metadata?.manual_update || order.shipping_status_metadata?.trackingNumber) ? (
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] uppercase font-black ${
                              order.shipping_status === "delivered" ? "text-emerald-500" :
                              order.status === "pending" ? "text-gray-200" :
                              order.shipping_status === "sent" ? "text-blue-500" :
                              order.shipping_status === "incident" ? "text-orange-500" :
                              order.shipping_status === "lost" ? "text-red-700" :
                              "text-amber-500"
                            }`}>
                              {order.shipping_status === 'delivered' ? 'Entregados' : 
                               order.shipping_status === 'sent' ? 'Em Trânsito' :
                               order.shipping_status === 'out_for_delivery' ? 'Em Entrega' :
                               order.shipping_status === 'preparing' ? 'Em Preparação' :
                               order.shipping_status === 'ready' ? 'Preparados' :
                               order.shipping_status === 'confirmed' ? 'Confirmados' :
                               order.shipping_status === 'pending_confirmation' ? 'Pend. de Confirmação' :
                               order.shipping_status === 'incident' ? 'Com Incidente' :
                               order.shipping_status === 'rejected' ? 'Rejeitado' :
                               order.shipping_status === 'review' ? 'Com Erro e Revisão' :
                               order.shipping_status === 'lost' ? 'Extraviado' :
                               ['canceled', 'cancelled'].includes(order.status?.toLowerCase() || '') ? 'Cancelado' : 
                               (order.shipping_status_metadata?.manual_update ? 'Processado Manual' : 'Em Processamento')}
                            </span>
                            <span className="text-[8px] text-white/85 font-mono tracking-tighter">
                               {order.provider_order_id || (order.shipping_status_metadata?.manual_update ? 'MANUAL' : '')} 
                               {(order.shipping_status_metadata?.trackingNumber || order.shipping_tracking_code) && ` | ${order.shipping_status_metadata?.trackingNumber || order.shipping_tracking_code}`}
                            </span>
                          </div>
                        ) : (["paid", "pago", "completed", "succeeded"].includes(order.status?.toLowerCase() || "")) ? (
                          <div className="flex items-center gap-1.5 min-w-[140px]">
                            {(order.provider_order_id) ? (
                               <Button 
                                size="sm"
                                onClick={() => handleSyncStatus(order.id)}
                                className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-none text-[8px] uppercase tracking-widest font-black h-7 px-3 border border-emerald-500/20 flex-1"
                              >
                                <RefreshCw size={10} className="mr-1.5" /> Sincronizar
                              </Button>
                            ) : (
                              <>
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSyncStatus(order.id)}
                                  className="border-white/10 text-white/60 hover:bg-white/5 rounded-none text-[8px] uppercase tracking-widest font-bold h-7 px-2"
                                  title="Sincronizar com Stripe"
                                >
                                  Verificar
                                </Button>
                                {order.product?.aliexpress_id ? (
                                  <div className="flex flex-col gap-1.5 flex-1 w-full">
                                    {(order.shipping_status_metadata?.manual_update || order.provider_order_id) ? (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[9px] text-orange-500 font-black uppercase tracking-widest bg-orange-500/10 px-2 py-1 border border-orange-500/20 text-center">
                                          {order.shipping_status_metadata?.lastExternalStatus || "Processado Manual"}
                                        </span>
                                        <Button 
                                          size="sm"
                                          onClick={() => handleSyncStatus(order.id)}
                                          className="bg-orange-500/5 text-orange-500 hover:bg-orange-500 hover:text-white border border-orange-500/20 rounded-none text-[7px] uppercase tracking-widest font-bold h-6"
                                        >
                                          <RefreshCw size={8} className="mr-1" /> Sincronizar
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1 flex-1">
                                        <Button 
                                          size="sm"
                                          onClick={() => handleManualFulfill(order.id)}
                                          className="bg-luxury-gold text-black hover:bg-luxury-gold/80 rounded-none text-[8px] uppercase tracking-widest font-black h-7 px-2 flex-1"
                                          title="Processar manualmente"
                                        >
                                          Manual
                                        </Button>
                                        <Button 
                                          size="sm"
                                          onClick={() => handleInternationalFulfill(order.id)}
                                          className="bg-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white border border-orange-500/30 rounded-none text-[8px] uppercase tracking-widest font-black h-7 px-2 flex-1"
                                          title="Processar via Logística Auto"
                                        >
                                          Auto-API
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <Button 
                                    size="sm"
                                    onClick={() => handleManualFulfill(order.id)}
                                    className="bg-luxury-gold text-black hover:bg-luxury-gold/80 rounded-none text-[8px] uppercase tracking-widest font-black h-7 px-3 flex-1"
                                  >
                                    Enviar Manual
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/70 text-[9px] uppercase tracking-widest font-bold">
                            Aguardando Pagamento
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-2">
                          {/* Order Status */}
                          <div className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest font-black border text-center ${
                            ["deposited", "paid", "completed", "pago", "delivered", "succeeded"].includes(order.status?.toLowerCase() || "")
                              ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                              : ["refunded", "reembolsado", "refund_pending", "refund_requested"].includes(order.status?.toLowerCase() || "")
                                ? "text-red-400 border-red-500/20 bg-red-500/5"
                                : ["canceled", "cancelled"].includes(order.status?.toLowerCase() || "")
                                  ? "text-slate-400 border-slate-500/20 bg-slate-500/5"
                                  : "text-amber-500 border-amber-500/20 bg-amber-500/5"
                          }`}>
                            {["refunded", "reembolsado", "refund_pending"].includes(order.status?.toLowerCase() || "") ? "REEMBOLSADO" :
                             ["canceled", "cancelled"].includes(order.status?.toLowerCase() || "") ? "CANCELADO" :
                             ["paid", "completed", "succeeded", "pago"].includes(order.status?.toLowerCase() || "") ? "PAGO" :
                             "PENDENTE"}
                          </div>
                          
                          {/* Payment Status */}
                          <div className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest font-black border text-center ${
                            (["refunded", "reembolsado", "refund_pending"].includes(order.payment_status?.toLowerCase() || "") || ["refunded", "reembolsado", "refund_pending"].includes(order.status?.toLowerCase() || ""))
                              ? "bg-red-500 text-white border-red-600"
                              : (["paid", "completed", "succeeded", "pago"].includes(order.payment_status?.toLowerCase() || "") || ["paid", "completed", "succeeded", "pago"].includes(order.status?.toLowerCase() || ""))
                                ? "bg-emerald-500 text-white border-emerald-600"
                                : "bg-amber-500 text-white border-amber-600"
                          }`}>
                            { (["refunded", "reembolsado", "refund_pending"].includes(order.payment_status?.toLowerCase() || "") || ["refunded", "reembolsado", "refund_pending"].includes(order.status?.toLowerCase() || "")) ? "PAGAMENTO: REEMBOLSADO" :
                              (["paid", "completed", "succeeded", "pago"].includes(order.payment_status?.toLowerCase() || "") || ["paid", "completed", "succeeded", "pago"].includes(order.status?.toLowerCase() || "")) ? "PAGAMENTO: PAGO" :
                               "PAGAMENTO: PENDENTE"}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          {!["refunded", "delivered"].includes(order.status?.toLowerCase() || "") && (
                            <Button
                               onClick={async () => {
                                 const syncToast = toast.loading('Sincronizando status...');
                                 try {
                                   const response = await fetch(`/api/admin/orders/${order.id}/sync_payment`, {
                                     method: 'POST',
                                     headers: {
                                       'Content-Type': 'application/json',
                                       'x-user-id': user.id
                                     }
                                   });
                                   const data = await response.json();
                                   if (data.success) {
                                     toast.success(data.message || 'Sincronizado!', { id: syncToast });
                                     fetchDashboardData();
                                   } else {
                                     toast.info(data.message || 'Sem novas alterações.', { id: syncToast });
                                   }
                                 } catch(e) {
                                   toast.error('Erro de sincronização.', { id: syncToast });
                                 }
                               }}
                               variant="outline"
                               title="Sincronizar dados com Stripe (Apenas leitura)"
                               className="border-white/10 text-white/90 hover:text-luxury-gold hover:bg-white/5 h-8 px-3 text-[8px] uppercase tracking-widest font-bold whitespace-nowrap"
                             >
                               <RefreshCw size={10} className="mr-1" /> Sincronizar
                             </Button>
                          )}

                          {(order.status === 'paid' || order.status === 'completed') && (
                            <Button
                               onClick={() => {
                                 setOrderToRefund(order);
                                 setIsRefundModalOpen(true);
                               }}
                               variant="ghost"
                               title="Executar Reembolso Real (Stripe + Status)"
                               className="text-red-500 hover:text-white hover:bg-red-500/20 h-8 px-3 text-[8px] uppercase tracking-widest font-bold border border-red-500/20 whitespace-nowrap"
                             >
                               <Undo2 size={10} className="mr-1" /> Reembolsar
                             </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-8 py-12 text-center text-white/90 text-xs uppercase tracking-widest"
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

        {/* Modal de Confirmação de Reembolso */}
        {isRefundModalOpen && orderToRefund && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-zinc-900 border border-white/10 w-full max-w-md overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
              
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Confirmar Reembolso</h3>
                    <p className="text-white/90 text-xs uppercase tracking-widest mt-1">Ação Irreversível</p>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 p-4 mb-6 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/90 uppercase tracking-widest">Pedido</span>
                    <span className="text-white font-mono">Sart-{orderToRefund.id.split('-')[0].toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/90 uppercase tracking-widest">Valor</span>
                    <span className="text-white font-bold">{renderPrice(Number(orderToRefund.total_amount))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/90 uppercase tracking-widest">Cliente</span>
                    <span className="text-white truncate max-w-[150px]">{orderToRefund.customer_email}</span>
                  </div>
                </div>

                <p className="text-sm text-white/60 mb-8 leading-relaxed">
                  Esta ação irá processar o estorno automático via <strong>Stripe</strong>. 
                  O status do pedido será alterado para <span className="text-red-400 font-bold uppercase tracking-widest text-[10px]">Reembolsado</span>.
                  
                  <br /><br />
                  O cliente receberá o valor integral na sua conta e o acesso aos itens (se digitais) será removido.
                </p>

                <div className="flex gap-3">
                  <Button 
                    variant="outline"
                    className="flex-1 rounded-none border-white/10 hover:bg-white/5 text-white/60 h-12"
                    onClick={() => setIsRefundModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-widest text-[10px] h-12"
                    onClick={confirmRefundAction}
                  >
                    Confirmar Estorno
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {tab === "refunds" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div>
                <h2 className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-none">
                  Gestão de <span className="text-red-500 italic">Reembolsos</span>
                </h2>
                <p className="text-[10px] md:text-[11px] uppercase tracking-[0.3em] text-white/85 mt-4 font-light max-w-xl leading-relaxed">
                  Controle as solicitações de devolução de membros. A aprovação administrativa inicia o processo de estorno seguro via Stripe.
                </p>
              </div>

              <div className="bg-luxury-dark border border-white/5 rounded-none overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.3em] text-white/85 bg-white/[0.02]">
                        <th className="px-8 py-8 font-normal">Ordem / Produto</th>
                        <th className="px-8 py-8 font-normal">Cliente</th>
                        <th className="px-8 py-8 font-normal">Data Solicitação</th>
                        <th className="px-8 py-8 font-normal">Motivo</th>
                        <th className="px-8 py-8 font-normal">Estatuto</th>
                        <th className="px-8 py-8 font-normal text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {orders.filter(o => 
                        ['refund_requested', 'refund_pending', 'refunded', 'reembolsado'].includes(o.status?.toLowerCase() || "") ||
                        o.payment_status === 'refunded'
                      ).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-8 py-20 text-center text-white/70 text-xs uppercase tracking-[0.2em]">
                            Nenhuma solicitação de reembolso ativa encontrada.
                          </td>
                        </tr>
                      ) : (
                        orders
                          .filter(o => 
                            ['refund_requested', 'refund_pending', 'refunded', 'reembolsado'].includes(o.status?.toLowerCase() || "") ||
                            o.payment_status === 'refunded'
                          )
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((order) => (
                            <tr key={order.id} className="group hover:bg-white/[0.02] transition-colors">
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-14 bg-white/5 flex-shrink-0">
                                    <img 
                                      src={getImageUrl(order.product?.image_url || '')} 
                                      className="w-full h-full object-cover grayscale opacity-95 group-hover:grayscale-0 group-hover:opacity-100 transition-all" 
                                    />
                                  </div>
                                  <div>
                                    <div className="text-[11px] text-white/90 font-medium tracking-wide">
                                      {order.product?.title || 'Produto Indisponível'}
                                    </div>
                                    <div className="text-[9px] text-white/85 mt-1 uppercase tracking-widest font-mono">
                                      Sart-{order.id.split('-')[0].toUpperCase()}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="text-[11px] text-white/70">{order.customer_email || 'Anonimizado'}</div>
                                <div className="text-[9px] text-white/85 uppercase tracking-widest mt-1">Ref: {order.shipping_details?.fullName || 'N/A'}</div>
                              </td>
                              <td className="px-8 py-6 text-[10px] text-white/90 uppercase tracking-widest">
                                {order.selected_options?.refund_requested_at ? format(new Date(order.selected_options.refund_requested_at), "dd MMM yyyy", { locale: ptBR }) : 'N/A'}
                              </td>
                              <td className="px-8 py-6">
                                <div className="text-[10px] text-white/60 max-w-[200px] truncate" title={order.refund_reason || order.selected_options?.refund_reason}>
                                  {order.refund_reason || order.selected_options?.refund_reason || 'Não especificado'}
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className={`inline-flex px-3 py-1 rounded-full text-[8px] uppercase tracking-widest font-black ${
                                  order.status?.toLowerCase() === 'refund_requested' 
                                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                                    : order.status?.toLowerCase() === 'refund_pending'
                                      ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse'
                                      : order.status?.toLowerCase() === 'refund_rejected'
                                        ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                        : (order.status?.toLowerCase() === 'refunded' || order.payment_status === 'refunded' || order.status === 'reembolsado')
                                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                          : 'bg-white/5 text-white/90 border border-white/10'
                                }`}>
                                  {order.status?.toLowerCase() === 'refund_requested' ? 'Em Análise' : 
                                   order.status?.toLowerCase() === 'refund_pending' ? 'Processando Estorno' : 
                                   order.status?.toLowerCase() === 'refund_rejected' ? 'Solicitação Rejeitada' : 
                                   (order.status?.toLowerCase() === 'refunded' || order.payment_status === 'refunded' || order.status === 'reembolsado') ? 'Reembolso Concluído' :
                                   order.status?.toUpperCase() || 'Pendente'}
                                </div>
                              </td>
                              <td className="px-8 py-6 text-right">
                                  <div className="flex gap-2 justify-end items-center">
                                    <Button
                                      onClick={async (e) => {
                                        const btn = e.currentTarget;
                                        btn.disabled = true;
                                        const icon = btn.querySelector('.sync-icon');
                                        icon?.classList.add('animate-spin');
                                        const syncToast = toast.loading('Verificando status com Stripe...');
                                        
                                        try {
                                          const response = await fetch(`/api/admin/orders/${order.id}/sync_payment`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                              'x-user-id': user.id
                                            }
                                          });
                                          const data = await response.json();
                                          if (data.success) {
                                            toast.success(data.message || 'Dados atualizados!', { id: syncToast });
                                            fetchDashboardData();
                                          } else {
                                            toast.info(data.message || 'Sincronização concluída.', { id: syncToast });
                                          }
                                        } catch (e) {
                                          toast.error("Erro de rede", { id: syncToast });
                                        } finally {
                                          btn.disabled = false;
                                          icon?.classList.remove('animate-spin');
                                        }
                                      }}
                                      variant="outline"
                                      className="border-white/10 text-white/90 hover:bg-white/5 text-[8px] uppercase tracking-widest h-8 px-3 rounded-none transition-all"
                                      title="Sincronizar com Stripe"
                                    >
                                      <RefreshCw size={10} className="mr-1 sync-icon" />
                                      Sincronizar
                                    </Button>

                                    {order.status === 'refund_requested' && (
                                        <>
                                          <Button
                                            onClick={async () => {
                                              // Aprovado sem popup de sistema
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
                                              // Recusado sem popup de sistema
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
                                    <div className="flex flex-col items-end gap-1 mt-2">
                                      <div className="text-[9px] text-blue-400 uppercase tracking-widest flex items-center gap-2 font-bold bg-blue-500/5 px-2 py-1 border border-blue-500/10">
                                        <Loader2 size={10} className="animate-spin" />
                                        Processamento Gateway
                                      </div>
                                      <div className="text-[7px] text-white/90 uppercase tracking-[0.1em] mt-1 text-right">
                                        Clique em Sincronizar se o estorno já foi concluído
                                      </div>
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

        {tab === "coupons" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <CouponManager />
          </div>
        )}

        {tab === "pontuação" && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 duration-700">
            <div>
              <h2 className="text-2xl md:text-3xl font-serif">
                {currentUserProfile?.is_admin ? "Ranking & Pontuação Geral" : "Sua Pontuação & Histórico"}
              </h2>
              <div className="text-[10px] uppercase tracking-widest opacity-80 mt-2">
                {currentUserProfile?.is_admin 
                  ? "Monitorização detalhada do carregamento de produtos por cada colaborador"
                  : "Lista dos produtos que você carregou para a boutique"}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {currentUserProfile?.is_admin ? (
                <>
                  <Card className="bg-luxury-dark border-white/5 p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 bg-luxury-gold/10 flex items-center justify-center text-luxury-gold">
                      <ShoppingBag size={24} />
                    </div>
                    <div>
                      <h4 className="text-3xl font-serif text-luxury-gold">{products.length}</h4>
                      <p className="text-[10px] uppercase tracking-widest text-white/85 mt-1">Produtos Totais</p>
                    </div>
                  </Card>

                  <Card className="bg-luxury-dark border-white/5 p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <Users size={24} />
                    </div>
                    <div>
                      <h4 className="text-3xl font-serif text-white">{users.filter(u => u.is_employee).length}</h4>
                      <p className="text-[10px] uppercase tracking-widest text-white/85 mt-1">Funcionários Ativos</p>
                    </div>
                  </Card>

                  <Card className="bg-luxury-dark border-white/5 p-8 flex flex-col items-center justify-center text-center space-y-4">
                     <div className="w-12 h-12 bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <h4 className="text-3xl font-serif text-white">
                        {Math.round((products.length / (users.filter(u => u.is_employee || u.is_admin).length || 1)) * 10) / 10}
                      </h4>
                      <p className="text-[10px] uppercase tracking-widest text-white/85 mt-1">Média por Colaborador</p>
                    </div>
                  </Card>
                </>
              ) : (
                /* Employee Personal View - Large Card */
                <Card className="bg-luxury-dark border-luxury-gold/20 p-12 flex flex-col items-center justify-center text-center space-y-4 md:col-span-3">
                  <div className="w-20 h-20 bg-luxury-gold/10 flex items-center justify-center text-luxury-gold ring-1 ring-luxury-gold/40 rounded-full mb-4">
                    <TrendingUp size={40} />
                  </div>
                  <div>
                    <p className="text-[14px] uppercase tracking-[0.4em] text-white/90 mb-2">Seus Resultados</p>
                    <h4 className="text-7xl font-serif text-luxury-gold">
                      {products.filter(p => p.created_by === user.id).length}
                    </h4>
                    <p className="text-[12px] uppercase tracking-widest text-white/80 mt-4 font-bold border-t border-white/10 pt-4 px-12">Produtos Listados por Você</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/85 mt-2">Obrigado pela sua contribuição!</p>
                  </div>
                </Card>
              )}
            </div>

            {currentUserProfile?.is_admin && (
              <div className="bg-luxury-dark border border-white/5 overflow-hidden">
                <div className="px-8 py-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                  <h3 className="text-xs uppercase tracking-[0.2em] font-bold">Ranking de Performance</h3>
                  <span className="text-[9px] uppercase tracking-widest text-white/85">Total de produtos carregados</span>
                </div>
                {/* ... Ranking table only for admin ... */}
                <div className="overflow-x-auto luxury-scrollbar">
                  <table className="w-full text-left min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/5 bg-black/20">
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Posição</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Utilizador</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85 text-center">Produtos</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Cargo</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {users
                        .filter(u => u.is_employee || u.is_admin) // Only staff in ranking
                        .sort((a, b) => (b.products_count || 0) - (a.products_count || 0))
                        .map((u, idx) => (
                          <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-8 py-6">
                              <span className={`w-8 h-8 flex items-center justify-center font-mono text-[10px] ${
                                idx === 0 ? "bg-luxury-gold text-black font-black" : 
                                idx === 1 ? "bg-zinc-300 text-black font-black" :
                                idx === 2 ? "bg-amber-700 text-white font-black" :
                                "bg-white/5 text-white/90"
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-none border border-white/10 bg-white/5 flex items-center justify-center">
                                  {u.avatar_url ? (
                                    <img src={getImageUrl(u.avatar_url || u.email)} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-[10px] font-bold text-white/70">{u.full_name?.charAt(0) || u.email?.charAt(0)}</span>
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-serif text-white">{u.full_name || "Sem Nome"}</span>
                                  <span className="text-[9px] text-white/70 uppercase tracking-widest">{u.email}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-center">
                              <span className="text-xl font-mono font-black text-luxury-gold">
                                {u.products_count || 0}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-[8px] uppercase tracking-widest font-black px-2 py-1 ${
                                u.is_admin ? "bg-red-500/10 text-red-500" :
                                "bg-emerald-500/10 text-emerald-500"
                              }`}>
                                {u.is_admin ? "Administrador" : "Funcionário"}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setSelectedUserForProducts(u);
                                  setIsUserDetailsModalOpen(true);
                                }}
                                className="text-[8px] uppercase tracking-widest text-white/90 hover:text-luxury-gold hover:bg-luxury-gold/10 h-8 font-bold"
                              >
                                Ver Detalhes
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* List of products created by the user (Simplified for employees) */}
            {!currentUserProfile?.is_admin && currentUserProfile?.is_employee && (
              <div className="bg-luxury-dark border border-white/5 overflow-hidden">
                <div className="px-8 py-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                  <h3 className="text-xs uppercase tracking-[0.2em] font-bold">Seus Produtos Listados</h3>
                  <span className="text-[9px] uppercase tracking-widest text-white/85">Total: {products.filter(p => p.created_by === user.id).length}</span>
                </div>
                <div className="overflow-x-auto luxury-scrollbar">
                  <table className="w-full text-left min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/5 bg-black/20">
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Capa</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Produto</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Preço</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Estado</th>
                        <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85 text-right">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {products
                        .filter(p => p.created_by === user.id)
                        .slice(0, 50)
                        .map((p) => (
                          <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-8 py-4">
                              <img src={getImageUrl(p.image_url)} className="w-10 h-10 object-cover border border-white/10" />
                            </td>
                            <td className="px-8 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-serif text-white">{p.title}</span>
                                <span className="text-[9px] text-white/70 uppercase tracking-widest">{p.category}</span>
                              </div>
                            </td>
                            <td className="px-8 py-4 font-mono text-xs text-luxury-gold">
                              {renderPrice(p.pvp)}
                            </td>
                            <td className="px-8 py-4">
                               <span className={`text-[8px] uppercase tracking-widest font-black px-2 py-1 ${p.is_active ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                                {p.is_active ? "Ativo" : "Inativo"}
                              </span>
                            </td>
                            <td className="px-8 py-4 text-right text-[10px] text-white/70 font-mono">
                              {p.created_at ? format(new Date(p.created_at), "dd/MM/yyyy") : "-"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {products.filter(p => (p as any).created_by === user.id).length === 0 && (
                    <div className="px-8 py-12 text-center text-white/70 text-[10px] uppercase tracking-widest italic">
                      Parece que você ainda não tem produtos registrados no seu nome.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "users" && currentUserProfile?.is_admin && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h2 id="title-management" className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-none">
                  Gestão de <span className="text-luxury-gold italic">Utilizadores</span>
                </h2>
                <p id="desc-management" className="text-[10px] md:text-[11px] uppercase tracking-[0.3em] text-white/85 mt-4 font-light max-w-xl leading-relaxed">
                  Controle absoluto sobre os membros da boutique. Selecione utilizadores para disparar mensagens personalizadas e vitrines de produtos via e-mail.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <Button 
                  onClick={() => openEmailModalWithUsers(selectedUserIdsForEmail.length > 0 ? selectedUserIdsForEmail : users.map(u => u.id))} 
                  className="bg-luxury-gold text-black hover:bg-amber-400 font-extrabold uppercase tracking-widest text-[10px] px-5 py-3 flex items-center gap-2 rounded-none transition-all shadow-lg shadow-luxury-gold/10"
                >
                  <Mail size={15} /> 
                  Enviar Emails {selectedUserIdsForEmail.length > 0 ? `(${selectedUserIdsForEmail.length} Selecionados)` : ""}
                </Button>
                <div className="w-full md:w-64 relative group">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 group-focus-within:text-luxury-gold transition-colors" />
                  <input
                    type="text"
                    placeholder="Pesquisar utilizador..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 py-3 pl-12 pr-4 text-[10px] uppercase tracking-widest text-white outline-none focus:border-luxury-gold transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-sm overflow-hidden">
              <div className="overflow-x-auto luxury-scrollbar">
                <table className="w-full text-left min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/85 bg-white/[0.02]">
                      <th className="px-4 py-8 w-12 text-center">
                        <input 
                          type="checkbox" 
                          checked={
                            users.length > 0 &&
                            selectedUserIdsForEmail.length === users.filter(u => {
                              const s = userSearch.toLowerCase();
                              return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s) || u.id.toLowerCase().includes(s);
                            }).length
                          }
                          onChange={() => toggleSelectAllUsersForEmail(users.filter(u => {
                            const s = userSearch.toLowerCase();
                            return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s) || u.id.toLowerCase().includes(s);
                          }))}
                          className="accent-luxury-gold cursor-pointer w-4 h-4" 
                          title="Selecionar / Deselecionar Todos"
                        />
                      </th>
                      <th className="px-6 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Utilizador</th>
                      <th className="px-6 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">E-mail Corporativo</th>
                      <th className="px-6 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Membro Desde</th>
                      <th className="px-6 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Produtos</th>
                      <th className="px-6 py-8 font-normal hover:text-luxury-gold transition-colors cursor-default">Estatuto</th>
                      <th className="px-6 py-8 font-normal text-right">Ações de Controlo</th>
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
                      <tr key={profile.id} className={`group hover:bg-white/5 transition-colors ${selectedUserIdsForEmail.includes(profile.id) ? "bg-luxury-gold/5" : ""}`}>
                        <td className="px-4 py-5 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedUserIdsForEmail.includes(profile.id)} 
                            onChange={() => toggleSelectUserForEmail(profile.id)} 
                            className="accent-luxury-gold cursor-pointer w-4 h-4" 
                          />
                        </td>
                        <td className="px-6 py-5">
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
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-white font-medium">{profile.full_name || "Sem Nome"}</p>
                                {profile.is_admin && (
                                  <Crown size={12} className="text-luxury-gold fill-luxury-gold/20 animate-pulse" title="Administrador Master" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-[9px] text-luxury-gold font-mono font-bold tracking-widest uppercase">{profile.custom_id || `Sart-${profile.id.substring(0, 4).toUpperCase()}`}</p>
                                <span className="text-white/10">|</span>
                                <p className="text-[8px] text-white/70 font-mono tracking-tighter truncate max-w-[100px]">{profile.id}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm text-white/60">{profile.email || "N/D"}</td>
                        <td className="px-6 py-5 text-sm text-white/60">
                          {profile.created_at ? format(new Date(profile.created_at), "dd/MM/yyyy") : "-"}
                        </td>
                        <td className="px-6 py-5">
                           <span className="text-[10px] font-black text-luxury-gold px-3 py-1 bg-luxury-gold/10 border border-luxury-gold/20 font-mono">
                             {profile.products_count || 0}
                           </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[8px] uppercase tracking-widest font-bold ${
                              profile.is_admin 
                                ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30" 
                                : "bg-white/5 text-white/90 border border-white/10"
                            }`}>
                              {profile.is_admin ? <ShieldCheck size={10} /> : <Users size={10} />}
                              {profile.is_admin ? "Administrador" : "Cliente"}
                            </span>
                            {profile.is_employee && !profile.is_admin && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[8px] uppercase tracking-widest font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                <ShieldCheck size={10} /> Funcionário
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <Button 
                              onClick={() => openEmailModalWithUsers([profile.id])}
                              variant="outline" 
                              size="sm"
                              className="rounded-none text-[8px] uppercase tracking-widest h-8 border-luxury-gold/40 text-luxury-gold hover:bg-luxury-gold hover:text-black transition-all flex items-center gap-1 font-bold"
                            >
                              <Mail size={12} />
                              Enviar Email
                            </Button>
                            {profile.id !== user.id && (
                              <>
                                <Button 
                                  onClick={() => updateUserRole(profile, "admin", !profile.is_admin)}
                                  variant="outline" 
                                  size="sm"
                                  className={`rounded-none text-[8px] uppercase tracking-widest h-8 border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-all ${
                                    profile.is_admin ? "hover:border-red-500 hover:text-red-500" : ""
                                  }`}
                                >
                                  {profile.is_admin ? "Revogar Admin" : "Tornar Admin"}
                                </Button>
                                <Button 
                                  onClick={() => updateUserRole(profile, "employee", !profile.is_employee)}
                                  variant="outline" 
                                  size="sm"
                                  className={`rounded-none text-[8px] uppercase tracking-widest h-8 border-white/10 hover:border-blue-500 hover:text-blue-500 transition-all ${
                                    profile.is_employee ? "hover:border-red-500 hover:text-red-500" : ""
                                  }`}
                                >
                                  {profile.is_employee ? "Revogar Func" : "Tornar Func"}
                                </Button>
                              </>
                            )}
                            <Button 
                              onClick={() => {
                                setSelectedUserForProducts(profile);
                                setIsUserDetailsModalOpen(true);
                              }}
                              variant="ghost" 
                              size="sm"
                              className="rounded-none text-[8px] uppercase tracking-widest h-8 text-white/90 hover:text-luxury-gold hover:bg-luxury-gold/10"
                            >
                              Ver Contribuições
                            </Button>
                          </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "api" && currentUserProfile?.is_admin && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Header */}
          <div>
            <h2 className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-none">
              Chaves de <span className="text-luxury-gold italic">API & Integração</span>
            </h2>
            <div className="text-[10px] uppercase tracking-widest opacity-80 mt-2">
              Crie e faça a gestão das suas chaves de acesso para alimentar outras aplicações e canais com as fotos e dados dos produtos.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: API Key Generator & List */}
            <div className="lg:col-span-5 space-y-6">
              {/* Generator Form */}
              <Card className="bg-luxury-dark border-white/5 p-6 rounded-none">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-sm uppercase tracking-widest font-serif text-white">Gerar Nova Chave de API</CardTitle>
                  <p className="text-[9px] text-white/90 uppercase tracking-wider mt-1">Insira um nome descritivo para identificar a integração</p>
                </CardHeader>
                <CardContent className="p-0">
                  <form onSubmit={handleGenerateApiKey} className="space-y-4">
                    <div>
                      <input
                        type="text"
                        placeholder="Ex: App de Dropshipping, E-commerce Externo..."
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 px-4 py-3 text-xs text-white placeholder-white/20 focus:outline-none focus:border-luxury-gold rounded-none"
                        disabled={generatingKey}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={generatingKey}
                      className="w-full bg-luxury-gold text-black hover:bg-luxury-gold/80 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] font-semibold uppercase text-[9px] tracking-widest h-10 rounded-none flex items-center justify-center gap-2"
                    >
                      {generatingKey ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          A Gerar...
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          Gerar Chave
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* API Keys List */}
              <div className="bg-luxury-dark border border-white/5 rounded-none overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
                  <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-white">Chaves Ativas</h3>
                  <span className="text-[9px] uppercase tracking-widest text-white/85 font-mono">{apiKeys.length} chaves</span>
                </div>

                {loadingApiKeys ? (
                  <div className="p-12 text-center text-white/85 text-xs flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-luxury-gold" />
                    A carregar chaves...
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="p-12 text-center text-white/85 text-[10px] uppercase tracking-widest italic border border-dashed border-white/5">
                    Nenhuma chave de API gerada ainda. Use o formulário acima para criar a sua primeira chave.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {apiKeys.map((key) => {
                      const isVisible = !!visibleKeyIds[key.id];
                      return (
                        <div key={key.id} className="p-5 hover:bg-white/[0.01] transition-colors space-y-3">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <h4 className="text-xs font-serif text-white font-medium">{key.name}</h4>
                              <p className="text-[8px] text-white/85 font-mono mt-0.5">Criado em: {key.created_at ? format(new Date(key.created_at), "dd/MM/yyyy HH:mm") : "-"}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteApiKey(key.id)}
                              className="h-6 w-6 p-0 text-white/70 hover:text-red-500 hover:bg-red-500/10 rounded-none"
                              title="Eliminar Chave"
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>

                          <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-3 py-2 rounded-none">
                            <span className="font-mono text-[9px] text-luxury-gold/90 break-all select-all flex-1">
                              {isVisible ? key.token : `${key.token.substring(0, 12)}••••••••••••••••••••••••`}
                            </span>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleKeyVisibility(key.id)}
                              className="h-6 px-2 text-[8px] uppercase font-bold tracking-widest text-white/90 hover:text-white hover:bg-white/5 rounded-none"
                            >
                              {isVisible ? "Ocultar" : "Mostrar"}
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(key.token, key.id)}
                              className="h-6 w-6 p-0 text-white/90 hover:text-luxury-gold hover:bg-luxury-gold/10 rounded-none flex items-center justify-center"
                              title="Copiar Token"
                            >
                              {copiedKeyId === key.id ? (
                                <Check size={12} className="text-emerald-500" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Documentation Portal */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-luxury-dark border border-white/10 p-8 rounded-none space-y-8">
                <div>
                  <h3 className="text-lg uppercase tracking-widest font-serif text-white flex items-center gap-3">
                    <Terminal size={18} className="text-luxury-gold" />
                    Manual de Integração & Endpoints REST
                  </h3>
                  <p className="text-[10px] text-luxury-gold uppercase tracking-wider font-bold mt-1.5">
                    Guia técnico completo e detalhado para extrair produtos, galerias e stock em tempo real
                  </p>
                </div>

                <Separator className="bg-white/10" />

                {/* Paso a paso */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold" /> Como funciona a integração (Passo a Passo)
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="bg-black/50 border border-white/5 p-4 space-y-2">
                      <div className="text-luxury-gold font-bold font-serif text-sm">01. Autenticação</div>
                      <p className="text-white/90 leading-relaxed text-[11px]">
                        Gere a sua Chave de API no painel esquerdo. Mantenha o token seguro e envie-o no cabeçalho <code className="text-luxury-gold bg-black/80 px-1 font-mono text-[10px]">Authorization</code>.
                      </p>
                    </div>

                    <div className="bg-black/50 border border-white/5 p-4 space-y-2">
                      <div className="text-luxury-gold font-bold font-serif text-sm">02. Endpoints</div>
                      <p className="text-white/90 leading-relaxed text-[11px]">
                        Aceda à nossa URL base segura para consultar a lista completa de produtos ativos, descrições ricas, categorias e imagens em alta resolução.
                      </p>
                    </div>

                    <div className="bg-black/50 border border-white/5 p-4 space-y-2">
                      <div className="text-luxury-gold font-bold font-serif text-sm">03. Sincronização</div>
                      <p className="text-white/90 leading-relaxed text-[11px]">
                        Os dados do stock e dos preços são atualizados automaticamente na nossa base de dados e refletem-se instantaneamente na sua chamada de API.
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Auth Guide */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold" /> Autenticação das Chamadas de API
                  </h4>
                  <p className="text-xs text-white leading-relaxed">
                    A URL base oficial para as chamadas é <strong className="text-luxury-gold">https://sart-full.pt</strong>. Pode autenticar as suas chamadas de duas formas distintas:
                  </p>
                  
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-white/90 font-bold block mb-1.5">MÉTODO RECOMENDADO: Cabeçalho HTTP Authorization (Bearer Token)</span>
                      <pre className="bg-black border border-white/10 p-3.5 font-mono text-[10.5px] text-emerald-400 overflow-x-auto select-all rounded-none shadow-inner">
                        Authorization: Bearer s_art_vossa_chave_gerada_aqui
                      </pre>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-white/90 font-bold block mb-1.5">MÉTODO ALTERNATIVO: Parâmetro de URL (Query Parameter)</span>
                      <pre className="bg-black border border-white/10 p-3.5 font-mono text-[10.5px] text-emerald-400 overflow-x-auto select-all rounded-none shadow-inner">
                        https://sart-full.pt/api/v1/products?key=s_art_vossa_chave_gerada_aqui
                      </pre>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Interactive Multi-Language Code Snippets */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-xs uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold" /> Exemplos de Código por Linguagem
                    </h4>
                    <span className="text-[8px] uppercase tracking-wider text-white/60 bg-white/5 border border-white/10 px-2 py-0.5">Siga o padrão da sua stack</span>
                  </div>

                  {/* Language Tab buttons */}
                  <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
                    {(["js", "py", "php", "go", "curl"] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setApiLang(lang)}
                        className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest border transition-all ${
                          apiLang === lang
                            ? "bg-luxury-gold text-black border-luxury-gold font-bold"
                            : "bg-black/40 text-white border-white/10 hover:border-white/30 hover:bg-white/5"
                        }`}
                      >
                        {lang === "js" && "JavaScript (Fetch)"}
                        {lang === "py" && "Python"}
                        {lang === "php" && "PHP"}
                        {lang === "go" && "Go (Golang)"}
                        {lang === "curl" && "cURL (Bash)"}
                      </button>
                    ))}
                  </div>

                  {/* Code Container */}
                  <div className="relative group">
                    {apiLang === "js" && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/90 leading-relaxed">
                          Utilize a API nativa <code className="bg-black px-1.5 py-0.5 text-luxury-gold rounded-none font-mono">fetch</code> do JavaScript em ambientes modernos (Node.js, React, Vue, Svelte ou direto no Browser):
                        </p>
                        <pre className="bg-black border border-white/10 p-4 font-mono text-[10px] text-white/90 overflow-x-auto rounded-none leading-relaxed max-h-96 overflow-y-auto shadow-inner select-all">
{`// Chamada em JavaScript (ES6+ / Async/Await)
const fetchSartProducts = async () => {
  const API_URL = 'https://sart-full.pt/api/v1/products';
  const API_KEY = 'Sua_Chave_De_API_Aqui'; // Substitua pelo seu token gerado

  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(\`Erro HTTP: \${response.status}\`);
    }

    const produtos = await response.json();
    console.log('Sucesso! Produtos importados:', produtos);
    return produtos;
  } catch (erro) {
    console.error('Erro de rede ou autenticação na S.art:', erro);
  }
};`}
                        </pre>
                      </div>
                    )}

                    {apiLang === "py" && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/90 leading-relaxed">
                          Recomendado para scripts de automação, pipelines ou backend integrado (Flask, Django, FastAPI) utilizando a biblioteca <code className="bg-black px-1.5 py-0.5 text-luxury-gold rounded-none font-mono">requests</code>:
                        </p>
                        <pre className="bg-black border border-white/10 p-4 font-mono text-[10px] text-white/90 overflow-x-auto rounded-none leading-relaxed max-h-96 overflow-y-auto shadow-inner select-all">
{`# Chamada em Python 3 usando a biblioteca 'requests'
import requests

def importar_produtos_sart():
    api_url = "https://sart-full.pt/api/v1/products"
    api_key = "Sua_Chave_De_API_Aqui"  # Cole aqui a sua chave de API gerada

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json"
    }

    try:
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()  # Dispara um erro para códigos 4xx ou 5xx
        
        produtos = response.json()
        print(f"Sucesso! {len(produtos)} produtos ativos na boutique S.art foram lidos.")
        for item in produtos:
            print(f"- {item['name']} | Preço: {item['price']} EUR (Stock: {item['stock']})")
        return produtos
    except requests.exceptions.HTTPError as http_err:
        print(f"Erro HTTP na autenticação ou rota: {http_err}")
    except Exception as err:
        print(f"Ocorreu um erro na requisição: {err}")

# Executar função
importar_produtos_sart()`}
                        </pre>
                      </div>
                    )}

                    {apiLang === "php" && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/90 leading-relaxed">
                          Perfeito para integrações legadas, sites WordPress, WooCommerce ou backends customizados em PHP utilizando cURL:
                        </p>
                        <pre className="bg-black border border-white/10 p-4 font-mono text-[10px] text-white/90 overflow-x-auto rounded-none leading-relaxed max-h-96 overflow-y-auto shadow-inner select-all">
{`<?php
// Exemplo de chamada de API estruturada em PHP usando cURL
$apiUrl = "https://sart-full.pt/api/v1/products";
$apiKey = "Sua_Chave_De_API_Aqui"; // Token gerado no painel administrativo

$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => "GET",
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . $apiKey,
        "Accept: application/json"
    ]
]);

$response = curl_exec($ch);
$err = curl_error($ch);

if ($err) {
    echo "Erro na ligação cURL: " . $err;
} else {
    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($statusCode === 200) {
        $produtos = json_decode($response, true);
        echo "Sucesso! Foram encontrados " . count($produtos) . " produtos.\n";
        foreach ($produtos as $produto) {
            echo "• ID: " . $produto['id'] . " | Nome: " . $produto['name'] . " | Preço: " . $produto['price'] . " EUR\n";
        }
    } else {
        echo "A API retornou código de erro " . $statusCode . "\n";
        echo "Resposta do servidor: " . $response;
    }
}

curl_close($ch);
?>`}
                        </pre>
                      </div>
                    )}

                    {apiLang === "go" && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/90 leading-relaxed">
                          Implementação performática nativa em Go (Golang) com tipagem estática e decodificação eficiente de JSON:
                        </p>
                        <pre className="bg-black border border-white/10 p-4 font-mono text-[10px] text-white/90 overflow-x-auto rounded-none leading-relaxed max-h-96 overflow-y-auto shadow-inner select-all">
{`package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Product struct {
	ID          string   \`json:"id"\`
	Name        string   \`json:"name"\`
	Price       float64  \`json:"price"\`
	Stock       int      \`json:"stock"\`
	ImageURL    string   \`json:"image_url"\`
	ExtraImages []string \`json:"extra_images"\`
}

func main() {
	url := "https://sart-full.pt/api/v1/products"
	apiKey := "Sua_Chave_De_API_Aqui"

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", url, nil)
	
	req.Header.Add("Authorization", "Bearer " + apiKey)
	req.Header.Add("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Erro na requisição: %v\\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Erro do servidor: Código %d\\n", resp.StatusCode)
		return
	}

	body, _ := io.ReadAll(resp.Body)
	var products []Product
	if err := json.Unmarshal(body, &products); err != nil {
		fmt.Printf("Erro no parse JSON: %v\\n", err)
		return
	}

	fmt.Printf("Sucesso! %d produtos importados para Go\\n", len(products))
	for _, p := range products {
		fmt.Printf("- %s: %.2f EUR (Stock: %d)\\n", p.Name, p.Price, p.Stock)
	}
}`}
                        </pre>
                      </div>
                    )}

                    {apiLang === "curl" && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/90 leading-relaxed">
                          Ideal para testes rápidos direto no terminal Bash do seu computador ou servidores Linux:
                        </p>
                        <pre className="bg-black border border-white/10 p-4 font-mono text-[10px] text-white/90 overflow-x-auto rounded-none leading-relaxed shadow-inner select-all">
{`# Chamar API e obter lista de produtos estruturada em formato JSON
curl -X GET "https://sart-full.pt/api/v1/products" \\
  -H "Authorization: Bearer Sua_Chave_De_API_Aqui" \\
  -H "Accept: application/json"`}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Endpoints */}
                <div className="space-y-6">
                  <h4 className="text-xs uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold" /> Endpoints REST Disponíveis
                  </h4>

                  {/* Endpoint 1 */}
                  <div className="space-y-2 border-l-2 border-luxury-gold pl-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-none font-mono text-[9px] font-bold">GET</span>
                      <span className="font-mono text-xs text-white font-semibold">/api/v1/products</span>
                    </div>
                    <p className="text-[11px] text-white/90 leading-relaxed">
                      Puxa todos os produtos cadastrados e sincronizados na boutique de luxo, incluindo todos os detalhes cruciais: ID único, título/nome, preços formatados, quantidade disponível em stock e imagem principal + galeria completa de fotos adicionais.
                    </p>
                  </div>

                  {/* Endpoint 2 */}
                  <div className="space-y-2 border-l-2 border-luxury-gold pl-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-none font-mono text-[9px] font-bold">GET</span>
                      <span className="font-mono text-xs text-white font-semibold">/api/v1/products/:id</span>
                    </div>
                    <p className="text-[11px] text-white/90 leading-relaxed">
                      Carrega todos os dados detalhados e estruturados de um produto específico na base de dados nacional a partir do seu ID único correspondente.
                    </p>
                  </div>

                  {/* Endpoint 3 */}
                  <div className="space-y-2 border-l-2 border-luxury-gold pl-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-none font-mono text-[9px] font-bold">GET</span>
                      <span className="font-mono text-xs text-white font-semibold">/api/v1/products/:id/image</span>
                    </div>
                    <p className="text-[11px] text-white/90 leading-relaxed">
                      Obtém diretamente a imagem ou imagens associadas a um produto. Suporta duas abordagens técnicas:
                    </p>
                    <ul className="list-disc pl-5 text-[11px] text-white/90 space-y-1">
                      <li>
                        <strong>Renderização Direta (Tag HTML):</strong> Utilize a URL diretamente como origem de uma imagem em HTML: <code className="text-luxury-gold bg-black px-1 py-0.5 font-mono text-[10px]">&lt;img src="https://sart-full.pt/api/v1/products/ID/image?key=..." /&gt;</code>. O servidor responderá com um redirecionamento HTTP direto para a CDN da foto.
                      </li>
                      <li>
                        <strong>JSON de Mídias (Galeria):</strong> Passe o cabeçalho <code className="text-white bg-black px-1 py-0.5 font-mono text-[10px]">Accept: application/json</code> ou o parâmetro <code className="text-luxury-gold bg-black px-1 py-0.5 font-mono text-[10px]">?json=true</code> para receber um objeto JSON com o array completo de imagens adicionais.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Details & Products Modal (Admin) */}
      {isUserDetailsModalOpen && selectedUserForProducts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setIsUserDetailsModalOpen(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-4xl bg-[#050505] border border-white/10 rounded-[2rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-8 border-b border-white/5 bg-white/[0.02] flex justify-between items-start">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-none border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden">
                  {selectedUserForProducts.avatar_url ? (
                    <img src={selectedUserForProducts.avatar_url} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-serif text-white/70">{selectedUserForProducts.full_name?.charAt(0) || selectedUserForProducts.email?.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-serif text-white">{selectedUserForProducts.full_name || "Sem Nome"}</h3>
                  <div className="flex items-center gap-4 mt-1">
                    <p className="text-[10px] uppercase tracking-widest text-white/90">{selectedUserForProducts.email}</p>
                    <span className="text-white/10">|</span>
                    <span className={`text-[8px] uppercase tracking-widest font-black px-2 py-0.5 ${
                      selectedUserForProducts.is_admin ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                    }`}>
                      {selectedUserForProducts.is_admin ? "Master Admin" : "Colaborador"}
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsUserDetailsModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 transition-all"
              >
                <X size={24} />
              </button>
            </div>

            {/* List of User Products */}
            <div className="flex-1 overflow-y-auto luxury-scrollbar p-0">
               <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-black/40">
                  <h4 className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold">Produtos Carregados por este Utilizador</h4>
                  <span className="text-[9px] uppercase tracking-widest text-white/85 font-mono">
                    Total: {products.filter(p => p.created_by === selectedUserForProducts.id).length}
                  </span>
               </div>
               
               <table className="w-full text-left">
                  <thead className="bg-white/5 sticky top-0 z-10">
                    <tr>
                      <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Capa</th>
                      <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Produto</th>
                      <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85">Preço</th>
                      <th className="px-8 py-4 text-[9px] uppercase tracking-widest text-white/85 text-right">Controlo Adm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {products
                      .filter(p => p.created_by === selectedUserForProducts.id)
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                           <td className="px-8 py-4">
                              <div className="w-12 h-12 border border-white/10 overflow-hidden bg-black flex items-center justify-center">
                                {p.image_url ? (
                                  <img src={p.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                ) : (
                                  <ShoppingBag size={16} className="text-white/10" />
                                )}
                              </div>
                           </td>
                           <td className="px-8 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-serif text-white group-hover:text-luxury-gold transition-colors">{p.title}</span>
                                <span className="text-[8px] uppercase tracking-widest text-white/70 mt-1 font-mono">{p.category || "Sem Categoria"}</span>
                              </div>
                           </td>
                           <td className="px-8 py-4">
                              <span className="text-xs font-mono font-bold text-white/60">{renderPrice(p.pvp || p.price || 0)}</span>
                           </td>
                           <td className="px-8 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setTab("products");
                                    setEditingProduct(p);
                                    // Keep modal open or close it? Let's close this one so the edit modal is visible
                                    setIsUserDetailsModalOpen(false);
                                  }}
                                  className="h-8 w-8 p-0 text-white/70 hover:text-luxury-gold hover:bg-luxury-gold/10"
                                >
                                  <Edit size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setTab("products");
                                    setProductToDelete(p);
                                    setIsUserDetailsModalOpen(false);
                                  }}
                                  className="h-8 w-8 p-0 text-white/70 hover:text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                           </td>
                        </tr>
                      ))}
                    {products.filter(p => p.created_by === selectedUserForProducts.id).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-20 text-center">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">Este utilizador ainda não carregou nenhum produto.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 bg-black/60 flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => setIsUserDetailsModalOpen(false)}
                className="rounded-none border-white/10 text-white/90 hover:text-white uppercase tracking-widest text-[9px] px-8 h-12"
              >
                Fechar Visualização
              </Button>
            </div>
          </motion.div>
        </div>
      )}
      </div>

      {viewingOrder && (() => {
        const shippingData = (() => {
          if (!viewingOrder.shipping_details) return viewingOrder.selected_options?.shipping_details;
          if (typeof viewingOrder.shipping_details === 'object') return viewingOrder.shipping_details;
          try {
            return JSON.parse(viewingOrder.shipping_details);
          } catch(e) {
            return null;
          }
        })();
        
        return (
        <div className="fixed inset-0 z-[60] bg-luxury-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full bg-luxury-dark border-white/10 rounded-sm p-8 space-y-6 animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <h3 className="text-xl font-serif text-luxury-gold">Detalhes do Pedido</h3>
              <Button variant="ghost" onClick={() => setViewingOrder(null)} className="text-white/90 hover:text-white">
                <X size={20} />
              </Button>
            </div>
            
            <div className="space-y-6">
              {/* Controlo Manual de Estado */}
              <div className="p-4 bg-luxury-gold/5 border border-luxury-gold/20 rounded-none space-y-4">
                <div className="flex items-center gap-2 text-luxury-gold text-[10px] font-bold uppercase tracking-widest mb-2">
                  <Settings size={14} /> Controlo Administrativo Manual
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-luxury-gold font-bold">ID Exclusivo AliExpress</label>
                    <div className="relative group">
                      <input 
                        type="text"
                        value={manualProviderOrderId}
                        onChange={(e) => setManualProviderOrderId(e.target.value)}
                        placeholder={viewingOrder.provider_order_id || "Ex: 8151234567890"}
                        className="w-full bg-black/40 border border-luxury-gold/20 p-2 text-[10px] text-white outline-none focus:border-luxury-gold focus:bg-black/60 transition-all group-hover:border-luxury-gold/40"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[7px] text-luxury-gold/30 uppercase font-black tracking-tighter pointer-events-none group-focus-within:opacity-0 transition-opacity">
                        REF MANUAL
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/90">Estado Geral</label>
                    <select 
                      value={manualStatus || viewingOrder.status}
                      onChange={(e) => setManualStatus(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 p-2 text-[10px] uppercase text-white outline-none focus:border-luxury-gold"
                    >
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago (Confirmado)</option>
                      <option value="processing_provider">Em Processamento no Fornecedor</option>
                      <option value="completed">Concluído</option>
                      <option value="refunded">Reembolsado</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/90">Estado Logístico</label>
                    <select 
                      value={manualShippingStatus || viewingOrder.shipping_status || "pending"}
                      onChange={(e) => setManualShippingStatus(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 p-2 text-[10px] uppercase text-white outline-none focus:border-luxury-gold"
                    >
                      <option value="pending">Aguardando Envio</option>
                      <option value="preparing">Em Preparação</option>
                      <option value="ready">Pronto a Despachar</option>
                      <option value="sent">Enviado / Em Trânsito</option>
                      <option value="out_for_delivery">Em Rota de Entrega</option>
                      <option value="delivered">Entregue</option>
                      <option value="incident">Incidente / Problema</option>
                      <option value="lost">Extraviado</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/90">Código de Rastreio</label>
                    <input 
                      type="text"
                      value={manualTrackingCode}
                      onChange={(e) => setManualTrackingCode(e.target.value)}
                      placeholder={viewingOrder.shipping_tracking_code || "Ex: LB123456789HK"}
                      className="w-full bg-black/50 border border-white/10 p-2 text-[10px] text-white outline-none focus:border-luxury-gold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/90">Link de Rastreio</label>
                    <input 
                      type="text"
                      value={manualTrackingUrl}
                      onChange={(e) => setManualTrackingUrl(e.target.value)}
                      placeholder={viewingOrder.shipping_tracking_url || "Ex: https://17track.net/..."}
                      className="w-full bg-black/50 border border-white/10 p-2 text-[10px] text-white outline-none focus:border-luxury-gold"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div 
                      onClick={() => setStripeCheckToggle(!stripeCheckToggle)}
                      className={`w-10 h-5 rounded-full transition-all relative ${stripeCheckToggle ? 'bg-luxury-gold' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${stripeCheckToggle ? 'left-6' : 'left-1'}`} />
                    </div>
                    <span className="text-[9px] uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">Verificar Stripe antes de salvar</span>
                  </label>
                  
                  <Button 
                    size="sm"
                    onClick={() => handleManualStatusUpdate(
                      viewingOrder.id, 
                      manualStatus || viewingOrder.status, 
                      manualShippingStatus || viewingOrder.shipping_status, 
                      stripeCheckToggle
                    )}
                    className="ml-auto bg-luxury-gold text-black hover:bg-white text-[9px] font-black uppercase tracking-widest h-8 px-6 rounded-none transition-all"
                  >
                    Confirmar Alteração
                  </Button>
                </div>
              </div>

              {viewingOrder.product?.admin_link && (
                <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-none">
                  <div className="p-2 bg-blue-500/20 text-blue-400">
                    <ExternalLink size={16} />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-blue-400 font-bold">Gestão Externa</p>
                    <a 
                      href={viewingOrder.product.admin_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[11px] text-white hover:text-luxury-gold transition-colors font-medium flex items-center gap-1"
                    >
                      Abrir link do produto no fornecedor <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              )}

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
                  <p className="text-[10px] uppercase tracking-widest text-white/90 mb-1">Produto Adquirido</p>
                  <div className="flex justify-between items-start">
                    <h4 className="font-serif text-lg text-white">
                      {viewingOrder.product?.title || "Produto Removido"} 
                      {viewingOrder.quantity > 1 && (
                        <span className="text-luxury-gold ml-2">x{viewingOrder.quantity}</span>
                      )}
                    </h4>
                    <div className="text-xl font-mono font-black text-white ml-4">
                      {renderPrice(Number(viewingOrder.total_amount))}
                    </div>
                  </div>
                  {viewingOrder.selected_options && (
                    <p className="text-white/60 mt-1 uppercase text-[10px] tracking-widest">
                      {viewingOrder.selected_options.size && `Tamanho: ${viewingOrder.selected_options.size} `}
                      {viewingOrder.selected_options.color && `| Cor: ${viewingOrder.selected_options.color}`}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/90 mb-1">Cliente</p>
                <div className="text-base text-white">{viewingOrder.customer_email}</div>
                {shippingData && (
                  <div className="text-sm text-white/80 mt-1">{shippingData.fullName || `${shippingData.firstName || ''} ${shippingData.lastName || ''}`.trim() || shippingData.name}</div>
                )}
              </div>

              {shippingData ? (
                <div className="p-4 border border-white/10 bg-white/5 space-y-3">
                  <div className="text-[10px] uppercase tracking-widest text-luxury-gold flex items-center gap-2">
                    <Truck size={14} /> Morada de Envio Completa
                  </div>
                  <div className="text-sm space-y-1 text-white/80">
                    <p><span className="text-white/90">Morada:</span> {shippingData.address || "N/A"}</p>
                    <p><span className="text-white/90">Código Postal:</span> {shippingData.postalCode || shippingData.zip || "N/A"}</p>
                    <p><span className="text-white/90">Localidade:</span> {shippingData.city || "N/A"}</p>
                    <p><span className="text-white/90">País:</span> {shippingData.country || "N/A"}</p>
                    <p><span className="text-white/90">Telemóvel:</span> {shippingData.phone || "N/A"}</p>
                    {shippingData.identification && (
                      <p className="bg-luxury-gold/10 p-2 mt-2 border border-luxury-gold/30">
                        <span className="text-luxury-gold font-bold">Identificação (CPF/NIF/ID):</span> {shippingData.identification}
                      </p>
                    )}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pt-6 border-t border-white/10">
                <div className="p-4 bg-white/5 border border-white/10">
                  <p className="text-[10px] uppercase tracking-widest text-white/90 mb-2">Estado do Pedido</p>
                  <div className="flex items-center gap-2">
                     <span className={`text-[10px] uppercase font-black px-2 py-1 ${
                       ["paid", "completed", "succeeded", "pago"].includes(viewingOrder.status?.toLowerCase() || "") ? "bg-emerald-500/10 text-emerald-500" :
                       viewingOrder.status === 'manual_fulfillment_required' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                       ["canceled", "cancelled"].includes(viewingOrder.status?.toLowerCase() || "") ? "bg-red-500/10 text-red-500" :
                       ["refunded", "reembolsado", "refund_pending"].includes(viewingOrder.status?.toLowerCase() || "") ? "bg-zinc-500/10 text-zinc-500" :
                       "bg-white/10 text-white"
                     }`}>
                       {["paid", "completed", "succeeded", "pago"].includes(viewingOrder.status?.toLowerCase() || "") ? "Pago" : 
                        viewingOrder.status === 'manual_fulfillment_required' ? "Fulfillment Pendente" :
                        ["canceled", "cancelled"].includes(viewingOrder.status?.toLowerCase() || "") ? "Cancelado" : 
                        ["refunded", "reembolsado", "refund_pending"].includes(viewingOrder.status?.toLowerCase() || "") ? "Reembolsado" :
                        "Pendente"}
                     </span>
                  </div>
                </div>
                <div className="p-4 bg-white/5 border border-white/10">
                  <p className="text-[10px] uppercase tracking-widest text-white/90 mb-2">Estado do Envio</p>
                  <div className="flex items-center gap-2">
                     <span className={`text-[10px] uppercase font-black px-2 py-1 ${
                       viewingOrder.shipping_status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500' :
                       viewingOrder.shipping_status === 'sent' ? 'bg-blue-500/10 text-blue-500' :
                       'bg-white/10 text-white'
                     }`}>
                       {viewingOrder.shipping_status === 'delivered' ? 'Entregue' : 
                        viewingOrder.shipping_status === 'sent' ? 'Enviado' : 
                        viewingOrder.shipping_status === 'pending' ? 'Pendente' :
                        viewingOrder.shipping_status || 'Aguardando'}
                     </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/90 mb-1">Identificadores do Sistema</p>
                <div className="p-4 border border-white/10 bg-black/20 text-xs font-mono space-y-3">
                  <div className="select-all block"><span className="text-white/90 select-none">Ordem ID:</span> Sart-{viewingOrder.id.split('-')[0].toUpperCase()} ({viewingOrder.id})</div>
                  <div className="select-all block"><span className="text-white/90 select-none">Produto ID:</span> {viewingOrder.product_id}</div>
                  
                  {viewingOrder.fulfillment_error && (
                    <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                      <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                        <AlertTriangle size={12} /> Erro de Automação
                      </div>
                      <p className="text-xs text-white/60 font-mono italic">{viewingOrder.fulfillment_error}</p>
                    </div>
                  )}
                  
                  {/* Utilidades de E-mail */}
                  <div className="py-3 mt-3 border-y border-white/5 space-y-3">
                    <p className="text-[8px] uppercase tracking-[0.2em] text-luxury-gold font-bold">Resgate & Notificações Manuais</p>
                    <div className="flex flex-wrap gap-2">
                       <Button 
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRetriggerEmail(viewingOrder.id, 'payment')}
                        className="bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500 rounded-none text-[8px] uppercase tracking-widest font-bold h-8 px-3 border border-emerald-500/20"
                        title="Enviar e-mail de confirmação de pagamento"
                      >
                        <Mail size={10} className="mr-2" /> Confirmação de Pagamento
                        {viewingOrder.email_paid_sent && <Check size={10} className="ml-2 text-emerald-400" />}
                      </Button>
                      
                      <Button 
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRetriggerEmail(viewingOrder.id, 'shipping')}
                        className="bg-blue-500/5 hover:bg-blue-500/10 text-blue-500 rounded-none text-[8px] uppercase tracking-widest font-bold h-8 px-3 border border-blue-500/20"
                        title="Enviar e-mail com código de rastreio"
                      >
                        <Truck size={10} className="mr-2" /> Notificação de Envio
                        {viewingOrder.email_shipped_sent && <Check size={10} className="ml-2 text-blue-400" />}
                      </Button>

                      <Button 
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRetriggerEmail(viewingOrder.id, 'canceled')}
                        className="bg-red-500/5 hover:bg-red-500/10 text-red-500 rounded-none text-[8px] uppercase tracking-widest font-bold h-8 px-3 border border-red-500/20"
                        title="Enviar e-mail de cancelamento"
                      >
                        <X size={10} className="mr-2" /> Cancelamento
                        {viewingOrder.email_canceled_sent && <Check size={10} className="ml-2 text-red-400" />}
                      </Button>

                      <Button 
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRetriggerEmail(viewingOrder.id, 'delivered')}
                        className="bg-purple-500/5 hover:bg-purple-500/10 text-purple-500 rounded-none text-[8px] uppercase tracking-widest font-bold h-8 px-3 border border-purple-500/20"
                        title="Enviar e-mail de confirmação de entrega"
                      >
                        <CheckCircle size={10} className="mr-2" /> Entrega Concluída
                        {viewingOrder.email_delivered_sent && <Check size={10} className="ml-2 text-purple-400" />}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-4">
                      {(() => {
                         const product = viewingOrder.product;
                         const provider = viewingOrder.provider || product?.provider || 'aliexpress';
                         const isAli = provider === 'aliexpress';
                         const providerLabel = isAli ? 'Internacional' : 'Local';
                         const externalId = (viewingOrder.provider_order_id);
                         
                         return (
                           <>
                              <div className="flex flex-col gap-1">
                                <span className="text-white/90 select-none uppercase text-[8px] tracking-[0.2em]">Status {providerLabel}</span>
                                <div className="flex items-center gap-2">
                                  {externalId || (viewingOrder.shipping_tracking_code || viewingOrder.shipping_status_metadata?.trackingNumber) ? (
                                    <>
                                      <div className={`w-2 h-2 rounded-full ${externalId ? (isAli ? 'bg-orange-500' : 'bg-emerald-500') : 'bg-blue-500'} animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.5)]`} />
                                      <span className={`${externalId ? (isAli ? 'text-orange-500' : 'text-emerald-500') : 'text-blue-500'} font-bold tracking-widest text-[9px] uppercase font-mono`}>
                                        {externalId ? `Sincronizado (#${externalId})` : `Rastreio Manual (#${viewingOrder.shipping_tracking_code || viewingOrder.shipping_status_metadata?.trackingNumber})`}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                                      <span className="text-amber-500 font-bold tracking-widest text-[9px] uppercase">Aguardando Envio</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2">
                                {(externalId || viewingOrder.shipping_tracking_code || viewingOrder.shipping_status_metadata?.trackingNumber) ? (
                                  <div className="flex flex-col gap-2 flex-1">
                                     <div className="bg-orange-500/10 border border-orange-500/20 p-3 flex flex-col items-center justify-center gap-1">
                                       <p className="text-[8px] uppercase tracking-[0.2em] text-white/90 font-bold">Estado Logístico Real-Time</p>
                                       <p className="text-sm text-orange-500 font-black uppercase tracking-widest">
                                         {viewingOrder.shipping_status_metadata?.lastExternalStatus || viewingOrder.shipping_status || 'Processado'}
                                       </p>
                                     </div>
                                     <Button 
                                       size="sm"
                                       variant="outline"
                                       onClick={() => handleSyncStatus(viewingOrder.id)}
                                       className="border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white rounded-none text-[9px] uppercase tracking-widest font-black h-9 px-4 flex-1"
                                     >
                                       <RefreshCw size={10} className="mr-2" /> Forçar Sincronização
                                     </Button>
                                  </div>
                                ) : (viewingOrder.status === 'paid' || viewingOrder.status === "pago" || viewingOrder.status === 'completed') && (
                                  <>
                                    <Button 
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleSyncStatus(viewingOrder.id)}
                                      className="border-white/10 text-white hover:bg-white/5 rounded-none text-[9px] uppercase tracking-widest font-bold h-9 px-4"
                                    >
                                      <Search size={10} className="mr-2" /> 
                                      Verificar Stat. {providerLabel}
                                    </Button>

                                    {viewingOrder.product?.admin_link && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleCyberFulfillPress(viewingOrder)}
                                        disabled={cyberLoading}
                                        className={`rounded-none text-[9px] uppercase tracking-[1.5px] font-black h-9 px-6 shadow-lg transition-all duration-300 ${
                                          cyberLoading 
                                            ? "border-cyan-400 border-dashed bg-cyan-950 text-cyan-400 cursor-not-allowed opacity-80 animate-pulse" 
                                            : "bg-gradient-to-br from-zinc-900 to-indigo-950 text-white border border-purple-500 hover:scale-105 hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-[0_12px_35px_rgba(0,242,254,0.3),inset_0_0_15px_rgba(168,85,247,0.1)] shadow-purple-500/20"
                                        }`}
                                      >
                                        {cyberLoading ? (
                                          <span className="flex items-center gap-2">
                                            <span className="animate-spin text-base">🌀</span>
                                            {cyberStatus}
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-2">
                                            <Zap size={10} className="text-cyan-400 animate-pulse" />
                                            {cyberStatus}
                                          </span>
                                        )}
                                      </Button>
                                    )}
                                    
                                    {isAli ? (
                                      <div className="flex gap-2">
                                        <Button 
                                          size="sm"
                                          onClick={() => handleManualFulfill(viewingOrder.id)}
                                          className="bg-luxury-gold text-black hover:bg-luxury-gold/80 rounded-none text-[9px] uppercase tracking-widest font-black h-9 px-6 shadow-lg shadow-luxury-gold/20 flex-1"
                                        >
                                          <Truck size={10} className="mr-2" /> Manual
                                        </Button>
                                        <Button 
                                          size="sm"
                                          onClick={() => handleInternationalFulfill(viewingOrder.id)}
                                          className="bg-orange-500 text-white hover:bg-orange-600 rounded-none text-[9px] uppercase tracking-widest font-black h-9 px-6 shadow-lg shadow-orange-900/20 flex-1"
                                        >
                                          <Zap size={10} className="mr-2" /> Auto-API
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button 
                                        size="sm"
                                        onClick={() => handleManualFulfill(viewingOrder.id)}
                                        className="bg-luxury-gold text-black hover:bg-luxury-gold/80 rounded-none text-[9px] uppercase tracking-widest font-black h-9 px-6 shadow-lg shadow-luxury-gold/20"
                                      >
                                        Enviar Manualmente
                                      </Button>
                                    )}
                                  </>
                                )}

                                {externalId && (
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSyncStatus(viewingOrder.id)}
                                    className="border-white/10 text-white hover:bg-white/5 rounded-none text-[8px] uppercase tracking-widest font-bold h-8 px-3"
                                  >
                                    <RefreshCw size={10} className="mr-2" /> 
                                    Sincronizar c/ {providerLabel}
                                  </Button>
                                )}
                              </div>
                           </>
                         );
                      })()}
                  </div>

                  {viewingOrder.shipping_status_metadata && (
                    <div className="pt-3 mt-3 border-t border-white/5 space-y-2">
                      <p className="text-[8px] uppercase tracking-[0.2em] text-white/90">Informações de Rastreio</p>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-white font-mono">{viewingOrder.shipping_status_metadata.trackingNumber || "Aguardando código..."}</span>
                        {viewingOrder.shipping_status_metadata.trackingUrl && (
                          <a 
                            href={viewingOrder.shipping_status_metadata.trackingUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-luxury-gold hover:underline font-bold"
                          >
                            Ver no site da transportadora
                          </a>
                        )}
                      </div>
                    </div>
                  )}
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

      {isTestEmailModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsTestEmailModalOpen(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1A1A1A] border border-luxury-gold/20 w-full max-w-md p-8 relative z-10 space-y-6 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-luxury-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
            
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-serif text-luxury-gold tracking-tight">Testar SMTP</h3>
              <p className="text-xs text-white/90 uppercase tracking-[0.2em]">
                Validação do Servidor de E-mail
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-white/70 font-bold">E-mail de Destino</label>
                <input
                  type="email"
                  value={testEmailInput}
                  onChange={(e) => setTestEmailInput(e.target.value)}
                  autoFocus
                  placeholder="exemplo@email.com"
                  className="w-full bg-black/50 border border-white/10 p-4 text-sm text-white focus:border-luxury-gold focus:outline-none transition-all placeholder:text-white/10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmTestEmail();
                    }
                  }}
                />
                <p className="text-[9px] text-white/70 mt-2 leading-relaxed">
                  Isto enviará um e-mail real utilizando a configuração de porta 465 definida no servidor. Verifique a sua caixa de entrada (e SPAM).
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => setIsTestEmailModalOpen(false)}
                  variant="ghost"
                  className="flex-1 text-white/90 hover:text-white hover:bg-white/5 rounded-none h-12 uppercase tracking-widest text-[9px]"
                >
                  Voltar
                </Button>
                <Button 
                  onClick={handleConfirmTestEmail}
                  className="flex-1 bg-luxury-gold text-black hover:bg-luxury-gold/80 rounded-none h-12 uppercase tracking-widest text-[10px] font-black shadow-lg shadow-luxury-gold/20"
                >
                  Enviar Teste
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Site Settings Modal */}
      {isSiteSettingsOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setIsSiteSettingsOpen(false)}
            className="absolute inset-0 bg-[#050505]/95 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-xl bg-[#080808] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#080808] z-10 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-luxury-gold/10 flex items-center justify-center">
                  <Settings size={20} className="text-luxury-gold" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-white leading-none">Configurações do Site</h3>
                  <p className="text-[9px] text-white/85 uppercase tracking-[0.2em] mt-1.5">Identidade Visual da Boutique</p>
                </div>
              </div>
              <button 
                onClick={() => setIsSiteSettingsOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors text-white/90 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">
              <div className="space-y-6">
                {/* Theme Selector */}
                <div className="space-y-3 pb-6 border-b border-white/5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/90 font-bold block">Tema Ativo da Boutique</label>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Luxury Theme */}
                    <button
                      type="button"
                      onClick={() => setLocalTheme("luxury")}
                      className={`relative p-3 text-left border flex flex-col justify-between h-24 transition-all duration-300 rounded-none ${
                        localTheme === "luxury"
                          ? "border-luxury-gold bg-luxury-gold/5 shadow-lg shadow-luxury-gold/5"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <span className="text-[8px] uppercase tracking-wider font-bold text-white/60">Classic</span>
                        <div className={`w-2 h-2 rounded-full ${localTheme === "luxury" ? "bg-luxury-gold" : "bg-white/20"}`} />
                      </div>
                      <div>
                        <h4 className="font-serif text-[11px] text-white font-semibold">Luxury Gold</h4>
                        <p className="text-[7px] text-white/90 mt-0.5">Preto & Ouro</p>
                      </div>
                    </button>

                    {/* Christmas Theme */}
                    <button
                      type="button"
                      onClick={() => setLocalTheme("christmas")}
                      className={`relative p-3 text-left border flex flex-col justify-between h-24 transition-all duration-300 rounded-none ${
                        localTheme === "christmas"
                          ? "border-red-500 bg-red-950/10 shadow-lg shadow-red-500/5"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <span className="text-[8px] uppercase tracking-wider font-bold text-red-400">Inverno</span>
                        <div className={`w-2 h-2 rounded-full ${localTheme === "christmas" ? "bg-red-500" : "bg-white/20"}`} />
                      </div>
                      <div>
                        <h4 className="font-serif text-[11px] text-white font-semibold">Natalino</h4>
                        <p className="text-[7px] text-white/90 mt-0.5">Vermelho & Neve</p>
                      </div>
                    </button>

                    {/* Summer Theme */}
                    <button
                      type="button"
                      onClick={() => setLocalTheme("summer")}
                      className={`relative p-3 text-left border flex flex-col justify-between h-24 transition-all duration-300 rounded-none ${
                        localTheme === "summer"
                          ? "border-orange-500 bg-orange-950/10 shadow-lg shadow-orange-500/5"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <span className="text-[8px] uppercase tracking-wider font-bold text-orange-400">Verão</span>
                        <div className={`w-2 h-2 rounded-full ${localTheme === "summer" ? "bg-orange-500" : "bg-white/20"}`} />
                      </div>
                      <div>
                        <h4 className="font-serif text-[11px] text-white font-semibold">Pôr-do-Sol</h4>
                        <p className="text-[7px] text-white/90 mt-0.5">Laranja & Calor</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Integração AliExpress */}
                <div className="space-y-4 pb-6 border-b border-white/5 bg-white/[0.02] p-5 rounded-xl border border-luxury-gold/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <h4 className="text-[11px] uppercase tracking-[0.2em] text-white/95 font-black flex items-center gap-2">
                        <span>Integração Oficial AliExpress</span>
                        <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                          PRODUÇÃO (ONLINE)
                        </span>
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestAliConnection}
                      disabled={isTestingAliConnection}
                      className="text-[9px] bg-luxury-gold text-black px-3 py-1.5 uppercase tracking-wider font-extrabold rounded hover:bg-luxury-gold/90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <RefreshCw size={10} className={isTestingAliConnection ? "animate-spin" : ""} />
                      {isTestingAliConnection ? "Testando..." : "⚡ Testar Conexão"}
                    </button>
                  </div>

                  {aliTestResult && (
                    <div className={`p-3 rounded-lg text-xs font-mono border ${aliTestResult.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'}`}>
                      <div className="font-bold mb-0.5">{aliTestResult.success ? "✅ Conexão Validada" : "⚠️ Erro na Conexão"}</div>
                      <div className="text-[11px] opacity-90">{aliTestResult.message}</div>
                    </div>
                  )}

                  {/* Passo 1: Link de Autorização OAuth 2.0 */}
                  <div className="bg-black/40 border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider text-luxury-gold font-bold flex items-center gap-1.5">
                        <span>Passo 1: Gerar Código de Autorização</span>
                      </div>
                      <a
                        href={`https://oauth.aliexpress.com/authorize?response_type=code&force_auth=true&client_id=${aliAppKey.trim() || '533964'}&redirect_uri=https://sart-full.pt/&sp=ae`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] bg-white/10 hover:bg-white/20 text-white font-bold px-2.5 py-1 rounded border border-white/20 transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        <ExternalLink size={10} />
                        Abrir Link no Navegador
                      </a>
                    </div>
                    <p className="text-[9px] text-white/60 leading-relaxed">
                      Abra o link acima, faça login na sua conta AliExpress e clique em <strong className="text-white/90">Authorize</strong>. O navegador será redirecionado para a sua loja com o código no link (ex: <code className="text-luxury-gold">?code=3_533964_...</code>).
                    </p>
                  </div>

                  {/* Passo 2: Troca do Code por Token de Produção */}
                  <div className="bg-black/40 border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-luxury-gold font-bold">
                      Passo 2: Trocar "Code" pelo Token Oficial de Produção
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={aliAuthCode}
                        onChange={(e) => setAliAuthCode(e.target.value)}
                        placeholder="Cole aqui o code gerado (ex: 3_533964_xxx...)"
                        className="flex-1 bg-white/5 border border-white/15 px-3 py-2 text-xs outline-none focus:border-luxury-gold transition-all text-white font-mono rounded"
                      />
                      <button
                        type="button"
                        onClick={handleExchangeAliCode}
                        disabled={isExchangingAliCode || !aliAuthCode.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-[10px] uppercase tracking-wider font-black rounded transition-all disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                      >
                        <Check size={12} />
                        {isExchangingAliCode ? "Gerando..." : "Gerar Token"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-[0.15em] text-white/60 font-bold block">App Key (Produção)</label>
                        <input
                          value={aliAppKey}
                          onChange={(e) => setAliAppKey(e.target.value)}
                          placeholder="533964"
                          className="w-full bg-white/5 border border-white/10 px-4 py-2.5 text-xs outline-none focus:border-luxury-gold transition-all text-white/90 font-mono rounded"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-[0.15em] text-white/60 font-bold block">App Secret (Produção)</label>
                        <input
                          type="password"
                          value={aliAppSecret}
                          onChange={(e) => setAliAppSecret(e.target.value)}
                          placeholder="••••••••••••••••••••"
                          className="w-full bg-white/5 border border-white/10 px-4 py-2.5 text-xs outline-none focus:border-luxury-gold transition-all text-white/90 font-mono rounded"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] uppercase tracking-[0.15em] text-white/60 font-bold block">Access Token Oficial (Session Key)</label>
                        <span className="text-[8px] text-emerald-400 uppercase tracking-widest font-black">Pronto para Produção</span>
                      </div>
                      <textarea
                        value={aliAccessToken}
                        onChange={(e) => setAliAccessToken(e.target.value)}
                        placeholder="O Access Token oficial do AliExpress aparecerá aqui automaticamente após a troca ou pode colá-lo diretamente..."
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 px-4 py-3 text-xs outline-none focus:border-luxury-gold transition-all text-white/90 font-mono resize-none custom-scrollbar rounded"
                      />
                    </div>
                  </div>
                </div>

                {/* Media Hero Config Section */}
                <div className="pt-4 border-t border-white/10 space-y-6">
                  <div className="bg-white/5 border border-white/10 p-4 space-y-1">
                    <h4 className="text-xs font-serif uppercase tracking-widest text-luxury-gold font-bold flex items-center gap-2">
                      <Film size={14} />
                      Configuração do Banner Principal (Hero Responsivo)
                    </h4>
                    <p className="text-[10px] text-white/60 leading-relaxed">
                      Defina imagens e vídeos específicos para <strong className="text-white/90">Telas Grandes (Desktop)</strong> e para <strong className="text-white/90">Telas Menores (Mobile/Telemóvel)</strong> para garantir um enquadramento perfeito em todos os dispositivos.
                    </p>
                  </div>

                  {/* Desktop Section */}
                  <div className="space-y-4 bg-white/[0.02] border border-amber-500/20 p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider pb-2 border-b border-white/10">
                      <Monitor size={16} />
                      <span>Telas Grandes (Computadores / Notebooks)</span>
                    </div>

                    {/* Desktop Image */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <label className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-bold flex items-center gap-1.5">
                          <ImageIcon size={12} className="text-amber-400" />
                          Imagem Desktop (Banner Principal)
                        </label>
                        <div className="flex items-center gap-2">
                          {siteHero.image && (
                            <button
                              type="button"
                              onClick={() => setSiteHero({ ...siteHero, image: "" })}
                              className="text-[9px] uppercase tracking-widest text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-500/10 border border-red-500/20 transition-all"
                            >
                              Remover
                            </button>
                          )}
                          <label className="cursor-pointer text-[10px] bg-luxury-gold text-black uppercase tracking-widest font-black px-3 py-1 hover:bg-white transition-all flex items-center gap-1.5 shadow-md">
                            <Upload size={12} />
                            {uploading ? "A carregar..." : "Carregar Ficheiro"}
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => handleFileUpload(e, "hero_image")}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      </div>

                      <input
                        value={siteHero.image}
                        onChange={(e) => setSiteHero({ ...siteHero, image: e.target.value })}
                        placeholder="https://exemplo.com/imagem-desktop.jpg"
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-xs outline-none focus:border-luxury-gold transition-all text-white/90 placeholder:text-white/20 font-mono"
                      />
                    </div>

                    {/* Desktop Video */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <label className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-bold flex items-center gap-1.5">
                          <Video size={12} className="text-amber-400" />
                          Vídeo Desktop (Fundo / Animação - Opcional)
                        </label>
                        <div className="flex items-center gap-2">
                          {siteHero.video_url && (
                            <button
                              type="button"
                              onClick={() => setSiteHero({ ...siteHero, video_url: "" })}
                              className="text-[9px] uppercase tracking-widest text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-500/10 border border-red-500/20 transition-all"
                            >
                              Remover Vídeo
                            </button>
                          )}
                          <label className="cursor-pointer text-[10px] bg-luxury-gold text-black uppercase tracking-widest font-black px-3 py-1 hover:bg-white transition-all flex items-center gap-1.5 shadow-md">
                            <Upload size={12} />
                            {uploading ? "A carregar..." : "Carregar Vídeo"}
                            <input
                              type="file"
                              className="hidden"
                              accept="video/*"
                              onChange={(e) => handleFileUpload(e, "hero_video")}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      </div>

                      <input
                        value={siteHero.video_url}
                        onChange={(e) => setSiteHero({ ...siteHero, video_url: e.target.value })}
                        placeholder="https://exemplo.com/video-desktop.mp4"
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-xs outline-none focus:border-luxury-gold transition-all text-white/90 placeholder:text-white/20 font-mono"
                      />
                    </div>
                  </div>

                  {/* Mobile Section */}
                  <div className="space-y-4 bg-white/[0.02] border border-sky-500/20 p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider pb-2 border-b border-white/10">
                      <Smartphone size={16} />
                      <span>Telas Menores (Telemóveis / Smartphones)</span>
                    </div>

                    {/* Mobile Image */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <label className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-bold flex items-center gap-1.5">
                          <ImageIcon size={12} className="text-sky-400" />
                          Imagem Mobile (Enquadramento Vertical/Mobile)
                        </label>
                        <div className="flex items-center gap-2">
                          {siteHero.image_mobile && (
                            <button
                              type="button"
                              onClick={() => setSiteHero({ ...siteHero, image_mobile: "" })}
                              className="text-[9px] uppercase tracking-widest text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-500/10 border border-red-500/20 transition-all"
                            >
                              Remover
                            </button>
                          )}
                          <label className="cursor-pointer text-[10px] bg-sky-400 text-black uppercase tracking-widest font-black px-3 py-1 hover:bg-white transition-all flex items-center gap-1.5 shadow-md">
                            <Upload size={12} />
                            {uploading ? "A carregar..." : "Carregar Ficheiro"}
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => handleFileUpload(e, "hero_image_mobile")}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      </div>

                      <input
                        value={siteHero.image_mobile || ""}
                        onChange={(e) => setSiteHero({ ...siteHero, image_mobile: e.target.value })}
                        placeholder="https://exemplo.com/imagem-mobile.jpg (Opcional - usa a imagem desktop se vazia)"
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-xs outline-none focus:border-sky-400 transition-all text-white/90 placeholder:text-white/20 font-mono"
                      />
                    </div>

                    {/* Mobile Video */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <label className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-bold flex items-center gap-1.5">
                          <Video size={12} className="text-sky-400" />
                          Vídeo Mobile (Opcional)
                        </label>
                        <div className="flex items-center gap-2">
                          {siteHero.video_mobile_url && (
                            <button
                              type="button"
                              onClick={() => setSiteHero({ ...siteHero, video_mobile_url: "" })}
                              className="text-[9px] uppercase tracking-widest text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-red-500/10 border border-red-500/20 transition-all"
                            >
                              Remover Vídeo
                            </button>
                          )}
                          <label className="cursor-pointer text-[10px] bg-sky-400 text-black uppercase tracking-widest font-black px-3 py-1 hover:bg-white transition-all flex items-center gap-1.5 shadow-md">
                            <Upload size={12} />
                            {uploading ? "A carregar..." : "Carregar Vídeo"}
                            <input
                              type="file"
                              className="hidden"
                              accept="video/*"
                              onChange={(e) => handleFileUpload(e, "hero_video_mobile")}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      </div>

                      <input
                        value={siteHero.video_mobile_url || ""}
                        onChange={(e) => setSiteHero({ ...siteHero, video_mobile_url: e.target.value })}
                        placeholder="https://exemplo.com/video-mobile.mp4 (Opcional)"
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-xs outline-none focus:border-sky-400 transition-all text-white/90 placeholder:text-white/20 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/90 font-bold">Título do Banner</label>
                  <input
                    value={siteHero.title}
                    onChange={(e) => setSiteHero({ ...siteHero, title: e.target.value })}
                    placeholder="Luxo & Exclusividade"
                    className="w-full bg-white/5 border border-white/10 px-4 py-4 text-sm outline-none focus:border-luxury-gold transition-all text-white/80"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/90 font-bold">Subtítulo do Banner</label>
                  <input
                    value={siteHero.subtitle}
                    onChange={(e) => setSiteHero({ ...siteHero, subtitle: e.target.value })}
                    placeholder="A Essência da Exclusividade"
                    className="w-full bg-white/5 border border-white/10 px-4 py-4 text-sm outline-none focus:border-luxury-gold transition-all text-white/80"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/90 font-bold">Texto do Botão Hero</label>
                  <input
                    value={siteHero.buttonText}
                    onChange={(e) => setSiteHero({ ...siteHero, buttonText: e.target.value })}
                    placeholder="Explorar Coleção"
                    className="w-full bg-white/5 border border-white/10 px-4 py-4 text-sm outline-none focus:border-luxury-gold transition-all text-white/80"
                  />
                </div>
                
                {/* Visual Previews */}
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold block">
                    Pré-visualização dos Mídias
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Desktop Preview Card */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1">
                        <Monitor size={12} /> Preview Desktop
                      </span>
                      <div className="aspect-[16/9] w-full border border-white/10 relative overflow-hidden rounded-lg bg-black flex items-center justify-center">
                        {siteHero.video_url ? (
                          <video
                            key={siteHero.video_url}
                            src={getImageUrl(siteHero.video_url)}
                            poster={getImageUrl(siteHero.image)}
                            className="w-full h-full object-cover opacity-70"
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                        ) : siteHero.image ? (
                          <img
                            src={getImageUrl(siteHero.image)}
                            alt="Desktop Preview"
                            className="w-full h-full object-cover opacity-80"
                          />
                        ) : (
                          <span className="text-[10px] text-white/30 font-mono">Sem imagem desktop</span>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-2 text-center">
                          <h5 className="text-[9px] font-serif text-white uppercase drop-shadow">{siteHero.title}</h5>
                          <span className="mt-1 px-2 py-0.5 bg-luxury-gold text-[7px] text-black font-black uppercase tracking-widest">
                            {siteHero.buttonText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mobile Preview Card */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase tracking-wider text-sky-400 font-mono flex items-center gap-1">
                        <Smartphone size={12} /> Preview Mobile
                      </span>
                      <div className="aspect-[9/16] max-h-[180px] mx-auto border border-white/10 relative overflow-hidden rounded-lg bg-black flex items-center justify-center">
                        {siteHero.video_mobile_url ? (
                          <video
                            key={siteHero.video_mobile_url}
                            src={getImageUrl(siteHero.video_mobile_url)}
                            poster={getImageUrl(siteHero.image_mobile || siteHero.image)}
                            className="w-full h-full object-cover opacity-70"
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                        ) : (siteHero.image_mobile || siteHero.image) ? (
                          <img
                            src={getImageUrl(siteHero.image_mobile || siteHero.image)}
                            alt="Mobile Preview"
                            className="w-full h-full object-cover opacity-80"
                          />
                        ) : (
                          <span className="text-[10px] text-white/30 font-mono">Sem imagem mobile</span>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-2 text-center">
                          <h5 className="text-[8px] font-serif text-white uppercase drop-shadow line-clamp-1">{siteHero.title}</h5>
                          <span className="mt-1 px-1.5 py-0.5 bg-luxury-gold text-[6px] text-black font-black uppercase tracking-widest">
                            {siteHero.buttonText}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/5 flex gap-4 bg-[#080808] shrink-0">
              <Button
                variant="outline"
                onClick={() => setIsSiteSettingsOpen(false)}
                className="flex-1 border-white/5 text-white/90 hover:text-white h-12 text-[10px] uppercase tracking-[.25em] bg-white/5 rounded-none"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateSiteSettings}
                className="flex-1 bg-luxury-gold text-black hover:bg-white h-12 text-[10px] uppercase tracking-[.25em] font-black rounded-none shadow-xl shadow-luxury-gold/10"
              >
                Guardar Alterações
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Email Dispatcher Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setIsEmailModalOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-5xl bg-[#09090b] border border-luxury-gold/30 rounded-2xl overflow-hidden shadow-[0_0_120px_rgba(212,175,55,0.15)] flex flex-col max-h-[92vh] z-10"
          >
            {/* Modal Header */}
            <div className="p-6 md:p-8 border-b border-white/10 bg-white/[0.02] flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-serif text-white tracking-wide">
                      Disparo de E-mails aos <span className="text-luxury-gold italic">Clientes</span>
                    </h3>
                    <p className="text-[10px] uppercase tracking-widest text-white/60 mt-0.5">
                      {selectedUserIdsForEmail.length} destinatários selecionados de {users.length} utilizadores registados
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-all rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-white/10 bg-black/40 px-6">
              <button
                onClick={() => setEmailTabMode("compose")}
                className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all ${
                  emailTabMode === "compose"
                    ? "border-luxury-gold text-luxury-gold bg-luxury-gold/5"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Edit size={14} /> 1. Personalizar Mensagem & Produtos
              </button>
              <button
                onClick={() => setEmailTabMode("preview")}
                className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all ${
                  emailTabMode === "preview"
                    ? "border-luxury-gold text-luxury-gold bg-luxury-gold/5"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Eye size={14} /> 2. Pré-visualização do E-mail HTML
              </button>
              <button
                onClick={() => setEmailTabMode("code")}
                className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all ${
                  emailTabMode === "code"
                    ? "border-luxury-gold text-luxury-gold bg-luxury-gold/5"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Terminal size={14} /> 3. Código Edge Function Supabase
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto luxury-scrollbar p-6 md:p-8 space-y-8">
              {emailTabMode === "compose" && (
                <div className="space-y-8">
                  {/* Recipients Summary */}
                  <div className="bg-white/[0.02] border border-white/10 p-5 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-2">
                        <Users size={14} /> Destinatários Selecionados ({selectedUserIdsForEmail.length})
                      </label>
                      <button
                        onClick={() => setSelectedUserIdsForEmail(users.map(u => u.id))}
                        className="text-[9px] uppercase tracking-widest text-white/70 hover:text-luxury-gold underline"
                      >
                        Selecionar Todos ({users.length})
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto luxury-scrollbar p-1">
                      {users
                        .filter(u => selectedUserIdsForEmail.includes(u.id))
                        .map(u => (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 text-white text-[10px] font-mono rounded-full"
                          >
                            {u.full_name || u.email}
                            <button
                              onClick={() => toggleSelectUserForEmail(u.id)}
                              className="text-white/50 hover:text-red-400"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      {selectedUserIdsForEmail.length === 0 && (
                        <p className="text-xs text-red-400 font-mono">
                          Nenhum cliente selecionado. Selecione na tabela de utilizadores.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-white/80 block">
                      Assunto do E-mail *
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Ex: Coleção de Verão Exclusiva - Descontos Especiais"
                      className="w-full bg-white/5 border border-white/10 py-3.5 px-4 text-xs font-medium text-white outline-none focus:border-luxury-gold transition-all rounded-lg"
                    />
                  </div>

                  {/* Message Body */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-white/80 block">
                      Mensagem Personalizada *
                    </label>
                    <textarea
                      rows={5}
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      placeholder="Escreva a sua mensagem para os clientes..."
                      className="w-full bg-white/5 border border-white/10 p-4 text-xs font-mono leading-relaxed text-white outline-none focus:border-luxury-gold transition-all rounded-lg resize-y"
                    />
                  </div>

                  {/* Products Showcase Builder */}
                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-luxury-gold uppercase tracking-wider flex items-center gap-2">
                          <ShoppingBag size={16} /> Adicionar Produtos em Destaque ao E-mail
                        </h4>
                        <p className="text-[10px] text-white/60 uppercase tracking-widest mt-1">
                          Os produtos selecionados serão dispostos em uma grade elegante de 2 produtos por fileira.
                        </p>
                      </div>
                      <div className="w-full md:w-64 relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                        <input
                          type="text"
                          placeholder="Pesquisar catálogo..."
                          value={emailProductSearch}
                          onChange={(e) => setEmailProductSearch(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 py-2 pl-9 pr-3 text-[10px] uppercase text-white outline-none focus:border-luxury-gold rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Selected Products Badges */}
                    {selectedProductIdsForEmail.length > 0 && (
                      <div className="bg-luxury-gold/10 border border-luxury-gold/30 p-3 rounded-lg flex flex-wrap items-center gap-2">
                        <span className="text-[9px] uppercase tracking-widest font-bold text-luxury-gold">
                          {selectedProductIdsForEmail.length} Produto(s) Destaque:
                        </span>
                        {products
                          .filter(p => selectedProductIdsForEmail.includes(p.id))
                          .map(p => (
                            <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black text-luxury-gold text-[10px] font-bold border border-luxury-gold/40 rounded-md">
                              {p.title?.substring(0, 20)}...
                              <button onClick={() => setSelectedProductIdsForEmail(prev => prev.filter(id => id !== p.id))} className="text-white hover:text-red-400">
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        <button onClick={() => setSelectedProductIdsForEmail([])} className="text-[9px] uppercase tracking-widest text-white/60 hover:text-white underline ml-auto">
                          Limpar todos
                        </button>
                      </div>
                    )}

                    {/* Catalog Picker Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto luxury-scrollbar p-1">
                      {products
                        .filter(p => p.title?.toLowerCase().includes(emailProductSearch.toLowerCase()))
                        .slice(0, 16)
                        .map(p => {
                          const isSelected = selectedProductIdsForEmail.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              onClick={() => setSelectedProductIdsForEmail(prev => isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                              className={`p-3 border rounded-xl cursor-pointer transition-all flex flex-col items-center text-center group ${
                                isSelected 
                                  ? "bg-luxury-gold/20 border-luxury-gold shadow-lg shadow-luxury-gold/10" 
                                  : "bg-white/5 border-white/10 hover:border-white/30"
                              }`}
                            >
                              <div className="w-16 h-16 bg-white rounded-lg p-1 overflow-hidden mb-2 flex items-center justify-center">
                                <img src={p.image_url || "https://i.imgur.com/bkuoZcP.png"} alt="" className="max-h-full max-w-full object-contain" />
                              </div>
                              <p className="text-[10px] font-bold text-white line-clamp-1 w-full">{p.title}</p>
                              <p className="text-[9px] font-mono font-bold text-luxury-gold mt-1">€{Number(p.price ?? p.pvp ?? 0).toFixed(2)}</p>
                              <span className={`mt-2 text-[8px] font-extrabold uppercase px-2 py-0.5 rounded ${
                                isSelected ? "bg-luxury-gold text-black" : "bg-white/10 text-white/70"
                              }`}>
                                {isSelected ? "✓ Adicionado" : "+ Incluir"}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {emailTabMode === "preview" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Pré-visualização do E-mail</p>
                      <p className="text-[10px] text-white/60">É assim que a mensagem aparecerá na caixa de entrada do cliente.</p>
                    </div>
                    <span className="text-[10px] font-mono text-luxury-gold px-3 py-1 bg-luxury-gold/10 border border-luxury-gold/30 rounded-md">
                      HTML Responsivo (Grid 2 Colunas)
                    </span>
                  </div>

                  <div className="bg-white rounded-xl overflow-hidden shadow-2xl border border-gray-300">
                    <iframe
                      title="Email Preview"
                      srcDoc={generateEmailTemplate(
                        emailSubject,
                        emailMessage,
                        products.filter(p => selectedProductIdsForEmail.includes(p.id))
                      )}
                      className="w-full h-[550px] border-none"
                    />
                  </div>
                </div>
              )}

              {emailTabMode === "code" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-luxury-gold uppercase tracking-wider">Supabase Edge Function (`send-custom-email/index.ts`)</p>
                      <p className="text-[10px] text-white/60">Código oficial para deploy direto nas Edge Functions do Supabase usando credenciais SMTP.</p>
                    </div>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(`import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const json = await req.json();
    const to = json.to || json.email;
    const subject = json.subject;
    const body = json.body || json.message || "";
    const customHtml = json.html || json.htmlBody;
    const name = json.name || json.customerName;

    if (!to) throw new Error("Destinatário (to/email) é obrigatório");
    if (!subject) throw new Error("Assunto (subject) é obrigatório");

    console.log(\`[SMTP EDGE FUNCTION] Disparando e-mail para \${to}: \${subject}\`);

    const finalHtml = customHtml ? customHtml : \`
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 24px; border: 1px solid #f0f0f0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="https://i.imgur.com/bkuoZcP.png" alt="SArt Boutique" style="height: 48px; width: auto; margin-bottom: 12px; display: inline-block;" />
          <div style="font-size: 22px; font-weight: 300; letter-spacing: 5px; color: #000000; text-transform: uppercase;">SArt Boutique</div>
          <div style="height: 2px; width: 60px; background: #D4AF37; margin: 12px auto 0;"></div>
        </div>
        
        <div style="line-height: 1.7; font-size: 15px; color: #333333;">
          \${name ? \`<p style="font-weight: 600; font-size: 16px; margin-bottom: 16px;">Olá \${name},</p>\` : ''}
          <div style="color: #444444; white-space: pre-line;">
            \${body}
          </div>
        </div>

        <div style="text-align: center; margin-top: 50px; padding-top: 30px; border-top: 1px solid #eeeeee;">
          <p style="font-size: 11px; color: #888888; letter-spacing: 1.5px; font-weight: bold; text-transform: uppercase; margin: 0;">
            © 2026 SART BOUTIQUE | PORTO - PORTUGAL
          </p>
        </div>
      </div>
    \`;

    await transporter.sendMail({
      from: \`"SArt Boutique" <\${SMTP_USER}>\`,
      to: to,
      subject: subject,
      html: finalHtml,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});`);
                        toast.success("Código da Supabase Edge Function copiado!");
                      }}
                      className="bg-luxury-gold text-black hover:bg-white text-[10px] font-bold uppercase tracking-widest px-4 h-9"
                    >
                      <Copy size={12} className="mr-2" /> Copiar Código
                    </Button>
                  </div>

                  <pre className="bg-[#020202] border border-white/10 p-5 rounded-xl text-emerald-400 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[480px]">
{`import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const json = await req.json();
    const to = json.to || json.email;
    const subject = json.subject;
    const body = json.body || json.message || "";
    const customHtml = json.html || json.htmlBody;
    const name = json.name || json.customerName;

    if (!to) throw new Error("Destinatário (to/email) é obrigatório");
    if (!subject) throw new Error("Assunto (subject) é obrigatório");

    console.log(\`[SMTP EDGE FUNCTION] Disparando e-mail para \${to}: \${subject}\`);

    const finalHtml = customHtml ? customHtml : \`...\`;

    await transporter.sendMail({
      from: \`"SArt Boutique" <\${SMTP_USER}>\`,
      to: to,
      subject: subject,
      html: finalHtml,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});`}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/10 bg-[#050505] flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2 text-white/60 text-[10px] uppercase font-mono">
                <CheckCircle size={14} className="text-emerald-400" />
                SMTP Ativo (Porta 465 / SSL)
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="flex-1 sm:flex-none border-white/10 text-white hover:bg-white/5 h-12 px-6 text-[10px] uppercase tracking-widest font-bold rounded-none"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSendBatchEmail}
                  disabled={sendingEmail || selectedUserIdsForEmail.length === 0}
                  className="flex-1 sm:flex-none bg-luxury-gold text-black hover:bg-amber-400 h-12 px-8 text-[10px] uppercase tracking-widest font-extrabold rounded-none shadow-xl shadow-luxury-gold/20 flex items-center justify-center gap-2"
                >
                  {sendingEmail ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Disparando E-mails...
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      Disparar E-mails ({selectedUserIdsForEmail.length})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

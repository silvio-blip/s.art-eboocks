import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import {
  ShoppingBag,
  User,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
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
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";

import AdminDashboard from "./components/AdminDashboard";
import PDFReader from "./components/PDFReader";
import TermsAndPrivacy from "./components/TermsAndPrivacy";
import ProfileDashboard from "./components/ProfileDashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const getImageUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  try {
    const { data } = supabase.storage.from("assets").getPublicUrl(url);
    return data?.publicUrl || "";
  } catch (err) {
    console.warn("Error generating public URL for image:", err);
    return "";
  }
};

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
  product_type?: "digital" | "physical";
  sizes?: string;
  colors?: string;
  sizes_enabled?: boolean;
  colors_enabled?: boolean;
  admin_link?: string;
  extra_images?: string;
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  shipping_status: string;
  total_amount: number;
  created_at: string;
  product?: Product;
}

interface ReadingProgress {
  book_id: string;
  last_page_read: number;
  total_pages: number;
}

// --- Components ---

const Navbar = ({
  user,
  profile,
  theme,
  onThemeToggle,
  onAuthClick,
  onLogoutClick,
  onDashboardClick,
  onHomeClick,
  onSearch,
  searchQuery,
}: {
  user: SupabaseUser | null;
  profile: { full_name: string; avatar_url: string } | null;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  onAuthClick: () => void;
  onLogoutClick: () => void;
  onDashboardClick: (v: "dashboard" | "admin") => void;
  onHomeClick: () => void;
  onSearch: (q: string) => void;
  searchQuery: string;
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const avatarUrl = profile?.avatar_url 
    ? getImageUrl(profile.avatar_url) 
    : (user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
        <button
          onClick={onHomeClick}
          className="text-xl md:text-2xl font-serif tracking-tighter hover:opacity-70 transition-opacity dark:text-white"
        >
          S.Art
        </button>

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
              <Search
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30 group-focus-within:text-luxury-gold transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 pl-0 md:pl-4 md:border-l border-black/10 dark:border-white/10">
            <button
              onClick={onThemeToggle}
              className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white transition-all duration-500 cursor-pointer"
              aria-label="Toggle Theme"
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <div className="hidden md:flex items-center gap-2 md:gap-3">
              {user ? (
                <>
                  {ADMIN_IDS.includes(user.id) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDashboardClick("admin")}
                      className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-luxury-gold"
                    >
                      <Shield size={18} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDashboardClick("dashboard")}
                    className="rounded-full w-8 h-8 md:w-10 md:h-10 p-0 overflow-hidden border border-black/10 dark:border-white/10 hover:border-luxury-gold transition-colors"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <LayoutGrid size={18} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onLogoutClick}
                    className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white ml-1"
                  >
                    <LogOut size={16} />
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onAuthClick}
                  className="rounded-full hover:bg-black/5 dark:hover:bg-white/5 dark:text-white"
                >
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
            animate={{ opacity: 1, height: "auto" }}
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
                <Search
                  size={14}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {user ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onDashboardClick("dashboard");
                        setIsMobileMenuOpen(false);
                      }}
                      className="rounded-none border-black/10 dark:border-white/10 dark:text-white h-12 uppercase tracking-widest text-[9px]"
                    >
                      <LayoutGrid size={14} className="mr-2" /> Biblioteca
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onLogoutClick();
                        setIsMobileMenuOpen(false);
                      }}
                      className="rounded-none border-black/10 dark:border-white/10 dark:text-white h-12 uppercase tracking-widest text-[9px]"
                    >
                      <LogOut size={14} className="mr-2" /> Sair
                    </Button>
                    {ADMIN_IDS.includes(user.id) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          onDashboardClick("admin");
                          setIsMobileMenuOpen(false);
                        }}
                        className="rounded-none border-luxury-gold/30 text-luxury-gold col-span-2 h-12 uppercase tracking-widest text-[9px]"
                      >
                        <Shield size={14} className="mr-2" /> Painel Admin
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      onAuthClick();
                      setIsMobileMenuOpen(false);
                    }}
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
function ProductCard({
  product,
  onBuy,
  onRead,
  isOwned,
  isProcessing,
}: {
  product: Product;
  onBuy: (p: Product) => any;
  onRead?: (p: Product) => any;
  isOwned?: boolean;
  isProcessing?: boolean;
}) {
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
          <div className="flex flex-col gap-2 w-full max-w-[140px]">
            <Button
              disabled={isProcessing || (product.product_type === 'physical' && !product.is_active)}
              onClick={(e) => {
                e.stopPropagation();
                if (isOwned && product.product_type !== 'physical' && onRead) {
                  onRead(product);
                } else {
                  onBuy(product);
                }
              }}
              className={`bg-white text-black hover:bg-luxury-gold hover:text-white rounded-none w-full py-4 text-[10px] font-bold uppercase tracking-[0.25em] transition-all duration-500 transform ${isProcessing ? "translate-y-0 opacity-100" : "translate-y-8"} group-hover:translate-y-0 shadow-2xl border-none disabled:opacity-50`}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  ...
                </span>
              ) : isOwned && product.product_type !== 'physical' ? (
                "Ler Obra"
              ) : product.product_type === "physical" ? (
                product.is_active ? "Ver Detalhes" : "Esgotado"
              ) : (
                "Adquirir"
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-5 px-1 pb-2 space-y-1.5 flex-grow flex flex-col justify-end">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-serif text-[13px] leading-tight line-clamp-2 group-hover:text-luxury-gold transition-colors duration-300 dark:text-zinc-100 flex-1">
            {product.title}
          </h3>
          <span className="text-[11px] font-black tracking-tight dark:text-luxury-gold">
            €{product.price}
          </span>
        </div>
        <div className="text-[8px] uppercase tracking-widest text-black/30 dark:text-white/30 font-mono flex items-center justify-between">
          <span>Ref: {product.id.split('-')[0].toUpperCase()}</span>
          {product.product_type === 'digital' && <span className="text-[#D4AF37]">Digital</span>}
        </div>
        <div className="h-[1px] w-0 group-hover:w-full bg-expensive-gold transition-all duration-700 opacity-40 bg-luxury-gold" />
        <div className="text-[10px] text-black/50 dark:text-zinc-400 line-clamp-3 leading-snug pt-1">
          {product.description}
        </div>
      </div>
    </motion.div>
  );
}

const ADMIN_IDS = [
  "3d596215-583e-498f-9fd5-36b83d8bccf5",
  "00d44feb-0b51-405e-86f7-31b67edfb7b6",
];

const AuthDialog = ({
  isOpen,
  onClose,
  onViewTerms,
}: {
  isOpen: boolean;
  onClose: () => void;
  onViewTerms: () => void;
}) => {
  const [mode, setMode] = useState<
    "login" | "register" | "forgot" | "check-email" | "otp" | "reset"
  >("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const setAuthMode = (newMode: typeof mode) => {
    setMode(newMode);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setPassword("");
    setConfirmPassword("");
  };

  const handleGoogleLogin = async () => {
    try {
      if (mode === "register" && !acceptedTerms) {
        toast.error("Tem de aceitar os Termos e Privacidade.");
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Bem-vindo de volta.");
        onClose();
      } else if (mode === "register") {
        if (!acceptedTerms)
          throw new Error(
            "Tem de aceitar os Termos e Privacidade para criar conta.",
          );
        if (password !== confirmPassword)
          throw new Error("As passwords não coincidem.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.user) {
          const customId = `SART-${data.user.id.substring(0, 4).toUpperCase()}`;
          await supabase
            .from("profiles")
            .upsert({ 
              id: data.user.id, 
              email, 
              full_name: fullName,
              custom_id: customId,
              welcomed: false,
              theme: 'dark'
            });
        }
        toast.success("Conta criada. Verifique o seu email.");
        onClose();
      } else if (mode === "forgot") {
        if (!email) throw new Error("Por favor, insira o seu e-mail.");
        
        const normalizedEmail = email.trim().toLowerCase();
        console.log("Iniciando recuperação via servidor...");
        
        try {
          // 1. Check if user exists
          const checkResponse = await fetch("/api/recovery/check-exists", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail })
          });
          const checkData = await checkResponse.json();
          
          if (!checkData.exists) {
            throw new Error("Este e-mail não está registado no nosso sistema.");
          }

          // 2. Send recovery code
          const response = await fetch("/api/recovery/send", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail })
          });

          const data = await response.json().catch(() => ({ error: "Erro na resposta do servidor." }));

          if (!response.ok || data.error) {
            throw new Error(data.error || `Erro: ${response.status}`);
          }

          toast.success("Um código de 15 dígitos foi enviado.");
          setAuthMode("otp");
        } catch (invError: any) {
          console.error("Erro na recuperação:", invError);
          toast.error(invError.message || "Erro ao contactar o servidor de e-mail.");
        }
      } else if (mode === "otp") {
        if (!otp || otp.length < 15) throw new Error("Insira o código completo de 15 dígitos.");
        
        const response = await fetch("/api/recovery/verify", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: otp })
        });

        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Código inválido ou expirado.");

        toast.success("Código validado. Defina a sua nova senha.");
        setAuthMode("reset");
      } else if (mode === "reset") {
        if (password !== confirmPassword) throw new Error("As passwords não coincidem.");
        if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");

        const response = await fetch("/api/recovery/reset", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: otp, password })
        });

        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Erro ao redefinir senha.");

        toast.success("Senha atualizada com sucesso. Pode entrar.");
        setAuthMode("login");
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
          <DialogTitle className="font-serif text-3xl mb-2 dark:text-white">
            S.Art Atelier
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40">
            {mode === "login"
              ? "Entrar na Boutique Digital"
              : mode === "register"
                ? "Criar Conta Exclusiva"
                : mode === "forgot"
                ? "Recuperar Acesso"
                : mode === "check-email"
                  ? "Inbox de Segurança"
                  : mode === "otp"
                    ? "Validar Identidade"
                    : "Nova Password"}
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-8">
          {(mode === "login" || mode === "register") && (
            <>
              <Button
                onClick={handleGoogleLogin}
                variant="outline"
                className="w-full flex items-center justify-center gap-3 rounded-none h-12 border-black/10 dark:border-white/10 text-[10px] uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black dark:text-white transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Entrar com Google
              </Button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-black/5 dark:border-white/5"></div>
                <span className="flex-shrink mx-4 text-[9px] uppercase tracking-widest text-black/30 dark:text-white/30">
                  ou usar email
                </span>
                <div className="flex-grow border-t border-black/5 dark:border-white/5"></div>
              </div>
            </>
          )}

          {mode === "register" && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white"
                placeholder="Ex: Maria Antonieta"
              />
            </div>
          )}

          {(mode === "login" ||
            mode === "register" ||
            mode === "forgot" ||
            mode === "check-email" ||
            mode === "otp") && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">
                Endereço de Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === "otp" || mode === "check-email"}
                className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white disabled:opacity-50"
                placeholder="vogue@sart.com"
              />
            </div>
          )}

          {mode === "check-email" && (
            <div className="py-2 space-y-4 animate-in fade-in duration-500">
              <div className="bg-luxury-gold/10 border border-luxury-gold/20 p-4 text-center">
                <p className="text-[10px] text-luxury-gold font-medium leading-relaxed italic">
                  "Enviámos um convite de recuperação para o seu destino digital. Siga a hiperligação no seu e-mail para definir o novo acesso."
                </p>
              </div>
              <p className="text-[9px] text-center text-black/30 dark:text-white/30 uppercase tracking-widest">
                Não recebeu? Verifique o Spam.
              </p>
            </div>
          )}

          {mode === "otp" && (
            <div className="space-y-4">
              <div className="bg-luxury-gold/5 p-4 border border-luxury-gold/20 rounded-sm">
                <p className="text-[10px] text-luxury-gold text-center italic">
                  "Introduza o código exclusivo de 15 dígitos enviado para o seu e-mail para validar a sua identidade."
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">
                  Código de 15 Dígitos
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-lg tracking-[0.3em] text-center outline-none focus:border-luxury-gold transition-colors dark:text-white font-mono"
                  placeholder="X1y2Z3a4B5c6D7E"
                />
              </div>
            </div>
          )}

          {(mode === "login" || mode === "register" || mode === "reset") && (
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">
                  {mode === "reset" ? "Nova Password" : "Palavra-passe"}
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => setAuthMode("forgot")}
                    className="text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.1em] hover:text-luxury-gold transition-colors"
                  >
                    Esqueceu a sua password?
                  </button>
                )}
              </div>
              <div className="relative group">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-black/20 dark:text-white/20 hover:text-luxury-gold dark:hover:text-luxury-gold transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {(mode === "register" || mode === "reset") && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">
                Confirmar Password
              </label>
              <div className="relative group">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-black/20 dark:text-white/20 hover:text-luxury-gold dark:hover:text-luxury-gold transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {mode === "register" && (
            <div className="flex items-start gap-3 py-2">
              <input
                type="checkbox"
                id="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 w-4 h-4 rounded-none border-black/20 text-black focus:ring-0 cursor-pointer"
              />
              <label
                htmlFor="terms"
                className="text-[10px] text-black/60 dark:text-white/60 leading-relaxed cursor-pointer"
              >
                Eu entendi e aceito os{" "}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewTerms();
                  }}
                  className="text-luxury-gold underline hover:text-black dark:hover:text-white transition-colors"
                >
                  Termos de Serviço e Política de Privacidade
                </button>
                , e declaro que as minhas ações estão sob minha
                responsabilidade.
              </label>
            </div>
          )}

          {mode !== "check-email" && (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-none h-14 uppercase tracking-widest text-[10px] cursor-pointer"
            >
              {loading
                ? "A processar..."
                : mode === "login"
                  ? "Entrar na Boutique"
                  : mode === "register"
                    ? "Criar Conta"
                    : mode === "forgot"
                      ? "Enviar Pedido"
                      : mode === "otp"
                        ? "Validar Código"
                        : "Redefinir Password"}
            </Button>
          )}

          <button
            onClick={() => setAuthMode(mode === "login" ? "register" : "login")}
            className="w-full text-center text-[9px] text-black/40 dark:text-white/40 uppercase tracking-widest hover:text-black dark:hover:text-white transition-colors pt-2"
          >
            {mode === "login"
              ? "Não tem conta? Registe-se"
              : mode === "register"
                ? "Já tem conta? Inicie sessão"
                : "Voltar ao Login"}
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
  isProcessing,
}: {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  userEmail: string;
  onConfirm: (email: string) => void;
  isProcessing: boolean;
}) => {
  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] w-[95vw] rounded-none border-none dark:bg-zinc-900 p-6 md:p-8 shadow-2xl backdrop-blur-xl bg-white/95 transition-all duration-500">
        <DialogHeader className="space-y-4">
          <DialogTitle className="text-3xl font-serif dark:text-white tracking-tight">
            Confirmar Aquisição
          </DialogTitle>
          <div className="flex gap-4 items-start p-4 bg-neutral-50/50 dark:bg-zinc-800/30 border border-black/5 dark:border-white/5 overflow-hidden">
            <div className="w-16 h-24 bg-neutral-200 dark:bg-zinc-700 flex-shrink-0 overflow-hidden shadow-md">
              <img
                src={getImageUrl(product.image_url)}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-[0.3em] text-black/30 dark:text-white/30 font-bold">
                  Investimento Digital
                </div>
                <div className="text-sm font-serif dark:text-white leading-tight truncate-multiline line-clamp-2">
                  {product.title}
                </div>
                <div className="text-xs font-black tracking-tight dark:text-luxury-gold pt-1">
                  €{product.price}
                </div>
              </div>
              {product.description && (
                <div className="pt-2 border-t border-black/5 dark:border-white/10 mt-2">
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-6 whitespace-pre-wrap">
                    {product.description}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-8 pt-6">
          <div className="space-y-3">
            <p className="text-[9px] text-black/40 dark:text-zinc-500 italic pl-1 flex items-center gap-1.5">
              <span className="w-1 h-1 bg-luxury-gold rounded-full" />A obra
              será desbloqueada instantaneamente na sua Biblioteca Privada após
              o pagamento.
            </p>
          </div>

          <Button
            onClick={() => onConfirm(userEmail)}
            disabled={isProcessing}
            className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-luxury-gold dark:hover:bg-luxury-gold hover:text-white rounded-none h-14 text-[11px] font-bold uppercase tracking-[0.3em] transition-all duration-500 shadow-xl disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="flex items-center gap-3">
                <Loader2 size={16} className="animate-spin" />A Iniciar
                Protocolo Stripe...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Prosseguir para Pagamento <ArrowRight size={14} />
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ResetPasswordView = ({ onComplete }: { onComplete: () => void }) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!password || password.length < 6) {
      toast.error("A password deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password atualizada com sucesso!");
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5 p-8 shadow-2xl"
      >
        <h2 className="font-serif text-3xl mb-2 text-center dark:text-white">
          Nova Password
        </h2>
        <p className="text-[10px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 text-center mb-8">
          Defina o seu novo acesso à boutique
        </p>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50">
              Palavra-passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-xs outline-none focus:border-black dark:focus:border-white transition-colors dark:text-white"
              placeholder="••••••••"
            />
          </div>

          <Button
            onClick={handleReset}
            disabled={loading}
            className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-none h-14 uppercase tracking-widest text-[10px] cursor-pointer"
          >
            {loading ? "A processar..." : "Atualizar Password"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

const ProductDetailsPage = ({
  product,
  onBack,
  onConfirm,
  isProcessing,
}: {
  product: Product;
  onBack: () => void;
  onConfirm: (
    product: Product,
    options: { size: string; color: string },
  ) => void;
  isProcessing?: boolean;
}) => {
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const extraImages = product.extra_images
    ? product.extra_images
        .split(",")
        .map((img) => img.trim())
        .filter(Boolean)
    : [];
  const allImages = [getImageUrl(product.image_url), ...extraImages];

  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = allImages[activeIndex];

  const sizes = product.sizes
    ? product.sizes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const colors = product.colors
    ? product.colors
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  const nextImage = () =>
    setActiveIndex((prev) => (prev + 1) % allImages.length);
  const prevImage = () =>
    setActiveIndex((prev) => (prev - 1 + allImages.length) % allImages.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto space-y-12 px-4 py-8"
    >
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="text-luxury-gold hover:text-black dark:hover:text-white transition-colors flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold group"
        >
          <ChevronLeft
            className="transition-transform group-hover:-translate-x-1"
            size={16}
          />{" "}
          Voltar à Boutique
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">
        {/* Gallery */}
        <div className="w-full lg:w-1/2 flex flex-col-reverse lg:flex-row gap-4">
          {/* Thumbnails */}
          {allImages.length > 1 && (
            <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto lg:max-h-[600px] scrollbar-hide snap-x p-1">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`flex-shrink-0 w-20 lg:w-20 aspect-[3/4] border-2 transition-all overflow-hidden bg-neutral-100 dark:bg-zinc-900 snap-start ${activeIndex === i ? "border-luxury-gold shadow-lg scale-105" : "border-transparent opacity-60 hover:opacity-100"}`}
                >
                  <img
                    src={img}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    alt={`Thumbnail ${i + 1}`}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Main Image */}
          <div className="flex-1 aspect-[3/4] max-h-[700px] bg-neutral-100 dark:bg-zinc-900 border border-black/5 dark:border-white/5 overflow-hidden group relative shadow-2xl">
            <AnimatePresence mode="wait">
              <motion.img
                key={activeImage}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 100) prevImage();
                  else if (info.offset.x < -100) nextImage();
                }}
                src={activeImage}
                className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                alt={product.title}
                referrerPolicy="no-referrer"
              />
            </AnimatePresence>

            {/* Navigation Buttons for PC */}
            {allImages.length > 1 && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prevImage();
                  }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-luxury-gold hover:border-luxury-gold transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nextImage();
                  }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-luxury-gold hover:border-luxury-gold transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}

            {/* Mobile/Tablet Swipe Hint or Indicator */}
            {allImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden z-10">
                {allImages.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${activeIndex === i ? "bg-luxury-gold w-4" : "bg-white/40"}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="w-full lg:w-1/2 space-y-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[10px] uppercase tracking-[0.4em] text-luxury-gold font-bold">
                S.Art Exclusive
              </p>
              <span className="text-black/20 dark:text-white/20">|</span>
              <p className="text-[10px] uppercase tracking-[0.2em] font-mono text-black/50 dark:text-white/50">
                Ref: {product.id.split('-')[0].toUpperCase()}
              </p>
            </div>
            <h1 className={`font-serif leading-tight dark:text-white text-balance ${product.title.length > 50 ? 'text-2xl md:text-3xl lg:text-3xl' : 'text-3xl md:text-4xl lg:text-4xl'}`}>
              {product.title}
            </h1>
            <p className="text-2xl md:text-3xl font-black text-black dark:text-luxury-gold tracking-tighter">
              €{product.price}
            </p>
          </div>

          <Separator className="bg-black/10 dark:bg-white/10" />

          <div className="space-y-6">
            <p className="text-sm text-black/70 dark:text-zinc-400 leading-relaxed font-light whitespace-pre-wrap italic">
              {product.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              {product.sizes_enabled && sizes.length > 0 && (
                <div className="space-y-4">
                  <label className="text-[9px] uppercase tracking-[0.3em] text-black/40 dark:text-white/40 font-bold block">
                    Tamanhos Disponíveis
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`min-w-[44px] h-11 px-3 text-[10px] uppercase border transition-all duration-300 ${selectedSize === size ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-xl scale-105" : "border-black/10 dark:border-white/10 dark:text-white hover:border-luxury-gold"}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {product.colors_enabled && colors.length > 0 && (
                <div className="space-y-4">
                  <label className="text-[9px] uppercase tracking-[0.3em] text-black/40 dark:text-white/40 font-bold block">
                    Cores & Acabamentos
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`px-5 h-11 text-[10px] uppercase border transition-all duration-300 ${selectedColor === color ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-xl scale-105" : "border-black/10 dark:border-white/10 dark:text-white hover:border-luxury-gold"}`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-10 space-y-6">
            <Button
              onClick={() =>
                onConfirm(product, { size: selectedSize, color: selectedColor })
              }
              disabled={
                (!selectedSize && product.sizes_enabled) ||
                (!selectedColor && product.colors_enabled) ||
                isProcessing
              }
              className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-none h-16 md:h-20 text-[11px] font-bold uppercase tracking-[0.4em] transition-all duration-700 shadow-[0_20px_50px_rgba(0,0,0,0.2)] disabled:opacity-40 flex items-center justify-center gap-3"
            >
              {isProcessing ? (
                <span className="flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin" />A Processar...
                </span>
              ) : (
                <>
                  Adquirir Obra de Arte <CreditCard size={16} />
                </>
              )}
            </Button>

            <div className="grid grid-cols-2 gap-6 text-center">
              <div className="space-y-2">
                <Shield
                  size={16}
                  className="mx-auto text-luxury-gold opacity-50"
                />
                <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40">
                  Pagamento Blindado
                </p>
              </div>
              <div className="space-y-2">
                <ShoppingBag
                  size={16}
                  className="mx-auto text-luxury-gold opacity-50"
                />
                <p className="text-[8px] uppercase tracking-widest text-black/40 dark:text-white/40">
                  Curadoria S.Art
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [view, setView] = useState<
    | "home"
    | "dashboard"
    | "success"
    | "admin"
    | "reader"
    | "reset-password"
    | "terms"
    | "product-detail"
    | "shipping"
  >("home");
  const [purchasedProducts, setPurchasedProducts] = useState<Order[]>([]);
  const [readingProgress, setReadingProgress] = useState<
    Record<string, ReadingProgress>
  >({});
  const [activeReading, setActiveReading] = useState<{
    orderId: string;
    product: Product;
    purchasedAt: string;
  } | null>(null);
  const [successProduct, setSuccessProduct] = useState<Product | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    phone: "",
  });

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<{
    size: string;
    color: string;
  }>({ size: "", color: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [profile, setProfile] = useState<{
    full_name: string;
    avatar_url: string;
  } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sart-theme");
      return (saved as "light" | "dark") || "light";
    }
    return "light";
  });

  const toggleTheme = async () => {
    const newTheme = theme === "light" ? "dark" : "light";

    // Atualiza o estado da UI imediatamente para resposta rápida
    setTheme(newTheme);
    localStorage.setItem("sart-theme", newTheme);

    if (user) {
      try {
        // 1. Tenta salvar no banco de dados (profiles)
        const { error: dbError } = await supabase.from("profiles").upsert(
          {
            id: user.id,
            theme: newTheme,
            email: user.email!,
          },
          { onConflict: "id" },
        );

        // 2. Sempre tenta salvar nos metadados do utilizador (backup garantido no banco de dados do Auth)
        const { error: authError } = await supabase.auth.updateUser({
          data: { theme: newTheme },
        });

        if (dbError) {
          console.warn(
            "Aviso: Coluna 'theme' pode estar em falta na tabela profiles. Use os metadados como fallback.",
            dbError,
          );
        }

        if (authError) {
          console.error(
            "Erro ao atualizar metadados do utilizador:",
            authError,
          );
        }
      } catch (err) {
        console.error("Erro inesperado ao sincronizar tema:", err);
      }
    }
  };

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const handleDownload = async (orderId: string) => {
    const downloadToast = toast.loading("A preparar o seu descarregamento...");
    try {
      const res = await fetch(`/api/orders/${orderId}/download`);
      const responseContent = await res.text();

      let data;
      try {
        data = JSON.parse(responseContent);
      } catch (e) {
        throw new Error("Resposta inválida do servidor.");
      }

      if (!res.ok) {
        throw new Error(data.error || `Erro de servidor (${res.status})`);
      }

      if (data.url) {
        // Criar um elemento link invisível para forçar o descarregamento/abertura
        const link = document.createElement("a");
        link.href = data.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success("Guia pronta para leitura.", { id: downloadToast });
      } else {
        throw new Error("Link de descarregamento não encontrado.");
      }
    } catch (err: any) {
      console.error("[DOWNLOAD ERR]", err);
      toast.error(err.message || "Erro na ligação ao servidor.", {
        id: downloadToast,
      });
    }
  };

  useEffect(() => {
    if (window.location.pathname === "/admin") {
      if (user && !ADMIN_IDS.includes(user.id)) {
        setView("home");
        window.history.replaceState({}, "", "/");
        toast.error("Acesso restrito ao Administrador.");
      } else {
        setView("admin");
      }
    }
  }, [user]);

  // Gerir subscrição em tempo real separadamente para evitar conflitos de bloqueio
  useEffect(() => {
    if (!user) return;

    const channelName = `user-orders-realtime-${user.id}`;
    const ordersChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload.new.status === "completed") {
            fetchDashboardData(user.id);
            if (payload.old && payload.old.status !== "completed") {
              toast.success(
                "Pagamento confirmado! O pedido foi efetuado com sucesso.",
                {
                  duration: 5000,
                  icon: <CheckCircle2 className="text-emerald-500" size={18} />,
                },
              );
            } else if (payload.new.shipping_status !== payload.old?.shipping_status) {
              toast.info(
                "Atualização no estado de envio do seu produto S.Art.",
                { duration: 4000 }
              );
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
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
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          fetchDashboardData(currentUser.id).catch((err) =>
            console.error("Error fetching dashboard:", err),
          );
          fetchProfile(currentUser).catch((err) =>
            console.error("Error fetching profile:", err),
          );
        }

        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          fetchProducts().catch((err) =>
            console.error("Error fetching products on login:", err),
          );
        }

        if (event === "PASSWORD_RECOVERY") {
          setIsAuthOpen(false);
          setView("reset-password");
        }
      } catch (err) {
        console.error("Auth state change error:", err);
      }
    });

    // Real-time products subscription
    const productsChannel = supabase
      .channel('products-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          console.log('[REALTIME] Product change:', payload);
          fetchProducts();
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
      });

    fetchProducts();
    checkUrlParams();

    // Fallback: Se após 5 segundos ainda estiver a carregar, forçar a entrada na UI
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      authSub.unsubscribe();
      supabase.removeChannel(productsChannel);
      clearTimeout(loadingTimeout);
    };
  }, []);

  const fetchProfile = async (userObj: SupabaseUser) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("theme, full_name, avatar_url, welcomed, custom_id")
      .eq("id", userObj.id)
      .single();

    // Se o perfil não existir, criá-lo (Sincronização manual como fallback se o trigger não correr)
    if (error && (error.code === 'PGRST116' || error.message.includes('No object found') || error.message.includes('JSON object requested'))) {
      console.log("[PROFILE] Perfil não encontrado. Tentando sincronização de fallback...");
      const googleAvatar = userObj.user_metadata?.avatar_url || userObj.user_metadata?.picture;
      const fullName = userObj.user_metadata?.full_name || userObj.user_metadata?.name || "";
      const customId = `SART-${userObj.id.substring(0, 4).toUpperCase()}`;

      // Tentar inserir. Se o trigger já o criou, o upsert resolve.
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .upsert({ 
          id: userObj.id, 
          email: userObj.email,
          full_name: fullName, 
          avatar_url: googleAvatar || "", 
          welcomed: false,
          custom_id: customId,
          theme: 'dark'
        }, { onConflict: 'id' })
        .select()
        .maybeSingle();

      if (!createError && newProfile) {
        console.log("[PROFILE] Perfil garantido via fallback.");
        setProfile({
          full_name: newProfile.full_name || "",
          avatar_url: newProfile.avatar_url || "",
        });
        if (newProfile.welcomed === false) {
          sendWelcomeEmail(userObj, newProfile);
        }
      } else {
        console.warn("[PROFILE] Fallback falhou (pode ser RLS ou trigger já em curso):", createError);
        // Fallback UI
        setProfile({
          full_name: fullName,
          avatar_url: googleAvatar || "",
        });
      }
      return;
    }

    if (!error && data) {
      if (data.theme) {
        setTheme(data.theme as "light" | "dark");
        localStorage.setItem("sart-theme", data.theme);
      }

      let finalAvatar = data.avatar_url;

      // Sincronizar Avatar do Google se o perfil estiver sem foto e o utilizador for Google
      const googleAvatar = userObj.user_metadata?.avatar_url || userObj.user_metadata?.picture;
      
      // Se na tabela não houver avatar, mas no Google houver, vamos usar e sincronizar
      if (!finalAvatar && googleAvatar) {
        console.log("[PROFILE] Sincronizando avatar do Google para a tabela profiles...");
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: googleAvatar })
          .eq("id", userObj.id);
        
        if (!updateError) {
          console.log("[PROFILE] Link do Google salvo no banco de dados.");
          finalAvatar = googleAvatar;
        }
      }

      setProfile({
        full_name: data.full_name || userObj.user_metadata?.full_name || userObj.user_metadata?.name || "",
        avatar_url: finalAvatar || googleAvatar || "", // Fallback final para UI imediata
      });

      // Só envia e-mail se ainda não foi marcado como welcomed
      if (data.welcomed === false) {
        sendWelcomeEmail(userObj, data);
      }
    }
  };

  const sendWelcomeEmail = async (userObj: SupabaseUser, profileData: any) => {
    console.log("[WELCOME] Iniciando envio de e-mail de boas-vindas...");
    try {
      const { error: functionError } = await supabase.functions.invoke("welcome-email", {
        body: { 
          record: { 
            email: userObj.email, 
            raw_user_meta_data: { 
              full_name: profileData.full_name || userObj.user_metadata?.full_name || "Membro" 
            } 
          } 
        }
      });

      if (!functionError) {
        await supabase
          .from("profiles")
          .update({ welcomed: true })
          .eq("id", userObj.id);
        console.log("[WELCOME] E-mail enviado e perfil marcado como acolhido.");
      } else {
        console.error("[WELCOME] Erro na Edge Function:", functionError);
      }
    } catch (err) {
      console.error("[WELCOME] Erro inesperado:", err);
    }
  };

  const checkUrlParams = async () => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    // Security & Redirect: If session state is active but no ID is present, kick back to library
    if (view === "success" && !sessionId) {
      setView("dashboard");
      return;
    }

    if (sessionId) {
      // Clear ID from URL to prevent reactivation on refresh
      window.history.replaceState({}, "", window.location.pathname);

      setView("success");
      try {
        console.log(`[S.ART DEBUG] Verifying Stripe session: ${sessionId}`);
        const res = await fetch(`/api/verify-session?session_id=${sessionId}`);

        // Anti-HTML Guard (Crucial for Vercel 500s)
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const rawText = await res.text();
          console.error(
            "[CRITICAL] API returned HTML instead of JSON:",
            rawText.substring(0, 300),
          );
          throw new Error(
            `Resposta inválida do servidor (HTML). Status: ${res.status}`,
          );
        }

        const data = await res.json();

        if (data.status === "paid") {
          setSuccessProduct(data.product);
          setSuccessOrderId(data.orderId);
          toast.success("Compra aprovada! Desfrute da sua nova obra.");

          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user) {
            fetchDashboardData(session.user.id);
          }
        } else {
          console.warn("[S.ART DEBUG] Session not paid yet:", data);
        }
      } catch (err: any) {
        console.error("[S.ART SESSION ERROR LOG]", {
          message: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        });
        toast.error(
          "Erro ao validar o pagamento. Por favor, contacte o suporte se o valor foi debitado.",
        );
      }
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar produtos do atelier.");
        console.error(error);
      }
      if (data) setProducts(data.filter((p) => p.is_active !== false));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async (userId: string) => {
    console.log("[DEBUG] Fetching dashboard data for:", userId);

    // QUERY DE SEGURANÇA (sem joins complexos para evitar PGRST200)
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["completed", "refund_pending", "refunded"]) // Filtrar status válidos para o utilizador ver
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("[DEBUG] Error fetching orders:", ordersError);
      return;
    }

    if (!orders || orders.length === 0) {
      setPurchasedProducts([]);
      return;
    }

    // Buscar produtos separadamente para garantir compatibilidade
    const productIds = orders.map((o) => o.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("*")
      .in("id", productIds);

    const productsMap = (products || []).reduce((acc: any, p: any) => {
      acc[p.id] = p;
      return acc;
    }, {});

    const mappedOrders = (orders || []).map((o: any) => ({
      ...o,
      product: productsMap[o.product_id] || null,
    }));

    setPurchasedProducts(mappedOrders);

    // Fetch Reading Progress
    const { data: progress, error: progressError } = await supabase
      .from("user_reading_progress")
      .select("*")
      .eq("user_id", userId);

    if (!progressError && progress) {
      const progressMap: Record<string, ReadingProgress> = {};
      progress.forEach((p: any) => {
        progressMap[p.book_id] = p;
      });
      setReadingProgress(progressMap);
    }
  };

  const handleOpenReader = (
    product: Product,
    orderId: string,
    purchasedAt: string,
  ) => {
    setActiveReading({ orderId, product, purchasedAt });
    setView("reader");
  };

  const [refundBookName, setRefundBookName] = useState("");
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);

  const handleRefund = async () => {
    if (!refundOrder || !user) return;
    if (refundBookName !== refundOrder.product?.title) {
      toast.error("O título digitado não corresponde à obra selecionada.");
      return;
    }

    setIsRefunding(true);
    try {
      const res = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: refundOrder.id, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Erro ao solicitar reembolso.");

      toast.success("Reembolso efetuado com sucesso.");
      setRefundOrder(null);
      setRefundBookName("");
      fetchDashboardData(user.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleBuy = (product: Product) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    // Check if user already owns the product (only for digital)
    const order = purchasedProducts.find(
      (o) => o.product_id === product.id && o.status === "completed",
    );
    if (order && product.product_type !== "physical") {
      handleOpenReader(product, order.id, order.created_at);
      return;
    }

    if (product.product_type === "physical") {
      setDetailProduct(product);
      setView("product-detail");
      window.scrollTo(0, 0);
    } else {
      setSelectedProduct(product);
      setIsCheckoutModalOpen(true);
    }
  };

  const handleDetailConfirm = (
    product: Product,
    options: { size: string; color: string },
  ) => {
    setSelectedProduct(product);
    setSelectedOptions(options);
    setDetailLoading(true);

    // Pequeno atraso para feedback visual
    setTimeout(() => {
      setDetailLoading(false);
      setDetailProduct(null);
      if (product.product_type === "physical") {
        setView("shipping");
      } else {
        setIsCheckoutModalOpen(true);
      }
    }, 500);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (view !== "home" && query.trim() !== "") {
      setView("home");
    }
  };

  const handleCheckoutConfirm = async (email: string) => {
    if (!selectedProduct || !user) return;

    setCheckoutLoading(selectedProduct.id);

    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          userId: user.id,
          email: email,
          options: selectedOptions,
          shippingInfo:
            selectedProduct.product_type === "physical"
              ? shippingInfo
              : undefined,
        }),
      });

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Resposta do servidor não é JSON: ${responseText}`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Erro do servidor (${res.status})`);
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não recebida.");
      }
    } catch (err: any) {
      console.error("[NETWORK ERROR]", err);
      alert(`Erro ao iniciar pagamento: ${err.message}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`h-screen flex items-center justify-center ${theme === "dark" ? "dark bg-black text-white" : "bg-white text-black"}`}
      >
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
    <div
      className={`min-h-screen ${theme === "dark" ? "dark" : ""} bg-background text-foreground font-sans selection:bg-primary-foreground selection:text-primary transition-colors duration-700`}
    >
      <Navbar
        user={user}
        profile={profile}
        theme={theme}
        onThemeToggle={toggleTheme}
        onAuthClick={() => setIsAuthOpen(true)}
        onLogoutClick={() => setIsLogoutOpen(true)}
        onDashboardClick={(v) => setView(v)}
        onHomeClick={() => {
          setView("home");
          setSearchQuery("");
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
      />

      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        product={selectedProduct}
        userEmail={user?.email || ""}
        isProcessing={!!checkoutLoading}
        onConfirm={handleCheckoutConfirm}
      />

      <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
        <DialogContent className="max-w-[320px] rounded-none border-black/5 dark:border-white/5 bg-white/95 dark:bg-black/95 backdrop-blur-xl p-8">
          <DialogHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-luxury-gold">
                <LogOut size={20} />
              </div>
            </div>
            <DialogTitle className="text-center font-serif text-xl dark:text-white">
              Encerrar Sessão?
            </DialogTitle>
            <p className="text-center text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 leading-relaxed">
              Deseja realmente sair da sua conta na boutique S.Art?
            </p>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={async () => {
                await supabase.auth.signOut();
                setIsLogoutOpen(false);
                setView("home");
                toast.success("Até breve.");
              }}
              className="rounded-none bg-black dark:bg-white text-white dark:text-black h-12 uppercase tracking-[0.2em] text-[9px] font-bold hover:opacity-80 transition-opacity"
            >
              Confirmar Saída
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsLogoutOpen(false)}
              className="rounded-none h-12 uppercase tracking-[0.2em] text-[9px] dark:text-white/60 hover:text-black dark:hover:text-white"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <main className="pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === "reset-password" && (
            <ResetPasswordView onComplete={() => setView("home")} />
          )}

          {view === "admin" && user && ADMIN_IDS.includes(user.id) && (
            <AdminDashboard
              user={user}
              theme={theme}
              onBack={() => {
                setView("home");
                fetchProducts();
              }}
            />
          )}

          {view === "home" && (
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
                  Boutique de <br />
                  Conhecimento Digital
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
                {(["Todos", "Moda", "Saúde", "Tecnologia"] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 sm:px-8 py-2 text-[8px] sm:text-[10px] uppercase tracking-[0.2em] transition-all duration-300 ${
                        selectedCategory === cat
                          ? "bg-black dark:bg-white text-white dark:text-black font-bold"
                          : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white border border-transparent hover:border-black/10 dark:hover:border-white/10"
                      }`}
                    >
                      {cat}
                    </button>
                  ),
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10 pt-8">
                {products
                  .filter((p) => {
                    const title = p.title || "";
                    const desc = p.description || "";
                    const matchesCategory =
                      selectedCategory === "Todos" ||
                      p.category === selectedCategory;
                    const matchesSearch =
                      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      desc.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesCategory && matchesSearch;
                  })
                  .map((product) => (
                    <div key={product.id}>
                      <ProductCard
                        product={product}
                        onBuy={handleBuy}
                        onRead={(p) => {
                          const order = purchasedProducts.find(
                            (o) => o.product_id === p.id,
                          );
                          if (order)
                            handleOpenReader(p, order.id, order.created_at);
                        }}
                        isOwned={purchasedProducts.some(
                          (p) => p.product_id === product.id,
                        )}
                        isProcessing={checkoutLoading === product.id}
                      />
                    </div>
                  ))}
              </div>

              {products.filter(
                (p) =>
                  selectedCategory === "Todos" ||
                  p.category === selectedCategory,
              ).length === 0 && (
                <div className="py-32 text-center space-y-4 animate-in fade-in duration-1000">
                  <p className="font-serif text-2xl italic text-neutral-300">
                    Novos e-books de {selectedCategory} em breve.
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                    A nossa curadoria está em processo de seleção.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {view === "product-detail" && detailProduct && (
            <ProductDetailsPage
              product={detailProduct}
              onBack={() => setView("home")}
              onConfirm={handleDetailConfirm}
              isProcessing={detailLoading}
            />
          )}

          {view === "shipping" && selectedProduct && (
            <div className="max-w-4xl mx-auto py-12 animate-in fade-in duration-700">
              <div className="mb-12 space-y-4 text-center">
                <h2 className="text-4xl md:text-5xl font-serif dark:text-white">
                  Finalizar Aquisição
                </h2>
                <div className="text-[10px] uppercase tracking-[0.3em] text-black/40 dark:text-white/40">
                  Precisamos da sua morada para a entrega física S.Art
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                <div className="lg:col-span-3 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        value={shippingInfo.fullName}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            fullName: e.target.value,
                          })
                        }
                        className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                        placeholder="Nome para faturação e entrega"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold">
                        Morada de Entrega
                      </label>
                      <input
                        type="text"
                        value={shippingInfo.address}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            address: e.target.value,
                          })
                        }
                        className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                        placeholder="Rua, número, andar..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={shippingInfo.city}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            city: e.target.value,
                          })
                        }
                        className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                        placeholder="Ex: Lisboa"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold">
                        Código Postal
                      </label>
                      <input
                        type="text"
                        value={shippingInfo.postalCode}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            postalCode: e.target.value,
                          })
                        }
                        className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                        placeholder="0000-000"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold">
                        País
                      </label>
                      <input
                        type="text"
                        value={shippingInfo.country}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            country: e.target.value,
                          })
                        }
                        className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                        placeholder="Ex: Portugal"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold">
                        Contacto Telefónico
                      </label>
                      <input
                        type="tel"
                        value={shippingInfo.phone}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            phone: e.target.value,
                          })
                        }
                        className="w-full border-b border-black/10 dark:border-white/10 dark:bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors dark:text-white"
                        placeholder="+351 900 000 000"
                      />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="bg-neutral-50 dark:bg-zinc-900/50 p-8 border border-black/5 dark:border-white/5 space-y-6 sticky top-32">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-bold border-b border-black/5 dark:border-white/5 pb-4">
                      Resumo da Aquisição
                    </div>

                    <div className="flex gap-4">
                      <div className="w-16 h-20 bg-white dark:bg-zinc-800 border border-black/5 flex-shrink-0">
                        <img
                          src={getImageUrl(selectedProduct.image_url)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="font-serif text-sm dark:text-white line-clamp-2">
                          {selectedProduct.title}
                        </div>
                        {selectedOptions &&
                          (selectedOptions.size || selectedOptions.color) && (
                            <div className="text-[8px] uppercase text-luxury-gold">
                              {selectedOptions.size &&
                                `Tam: ${selectedOptions.size} `}
                              {selectedOptions.color &&
                                `Cor: ${selectedOptions.color}`}
                            </div>
                          )}
                        <div className="text-xs font-bold dark:text-zinc-400">
                          €{selectedProduct.price}
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-black/5 dark:bg-white/5" />

                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60">
                        <span>Subtotal</span>
                        <span>€{selectedProduct.price}</span>
                      </div>
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60">
                        <span>Envio S.Art VIP</span>
                        <span className="text-luxury-gold font-bold">
                          Grátis
                        </span>
                      </div>
                      <div className="flex justify-between text-base font-serif dark:text-white pt-2 border-t border-black/5 dark:border-white/5">
                        <span>Total</span>
                        <span>€{selectedProduct.price}</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => {
                        if (
                          !shippingInfo.address ||
                          !shippingInfo.city ||
                          !shippingInfo.postalCode ||
                          !shippingInfo.fullName
                        ) {
                          toast.error(
                            "Por favor, preencha todos os campos obrigatórios.",
                          );
                          return;
                        }
                        setIsCheckoutModalOpen(true);
                      }}
                      className="w-full h-14 bg-black dark:bg-white text-white dark:text-black rounded-none text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-xl"
                    >
                      Prosseguir Pagamento
                    </Button>

                    <button
                      onClick={() => setView("home")}
                      className="w-full text-center text-[8px] uppercase tracking-widest text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-colors"
                    >
                      Cancelar e Voltar à Boutique
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "dashboard" && user && (
            <ProfileDashboard
              user={user}
              purchasedProducts={purchasedProducts}
              readingProgress={readingProgress}
              onRead={handleOpenReader}
              onProfileUpdate={(data) => setProfile(data)}
              onRefundRequest={(order) => setRefundOrder(order)}
            />
          )}

          {view === "reader" && activeReading && (
            <div className="max-w-6xl mx-auto">
              <PDFReader
                orderId={activeReading.orderId}
                bookId={activeReading.product.id}
                bookTitle={activeReading.product.title}
                purchasedAt={activeReading.purchasedAt}
                onBack={() => {
                  setView("dashboard");
                  fetchDashboardData(user!.id);
                }}
              />
            </div>
          )}

          {view === "terms" && (
            <motion.div
              key="terms"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <TermsAndPrivacy />
            </motion.div>
          )}

          {view === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl mx-auto py-24 text-center space-y-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12 }}
                className="w-24 h-24 bg-luxury-gold rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-luxury-gold/20"
              >
                <CheckCircle2 size={40} className="text-white" />
              </motion.div>

              <div className="space-y-6 md:space-y-8">
                <h2 className="text-4xl md:text-6xl font-serif dark:text-white leading-[1.1] px-4">
                  {successProduct?.product_type === 'physical' ? (
                    <>
                      Pedido <br />
                      Confirmado.
                    </>
                  ) : (
                    <>
                      Aquisição <br />
                      Concluída.
                    </>
                  )}
                </h2>
                <div className="h-px w-24 bg-luxury-gold mx-auto opacity-50" />
                <p className="text-[11px] uppercase tracking-[0.4em] text-black/40 dark:text-white/40 max-w-sm mx-auto leading-relaxed px-6">
                  {successProduct?.product_type === 'physical' ? (
                    "O seu pedido foi processado com sucesso. A sua morada e dados de envio foram registados e receberá em breve informações sobre a entrega."
                  ) : (
                    "A sua obra já está disponível para download imediato na sua biblioteca e foi enviada para o seu destino digital."
                  )}
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
                      <img
                        src={getImageUrl(successProduct.image_url)}
                        className="w-20 h-28 object-cover"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-luxury-gold">
                        {successProduct.product_type === 'physical' ? 'Novo Pedido' : 'Novo Ativo'}
                      </p>
                      <h4 className="font-serif text-xl dark:text-white leading-tight">
                        {successProduct.title}
                      </h4>
                      <div className="pt-2">
                        <Button
                          onClick={() => setView("dashboard")}
                          variant="ghost"
                          className="p-0 h-auto text-[10px] uppercase tracking-[0.2em] font-bold text-black/60 dark:text-white/60 hover:text-luxury-gold dark:hover:text-luxury-gold transition-all"
                        >
                          {successProduct.product_type === 'physical' ? 'Ir para Encomendas' : 'Ir para Biblioteca Privada'}{" "}
                          <ArrowRight size={12} className="ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
                {successProduct && successOrderId && successProduct.product_type !== 'physical' && (
                  <Button
                    onClick={() =>
                      handleOpenReader(
                        successProduct,
                        successOrderId,
                        new Date().toISOString(),
                      )
                    }
                    className="bg-luxury-gold text-white px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-2xl hover:scale-105 transition-all duration-500 flex items-center"
                  >
                    Começar a Ler Agora{" "}
                    <ArrowRight size={14} className="ml-2 animate-pulse" />
                  </Button>
                )}
                {successProduct && successOrderId && successProduct.product_type === 'physical' && (
                  <Button
                    onClick={() => setView("dashboard")}
                    className="bg-luxury-gold text-white px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-2xl hover:scale-105 transition-all duration-500 flex items-center"
                  >
                    Acompanhar Pedido{" "}
                    <ArrowRight size={14} className="ml-2" />
                  </Button>
                )}
                <Button
                  onClick={() => setView("dashboard")}
                  variant={successProduct ? "outline" : "default"}
                  className={`${!successProduct ? "bg-black text-white" : "border-black/10 dark:border-white/10"} px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-xl transition-all duration-500`}
                >
                  Minha Biblioteca
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {refundOrder && (
        <Dialog
          open={!!refundOrder}
          onOpenChange={(open) => !open && setRefundOrder(null)}
        >
          <DialogContent className="max-w-md rounded-none border-black/5 dark:border-white/5 bg-white/95 dark:bg-black/95 backdrop-blur-xl p-8 z-[200]">
            <DialogHeader className="space-y-4">
              <div className="text-center font-serif text-2xl text-red-500">
                Solicitar Reembolso
              </div>
              <div className="text-center text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60 leading-relaxed">
                Você está dentro do período de garantia de 14 dias para a obra{" "}
                <strong className="text-black dark:text-white">
                  {refundOrder.product?.title}
                </strong>
                .
              </div>
              <div className="text-center text-sm text-black/80 dark:text-white/80 leading-relaxed bg-red-50 dark:bg-red-950/20 p-4 border border-red-100 dark:border-red-900/50">
                Atenção: Ao processar este reembolso,{" "}
                <strong>perderá imediatamente o acesso</strong> ao livro.
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] font-medium text-black/60 dark:text-white/60 text-center block mb-2">
                  Digite o nome exato da obra para confirmar:
                </label>
                <input
                  type="text"
                  placeholder={refundOrder.product?.title}
                  value={refundBookName}
                  onChange={(e) => setRefundBookName(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-3 text-sm outline-none focus:border-red-500 text-center dark:text-white transition-colors"
                />
              </div>
              <Button
                onClick={handleRefund}
                disabled={
                  isRefunding || refundBookName !== refundOrder.product?.title
                }
                className="rounded-none bg-red-500 hover:bg-red-600 text-white h-12 uppercase tracking-[0.2em] text-[9px] font-bold mt-2 transition-all disabled:opacity-50"
              >
                {isRefunding ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Confirmar Reembolso"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <footer className="border-t border-black/5 dark:border-white/5 py-20 px-6 bg-white dark:bg-black transition-colors duration-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
          <div className="space-y-4">
            <h3 className="text-3xl font-serif tracking-tighter dark:text-white">
              S.Art
            </h3>
            <div className="text-[9px] uppercase tracking-[0.3em] text-black/40 dark:text-white/40">
              © 2026 Boutique S.Art | S.Art-full.pt
            </div>
          </div>
          <div className="flex gap-8 text-[9px] uppercase tracking-[0.2em] font-medium text-black/60 dark:text-white/60">
            <a
              href="#"
              className="hover:text-black dark:hover:text-white transition-colors"
            >
              Instagram
            </a>
            <button
              onClick={() => setView("terms")}
              className="hover:text-black dark:hover:text-white transition-colors text-left uppercase"
            >
              Termos e Privacidade
            </button>
          </div>
        </div>
      </footer>

      <AuthDialog
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onViewTerms={() => {
          setIsAuthOpen(false);
          setView("terms");
        }}
      />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: { borderRadius: 0, fontFamily: "serif", padding: "1.5rem" },
        }}
      />
    </div>
  );
}

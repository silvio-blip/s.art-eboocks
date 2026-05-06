import React, { useEffect, useState, useMemo, useRef } from "react";
import { 
  motion, 
  AnimatePresence, 
  useScroll, 
  useVelocity, 
  useSpring, 
  useTransform, 
  useAnimationFrame,
  useMotionValue
} from "motion/react";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import {
  ShoppingBag,
  User,
  Menu,
  X,
  ChevronDown,
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
import { Routes, Route, useLocation } from "react-router-dom";

import { DropeaService } from "./services/DropeaService";
import AdminDashboard from "./components/AdminDashboard";
import TermsAndPrivacy from "./components/TermsAndPrivacy";
import ProfileDashboard from "./components/ProfileDashboard";
import ProductReview from "./components/ProductReview";
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

// --- Animation Components ---

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

const InfiniteProductMarquee = ({ products }: { products: Product[] }) => {
  const activeProducts = useMemo(() => products.filter(p => p.is_active && p.image_url), [products]);
  if (activeProducts.length === 0) return null;

  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, {
    stiffness: 400,
    damping: 50
  });

  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 2], {
    clamp: false
  });

  // Extremely slow base speed (percent per second)
  const baseVelocity = -1.2;
  const directionFactor = React.useRef<number>(1);

  // Seamless wrap at 1/3
  const x = useTransform(baseX, (v) => `${wrap(-33.333, 0, v)}%`);

  useAnimationFrame((t, delta) => {
    // Determine direction from scroll velocity
    const velocity = scrollVelocity.get();
    if (velocity > 0) {
      directionFactor.current = 1; // Scroll down -> move left
    } else if (velocity < 0) {
      directionFactor.current = -1; // Scroll up -> move right
    }

    // delta is in ms, delta/1000 is seconds
    let moveBy = directionFactor.current * baseVelocity * (delta / 1000); 
    
    const factor = Math.abs(velocityFactor.get());
    if (factor > 0) {
      moveBy += moveBy * (factor * 0.5);
    }
    
    baseX.set(baseX.get() + moveBy);
  });

  const marqueeItems = useMemo(() => {
    let list = [...activeProducts];
    // Ensure we have a high enough count to prevent gaps anywhere
    while (list.length < 20) {
      list = [...list, ...activeProducts];
    }
    // Triple it for the wrap logic
    return [...list, ...list, ...list];
  }, [activeProducts]);

  return (
    <div className="relative py-14 overflow-hidden bg-[#050505] select-none pointer-events-none">
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#050505] to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#050505] to-transparent z-10" />
      
      <motion.div 
        className="flex gap-6 pr-6 w-max" 
        style={{ x }}
      >
        {marqueeItems.map((product, i) => (
          <div 
            key={`${product.id}-${i}`} 
            className="flex-shrink-0 flex items-center gap-4 w-[240px] h-14 pr-4"
          >
            <div className="w-14 h-full flex-shrink-0 overflow-hidden ml-2">
              <img 
                src={getImageUrl(product.image_url)} 
                alt="" 
                className="w-full h-full object-cover grayscale opacity-30"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex-1 flex flex-col justify-center gap-0.5 overflow-hidden">
              <p className="text-luxury-gold text-[7px] uppercase tracking-[0.3em] font-black truncate leading-none opacity-50">
                {product.title}
              </p>
              <div className="h-[1px] w-4 bg-luxury-gold/20"></div>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

const MagneticButton = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const ref = React.useRef<HTMLDivElement>(null);

  const handleMouse = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { left, top, width, height } = ref.current!.getBoundingClientRect();
    const x = clientX - (left + width / 2);
    const y = clientY - (top + height / 2);
    setPosition({ x, y });
  };

  const reset = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: position.x * 0.2, y: position.y * 0.2 }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const MovingParticles = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * 100 + "%", 
            y: Math.random() * 100 + "%",
            opacity: Math.random() * 0.3 + 0.1,
            scale: Math.random() * 0.5 + 0.5
          }}
          animate={{ 
            x: [null, Math.random() * 100 + "%", Math.random() * 100 + "%"],
            y: [null, Math.random() * 100 + "%", Math.random() * 100 + "%"],
            rotate: [0, 180, 360]
          }}
          transition={{ 
            duration: Math.random() * 20 + 20, 
            repeat: Infinity, 
            ease: "linear" 
          }}
          className="absolute w-1 h-1 bg-luxury-gold rounded-full blur-[1px]"
        />
      ))}
      <motion.div 
        animate={{ 
          opacity: [0.1, 0.2, 0.1],
          scale: [1, 1.1, 1]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-luxury-gold/5 rounded-full blur-[120px]"
      />
      <motion.div 
        animate={{ 
          opacity: [0.1, 0.15, 0.1],
          scale: [1, 1.2, 1]
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-luxury-gold/5 rounded-full blur-[150px]"
      />
    </div>
  );
};

const SectionHeading = ({ subtitle, title }: { subtitle: string, title: string }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="px-[5%] mb-20"
    >
      <motion.span 
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="text-luxury-gold text-[10px] uppercase tracking-[0.5em] font-bold block mb-4"
      >
        {subtitle}
      </motion.span>
      <h2 className="font-serif text-4xl md:text-5xl text-luxury-foreground italic transition-colors">
        {title}
      </h2>
      <motion.div 
        initial={{ width: 0 }}
        whileInView={{ width: 96 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="h-px bg-luxury-gold/30 mt-6"
      ></motion.div>
    </motion.div>
  );
};

// --- Types ---
interface Product {
  id: string;
  title: string;
  description: string;
  pvp: number;
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
  dropea_id?: string | number;
  supabase_id?: string;
  is_featured?: boolean;
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  shipping_status: string;
  payment_status?: string;
  total_amount: number;
  created_at: string;
  product?: Product;
}

// --- Components ---

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

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
  onCartClick,
  searchQuery,
}: {
  user: any;
  profile: any;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  onAuthClick: () => void;
  onLogoutClick: () => void;
  onDashboardClick: (v: "dashboard" | "admin") => void;
  onHomeClick: () => void;
  onSearch: (q: string) => void;
  onCartClick: () => void;
  searchQuery: string;
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const avatarUrl = profile?.avatar_url 
    ? getImageUrl(profile.avatar_url) 
    : (user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "");

  const iconClass = "text-white hover:text-luxury-gold transition-all duration-300 transform hover:scale-110 active:scale-95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]";

  return (
    <header className={`fixed w-full top-0 z-[50] transition-all duration-1000 ease-in-out ${
      isScrolled 
        ? "py-3 bg-black/80 backdrop-blur-3xl border-b border-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]" 
        : "py-6 bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 flex justify-between items-center">
        <button
          onClick={onHomeClick}
          className={`text-2xl md:text-3xl font-serif tracking-tighter hover:opacity-70 transition-all duration-1000 italic font-black text-white drop-shadow-2xl ${
            isScrolled ? "scale-90" : "scale-100"
          }`}
        >
          S.art
        </button>

        <div className="flex items-center gap-3 md:gap-6">
          {/* Superior Luxury Search */}
          <div className="relative flex items-center">
            <AnimatePresence>
              {isSearchOpen && (
                <motion.div 
                  initial={{ width: 0, opacity: 0, x: 20 }}
                  animate={{ width: 240, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="overflow-hidden flex items-center bg-black/60 backdrop-blur-2xl border border-white/20 rounded-full px-4 py-1.5 mr-3 shadow-2xl"
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="ENCANTAR COM..."
                    autoFocus
                    className="bg-transparent border-none text-white w-full outline-none text-[9px] uppercase tracking-[0.3em] placeholder:text-white/40"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={iconClass}
              aria-label="Search"
            >
              {isSearchOpen ? <X size={20} /> : <Search size={22} />}
            </button>
          </div>

          <AnimatePresence>
            {!isSearchOpen && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3 md:gap-6"
              >
                <button
                  onClick={onThemeToggle}
                  className={iconClass}
                >
                  {theme === "light" ? <Moon size={22} /> : <Sun size={22} />}
                </button>

                {user ? (
                  <div className="flex items-center gap-3 md:gap-6">
                    {ADMIN_IDS.includes(user.id) && (
                      <button
                        onClick={() => onDashboardClick("admin")}
                        className={iconClass}
                        title="Admin"
                      >
                        <Shield size={20} />
                      </button>
                    )}
                    <button
                      onClick={() => onDashboardClick("dashboard")}
                      className="hover:opacity-70 transition-all transform hover:scale-110 active:scale-95 overflow-hidden w-8 h-8 rounded-full border-2 border-white/30 shadow-2xl"
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <User size={20} className="text-white" />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onAuthClick}
                    className={iconClass}
                  >
                    <User size={22} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden absolute top-full left-0 w-full bg-luxury-bg border-b border-luxury-border p-6 space-y-6 shadow-2xl"
          >
            <div className="flex items-center bg-black/5 dark:bg-white/5 px-4 py-3 rounded-[4px] border border-luxury-border focus-within:border-luxury-gold transition-colors">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Procurar..."
                className="bg-transparent border-none text-luxury-foreground w-full outline-none text-sm placeholder:text-luxury-foreground/30"
              />
              <Search size={16} className="text-luxury-gold" />
            </div>
            
            {/* Logout button removed from here, now accessible via Profile Dashboard */}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

interface ProductCardProps {
  key?: React.Key;
  product: Product;
  onBuy: (p: Product) => any;
  onRead?: (p: Product) => any;
  isOwned?: boolean;
  isProcessing?: boolean;
  className?: string;
}

function ProductCard({
  product,
  onBuy,
  onRead,
  isOwned,
  isProcessing,
  className = "",
}: ProductCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -8 }}
      className={`luxury-card cursor-pointer group relative overflow-hidden ${className}`}
      onClick={() => {
        if (isOwned && product.product_type !== 'physical' && onRead) {
          onRead(product);
        } else {
          onBuy(product);
        }
      }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden">
        <motion.img
          src={getImageUrl(product.image_url)}
          alt={product.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-[2500ms] ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/40 transition-colors duration-700" />
        
        {/* Shine effect on hover */}
        <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none">
          <motion.div 
            initial={{ x: "-100%", skewX: -20 }}
            whileHover={{ x: "200%" }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
          />
        </div>
      </div>

      <div className="card-info bg-gradient-to-t from-black/80 via-black/20 to-transparent md:translate-y-6 md:group-hover:translate-y-0 md:opacity-0 md:group-hover:opacity-100 transition-all duration-700 ease-premium p-4 md:p-6">
        <div className="flex items-center gap-3 md:gap-4">
          <motion.div 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="w-10 h-10 rounded-full border border-luxury-gold/40 flex items-center justify-center text-luxury-gold flex-shrink-0"
          >
            <ShoppingBag size={18} />
          </motion.div>
          
          <div className="flex flex-col text-left overflow-hidden">
            <h4 className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] md:tracking-[0.3em] text-luxury-gold font-bold drop-shadow-md line-clamp-1">
              {product.title}
            </h4>
            <span className="text-xl md:text-2xl font-serif text-white font-light tracking-tight drop-shadow-lg">
              €{product.pvp}
            </span>
          </div>
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
              theme: localStorage.getItem("sart_theme") || "dark"
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
          const rawCheckText = await checkResponse.text();
          let checkData;
          try {
            checkData = JSON.parse(rawCheckText);
          } catch (e) {
            console.error("Failed to parse check-exists JSON response. Response text:", rawCheckText);
            throw new Error(`Erro do servidor (${checkResponse.status}): ${rawCheckText.substring(0, 50)}...`);
          }
          
          if (!checkData.exists) {
            throw new Error("Este e-mail não está registado no nosso sistema.");
          }

          // 2. Send recovery code
          const response = await fetch("/api/recovery/send", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail })
          });

          const rawText = await response.text();
          let data;
          try {
            data = JSON.parse(rawText);
          } catch (e) {
            console.error("Failed to parse JSON response. Response text:", rawText);
            throw new Error(`Erro do servidor (${response.status}): ${rawText.substring(0, 50)}...`);
          }
          
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

        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          console.error("Failed to parse JSON response. Response text:", rawText);
          throw new Error(`Erro do servidor (${response.status}): ${rawText.substring(0, 50)}...`);
        }
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

        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          console.error("Failed to parse JSON response. Response text:", rawText);
          throw new Error(`Erro do servidor (${response.status}): ${rawText.substring(0, 50)}...`);
        }
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
      <DialogContent className="sm:max-w-md bg-luxury-bg rounded-none border-none shadow-2xl p-6 md:p-12 w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors duration-500">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="font-serif text-3xl mb-2 text-luxury-foreground">
            S.Art Atelier
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-[0.2em] text-luxury-foreground/40">
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
                className="w-full flex items-center justify-center gap-3 rounded-none h-12 border-luxury-border text-[10px] uppercase tracking-widest hover:bg-luxury-gold hover:text-white dark:text-luxury-foreground transition-all cursor-pointer"
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
                <div className="flex-grow border-t border-luxury-border"></div>
                <span className="flex-shrink mx-4 text-[9px] uppercase tracking-widest text-luxury-foreground/30">
                  ou usar email
                </span>
                <div className="flex-grow border-t border-luxury-border"></div>
              </div>
            </>
          )}

          {mode === "register" && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50">
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border-b border-luxury-border bg-transparent py-3 text-xs outline-none focus:border-luxury-gold transition-colors text-luxury-foreground"
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
              <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50">
                Endereço de Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === "otp" || mode === "check-email"}
                className="w-full border-b border-luxury-border bg-transparent py-3 text-xs outline-none focus:border-luxury-gold transition-colors text-luxury-foreground disabled:opacity-50"
                placeholder="vogue@sart.com"
              />
            </div>
          )}

          {mode === "check-email" && (
            <div className="py-2 space-y-4 animate-in fade-in duration-500">
              <div className="bg-luxury-gold/10 border border-luxury-gold/20 p-4 text-center">
                <p className="text-[10px] text-luxury-gold font-medium leading-relaxed italic">
                  "Enviámos um convite de recuperação para o seu destino. Siga a hiperligação no seu e-mail para definir o novo acesso."
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
                <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50">
                  {mode === "reset" ? "Nova Password" : "Palavra-passe"}
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => setAuthMode("forgot")}
                    className="text-[9px] text-luxury-foreground/40 uppercase tracking-[0.1em] hover:text-luxury-gold transition-colors"
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
                  className="w-full border-b border-luxury-border bg-transparent py-3 text-xs outline-none focus:border-luxury-gold transition-colors text-luxury-foreground pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-luxury-foreground/20 hover:text-luxury-gold transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {(mode === "register" || mode === "reset") && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50">
                Confirmar Password
              </label>
              <div className="relative group">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border-b border-luxury-border bg-transparent py-3 text-xs outline-none focus:border-luxury-gold transition-colors text-luxury-foreground pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-luxury-foreground/20 hover:text-luxury-gold transition-colors"
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
  onConfirm: (customerData: any) => void;
  isProcessing: boolean;
}) => {
  if (!product) return null;
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: userEmail,
    phone: "",
    address: "",
    city: "",
    zip: "",
    country: "PT",
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] w-[95vw] rounded-none border-none dark:bg-zinc-900 p-6 md:p-8 shadow-2xl backdrop-blur-xl bg-white/95 transition-all duration-500">
        <DialogHeader className="space-y-4">
          <DialogTitle className="text-3xl font-serif dark:text-white tracking-tight">
            Finalizar Aquisição
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Nome" className="col-span-1 border-b py-2 text-sm" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
            <input placeholder="Apelido" className="col-span-1 border-b py-2 text-sm" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
          </div>
          <input placeholder="Email" className="w-full border-b py-2 text-sm" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          <input placeholder="Telefone" className="w-full border-b py-2 text-sm" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          <input placeholder="Morada" className="w-full border-b py-2 text-sm" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          <div className="grid grid-cols-3 gap-4">
            <input placeholder="Cidade" className="col-span-1 border-b py-2 text-sm" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
            <input placeholder="Código Postal" className="col-span-1 border-b py-2 text-sm" value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} />
            <select className="col-span-1 border-b py-2 text-sm" value={form.country} onChange={e => setForm({...form, country: e.target.value})}>
              <option value="PT">PT</option>
              <option value="ES">ES</option>
            </select>
          </div>
        </div>

        <div className="space-y-8 pt-6">
          <Button
            onClick={() => onConfirm(form)}
            disabled={isProcessing || !form.firstName || !form.address}
            className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-luxury-gold hover:text-white rounded-none h-14 text-[11px] font-bold uppercase tracking-[0.3em] transition-all duration-500 shadow-xl disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="flex items-center gap-3">
                <Loader2 size={16} className="animate-spin" />A Processar...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Confirmar Checkout <ArrowRight size={14} />
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
              €{product.pvp}
            </p>
          </div>

          <Separator className="bg-black/10 dark:bg-white/10" />

          <div className="space-y-6">
            <div 
              className="text-sm text-black/80 dark:text-zinc-300 leading-relaxed font-normal text-justify prose prose-sm dark:prose-invert max-w-none" 
              dangerouslySetInnerHTML={{ __html: product.description }} 
            />

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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(error => {
        console.error("Video background failed to play:", error);
      });
    }
  }, []);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [view, setView] = useState<
    | "home"
    | "dashboard"
    | "success"
    | "admin"
    | "reset-password"
    | "terms"
    | "product-detail"
    | "shipping"
  >("home");
  const [purchasedProducts, setPurchasedProducts] = useState<Order[]>([]);
  const [successProduct, setSuccessProduct] = useState<Product | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [siteHero, setSiteHero] = useState({
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070",
    video_url: "",
    title: "Luxo & Exclusividade",
    buttonText: "Explorar Coleção"
  });

  const fetchSiteSettings = async () => {
    try {
      const res = await fetch("/api/settings/hero");
      if (res.ok) {
        const data = await res.json();
        if (data && data.image) {
          setSiteHero(data);
        }
      }
    } catch (e) {
      console.error("Error fetching site settings:", e);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (e) {
      console.error("Error fetching categories:", e);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchSiteSettings();
  }, [view]);

  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);

  const allCategories = useMemo(() => {
    return categories.map(c => c.name).filter(c => c !== "Todos").sort();
  }, [categories]);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const location = useLocation();
  const isReviewPage = location.pathname.startsWith("/evaluate");

  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    phone: "",
  });

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, selectedProduct]);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<{
    size: string;
    color: string;
  }>({ size: "", color: "" });
  const [searchQuery, setSearchQuery] = useState("");

  // Intelligent Search: Auto-scroll to Boutique when user starts typing
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      if (view !== "home") {
        setView("home");
        // Give a small delay for the view to mount before scrolling
        setTimeout(() => {
          const boutiqueSection = document.getElementById("boutique");
          if (boutiqueSection) {
            const offset = 100;
            const elementPosition = boutiqueSection.getBoundingClientRect().top + window.pageYOffset;
            window.scrollTo({
              top: elementPosition - offset,
              behavior: "smooth"
            });
          }
        }, 100);
      } else {
        const boutiqueSection = document.getElementById("boutique");
        if (boutiqueSection) {
          const offset = 100;
          const elementPosition = boutiqueSection.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: elementPosition - offset,
            behavior: "smooth"
          });
        }
      }
    }
  }, [searchQuery]);
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
          event: "*",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          // Refresh dashboard data on any change to orders
          fetchDashboardData(user.id);

          const newStatus = payload.new?.status?.toLowerCase();
          const oldStatus = payload.old?.status?.toLowerCase();

          const isNowPaid = ['paid', 'completed', 'pago', 'delivered', 'succeeded'].includes(newStatus);
          const wasNotPaid = !oldStatus || !['paid', 'completed', 'pago', 'delivered', 'succeeded'].includes(oldStatus);

          const isInsert = payload.event === "INSERT";
          const isUpdate = payload.event === "UPDATE";

          if ((isInsert || isUpdate) && isNowPaid && (isInsert || wasNotPaid)) {
            toast.success(
              "Pagamento confirmado! O seu pedido foi registado com sucesso.",
              {
                duration: 5000,
                icon: <CheckCircle2 className="text-emerald-500" size={18} />,
              },
            );
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
      // Tentar marcar como welcomed primeiro, para evitar duplicidade
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({ welcomed: true })
        .eq("id", userObj.id)
        .eq("welcomed", false)
        .select();
      
      if (updateError || !updatedProfile || updatedProfile.length === 0) {
        console.log("[WELCOME] Perfil já marcado como acolhido ou erro, abortando envio.");
        return;
      }
      
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

      if (functionError) {
        console.error("[WELCOME] Erro na Edge Function:", functionError);
        // Opcional: Reverter para welcomed = false se o email falhar? 
        // O usuário pediu apenas para resolver a duplicação.
      } else {
        console.log("[WELCOME] E-mail enviado com sucesso.");
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
        console.log(`[S.ART DEBUG] Verifying Dropea session: ${sessionId}`);
        toast.info("A processar a sua compra... Por favor, aguarde um momento.", { id: "loading-order" });
        
        let attempts = 0;
        let order = null;
        let orderErr = null;

        // Tentar encontrar a ordem no banco (webhook pode demorar um pouco)
        while (attempts < 10 && !order) {
          console.log(`[S.ART DEBUG] Tentativa ${attempts + 1} de encontrar pedido...`);
          const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("stripe_session_id", sessionId)
            .maybeSingle();
          
          order = data;
          orderErr = error;

          if (order && (["paid", "completed", "pago", "succeeded"].includes(order.status.toLowerCase()))) {
             break;
          }

          attempts++;
          if (!order) await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s entre tentativas
        }

        if (orderErr) {
          console.error("[S.ART DEBUG] Erro ao buscar pedido:", orderErr);
          toast.error("Erro técnico ao recuperar detalhes do pedido.", { id: "loading-order" });
          return;
        }

        if (order && (["paid", "completed", "pago", "succeeded"].includes(order.status.toLowerCase()))) {
          toast.dismiss("loading-order");
          // Buscar produto separadamente para evitar erro de join 400
          if (order.product_id && !successProduct) {

            const { data: prodData } = await supabase
              .from("products")
              .select("*")
              .eq("id", order.product_id)
              .maybeSingle();
            if (prodData) setSuccessProduct(prodData);
          }
          
          setSuccessOrderId(order.id);
          // MENSAGEM DE SUCESSO AGRESSIVA E DIRETA
          toast.success("🔥 Compra confirmada! Verifique agora sua CAIXA DE ENTRADA ou GMAIL para o seu comprovativo oficial.", { 
            duration: 15000,
            id: "payment-success-final"
          });
        } else if (order) {
          console.log("[S.ART DEBUG] Order found but status is:", order.status);
          toast.info("Pagamento em processamento...");
        } else {
          console.log("[S.ART DEBUG] Order not found for session:", sessionId);
          // Opcional: tentar novamente após uns segundos
          setTimeout(() => checkUrlParams(), 3000);
        }
      } catch (err: any) {
        console.error("[S.ART SESSION ERROR LOG]", err);
      }
    }
  };

  useEffect(() => {
    const handleReturnFromPayment = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const status = urlParams.get('payment_status');
      const sessionId = urlParams.get('session_id');

      if (status === 'success') {
        const pending = localStorage.getItem('sart_pending_checkout');
        if (pending) {
          try {
            const { product } = JSON.parse(pending);
            toast.success(`Pagamento confirmado! Verifique a sua caixa de correio ou Gmail para o comprovativo.`, {
              duration: 10000,
              id: "payment-success"
            });
            // Opcional: Atualizar dashboard após uns segundos para ver se o webhook já registrou
            setTimeout(() => fetchDashboardData(user.id), 5000);
          } catch (e) {
            console.error("Erro ao recuperar checkout pendente:", e);
          } finally {
            localStorage.removeItem('sart_pending_checkout');
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } else if (status === 'cancel') {
        toast.error("Pagamento cancelado pelo utilizador.");
        localStorage.removeItem('sart_pending_checkout');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    if (user && !loading) {
      handleReturnFromPayment();
    }
  }, [user, loading]);

  const fetchProducts = async () => {
    try {
      // 1. FETCH PARALELO: Busca os produtos da Dropea e os do Supabase simultaneamente
      const [dropeaProducts, { data: dbProducts, error: dbError }] = await Promise.all([
        DropeaService.getProducts(user?.id),
        supabase.from("products").select("*")
      ]);

      if (dbError) {
        console.error("Erro ao carregar produtos do banco local:", dbError);
      }

      const productsFromDb = dbProducts || [];

      // 2. MERGE BLINDADO: Mapeia o array do SUPABASE (admin deicide o que vender)
      const mergedProducts = productsFromDb.map((supaProduct: any) => {
        // Se o produto tem um vínculo com a Dropea
        if (supaProduct.dropea_id) {
          // Procura a correspondência na Dropea usando String() para comparação segura
          const dropProduct = dropeaProducts.find(
            (dp: any) => String(dp.id) === String(supaProduct.dropea_id)
          );

          // Normalizar imagens da Dropea (GraphQL response handling)
          const dropeaImages = dropProduct && Array.isArray(dropProduct.images) 
            ? dropProduct.images.map((img: any) => typeof img === "string" ? img : (img.src || img.url || "")) 
            : [];

          // 3. ESTRUTURA DO OBJETO FINAL (Merge Supabase + Dropea)
          return {
            ...dropProduct, // Traz imagens, descrição original, variantes, id original da Dropea
            id: supaProduct.id, // ID interno para referências
            supabase_id: supaProduct.id,
            dropea_id: String(supaProduct.dropea_id),
            title: supaProduct.title || (dropProduct ? dropProduct.name : ""),
            pvp: supaProduct.price || (dropProduct ? (dropProduct.pvp || 0) : 0),
            price: supaProduct.price,
            description: supaProduct.description || (dropProduct ? dropProduct.description : ""),
            image_url: supaProduct.image_url || (dropeaImages[0] || ""),
            extra_images: supaProduct.extra_images || dropeaImages.join(","),
            product_type: supaProduct.product_type || "physical",
            category: supaProduct.category || (dropProduct ? dropProduct.category : "Dropshipping"),
            is_active: supaProduct.is_active,
            is_featured: supaProduct.is_featured,
            file_url: supaProduct.file_url,
            sizes_enabled: supaProduct.sizes_enabled,
            colors_enabled: supaProduct.colors_enabled,
            sizes: supaProduct.sizes,
            colors: supaProduct.colors,
          } as Product;
        }

        // Produto puramente local (ex: Info-produtos)
        return {
          ...supaProduct,
          supabase_id: supaProduct.id,
          pvp: supaProduct.price || 0,
          is_featured: supaProduct.is_featured
        } as Product;
      }).filter((p): p is Product => p !== null);

      if (mergedProducts.length > 0) {
        setProducts(mergedProducts);
      } else {
        console.warn("Nenhum produto válido para exibição após o merge.");
      }
    } catch (err) {
      console.error("Erro no fetchProducts:", err);
      toast.error("Ocorreu um erro ao carregar o catálogo de obras.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async (userId: string) => {
    // console.log("[DEBUG] Fetching dashboard data for:", userId);

    // 1. PRIMEIRO: Sincronizar com a Dropea o estado dos pedidos atuais
    try {
      await fetch('/api/orders/sync-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
    } catch (err) {
      // Sincronização falhou silenciosamente para evitar poluir o console
    }

    // 2. BUSCAR ORDENS ATUALIZADAS
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["paid", "completed", "pago", "delivered", "succeeded", "refund_requested", "refund_pending", "refunded", "canceled", "cancelled"])
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
  };

  const [refundBookName, setRefundBookName] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);

  const handleRefund = async () => {
    if (!refundOrder || !user) return;
    
    if (refundBookName !== refundOrder.product?.title) {
      toast.error("O título digitado não corresponde à obra selecionada.");
      return;
    }

    if (!refundReason || refundReason.trim().length < 10) {
      toast.error("O motivo do reembolso é obrigatório e deve ter pelo menos 10 caracteres.");
      return;
    }

    setIsRefunding(true);
    try {
      const res = await fetch("/api/request-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderId: refundOrder.id, 
          userId: user.id,
          reason: refundReason
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Erro ao solicitar análise de reembolso.");

      toast.success("O seu pedido de reembolso foi enviado para análise administrativa.");
      setRefundOrder(null);
      setRefundBookName("");
      setRefundReason("");
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

    if (product.product_type === "physical") {
      setDetailProduct(product);
      setView("product-detail");
      window.scrollTo(0, 0);
    } else {
      setSelectedProduct(product);
      setView("shipping");
      window.scrollTo(0, 0);
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
      setView("shipping");
    }, 500);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLogoutOpen(false);
    setView("home");
    toast.success("Até breve.");
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (view !== "home" && query.trim() !== "") {
      setView("home");
    }
  };

  const handleCheckoutConfirm = async (customerData: any) => {
    if (!selectedProduct || !user) return;

    setCheckoutLoading(selectedProduct.id);

    try {
      console.log("[CHECKOUT INIT] Criando sessão de pagamento:", selectedProduct.title);
      
      // Guardar dados para recuperar após o redirect
      localStorage.setItem('sart_pending_checkout', JSON.stringify({
        product: selectedProduct,
        customer: customerData,
        timestamp: Date.now()
      }));

      const res = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: selectedProduct,
          customer: { ...customerData, userId: user.id },
          baseUrl: window.location.origin
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao conectar com gateway de pagamento.");
      }

      const { url } = await res.json();
      
      if (url) {
        toast.info("A redirecionar para o checkout seguro...");
        setTimeout(() => {
          window.location.href = url;
          // Não fechamos o modal aqui pois a página vai recarregar/mudar para o Stripe
        }, 800);
      } else {
        throw new Error("Sessão de pagamento inválida.");
      }

    } catch (err: any) {
      console.error("[STRIPE INIT ERROR]", err);
      toast.error(`Erro ao iniciar checkout: ${err.message}`);
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
      <ScrollToTop />
      {isReviewPage ? (
        <Routes>
          <Route path="/evaluate/:orderId" element={<ProductReview />} />
        </Routes>
      ) : (
        <>
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
            onCartClick={() => {}}
          />

      <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
        <DialogContent className="max-w-[320px] rounded-none border-black/5 dark:border-white/5 bg-white/95 dark:bg-black/95 backdrop-blur-xl p-8">
          <DialogHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-luxury-gold">
                <LogOut size={20} />
              </div>
            </div>
            <DialogTitle className="text-center font-serif text-xl text-luxury-foreground transition-colors">
              Encerrar Sessão?
            </DialogTitle>
            <p className="text-center text-[10px] uppercase tracking-widest text-luxury-foreground/40 leading-relaxed transition-colors">
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
              className="rounded-none bg-luxury-foreground text-luxury-bg h-12 uppercase tracking-[0.2em] text-[10px] font-bold hover:opacity-80 transition-opacity"
            >
              Confirmar Saída
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsLogoutOpen(false)}
              className="rounded-none h-12 uppercase tracking-[0.2em] text-[10px] text-luxury-foreground/60 hover:text-luxury-foreground transition-all"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <main className={`overflow-x-hidden ${view === "home" ? "w-full" : "pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full"}`}>
        <AnimatePresence mode="wait">
          {view === "reset-password" && (
            <motion.div
              key="reset-password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5 }}
            >
              <ResetPasswordView onComplete={() => setView("home")} />
            </motion.div>
          )}

          {view === "admin" && user && ADMIN_IDS.includes(user.id) && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <AdminDashboard
                user={user}
                theme={theme}
                onBack={() => {
                  setView("home");
                  fetchProducts();
                }}
              />
            </motion.div>
          )}

          {view === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
                <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden bg-luxury-bg">
                  <MovingParticles />
                {/* Background Video/Image Container */}
                <div className="absolute inset-0 z-0 bg-[#050505]">
                  {siteHero.video_url ? (
                    <video
                      key={siteHero.video_url}
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      preload="auto"
                      poster={siteHero.image}
                      onEnded={(e) => {
                        (e.target as HTMLVideoElement).pause();
                      }}
                      className="w-full h-full object-cover opacity-100 transition-opacity duration-1000"
                    >
                      <source src={siteHero.video_url} type="video/mp4" />
                      {/* Fallback image if video fails to load */}
                      <img 
                        src={siteHero.image} 
                        alt="Luxury Background" 
                        className="w-full h-full object-cover"
                      />
                    </video>
                  ) : (
                    <img 
                      src={siteHero.image} 
                      alt="Luxury Background" 
                      className="w-full h-full object-cover opacity-85 dark:opacity-60 grayscale-[10%] transition-opacity duration-1000"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-transparent to-[#050505]"></div>
                </div>

                <div className="hero-content relative z-10 text-center px-4 max-w-5xl">
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={{
                        visible: {
                          transition: {
                            staggerChildren: 0.15
                          }
                        }
                      }}
                    >
                      <motion.h1 
                        variants={{
                          hidden: { y: 100, opacity: 0 },
                          visible: { y: 0, opacity: 1, transition: { duration: 1.8, ease: [0.16, 1, 0.3, 1] } }
                        }}
                        className="font-serif text-[clamp(2.5rem,7vw,9.5rem)] tracking-[-0.05em] text-white drop-shadow-2xl leading-[0.8] uppercase"
                      >
                        {siteHero.title.split(' ').map((word, i) => (
                          <motion.span 
                            key={i}
                            variants={{
                              hidden: { opacity: 0, scale: 0.9 },
                              visible: { opacity: 1, scale: 1 }
                            }}
                            className="inline-block mr-[0.2em]"
                          >
                            {i === 1 ? <span className="italic font-light text-luxury-gold">{word}</span> : word}
                          </motion.span>
                        ))}
                      </motion.h1>
                      
                      <motion.p 
                        variants={{
                          hidden: { opacity: 0, y: 20 },
                          visible: { opacity: 0.9, y: 0, transition: { duration: 1.2, ease: "easeOut" } }
                        }}
                        className="text-luxury-gold tracking-[0.8em] md:tracking-[1.2em] uppercase mt-12 font-medium text-[9px] md:text-[11px] mb-16 drop-shadow-sm opacity-80"
                      >
                        A Essência da Exclusividade
                      </motion.p>
                      
                      <motion.div
                        variants={{
                          hidden: { opacity: 0, y: 30 },
                          visible: { opacity: 1, y: 0, transition: { duration: 1, ease: "easeOut" } }
                        }}
                      >
                        <MagneticButton className="inline-block">
                          <motion.button
                            whileHover={{ scale: 1.05, backgroundColor: "#c78b7d", color: "#fff" }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => document.getElementById("featured-section")?.scrollIntoView({ behavior: "smooth" })}
                            className="bg-white text-black px-16 py-6 text-[10px] uppercase font-bold tracking-[0.5em] transition-all shadow-[0_30px_60px_rgba(0,0,0,0.4)] luxury-shine border border-white/20"
                          >
                            {siteHero.buttonText}
                          </motion.button>
                        </MagneticButton>
                      </motion.div>
                    </motion.div>
                </div>
              </section>

              {/* Featured Section (Destaque) - Redesenhada com Grid de 2 Colunas (Desktop) */}
              {products.filter(p => p.is_featured && p.is_active).length > 0 && (
                <section id="featured-section" className="bg-luxury-bg py-32 border-b border-luxury-border overflow-hidden transition-colors duration-500">
                  <SectionHeading subtitle="Seleção Master Premium" title="Destaques da Temporada" />

                  <motion.div 
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.25
                        }
                      }
                    }}
                    className="px-[5%]"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-24 max-w-[1700px] mx-auto">
                      {products.filter(p => p.is_featured && p.is_active).map((featuredProduct) => (
                        <motion.div 
                          key={featuredProduct.id} 
                          variants={{
                            hidden: { opacity: 0, y: 40 },
                            visible: { opacity: 1, y: 0, transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } }
                          }}
                          className="flex flex-col space-y-8"
                        >
                          {/* Main Product Card with internal truncated title */}
                          <div 
                            onClick={() => {
                              setSelectedProduct(featuredProduct);
                              setDetailProduct(featuredProduct);
                              setView("product-detail");
                            }}
                            className="relative aspect-[16/10] overflow-hidden border border-white/5 shadow-2xl group cursor-pointer"
                          >
                            <img 
                              src={getImageUrl(featuredProduct.image_url || "")} 
                              alt={featuredProduct.title}
                              className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-[4s] ease-out"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent dark:from-black/90 dark:via-black/20 dark:to-transparent"></div>
                            
                            {/* Title INSIDE the card with truncation */}
                            <div className="absolute bottom-0 left-0 p-6 md:p-10 w-full">
                              <h3 className="font-serif text-lg md:text-xl text-white tracking-tighter truncate max-w-[85%] uppercase">
                                {featuredProduct.title}
                              </h3>
                            </div>
                          </div>

                          {/* Information BELOW the card */}
                          <div className="flex flex-col space-y-6">
                            {/* Description Case */}
                            <div className="border-l border-luxury-border pl-6 h-12 flex items-center">
                              <p className="text-luxury-foreground/40 text-xs md:text-sm font-light leading-relaxed line-clamp-2 italic">
                                "{featuredProduct.description.replace(/<[^>]*>?/gm, "")}"
                              </p>
                            </div>

                            {/* Footer Info: Price & Action */}
                            <div className="flex items-center justify-between gap-6 pt-6 border-t border-luxury-border">
                              <div className="flex flex-col">
                                <span className="text-luxury-foreground/20 text-[8px] uppercase tracking-widest mb-1 font-bold">Valor Premium</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-luxury-gold text-3xl font-serif">€{featuredProduct.pvp}</span>
                                </div>
                              </div>
                              
                              <MagneticButton>
                                <motion.button 
                                  whileHover={{ scale: 1.05, backgroundColor: "#c78b7d", color: "#fff" }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBuy(featuredProduct);
                                  }}
                                  disabled={checkoutLoading === featuredProduct.id}
                                  className="bg-luxury-foreground text-luxury-bg px-12 py-5 rounded-full text-[9px] min-w-[200px] uppercase font-black tracking-[0.4em] transition-all duration-500 relative group overflow-hidden luxury-shine"
                                >
                                  <span className="relative z-10 flex items-center justify-center gap-3">
                                    {checkoutLoading === featuredProduct.id ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <>
                                        <span className="group-hover:translate-x-1 transition-transform duration-300">COMPRAR AGORA</span>
                                        <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform duration-300" />
                                      </>
                                    )}
                                  </span>
                                </motion.button>
                              </MagneticButton>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </section>
              )}

              <InfiniteProductMarquee products={products} />

              <section className="py-24 w-full overflow-hidden" id="boutique">
                <SectionHeading subtitle="Curadoria Exclusiva" title="Coleção Boutique" />
                <div className="space-y-12 w-full px-[2%]">
                  {/* Sticky Dropdown Filter Bar */}
                  <div className="sticky-filter-bar flex flex-col md:flex-row items-center justify-between py-6 gap-6 transition-colors duration-500">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold pt-1 font-bold">
                        {products.filter(p => {
                          const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                          const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                          const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
                          return matchesCategory && matchesPrice && matchesSearch;
                        }).length} itens
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                      {/* Custom Category Dropdown */}
                      <div className="relative min-w-[200px]">
                        <label className="text-[8px] uppercase tracking-[0.3em] text-luxury-gold font-bold block mb-1">Categoria</label>
                        <div className="relative">
                          <button 
                            className="w-full bg-black/5 dark:bg-white/5 border border-luxury-border text-luxury-foreground p-3 text-[10px] uppercase tracking-widest outline-none hover:border-luxury-gold transition-all text-left flex justify-between items-center group/btn"
                            onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                          >
                            <span>{selectedCategory}</span>
                            <ChevronDown size={12} className={`text-luxury-gold transition-transform duration-300 ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isCategoryMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setIsCategoryMenuOpen(false)} />
                              <div className="absolute top-full left-0 w-full bg-[#0a0a0a] border border-luxury-border z-50 shadow-2xl max-h-60 overflow-y-auto luxury-scrollbar mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                {["Todos", ...allCategories].map(cat => (
                                  <button 
                                    key={cat}
                                    className={`w-full text-left p-4 text-[9px] uppercase tracking-widest transition-colors hover:bg-luxury-gold hover:text-black border-b border-white/5 last:border-0 ${selectedCategory === cat ? 'bg-luxury-gold/10 text-luxury-gold font-bold' : 'text-white/60'}`}
                                    onClick={() => {
                                      setSelectedCategory(cat);
                                      setIsCategoryMenuOpen(false);
                                    }}
                                  >
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Price Range Controls */}
                      <div className="flex items-center gap-2 flex-grow md:flex-grow-0">
                        <div className="relative">
                          <label className="text-[8px] uppercase tracking-[0.3em] text-luxury-gold font-bold block mb-1">Preço Máx (€)</label>
                          <input 
                             type="number"
                             value={maxPrice}
                             onChange={(e) => setMaxPrice(Number(e.target.value))}
                             className="bg-white/5 border border-white/10 text-white p-3 text-[10px] w-24 outline-none focus:border-luxury-gold transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <motion.div 
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.15
                        }
                      }
                    }}
                    className="bento-grid"
                  >
                    {products
                      .filter((p) => {
                        const title = p.title || "";
                        const desc = p.description || "";
                        const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                        const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                        const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) || desc.toLowerCase().includes(searchQuery.toLowerCase());
                        return matchesCategory && matchesPrice && matchesSearch;
                      })
                      .map((product, idx) => {
                        // More balanced patterns: Wide cards for highlights, limited tall cards
                        const isWide = idx % 5 === 0;
                        const isHigh = idx === 3 || idx === 8;
                        
                        return (
                          <ProductCard
                            key={product.id}
                            product={product}
                            onBuy={handleBuy}
                            onRead={() => setView("dashboard")}
                            isOwned={purchasedProducts.some(
                              (p) => p.product_id === product.id && ['paid', 'completed', 'pago', 'delivered', 'succeeded'].includes(p.status?.toLowerCase()),
                            )}
                            className={`${isWide ? "md:col-span-2" : ""} ${isHigh ? "md:row-span-2" : ""}`}
                            isProcessing={checkoutLoading === product.id}
                          />
                        );
                      })}
                  </motion.div>

                  {products.filter((p) => {
                    const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                    const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesCategory && matchesPrice && matchesSearch;
                  }).length === 0 && (
                    <div className="py-32 text-center space-y-6">
                      <p className="font-serif text-3xl italic text-white/20 px-8">
                        Lamentamos, mas nenhuma obra em nossa curadoria atual condiz com os critérios selecionados.
                      </p>
                      <button 
                        onClick={() => {
                          setSelectedCategory("Todos");
                          setMinPrice(0);
                          setMaxPrice(10000);
                        }}
                        className="text-luxury-gold uppercase tracking-[0.3em] text-xs font-bold hover:text-white transition-colors"
                      >
                        Redefinir Curadoria
                      </button>
                    </div>
                  )}
                </div>
              </section>
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
                <h2 className="text-4xl md:text-5xl font-serif text-luxury-foreground">
                  Finalizar Aquisição
                </h2>
                <div className="text-[10px] uppercase tracking-[0.3em] text-luxury-foreground/40">
                  Precisamos da sua morada para a entrega física S.Art
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                <div className="lg:col-span-3 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingInfo.fullName}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            fullName: e.target.value,
                          })
                        }
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground"
                        placeholder="Nome para faturação e entrega"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        Morada de Entrega *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingInfo.address}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            address: e.target.value,
                          })
                        }
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground"
                        placeholder="Rua, número, andar..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        Cidade *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingInfo.city}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            city: e.target.value,
                          })
                        }
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground"
                        placeholder="Ex: Lisboa"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        Código Postal *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingInfo.postalCode}
                        onChange={(e) =>
                          setShippingInfo({
                            ...shippingInfo,
                            postalCode: e.target.value,
                          })
                        }
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground"
                        placeholder="0000-000"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        País *
                      </label>
                      <select
                        value={shippingInfo.country}
                        required
                        onChange={(e) => {
                          const newCountry = e.target.value;
                          const newPrefix = newCountry === 'Portugal' ? '+351 ' : (newCountry === 'Espanha' ? '+34 ' : '');
                          setShippingInfo({
                            ...shippingInfo,
                            country: newCountry,
                            phone: newPrefix
                          });
                        }}
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-luxury-bg">Selecione o País</option>
                        <option value="Portugal" className="bg-luxury-bg">Portugal</option>
                        <option value="Espanha" className="bg-luxury-bg">Espanha</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        Contacto Telefónico (PT/ES) *
                      </label>
                      <input
                        type="tel"
                        required
                        value={shippingInfo.phone}
                        onChange={(e) => {
                          const input = e.target.value;
                          const country = shippingInfo.country;
                          const prefix = country === 'Portugal' ? '+351 ' : (country === 'Espanha' ? '+34 ' : '');
                          
                          // Se tentar apagar o prefixo, não deixa
                          if (input.length < prefix.length) {
                            setShippingInfo({ ...shippingInfo, phone: prefix });
                            return;
                          }

                          if (!input.startsWith(prefix)) return;

                          // Só permite dígitos após o prefixo
                          const suffix = input.slice(prefix.length).replace(/\D/g, '');
                          
                          // Limite estrito de 9 dígitos para PT/ES
                          const limit = 9;
                          if (suffix.length <= limit) {
                            setShippingInfo({
                              ...shippingInfo,
                              phone: prefix + suffix
                            });
                          }
                        }}
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground font-mono"
                        placeholder={shippingInfo.country === 'Portugal' ? '+351 9xx xxx xxx' : (shippingInfo.country === 'Espanha' ? '+34 6xx xxx xxx' : 'Seleccione o país primeiro')}
                      />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="bg-luxury-bg/50 p-8 border border-luxury-border space-y-6 sticky top-32">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-bold border-b border-luxury-border pb-4">
                      Resumo da Aquisição
                    </div>

                    <div className="flex gap-4">
                      <div className="w-16 h-20 bg-luxury-bg border border-luxury-border flex-shrink-0">
                        <img
                          src={getImageUrl(selectedProduct.image_url)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="font-serif text-sm text-luxury-foreground line-clamp-2">
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
                        <div className="text-xs font-bold text-luxury-foreground/60 transition-colors">
                          €{selectedProduct.pvp}
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-luxury-border" />

                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-foreground/60 transition-colors">
                        <span>Subtotal</span>
                        <span>€{selectedProduct.pvp}</span>
                      </div>
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-foreground/60 transition-colors">
                        <span>Envio S.Art VIP</span>
                        <span className="text-luxury-gold font-bold">
                          Grátis
                        </span>
                      </div>
                      <div className="flex justify-between text-base font-serif text-luxury-foreground transition-colors pt-2 border-t border-luxury-border">
                        <span>Total</span>
                        <span>€{selectedProduct.pvp}</span>
                      </div>
                    </div>

                    <Button
                      onClick={async () => {
                        if (
                          !shippingInfo.address ||
                          !shippingInfo.city ||
                          !shippingInfo.postalCode ||
                          !shippingInfo.fullName ||
                          !shippingInfo.country ||
                          !shippingInfo.phone
                        ) {
                          toast.error(
                            "Por favor, preencha todos os campos obrigatórios.",
                          );
                          return;
                        }

                        // Phone Validation (PT or ES)
                        const country = shippingInfo.country;
                        const prefix = country === 'Portugal' ? '+351 ' : (country === 'Espanha' ? '+34 ' : '');
                        const suffix = shippingInfo.phone.slice(prefix.length).replace(/\s/g, '');

                        if (country === 'Portugal' && suffix.length !== 9) {
                          toast.error("O número de telemóvel de Portugal deve ter exatamente 9 dígitos.");
                          return;
                        }

                        if (country === 'Espanha' && suffix.length !== 9) {
                          toast.error("O número de telemóvel de Espanha deve ter exatamente 9 dígitos.");
                          return;
                        }

                        if (!country) {
                          toast.error("Por favor, selecione um país para validar o contacto.");
                          return;
                        }
                        
                        // Chamada direta do checkout sem modal secundário
                        await handleCheckoutConfirm({
                          firstName: shippingInfo.fullName.split(' ')[0],
                          lastName: shippingInfo.fullName.split(' ').slice(1).join(' ') || '.',
                          email: user?.email || '',
                          phone: shippingInfo.phone,
                          address: shippingInfo.address,
                          city: shippingInfo.city,
                          zip: shippingInfo.postalCode,
                          country: shippingInfo.country === 'Portugal' ? 'PT' : (shippingInfo.country === 'Espanha' ? 'ES' : shippingInfo.country)
                        });
                      }}
                      disabled={!!checkoutLoading}
                      className="w-full h-14 bg-black dark:bg-white text-white dark:text-black rounded-none text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-xl"
                    >
                      {checkoutLoading ? (
                        <span className="flex items-center gap-3">
                          <Loader2 size={16} className="animate-spin" /> A Processar...
                        </span>
                      ) : (
                        "Ir Para Pagamento Seguro"
                      )}
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
              onProfileUpdate={(data) => setProfile(data)}
              onRefundRequest={(order) => setRefundOrder(order)}
              onLogout={handleLogout}
            />
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
                <h2 className="text-4xl md:text-6xl font-serif text-luxury-foreground leading-[1.1] px-4 transition-colors">
                  Pedido <br />
                  Confirmado.
                </h2>
                <div className="h-px w-24 bg-luxury-gold mx-auto opacity-50" />
                <p className="text-[11px] uppercase tracking-[0.4em] text-luxury-foreground/40 max-w-sm mx-auto leading-relaxed px-6 transition-colors">
                  O seu pedido foi processado com sucesso. A sua morada e dados de envio foram registados e receberá em breve informações sobre a entrega.
                </p>
              </div>

              {successProduct && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-none border border-luxury-border bg-luxury-bg/50 overflow-hidden shadow-2xl mx-auto max-w-sm"
                >
                  <div className="flex bg-luxury-card p-6 gap-6 text-left items-center transition-colors">
                    <div className="shadow-xl flex-shrink-0">
                      <img
                        src={getImageUrl(successProduct.image_url)}
                        className="w-20 h-28 object-cover"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-luxury-gold">
                        Novo Pedido
                      </p>
                      <h4 className="font-serif text-xl text-luxury-foreground leading-tight transition-colors">
                        {successProduct.title}
                      </h4>
                      <div className="pt-2">
                        <Button
                          onClick={() => setView("dashboard")}
                          variant="ghost"
                          className="p-0 h-auto text-[10px] uppercase tracking-[0.2em] font-bold text-luxury-foreground/60 hover:text-luxury-gold transition-all"
                        >
                          Acompanhar Encomenda{" "}
                          <ArrowRight size={12} className="ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
                <Button
                  onClick={() => setView("dashboard")}
                  className="bg-luxury-gold text-white px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-2xl hover:scale-105 transition-all duration-500 flex items-center"
                >
                  Acompanhar Pedido{" "}
                  <ArrowRight size={14} className="ml-2" />
                </Button>
                <Button
                  onClick={() => setView("home")}
                  variant="outline"
                  className="px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-xl transition-all duration-500"
                >
                  Voltar à Boutique
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
                Solicitar Devolução
              </div>
              <div className="text-center text-[10px] uppercase tracking-widest text-black/60 dark:text-white/60 leading-relaxed">
                O seu pedido será enviado para análise administrativa pela nossa equipa de curadoria.
              </div>
              <div className="text-center text-sm text-black/80 dark:text-white/80 leading-relaxed bg-red-50 dark:bg-red-950/20 p-4 border border-red-100 dark:border-red-900/50">
                Atenção: A confirmar a devolução, o acesso à obra e suporte associado serão bloqueados permanentemente após aprovação administrativa.
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-medium text-black/60 dark:text-white/60 mb-2">
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

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-medium text-black/60 dark:text-white/60 mb-2">
                    Motivo da sua solicitação: (Obrigatório)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Explique por que deseja o reembolso..."
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-3 text-sm outline-none focus:border-red-500 dark:text-white transition-colors resize-none"
                  />
                </div>
              </div>
              <Button
                onClick={handleRefund}
                disabled={
                  isRefunding || 
                  refundBookName !== refundOrder.product?.title ||
                  !refundReason || 
                  refundReason.trim().length < 10
                }
                className="rounded-none bg-red-500 hover:bg-red-600 text-white h-12 uppercase tracking-[0.2em] text-[9px] font-bold mt-2 transition-all disabled:opacity-50"
              >
                {isRefunding ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Confirmar Pedido de Devolução"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <footer className="border-t border-white/5 py-24 px-6 bg-[#050505] transition-colors duration-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
          <div className="space-y-4">
            <h3 className="text-3xl font-serif tracking-tighter text-luxury-foreground transition-colors">
              S.Art
            </h3>
            <div className="text-[9px] uppercase tracking-[0.3em] text-luxury-foreground/40 transition-colors">
              © 2026 Boutique S.Art | S.Art-full.pt
            </div>
          </div>
          <div className="flex gap-8 text-[9px] uppercase tracking-[0.2em] font-medium text-luxury-foreground/60 transition-colors">
            <a
              href="#"
              className="hover:text-luxury-gold transition-colors"
            >
              Instagram
            </a>
            <button
              onClick={() => setView("terms")}
              className="hover:text-luxury-gold transition-colors text-left uppercase"
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
        </>
      )}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: { borderRadius: 0, fontFamily: "serif", padding: "1.5rem" },
        }}
      />
    </div>
  );
}

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
  Share2,
  Plus,
  Edit,
  Loader2,
  Eye,
  EyeOff,
  Search,
  Minus,
  Globe,
  Truck,
  Crown,
  Bell,
  Clock,
  Trash2,
  Info,
  SlidersHorizontal,
  RotateCcw,
  Filter,
  Star,
  Sparkles,
  RefreshCw,
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
import { t } from "./services/i18n";

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
  if (!url) return "https://picsum.photos/seed/shop/600/800";
  if (url.startsWith("http")) return url;
  try {
    const { data } = supabase.storage.from("assets").getPublicUrl(url);
    return data?.publicUrl || "https://picsum.photos/seed/shop/600/800";
  } catch (err) {
    console.warn("Error generating public URL for image:", err);
    return "https://picsum.photos/seed/shop/600/800";
  }
};

// --- Animation Components ---

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

const QuantitySelector = ({ value, onChange, label = "Quantidade" }: { value: number; onChange: (v: number) => void; label?: string }) => (
  <div className="space-y-4">
    <label className="text-[9px] uppercase tracking-[0.3em] text-luxury-foreground/40 font-bold block transition-colors">
      {label}
    </label>
    <div className="flex items-center gap-4 bg-luxury-bg/30 border border-luxury-border w-fit p-1 group hover:border-luxury-gold/50 transition-all">
      <button 
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-10 h-10 flex items-center justify-center text-luxury-foreground hover:bg-white/5 transition-colors"
      >
        <Minus size={14} />
      </button>
      <span className="w-8 text-center text-sm font-mono text-luxury-foreground">{value}</span>
      <button 
        onClick={() => onChange(value + 1)}
        className="w-10 h-10 flex items-center justify-center text-luxury-foreground hover:bg-white/5 transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>
  </div>
);


const InfiniteProductMarquee = ({ products }: { products: Product[] }) => {
  const activeProducts = useMemo(() => products.filter(p => p.is_active && p.image_url), [products]);

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
  const baseVelocity = -0.5;
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
    if (activeProducts.length === 0) return [];
    let list = [...activeProducts];
    // Ensure we have a high enough count to prevent gaps anywhere
    while (list.length < 20) {
      list = [...list, ...activeProducts];
    }
    // Triple it for the wrap logic
    return [...list, ...list, ...list];
  }, [activeProducts]);

  if (activeProducts.length === 0) return null;

  return (
    <div className="relative py-14 overflow-hidden bg-luxury-bg border-y border-luxury-border select-none pointer-events-none">
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-luxury-bg to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-luxury-bg to-transparent z-10" />
      
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
                className="w-full h-full object-cover grayscale opacity-40"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </div>
            <div className="flex-1 flex flex-col justify-center gap-0.5 overflow-hidden">
              <p className="text-luxury-foreground text-[8px] uppercase tracking-[0.25em] font-bold truncate leading-none">
                {product.title}
              </p>
              <div className="h-[1px] w-4 bg-luxury-gold/40"></div>
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

const GlassButton = ({ children, onClick, className = "", disabled = false, loading = false }: any) => {
  return (
    <MagneticButton className={className}>
      <motion.button
        whileHover="hover"
        whileTap="tap"
        onClick={onClick}
        disabled={disabled || loading}
        className="relative group overflow-hidden px-8 md:px-14 py-4 md:py-6 rounded-[2rem] transition-all duration-500 isolation-auto flex items-center justify-center min-w-[180px] md:min-w-[240px]"
      >
        {/* Crystal Clear Glass - Minimal blur to see background clearly, focusing on distortion/refraction */}
        <div className="absolute inset-0 bg-white/[0.01] backdrop-blur-[2px] backdrop-saturate-[150%] border border-white/20 group-hover:bg-white/[0.04] transition-all duration-500 rounded-[2rem]" />
        
        {/* Border Glow Beam - Elegant orbit that appears and disappears smoothly */}
        <div className="absolute inset-0 rounded-[2rem] pointer-events-none overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <motion.rect
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              rx="30"
              fill="none"
              stroke="url(#gold-glow-gradient)"
              strokeWidth="3"
              strokeDasharray="160, 500"
              initial={{ strokeDashoffset: 660 }}
              variants={{
                hover: { 
                  strokeDashoffset: -660,
                  transition: { duration: 3.5, ease: "linear", repeat: Infinity }
                }
              }}
              style={{ filter: "drop-shadow(0 0 4px #D4AF37)" }}
            />
            <defs>
              <linearGradient id="gold-glow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
                <stop offset="50%" stopColor="#D4AF37" stopOpacity="1" />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Improved Light Sweep - Smooth, continuous flow across the entire button */}
        <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 overflow-hidden rounded-[2rem]">
          <motion.div 
            initial={{ x: "-250%", skewX: -45 }}
            variants={{
              hover: { 
                x: "450%", 
                transition: { 
                  duration: 1.5, 
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 2
                } 
              }
            }}
            className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
          />
        </div>

        {/* Subtle reflection on top edge */}
        <div className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />

        {/* Button Content */}
        <span className="relative z-10 flex items-center justify-center gap-2 md:gap-3 text-[9px] md:text-[11px] uppercase font-black tracking-[0.3em] md:tracking-[0.5em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
           {children}
        </span>
      </motion.button>
    </MagneticButton>
  );
};

const MovingParticles = ({ activeTheme = "luxury" }: { activeTheme?: string }) => {
  if (activeTheme === "christmas") {
    return (
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-60">
        {[...Array(25)].map((_, i) => {
          const size = Math.random() * 4 + 2;
          return (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: -10,
                opacity: Math.random() * 0.5 + 0.3,
                scale: Math.random() * 0.5 + 0.5
              }}
              animate={{ 
                y: "110vh",
                x: [null, (Math.random() * 20 - 10) + "px", (Math.random() * 20 - 10) + "px"]
              }}
              transition={{ 
                duration: Math.random() * 12 + 8, 
                repeat: Infinity, 
                ease: "linear",
                delay: Math.random() * 8
              }}
              className="absolute bg-white rounded-full blur-[0.5px]"
              style={{ width: size, height: size }}
            />
          );
        })}
        <motion.div 
          animate={{ 
            opacity: [0.15, 0.25, 0.15],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[130px]"
        />
        <motion.div 
          animate={{ 
            opacity: [0.12, 0.18, 0.12],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[150px]"
        />
      </div>
    );
  }

  if (activeTheme === "summer") {
    return (
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-50">
        {[...Array(20)].map((_, i) => {
          const size = Math.random() * 6 + 2;
          return (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: "110%",
                opacity: Math.random() * 0.4 + 0.1,
                scale: Math.random() * 0.5 + 0.5
              }}
              animate={{ 
                y: "-10%",
                x: [null, (Math.random() * 40 - 20) + "px", (Math.random() * 40 - 20) + "px"]
              }}
              transition={{ 
                duration: Math.random() * 15 + 10, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: Math.random() * 10
              }}
              className="absolute bg-orange-400 rounded-full blur-[2px]"
              style={{ width: size, height: size }}
            />
          );
        })}
        <motion.div 
          animate={{ 
            opacity: [0.2, 0.3, 0.2],
            scale: [1, 1.15, 1]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-amber-500/15 rounded-full blur-[120px]"
        />
        <motion.div 
          animate={{ 
            opacity: [0.15, 0.25, 0.15],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute bottom-1/3 right-1/4 w-[600px] h-[600px] bg-orange-600/15 rounded-full blur-[140px]"
        />
      </div>
    );
  }

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
  supabase_id?: string;
  is_featured?: boolean;
  free_shipping?: boolean;
  discount_percent?: number;
}

export function getEffectivePrice(product: Partial<Product> | null | undefined): number {
  if (!product) return 0;
  const pvp = Number(product.pvp || 0);
  const discount = Number(product.discount_percent || 0);
  if (discount > 0) {
    const discounted = pvp * (1 - discount / 100);
    return Math.max(0, Math.round(discounted * 100) / 100);
  }
  return pvp;
}

const STARBURST_PATH = (() => {
  const points = 20;
  const outerRadius = 48;
  const innerRadius = 39;
  const cx = 50;
  const cy = 50;
  let path = "";
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.round((cx + r * Math.cos(angle)) * 100) / 100;
    const y = Math.round((cy + r * Math.sin(angle)) * 100) / 100;
    path += (i === 0 ? `M ${x},${y}` : ` L ${x},${y}`);
  }
  return path + " Z";
})();

export function StarburstDiscountBadge({ 
  discount, 
  className = "absolute -top-3.5 -right-3.5 z-20 pointer-events-none" 
}: { 
  discount?: number; 
  className?: string;
}) {
  if (!discount || discount <= 0) return null;

  return (
    <motion.div
      animate={{ 
        rotate: [0, -5, 5, -4, 4, -2, 2, 0], 
        scale: [1, 1.08, 0.96, 1.05, 1],
        x: [0, -1, 1, -0.5, 0.5, 0],
        y: [0, 0.8, -0.8, 0.5, -0.5, 0]
      }}
      transition={{ 
        duration: 1.4, 
        repeat: Infinity, 
        repeatDelay: 0.15,
        ease: "easeInOut" 
      }}
      className={`${className} filter drop-shadow-[0_8px_18px_rgba(220,38,38,0.55)] w-12 h-12 md:w-14 md:h-14 flex items-center justify-center select-none`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id="starburstGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="40%" stopColor="#DC2626" />
            <stop offset="80%" stopColor="#B91C1C" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>
        </defs>
        <path
          fill="url(#starburstGrad)"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinejoin="round"
          d={STARBURST_PATH}
        />
        <circle cx="50" cy="50" r="32" fill="none" stroke="#FDE68A" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.85" />
      </svg>

      <div className="relative z-10 flex flex-col items-center justify-center text-white text-center leading-none">
        <span className="text-[11px] md:text-[13px] font-black font-mono tracking-tighter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          -{discount}%
        </span>
        <span className="text-[6px] md:text-[7px] font-black uppercase tracking-widest text-amber-200 mt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          OFF
        </span>
      </div>
    </motion.div>
  );
}

interface Order {
  id: string;
  product_id: string;
  status: string;
  shipping_status: string;
  payment_status?: string;
  total_amount: number;
  quantity?: number;
  created_at: string;
  product?: Product;
}

const COUNTRIES = [
  { code: 'PT', name: 'Portugal', prefix: '+351', flag: '🇵🇹', currency: 'EUR' },
  { code: 'BR', name: 'Brasil', prefix: '+55', flag: '🇧🇷', requiresIdentification: "CPF", currency: 'BRL' },
  { code: 'ES', name: 'Espanha', prefix: '+34', flag: '🇪🇸', requiresIdentification: "DNI/NIE", currency: 'EUR' },
  { code: 'US', name: 'Estados Unidos', prefix: '+1', flag: '🇺🇸', currency: 'USD' },
  { code: 'FR', name: 'França', prefix: '+33', flag: '🇫🇷', currency: 'EUR' },
  { code: 'DE', name: 'Alemanha', prefix: '+49', flag: '🇩🇪', currency: 'EUR' },
  { code: 'IT', name: 'Itália', prefix: '+39', flag: '🇮🇹', requiresIdentification: "Codice Fiscale", currency: 'EUR' },
  { code: 'GB', name: 'Reino Unido', prefix: '+44', flag: '🇬🇧', currency: 'GBP' },
  { code: 'CA', name: 'Canadá', prefix: '+1', flag: '🇨🇦', currency: 'CAD' },
  { code: 'AU', name: 'Austrália', prefix: '+61', flag: '🇦🇺', currency: 'AUD' },
  { code: 'JP', name: 'Japão', prefix: '+81', flag: '🇯🇵', currency: 'JPY' },
  { code: 'KR', name: 'Coreia do Sul', prefix: '+82', flag: '🇰🇷', requiresIdentification: "PCCC", currency: 'KRW' },
  { code: 'CL', name: 'Chile', prefix: '+56', flag: '🇨🇱', requiresIdentification: "RUT", currency: 'CLP' },
  { code: 'MX', name: 'México', prefix: '+52', flag: '🇲🇽', requiresIdentification: "RFC", currency: 'MXN' },
  { code: 'NL', name: 'Holanda', prefix: '+31', flag: '🇳🇱', currency: 'EUR' },
  { code: 'BE', name: 'Bélgica', prefix: '+32', flag: '🇧🇪', currency: 'EUR' },
  { code: 'CH', name: 'Suíça', prefix: '+41', flag: '🇨🇭', currency: 'CHF' },
  { code: 'SE', name: 'Suécia', prefix: '+46', flag: '🇸🇪', currency: 'SEK' },
  { code: 'NO', name: 'Noruega', prefix: '+47', flag: '🇳🇴', currency: 'NOK' },
  { code: 'FI', name: 'Finlândia', prefix: '+358', flag: '🇫🇮', currency: 'EUR' },
  { code: 'DK', name: 'Dinamarca', prefix: '+45', flag: '🇩🇰', currency: 'DKK' },
  { code: 'IE', name: 'Irlanda', prefix: '+353', flag: '🇮🇪', currency: 'EUR' },
  { code: 'AT', name: 'Áustria', prefix: '+43', flag: '🇦Ｔ', currency: 'EUR' },
  { code: 'GR', name: 'Grécia', prefix: '+30', flag: '🇬🇷', currency: 'EUR' },
];

const isValidCPF = (cpf: string) => {
  if (typeof cpf !== 'string') return false;
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
  let add = 0;
  for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
  let rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  add = 0;
  for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
  rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  return true;
};

// --- Components ---

const CustomCursor = ({ active }: { active: boolean }) => {
  const mouseX = useMotionValue(typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
  const mouseY = useMotionValue(typeof window !== 'undefined' ? window.innerHeight - 60 : 0);
  const [isPointer, setIsPointer] = useState(false);
  const [hasExited, setHasExited] = useState(false);

  useEffect(() => {
    if (!active) {
      setHasExited(false);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Once it has exited the circle, follow mouse
      if (hasExited) {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
      }
      
      const target = e.target as HTMLElement;
      setIsPointer(window.getComputedStyle(target).cursor === 'pointer');
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [active, hasExited]);

  useEffect(() => {
    if (active && !hasExited) {
      // Small delay to peak the agitation before flying toward cursor
      const timer = setTimeout(() => {
        setHasExited(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [active, hasExited]);

  if (!active) return null;

  return (
    <>
      <style>
        {`
          * {
            cursor: ${hasExited ? 'none !important' : 'auto'};
          }
        `}
      </style>
      <motion.div
        style={{
          x: hasExited ? mouseX : window.innerWidth / 2,
          y: hasExited ? mouseY : window.innerHeight - 60,
          translateX: "-50%",
          translateY: "-50%",
        }}
        className="fixed top-0 left-0 w-2.5 h-2.5 bg-luxury-gold rounded-full z-[100000] pointer-events-none mix-blend-difference hidden md:block"
        animate={{
          scale: isPointer ? 3 : (!hasExited ? [1, 2.2, 0.8, 1.8] : 1),
          backgroundColor: isPointer ? "rgba(212, 175, 55, 0.4)" : "rgba(212, 175, 55, 1)",
          boxShadow: isPointer 
            ? "0 0 30px rgba(212, 175, 55, 0.7)" 
            : (!hasExited 
                ? "0 0 40px rgba(212, 175, 55, 0.9)" 
                : "0 0 10px rgba(212, 175, 55, 0.2)"),
          // Agitation shake while inside
          rotate: !hasExited ? [0, -15, 15, -10, 10, 0] : 0,
        }}
        transition={{ 
          scale: !hasExited ? { duration: 0.15, repeat: Infinity } : { type: "spring", stiffness: 300, damping: 20 },
          rotate: !hasExited ? { duration: 0.1, repeat: Infinity } : { duration: 0.2 },
          default: { 
            type: "spring", 
            stiffness: hasExited ? 450 : 80, 
            damping: hasExited ? 28 : 20,
            mass: 0.6
          }
        }}
      />
    </>
  );
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

const CountryDropdown = ({ value, onChange, className = "", isScrolled = false }: { value: any; onChange: (c: any) => void; className?: string; isScrolled?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const getCurrencySymbol = (code: string) => {
    switch (code) {
      case 'BRL': return 'R$';
      case 'USD': return '$';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'CAD': return 'C$';
      case 'AUD': return 'A$';
      case 'CHF': return 'Fr';
      case 'SEK': return 'kr';
      case 'NOK': return 'kr';
      case 'DKK': return 'kr';
      default: return '€';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 border rounded-full transition-all duration-300 shadow-sm group ${
          isScrolled 
            ? "border-luxury-border bg-luxury-card text-luxury-foreground hover:border-luxury-gold/60" 
            : "border-white/20 bg-black/40 text-white hover:border-luxury-gold/60"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm leading-none shrink-0">{value.flag || "🌐"}</span>
          <span className="text-[10px] md:text-[11px] font-mono font-bold leading-none tracking-tight">
            {value.code || value.currency} ({getCurrencySymbol(value.currency)})
          </span>
          <ChevronDown size={12} className="text-luxury-gold transition-transform duration-300 group-hover:translate-y-0.5 shrink-0" />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full right-0 mt-2 w-64 bg-luxury-card border border-luxury-border shadow-2xl z-[101] overflow-hidden rounded-xl"
            >
              <div className="p-2.5 border-b border-luxury-border bg-black/10 dark:bg-white/5 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.2em] text-luxury-gold font-bold flex items-center gap-1.5">
                  <Globe size={12} />
                  Moeda & Região
                </span>
                <span className="text-[9px] font-mono font-bold text-luxury-foreground/60">
                  {COUNTRIES.length} Países
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto luxury-scrollbar p-1.5 space-y-0.5">
                {COUNTRIES.map(country => {
                  const isSelected = value.code === country.code;
                  return (
                    <button 
                      key={country.code}
                      onClick={() => {
                        onChange(country);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-all rounded-lg ${
                        isSelected 
                          ? 'bg-luxury-gold/15 border border-luxury-gold/40 text-luxury-gold font-bold' 
                          : 'hover:bg-luxury-bg text-luxury-foreground/80 hover:text-luxury-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl shrink-0">{country.flag}</span>
                        <div className="flex flex-col">
                          <span className={`text-[10px] uppercase tracking-wider font-bold ${isSelected ? 'text-luxury-gold' : 'text-luxury-foreground'}`}>
                            {country.name}
                          </span>
                          <span className="text-[8px] text-luxury-foreground/40 font-mono">
                            {country.currency} ({getCurrencySymbol(country.currency)})
                          </span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono font-black ${isSelected ? 'text-luxury-gold' : 'text-luxury-foreground/50'}`}>
                        {getCurrencySymbol(country.currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const LANGUAGE_MAP: Record<string, string> = {
  PT: 'pt',
  BR: 'pt',
  ES: 'es',
  US: 'en',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  GB: 'en',
  CA: 'en',
  AU: 'en',
  JP: 'ja',
  KR: 'ko',
  CL: 'es',
  MX: 'es',
  NL: 'nl',
  BE: 'nl',
  CH: 'de',
  SE: 'sv',
  NO: 'no',
  FI: 'fi',
  DK: 'da',
  IE: 'en',
  AT: 'de',
  GR: 'el',
};

// --- Boutique Logo ---
const BoutiqueLogo = ({ className = "h-10", isScrolled = false }) => {
  const [hasError, setHasError] = useState(false);
  const color = isScrolled ? "var(--foreground)" : "#ffffff";

  if (hasError) {
    return (
      <svg 
        viewBox="0 0 120 120" 
        className={`${className} transition-all duration-700`}
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* S - Calligraphic main curve */}
        <path 
          d="M 54,24 C 70,22 80,28 78,38 C 76,50 56,54 50,62 C 42,72 44,84 56,86 C 68,88 78,82 78,74" 
          stroke={color} 
          strokeWidth="5.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className="transition-colors duration-500"
        />
        
        {/* S - Thin top flourish */}
        <path 
          d="M 40,36 C 40,24 52,22 62,22" 
          stroke={color} 
          strokeWidth="2.5" 
          strokeLinecap="round"
          className="transition-colors duration-500 opacity-90"
        />

        {/* A - Thin left leg */}
        <path 
          d="M 62,30 L 48,84" 
          stroke={color} 
          strokeWidth="2.5" 
          strokeLinecap="round"
          className="transition-colors duration-500"
        />

        {/* A - Thick right leg */}
        <path 
          d="M 64,28 L 78,84" 
          stroke={color} 
          strokeWidth="6" 
          strokeLinecap="round"
          className="transition-colors duration-500"
        />
        
        {/* A - Flat serif foot on the right leg */}
        <path 
          d="M 70,84 L 88,84" 
          stroke={color} 
          strokeWidth="3" 
          strokeLinecap="round"
          className="transition-colors duration-500"
        />

        {/* A - Apex curve connection */}
        <path 
          d="M 60,28 Q 63,24 66,28" 
          stroke={color} 
          strokeWidth="3.5" 
          strokeLinecap="round"
          className="transition-colors duration-500"
        />

        {/* Sharp calligraphic horizontal brush-strokes (the 'slashes') */}
        {/* Main middle slash */}
        <path 
          d="M 18,52 Q 45,54 86,42 Q 45,49 18,52 Z" 
          fill={color} 
          className="transition-colors duration-500"
        />
        
        {/* Upper slash */}
        <path 
          d="M 24,47 Q 45,49 76,40 Q 45,45 24,47 Z" 
          fill={color} 
          className="transition-colors duration-500 opacity-90"
        />
        
        {/* Lower slash */}
        <path 
          d="M 22,57 Q 45,58 70,48 Q 45,53 22,57 Z" 
          fill={color} 
          className="transition-colors duration-500 opacity-95"
        />

        {/* Dynamic brush-tip splits (stray marks pointing down-left) */}
        <path 
          d="M 25,58 Q 32,60 38,56 Q 32,58 25,58 Z" 
          fill={color} 
          className="transition-colors duration-500 opacity-80"
        />
        <path 
          d="M 22,62 Q 30,64 36,58 Q 30,61 22,62 Z" 
          fill={color} 
          className="transition-colors duration-500 opacity-70"
        />
      </svg>
    );
  }

  return (
    <img 
      src="/logo.webp" 
      alt="S.art Logo" 
      className={`${className} transition-all duration-700 object-contain`}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
    />
  );
};

// --- Navbar ---
const Navbar = ({
  user,
  profile,
  onAuthClick,
  onLogoutClick,
  onDashboardClick,
  onHomeClick,
  onSearch,
  onCartClick,
  searchQuery,
  selectedCountry,
  onCountryChange,
  currentLanguage,
  view,
  unreadCount = 0,
  onNotificationClick,
}: {
  user: any;
  profile: any;
  onAuthClick: () => void;
  onLogoutClick: () => void;
  onDashboardClick: (v: "dashboard" | "admin") => void;
  onHomeClick: () => void;
  onSearch: (q: string) => void;
  onCartClick: () => void;
  searchQuery: string;
  selectedCountry: any;
  onCountryChange: (c: any) => void;
  currentLanguage: string;
  view: string;
  unreadCount?: number;
  onNotificationClick?: () => void;
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

  // Dynamic Styles
  const forceScrolled = isScrolled || view !== "home";

  const headerBgClass = forceScrolled 
    ? "py-3 bg-[#FCFAF7]/95 backdrop-blur-md border-b border-black/5 shadow-[0_4px_30px_rgba(0,0,0,0.02)]" 
    : "py-5 bg-transparent";

  const textColorClass = forceScrolled 
    ? "text-luxury-foreground" 
    : "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]";

  const iconClass = `${
    forceScrolled ? "text-luxury-foreground" : "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
  } hover:text-gold transition-all duration-300 transform hover:scale-110 active:scale-95`;

  const linkClass = `text-[10px] uppercase tracking-[0.25em] font-medium transition-colors duration-300 ${
    forceScrolled 
      ? "text-luxury-foreground/70 hover:text-gold" 
      : "text-white/85 hover:text-gold drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
  }`;

  const handleScrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    onHomeClick();
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        const offset = 90;
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = element.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        window.scrollTo({
          top: elementPosition - offset,
          behavior: "smooth"
        });
      }
    }, 150);
  };

  return (
    <header className={`fixed w-full top-0 z-[9999] transition-all duration-500 ${headerBgClass}`}>
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 flex justify-between items-center">
        
        {/* Left: Branding & Logo */}
        <button
          onClick={() => {
            onHomeClick();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="flex items-center gap-2.5 hover:opacity-85 transition-all duration-300 group"
        >
          <BoutiqueLogo className="h-10 w-auto max-w-[120px] transform duration-500" isScrolled={forceScrolled} />
          <div className="flex flex-col text-left">
            <span className={`text-sm font-serif font-semibold tracking-[0.2em] leading-none uppercase ${textColorClass} transition-colors duration-500`}>
              S.art
            </span>
          </div>
        </button>

        {/* Center: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          <button 
            onClick={() => handleScrollToSection("boutique")}
            className={linkClass}
          >
            Coleção
          </button>
          <button 
            onClick={() => handleScrollToSection("featured-section")}
            className={linkClass}
          >
            Novidades
          </button>
        </nav>

        {/* Right: Actions Toolbar */}
        <div className="flex items-center gap-2.5 md:gap-4">
          <CountryDropdown 
            value={selectedCountry} 
            onChange={onCountryChange} 
            isScrolled={isScrolled}
          />

          {/* Luxury Search Bar */}
          <div className="relative flex items-center">
            <AnimatePresence>
              {isSearchOpen && (
                <motion.div 
                  initial={{ width: 0, opacity: 0, x: 20 }}
                  animate={{ width: 180, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`overflow-hidden flex items-center ${
                    isScrolled ? "bg-white border-black/10" : "bg-black/50 border-white/20"
                  } border rounded-full px-4 py-1.5 mr-2.5 shadow-sm`}
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearch(e.target.value)}
                    onBlur={() => {
                      if (searchQuery.trim() === "") {
                        setIsSearchOpen(false);
                      }
                    }}
                    placeholder={currentLanguage === 'pt' ? "PROCURAR..." : "SEARCH..."}
                    autoFocus
                    className={`bg-transparent border-none ${isScrolled ? "text-luxury-foreground" : "text-white"} w-full outline-none text-[9px] uppercase tracking-[0.3em] placeholder:opacity-50`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={iconClass}
              aria-label="Search"
            >
              {isSearchOpen ? <X size={18} /> : <Search size={19} />}
            </button>
          </div>

          {/* User / Dashboard Shortcut */}
          <AnimatePresence>
            {!isSearchOpen && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-3 md:gap-5"
              >
                {/* Real-time Notification Bell */}
                {onNotificationClick && (
                  <button
                    onClick={onNotificationClick}
                    className={`relative ${iconClass} p-1 rounded-full hover:bg-neutral-500/10 transition-colors flex items-center justify-center`}
                    aria-label="Notifications"
                    title="Notificações da Loja"
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 bg-red-500 text-white font-mono text-[8px] font-black rounded-full flex items-center justify-center px-1 animate-pulse border border-black shadow">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}
                {user ? (
                  <div className="flex items-center gap-3 md:gap-5">
                    {(ADMIN_IDS.includes(user.id || "") || profile?.is_admin || profile?.is_employee) && (
                      <button
                        onClick={() => onDashboardClick("admin")}
                        className={`${iconClass} flex items-center gap-1 focus:outline-none group/admin`}
                        title="Painel de Administração"
                      >
                        <Shield size={18} className="group-hover/admin:rotate-12 transition-transform duration-500" />
                        <span className="hidden lg:inline text-[8px] tracking-[0.2em] font-bold text-gold">PAINEL</span>
                      </button>
                    )}
                    <button
                      onClick={() => onDashboardClick("dashboard")}
                      className="relative hover:opacity-85 transition-all transform hover:scale-110 active:scale-95 overflow-visible w-8 h-8 flex items-center justify-center"
                    >
                      <div className="w-8 h-8 rounded-full border border-gold/40 overflow-hidden shrink-0 shadow-sm bg-neutral-200">
                        {avatarUrl ? (
                          <img src={avatarUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <User size={16} className={isScrolled ? "text-luxury-foreground" : "text-white"} />
                        )}
                      </div>
                      {profile?.is_admin && (
                        <div className="absolute -top-1.5 -right-1.5 bg-gold rounded-full p-0.5 border border-white shadow-sm animate-pulse">
                          <Crown size={8} className="text-white fill-white" />
                        </div>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onAuthClick}
                    className={iconClass}
                    aria-label="Account"
                  >
                    <User size={19} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden ${iconClass}`}
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="md:hidden absolute top-full left-0 w-full bg-[#FCFAF7]/98 backdrop-blur-2xl border-b border-black/5 p-6 space-y-6 shadow-xl z-50 overflow-hidden"
          >
            <div className="flex flex-col gap-4 border-b border-black/5 pb-4">
              <button 
                onClick={() => handleScrollToSection("boutique")}
                className="text-left py-2.5 text-xs uppercase tracking-[0.2em] font-medium text-luxury-foreground/80 hover:text-gold"
              >
                Coleção
              </button>
              <button 
                onClick={() => handleScrollToSection("featured-section")}
                className="text-left py-2.5 text-xs uppercase tracking-[0.2em] font-medium text-luxury-foreground/80 hover:text-gold"
              >
                Novidades
              </button>
              <button 
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onDashboardClick("dashboard");
                }}
                className="text-left py-2.5 text-xs uppercase tracking-[0.2em] font-medium text-luxury-foreground/80 hover:text-gold"
              >
                Perfil / Minha Conta
              </button>
            </div>
            
            <div className="flex items-center bg-black/5 px-4 py-3 rounded-full border border-black/5 focus-within:border-gold/50 transition-all">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Procurar na boutique..."
                className="bg-transparent border-none text-luxury-foreground w-full outline-none text-xs tracking-wider placeholder:text-luxury-foreground/40"
              />
              <Search size={16} className="text-gold" />
            </div>
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
  formatPrice?: (v: any) => string;
}

const ProductCard = React.memo(function ProductCard({
  product,
  onBuy,
  onRead,
  isOwned,
  isProcessing,
  className = "",
  index = 0,
  formatPrice,
}: ProductCardProps & { index?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ 
        opacity: 1, 
        y: 0,
        transition: { 
          duration: 0.6, 
          ease: [0.16, 1, 0.3, 1],
          delay: (index % 4) * 0.05
        } 
      }}
      viewport={{ once: true, amount: 0.05 }}
      className={`group cursor-pointer flex flex-col bg-white dark:bg-[#161616] border border-black/10 dark:border-white/10 hover:border-gold/60 rounded-[10px] relative overflow-visible shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)] transition-all duration-500 h-full ${className}`}
      onClick={() => {
        if (isOwned && product.product_type !== 'physical' && onRead) {
          onRead(product);
        } else {
          onBuy(product);
        }
      }}
    >
      {/* 16-point Serrated Starburst Discount Badge overlapping top-right border */}
      {product.discount_percent && product.discount_percent > 0 ? (
        <StarburstDiscountBadge discount={product.discount_percent} />
      ) : null}

      {/* Aspect Ratio 3:4 Image Frame */}
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-[#FAF8F5] dark:bg-[#1a1a1a] rounded-t-[9px] border-b border-black/5 dark:border-white/10 flex items-center justify-center">
        <motion.img
          src={getImageUrl(product.image_url)}
          alt={product.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-[1000ms] ease-out group-hover:scale-108"
          loading="lazy"
          decoding="async"
        />
        
        {/* Subtle luxury vignette overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
      </div>

      {/* Product Information */}
      <div className="flex flex-col p-4 md:p-5 text-left flex-grow bg-white dark:bg-[#161616] rounded-b-[9px] justify-between space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            {product.category ? (
              <span className="text-[8px] md:text-[9px] uppercase tracking-[0.25em] text-gold font-mono font-bold truncate">
                {product.category}
              </span>
            ) : <span />}

            {product.discount_percent && product.discount_percent > 0 ? (
              <span className="line-through text-neutral-400 dark:text-neutral-500 text-[10px] md:text-xs font-mono font-normal shrink-0">
                {formatPrice ? formatPrice(product.pvp) : `€${product.pvp}`}
              </span>
            ) : null}
          </div>
          
          <h4 className="text-xs md:text-sm font-serif text-luxury-foreground dark:text-white font-semibold tracking-wide leading-snug line-clamp-2 group-hover:text-gold transition-colors duration-300">
            {product.title}
          </h4>
        </div>
        
        <div className="flex justify-between items-center pt-3 border-t border-black/[0.06] dark:border-white/10 gap-2">
          <span className="text-base md:text-lg font-serif text-luxury-foreground dark:text-white font-semibold tracking-tight">
            {formatPrice ? formatPrice(getEffectivePrice(product)) : `€${getEffectivePrice(product)}`}
          </span>
          
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isOwned && product.product_type !== 'physical' && onRead) {
                onRead(product);
              } else {
                onBuy(product);
              }
            }}
            className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] font-extrabold text-black bg-gold hover:bg-amber-400 px-3 md:px-4 py-1.5 md:py-2 rounded-none transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 shrink-0"
          >
            <ShoppingBag size={12} className="stroke-[2.5]" />
            <span>{isOwned && product.product_type !== 'physical' ? 'Aceder' : 'Comprar'}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
});

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
          <DialogTitle className="font-serif text-3xl mb-2 text-luxury-foreground italic">
            S.art Atelier
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-[0.2em] text-luxury-foreground/40">
            {mode === "login"
              ? "Entrar na S.art Boutique"
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
            <GlassButton
              onClick={handleSubmit}
              disabled={loading}
              className="w-full"
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
            </GlassButton>
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

const sanitizeAddress = (val: string) => {
  // 1. Remove ordinal symbols and superscript indicators (º, ª, °, etc.)
  let s = val.replace(/[ºª°\u00B0\u00BA\u00AA]/g, "");
  
  // 2. Prohibit word patterns by replacing them with numbers
  const wordMap: any = {
    "primeiro": "1", "primeira": "1", "first": "1",
    "segundo": "2", "segunda": "2", "second": "2",
    "terceiro": "3", "terceira": "3", "third": "3",
    "quarto": "4", "quarta": "4", "fourth": "4",
    "quinto": "5", "quinta": "5", "fifth": "5",
    "um": "1", "uma": "1", "one": "1",
    "dois": "2", "duas": "2", "two": "2",
    "tres": "3", "three": "3",
  };
  
  Object.keys(wordMap).forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    s = s.replace(regex, wordMap[word]);
  });

  // 3. Keep only allowed characters (Alphanumeric, Space, _, -, /)
  // This prevents any "miniature zeros" or other hidden symbols.
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-zA-Z0-9\s_\-\/]/g, "");
  
  return s;
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

  if (!product) return null;

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
          <input 
            placeholder="Morada" 
            className="w-full border-b py-2 text-sm" 
            value={form.address} 
            onChange={e => setForm({...form, address: sanitizeAddress(e.target.value)})} 
          />
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
          <GlassButton
            onClick={() => onConfirm(form)}
            disabled={isProcessing || !form.firstName || !form.address}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>A Processar...</span>
              </>
            ) : (
              <>
                <span>Confirmar Checkout</span>
                <ArrowRight size={14} />
              </>
            )}
          </GlassButton>
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
  quantity,
  setQuantity,
  formatPrice,
}: {
  product: Product;
  onBack: () => void;
  onConfirm: (
    product: Product,
    options: { size: string; color: string },
    quantity: number
  ) => void;
  isProcessing?: boolean;
  quantity: number;
  setQuantity: (q: number) => void;
  formatPrice: (p: number) => string;
}) => {
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const extraImages = product.extra_images
    ? product.extra_images
        .split(",")
        .map((img) => img.trim())
        .filter(Boolean)
        .map(url => getImageUrl(url))
    : [];
  const allImages = [getImageUrl(product.image_url), ...extraImages];

  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = allImages[activeIndex];

  const sizes = product.sizes
    ? product.sizes
        .split(/[,\/]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const colors = product.colors
    ? product.colors
        .split(/[,\/]/)
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  const nextImage = () =>
    setActiveIndex((prev) => (prev + 1) % allImages.length);
  const prevImage = () =>
    setActiveIndex((prev) => (prev - 1 + allImages.length) % allImages.length);

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Update title and meta tags dynamically for sharing
    const previousTitle = document.title;
    const ogImage = document.querySelector('meta[property="og:image"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const previousOgImage = ogImage?.getAttribute("content");
    const previousTwitterImage = twitterImage?.getAttribute("content");
    const previousOgTitle = ogTitle?.getAttribute("content");

    document.title = `S.art | ${product.title}`;
    if (ogImage && allImages[0]) ogImage.setAttribute("content", allImages[0]);
    if (twitterImage && allImages[0]) twitterImage.setAttribute("content", allImages[0]);
    if (ogTitle) ogTitle.setAttribute("content", product.title);

    return () => {
      document.title = previousTitle;
      if (ogImage && previousOgImage) ogImage.setAttribute("content", previousOgImage);
      if (twitterImage && previousTwitterImage) twitterImage.setAttribute("content", previousTwitterImage);
      if (ogTitle && previousOgTitle) ogTitle.setAttribute("content", previousOgTitle);
    };
  }, [product]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto space-y-12 px-4 py-8"
    >
      <div className="flex items-center justify-between gap-4 mb-8">
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

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={async () => {
            const url = `${window.location.origin}/p/${product.id}`;
            
            const shareData: any = {
              title: product.title || '',
              text: product.title || '',
              url: url
            };

            const copyToClipboard = async () => {
              try {
                window.focus();
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado!");
              } catch (err) {
                const textArea = document.createElement("textarea");
                textArea.value = url;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                  document.execCommand('copy');
                  toast.success("Link copiado!");
                } catch (e) {}
                document.body.removeChild(textArea);
              }
            };

            if (navigator.share) {
              try {
                if (allImages[0] && navigator.canShare && navigator.canShare({ files: [] })) {
                  try {
                    const corsResponse = await fetch(allImages[0]);
                    const blob = await corsResponse.blob();
                    const file = new File([blob], 'product.jpg', { type: blob.type });
                    if (navigator.canShare({ files: [file] })) {
                      await navigator.share({ ...shareData, files: [file] });
                      return;
                    }
                  } catch (e) {
                    console.warn("Could not fetch image for sharing", e);
                  }
                }
                await navigator.share(shareData);
              } catch (shareErr) {
                if (shareErr instanceof Error && shareErr.name !== 'AbortError') {
                  await copyToClipboard();
                }
              }
            } else {
              await copyToClipboard();
            }
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-all text-black/60 dark:text-white/60"
          title="Partilhar"
        >
          <Share2 size={16} />
        </motion.button>
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
                    loading="lazy"
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
                loading="lazy"
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
        <div className="w-full lg:w-1/2 space-y-8 lg:sticky lg:top-32">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[10px] uppercase tracking-[0.4em] text-luxury-gold font-bold">
                S.art Exclusive
              </p>
              <span className="text-black/20 dark:text-white/20">|</span>
              <p className="text-[10px] uppercase tracking-[0.2em] font-mono text-black/50 dark:text-white/50">
                Ref: {product.id.split('-')[0].toUpperCase()}
              </p>
            </div>
            
            <div className="space-y-4">
              <h1 className={`font-serif leading-tight dark:text-white text-balance ${(product.title || '').length > 50 ? 'text-2xl md:text-3xl lg:text-3xl' : 'text-3xl md:text-4xl lg:text-4xl'}`}>
                {product.title}
              </h1>
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-2xl md:text-3xl font-black text-black dark:text-luxury-gold tracking-tighter font-mono">
                  {formatPrice(getEffectivePrice(product))}
                </p>
                {product.discount_percent && product.discount_percent > 0 ? (
                  <>
                    <span className="line-through text-neutral-400 dark:text-neutral-500 text-lg font-mono font-medium">
                      {formatPrice(product.pvp)}
                    </span>
                    <motion.span
                      animate={{ 
                        rotate: [0, -3, 3, -2, 2, 0], 
                        scale: [1, 1.05, 0.98, 1.03, 1] 
                      }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      className="px-3 py-1 bg-gradient-to-r from-red-600 to-amber-600 text-white font-black text-xs font-mono rounded-full uppercase tracking-wider shadow-md"
                    >
                      -{product.discount_percent}% OFF
                    </motion.span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <Separator className="bg-black/10 dark:bg-white/10" />

          <div className="space-y-6">
            <div className="relative">
              <div 
                className={`text-sm text-black/80 dark:text-zinc-300 leading-relaxed font-normal text-justify prose prose-sm dark:prose-invert max-w-none overflow-hidden transition-all duration-700 ${isExpanded ? "max-h-[2000px]" : "max-h-40"}`} 
                dangerouslySetInnerHTML={{ __html: product.description || "" }} 
              />
              {!isExpanded && (product.description || '').length > 400 && (
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white dark:from-[#050505] to-transparent" />
              )}
              {(product.description || '').length > 400 && (
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-2 text-[10px] uppercase tracking-widest text-luxury-gold font-bold hover:text-black dark:hover:text-white transition-colors relative z-10"
                >
                  {isExpanded ? "Ler Menos -" : "Ler Mais +"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              <QuantitySelector value={quantity} onChange={setQuantity} />
              
              <div className="space-y-4 opacity-40 grayscale pointer-events-none">
                <label className="text-[9px] uppercase tracking-[0.3em] text-black/40 dark:text-white/40 font-bold block">
                  Envio Internacional
                </label>
                <div className="flex items-center gap-2 text-[10px] text-luxury-foreground">
                  <Truck size={14} className="text-luxury-gold" />
                  <span>Seguro e Rastreável S.art</span>
                </div>
              </div>

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
                onConfirm(product, { size: selectedSize, color: selectedColor }, quantity)
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
                  Finalizar a compra <CreditCard size={16} />
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
                  Curadoria S.art
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const getThemeStyle = (themeName: string) => {
  if (themeName === "christmas") {
    return `
      :root {
        --bg-main: #FFF5F5 !important;
        --bg-card: #FFFFFF !important;
        --gold: #DC2626 !important;
        --borda: rgba(220, 38, 38, 0.1) !important;
        --luxury-dark: #FEE2E2 !important;
      }
      .dark {
        --bg-main: #120507 !important;
        --bg-card: #1A080C !important;
        --gold: #F59E0B !important;
        --borda: rgba(239, 68, 68, 0.15) !important;
        --luxury-dark: #0d0204 !important;
      }
    `;
  }
  if (themeName === "summer") {
    return `
      :root {
        --bg-main: #FFFDF9 !important;
        --bg-card: #FFFFFF !important;
        --gold: #EA580C !important;
        --borda: rgba(234, 88, 12, 0.1) !important;
        --luxury-dark: #FEF3C7 !important;
      }
      .dark {
        --bg-main: #0F0A06 !important;
        --bg-card: #19110B !important;
        --gold: #F59E0B !important;
        --borda: rgba(249, 115, 22, 0.15) !important;
        --luxury-dark: #0B0704 !important;
      }
    `;
  }
  return '';
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
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cached = localStorage.getItem("sartorial_cached_products");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[CACHE] ${parsed.length} produtos carregados instantaneamente do cache local.`);
          return parsed;
        }
      }
    } catch (e) {
      console.error("[CACHE] Erro ao ler produtos do localStorage:", e);
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [storeEvents, setStoreEvents] = useState<any[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread">("all");
  const [lastReadEvents, setLastReadEvents] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem("lastReadStoreEvents") || "0", 10);
    } catch (e) {
      return 0;
    }
  });

  // Notificações removidas individualmente pelo utilizador
  const [dismissedEvents, setDismissedEvents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("dismissedStoreEvents") || "[]");
    } catch (e) {
      return [];
    }
  });

  // Timestamps de visualização de cada evento para o contador regressivo de 3 dias
  const [viewedEventsMap, setViewedEventsMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem("viewedStoreEventsMap") || "{}");
    } catch (e) {
      return {};
    }
  });

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  // Marca notificação como vista
  const markEventAsViewed = (eventId: string) => {
    if (!eventId) return;
    const now = Date.now();
    setViewedEventsMap(prev => {
      if (prev[eventId]) return prev;
      const updated = { ...prev, [eventId]: now };
      try {
        localStorage.setItem("viewedStoreEventsMap", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Remove notificação individual
  const handleDismissEvent = (eventId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDismissedEvents(prev => {
      if (prev.includes(eventId)) return prev;
      const updated = [...prev, eventId];
      try {
        localStorage.setItem("dismissedStoreEvents", JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });
  };

  // Limpa todas as notificações
  const handleClearAllEvents = () => {
    const ids = storeEvents.map(ev => ev.id).filter(Boolean);
    setDismissedEvents(prev => {
      const updated = Array.from(new Set([...prev, ...ids]));
      try {
        localStorage.setItem("dismissedStoreEvents", JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });
  };

  // Calcula o texto do contador para expirar em 3 dias após ser visto
  const getExpiryCountdownText = (eventId: string) => {
    const viewedAt = viewedEventsMap[eventId];
    if (!viewedAt) return null;
    const remainingMs = (viewedAt + THREE_DAYS_MS) - Date.now();
    if (remainingMs <= 0) return "Expirado";
    
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `Expira em ${days}d ${hours}h`;
    } else if (hours > 0) {
      return `Expira em ${hours}h ${minutes}m`;
    } else {
      return `Expira em ${minutes}m`;
    }
  };

  // Filtra notificações ativas (não removidas e que pertencem a produtos existentes)
  const activeStoreEvents = useMemo(() => {
    const now = Date.now();
    const activeProductIds = new Set(products.map(p => String(p.id)));

    return storeEvents.filter(event => {
      if (!event || !event.id) return false;
      if (dismissedEvents.includes(event.id)) return false;

      // Se a notificação for associada a um produto, garante que o produto ainda existe na BD
      const pId = String(event.product_id || event.payload?.id || "");
      if (pId && products.length > 0 && !activeProductIds.has(pId)) {
        return false; // Produto foi eliminado da BD, notificação é removida
      }

      const viewedAt = viewedEventsMap[event.id];
      if (viewedAt) {
        if ((now - viewedAt) >= THREE_DAYS_MS) {
          return false; // expira após 3 dias da visualização
        }
      }
      return true;
    });
  }, [storeEvents, dismissedEvents, viewedEventsMap, products]);

  // Fetch initial event logs on page load
  useEffect(() => {
    fetch("/api/products/recent-events")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setStoreEvents(data);
        }
      })
      .catch(err => console.error("Error fetching recent store events:", err));
  }, []);

  // Listen for live Server-Sent Events for real-time notifications
  useEffect(() => {
    const eventSource = new EventSource("/api/products/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[SSE] Real-time store event received:", data);

        if (data.event_type === "product_deleted") {
          const deletedId = String(data.product_id || data.payload?.id || "");
          if (deletedId) {
            setProducts(prev => prev.filter(p => String(p.id) !== deletedId));
            setStoreEvents(prev => prev.filter(e => String(e.product_id || e.payload?.id || "") !== deletedId));
            setDetailProduct(current => {
              if (current && String(current.id) === deletedId) {
                setView("home");
                toast.info("O produto que estava a visualizar foi removido do catálogo.");
                return null;
              }
              return current;
            });
          }
        } else if (data.event_type === "product_created") {
          setStoreEvents(prev => [data, ...prev].slice(0, 50));

          // Trigger sonner toast with custom luxury styling matching the store theme
          toast.custom((t) => (
            <div 
              className="flex bg-neutral-950/95 backdrop-blur-md text-white border border-amber-500/30 p-4 shadow-2xl items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-sm rounded-lg"
              id="new-product-toast"
            >
              {data.payload?.image_url ? (
                <img 
                  src={data.payload.image_url} 
                  alt="" 
                  className="w-12 h-12 rounded object-cover border border-white/10" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded flex items-center justify-center">
                  <Bell className="w-5 h-5 text-amber-500" />
                </div>
              )}
              <div className="flex-1 text-left min-w-0">
                <p className="text-[10px] text-amber-500 uppercase tracking-[0.2em] font-medium">Novidade na Loja!</p>
                <h4 className="text-xs uppercase font-bold tracking-widest truncate">{data.payload?.title || "Novo Produto"}</h4>
                <p className="text-[10px] text-white/60 mt-0.5">
                  {data.payload?.price ? `€${parseFloat(data.payload.price).toFixed(2)}` : 'Preço sob consulta'}
                </p>
              </div>
              <button 
                onClick={() => {
                  toast.dismiss(t);
                  if (data.payload?.id) {
                    const minimalProduct: any = {
                      id: data.payload.id,
                      title: data.payload.title,
                      price: data.payload.price,
                      image_url: data.payload.image_url,
                      category: data.payload.category || 'Geral',
                      product_type: 'physical',
                      is_active: true
                    };
                    handleExploreProduct(data.payload.id, minimalProduct, data.id);
                  } else {
                    const element = document.getElementById("boutique");
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                    }
                  }
                }}
                className="text-[9px] uppercase tracking-widest font-black text-amber-500 border border-amber-500/30 hover:bg-amber-500 hover:text-black transition-all px-3 py-1.5 rounded"
              >
                Ver
              </button>
            </div>
          ), { duration: 8000 });
        }
      } catch (err) {
        console.error("[SSE] Error parsing event message:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("[SSE] EventSource connection encountered an error, reconnecting automatically...", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const unreadCount = useMemo(() => {
    return activeStoreEvents.filter(e => {
      const isAfterLastRead = new Date(e.created_at).getTime() > lastReadEvents;
      const isNotViewed = !viewedEventsMap[e.id];
      return isAfterLastRead && isNotViewed;
    }).length;
  }, [activeStoreEvents, lastReadEvents, viewedEventsMap]);

  const handleMarkAllRead = () => {
    const now = Date.now();
    setLastReadEvents(now);
    try {
      localStorage.setItem("lastReadStoreEvents", String(now));
    } catch(e) {}

    setViewedEventsMap(prev => {
      const updated = { ...prev };
      activeStoreEvents.forEach(e => {
        if (e.id && !updated[e.id]) {
          updated[e.id] = now;
        }
      });
      try {
        localStorage.setItem("viewedStoreEventsMap", JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleExploreProduct = async (productId: string, fallbackMinimalProduct: any, eventId?: string) => {
    if (eventId) {
      markEventAsViewed(eventId);
    } else if (productId) {
      markEventAsViewed(productId);
    }

    const targetId = String(productId || "").trim();
    const cleanId = targetId.toLowerCase();

    // 1. Procura na lista local de produtos (por id, supabase_id, aliexpress_id, sku ou inclusão)
    let found = products.find(p => {
      if (!p) return false;
      const pId = String(p.id || "").toLowerCase();
      const pSupa = String(p.supabase_id || "").toLowerCase();
      const pAli = String(p.aliexpress_id || "").toLowerCase();
      const pSku = String(p.sku || "").toLowerCase();
      return pId === cleanId || pSupa === cleanId || pAli === cleanId || pSku === cleanId || (pId && pId.includes(cleanId)) || (cleanId && cleanId.includes(pId));
    });

    if (found) {
      setDetailProduct(found);
      setView("product-detail");
      return;
    }

    // 2. Se não encontrou no estado React, busca diretamente na base de dados Supabase pelo ID completo
    try {
      const { data: dbProduct } = await supabase
        .from("products")
        .select("*")
        .or(`id.eq.${targetId},aliexpress_id.eq.${targetId},sku.eq.${targetId}`)
        .maybeSingle();

      if (dbProduct) {
        const fullProd = {
          ...dbProduct,
          pvp: dbProduct.price || 0,
          is_active: dbProduct.is_active ?? true,
          supabase_id: dbProduct.id
        };
        setProducts(prev => prev.some(p => p.id === fullProd.id) ? prev : [fullProd, ...prev]);
        setDetailProduct(fullProd);
        setView("product-detail");
        return;
      }

      // 3. Busca por correspondência parcial de ID
      const { data: matched } = await supabase
        .from("products")
        .select("*")
        .ilike("id", `%${targetId}%`)
        .limit(1);

      if (matched && matched.length > 0) {
        const fullProd = {
          ...matched[0],
          pvp: matched[0].price || 0,
          is_active: matched[0].is_active ?? true,
          supabase_id: matched[0].id
        };
        setProducts(prev => prev.some(p => p.id === fullProd.id) ? prev : [fullProd, ...prev]);
        setDetailProduct(fullProd);
        setView("product-detail");
        return;
      }
    } catch (err) {
      console.error("Erro ao buscar detalhes do produto no Supabase ao explorar:", err);
    }

    // 4. Se não encontrou o produto na BD (produto foi eliminado), notifica o utilizador e limpa a notificação
    toast.error("Este produto foi removido da loja e já não se encontra disponível.");
    setStoreEvents(prev => prev.filter(e => String(e.product_id || e.payload?.id || "") !== targetId && e.id !== eventId));
    if (view === "product-detail") {
      setView("home");
    }
  };
  const getInitialView = () => {
    if (typeof window === "undefined") return "home";
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v");
    const status = params.get("payment_status");
    const sessionId = params.get("session_id");
    const productId = params.get("product");

    if (status === "cancel") return "cancelled";
    if (sessionId) return "success";

    const pathMatch = window.location.pathname.match(/\/(?:product|produto|p|item)\/([a-zA-Z0-9\-_]+)/i);
    if (pathMatch && pathMatch[1]) {
      return "product-detail";
    }

    if (v && ["home", "dashboard", "success", "cancelled", "admin", "reset-password", "terms", "product-detail", "shipping"].includes(v)) {
      return v as any;
    }
    
    // If we have a product ID but no view, default to product-detail
    if (productId && !v) return "product-detail";
    
    return "home";
  };

  const [view, setView] = useState<
    | "home"
    | "dashboard"
    | "success"
    | "cancelled"
    | "admin"
    | "reset-password"
    | "terms"
    | "product-detail"
    | "shipping"
  >(getInitialView());
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [isNavigatingByHistory, setIsNavigatingByHistory] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const homeScrollPosRef = useRef(0);

  // Helper to handle view changes with scroll persistence
  const navigateTo = (newView: typeof view, product: Product | null = null) => {
    if (view === "home" && newView !== "home") {
      homeScrollPosRef.current = window.scrollY;
    }
    if (product) setDetailProduct(product);
    setView(newView);
  };

  // Sync state to URL and save for refresh
  useEffect(() => {
    if (!isInitialized || isNavigatingByHistory) return;

    let targetUrl = window.location.pathname + window.location.search;

    if (view === "product-detail" && detailProduct) {
      targetUrl = `/p/${detailProduct.id}`;
    } else if (view === "home") {
      targetUrl = "/";
    } else {
      const params = new URLSearchParams(window.location.search);
      params.set("v", view);
      params.delete("product");
      targetUrl = `/?${params.toString()}`;
    }

    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== targetUrl) {
      window.history.pushState({ view, productId: detailProduct?.id }, "", targetUrl);
    }
    
    // Persist to localStorage for refresh reliability
    localStorage.setItem("sart_navigation_state", JSON.stringify({ view, productId: detailProduct?.id, scroll: homeScrollPosRef.current }));
  }, [view, detailProduct, isNavigatingByHistory, isInitialized]);

  // Meta Pixel PageView Tracking for SPA
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "PageView");
    }
  }, [view, detailProduct?.id]);

  // Handle browser back/forward buttons and tab focus correctly
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setIsNavigatingByHistory(true);
      if (event && event.state) {
        const { view: savedView, productId } = event.state;
        if (productId && products.length > 0) {
          const prod = products.find(p => p.id === productId);
          if (prod) setDetailProduct(prod);
        } else {
          setDetailProduct(null);
        }
        setView(savedView || "home");
      } else {
        // Fallback: parse URL parameters manually if state is null
        const params = new URLSearchParams(window.location.search);
        let urlView = params.get("v");
        let urlProduct = params.get("product");
        const pathMatch = window.location.pathname.match(/\/(?:product|produto|p|item)\/([a-zA-Z0-9\-_]+)/i);
        if (pathMatch && pathMatch[1]) {
          urlProduct = pathMatch[1].trim();
          urlView = "product-detail";
        }
        if (urlProduct && products.length > 0) {
          const prod = products.find(p => p.id === urlProduct);
          if (prod) setDetailProduct(prod);
        } else {
          setDetailProduct(null);
        }
        if (urlView && ["home", "dashboard", "success", "cancelled", "admin", "reset-password", "terms", "product-detail", "shipping"].includes(urlView)) {
          setView(urlView as any);
        } else if (urlProduct) {
          setView("product-detail");
        } else {
          setView("home");
        }
      }
      // Faster reset of history flag to prevent blocking click-based navigation
      setTimeout(() => setIsNavigatingByHistory(false), 50);
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log("[SYSTEM] Aba focada. Verificando integridade da sessão do utilizador...");
        
        try {
          // Check if session is still valid
          const { data: { session } } = await supabase.auth.getSession();
          if (session && !user) {
            setUser(session.user);
          } else if (!session && user) {
            // Session lost or expired while away
            console.warn("[SYSTEM] Sessão expirada durante inatividade.");
            setUser(null);
          }
          
          if (user || session?.user) {
            fetchDashboardData((user || session?.user)!.id);
          }
        } catch (e) {
          console.error("[SYSTEM] Erro no heartbeat de visibilidade:", e);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [products, user]);

  // Keep detailProduct and selectedProduct matched with the latest version in products
  useEffect(() => {
    if (products.length > 0) {
      if (detailProduct) {
        const found = products.find(p => p.id === detailProduct.id);
        if (found && JSON.stringify(found) !== JSON.stringify(detailProduct)) {
          console.log("[REALTIME] Sincronizando detailProduct com versão mais recente:", found.title);
          setDetailProduct(found);
        }
      }
      if (selectedProduct) {
        const found = products.find(p => p.id === selectedProduct.id);
        if (found && JSON.stringify(found) !== JSON.stringify(selectedProduct)) {
          console.log("[REALTIME] Sincronizando selectedProduct com versão mais recente:", found.title);
          setSelectedProduct(found);
        }
      }
    }
  }, [products]);

  // Heartbeat do banco de dados (Self-healing background sync de segurança a cada 30 segundos)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("[HEARTBEAT] Verificando integridade dos dados e novas atualizações...");
      // Realtime subscription handles updates. We only fetch products as a safety fallback
      // if the catalog somehow became completely empty.
      if (products.length === 0) {
        console.log("[HEARTBEAT] Lista de produtos vazia detetada. Recuperando catálogo...");
        fetchProducts().catch(err => console.error("[HEARTBEAT] Erro de sinc do catálogo:", err));
      }
      if (user) {
        fetchDashboardData(user.id).catch(err => console.error("[HEARTBEAT] Erro de sinc do painel:", err));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user, products.length]);

  // Initialize from URL or LocalStorage
  useEffect(() => {
    if (isInitialized) return;

    // Strict safety timeout: absolute limit of 6 seconds before showing UI
    const safetyTimer = setTimeout(() => {
      if (!isInitialized) {
        console.warn("[INIT] Tempo limite de inicialização atingido. Forçando entrada.");
        performInitialization();
      }
    }, 6000);

    // We prefer waiting for products, as it defines which view it should be
    // but we don't wait forever.
    if (loadingProducts && products.length === 0) return;

    clearTimeout(safetyTimer);
    performInitialization();
  }, [products.length, isInitialized, loadingProducts]);

  const performInitialization = () => {
    if (isInitialized) return;
    
    console.log("[INIT] Sincronizando estado da aplicação...");

    const params = new URLSearchParams(window.location.search);
    let urlProduct = params.get("product");
    let urlView = params.get("v");

    const pathMatch = window.location.pathname.match(/\/(?:product|produto|p|item)\/([a-zA-Z0-9\-_]+)/i);
    if (pathMatch && pathMatch[1]) {
      urlProduct = pathMatch[1].trim();
      urlView = "product-detail";
    }
    
    // Check if Stripe is returning (prioritize)
    const status = params.get("payment_status");
    const sessionId = params.get("session_id");
    const isStripeReturn = !!(status || sessionId);

    if (status === "cancel") {
      setView("cancelled");
      localStorage.removeItem("sart_navigation_state");
      localStorage.removeItem('sart_pending_checkout');
      window.history.replaceState({}, "", window.location.pathname);
      setIsInitialized(true);
      setLoading(false);
      return;
    }

    if (sessionId) {
      window.history.replaceState({}, "", window.location.pathname);
      localStorage.removeItem("sart_navigation_state");
      const pending = localStorage.getItem('sart_pending_checkout');
      if (pending) {
        try {
          const { product } = JSON.parse(pending);
          if (product) setSuccessProduct(product);
        } catch (e) {}
      }
      setView("success");
      setIsInitialized(true);
      setLoading(false);
      return;
    }

    let targetView = urlView;
    let targetProductId = urlProduct;

    // Use persistence as fallback for non-defined URL states
    if (!urlProduct && !urlView) {
      const persisted = localStorage.getItem("sart_navigation_state");
      if (persisted) {
        try {
          const parsed = JSON.parse(persisted);
          targetView = parsed.view;
          targetProductId = parsed.productId;
          homeScrollPosRef.current = parsed.scroll || 0;
        } catch (e) {}
      }
    }

    // Validation against loaded products
    if (targetProductId) {
      const prod = products.find(p => p.id === targetProductId);
      if (prod) {
        setDetailProduct(prod);
        setSelectedProduct(prod);
        // Ensure consistent view for products
        setView(targetView === "shipping" ? "shipping" : "product-detail");
      } else if (products.length > 0) {
        // Product requested but not found after load -> go home
        console.warn(`[INIT] Produto ${targetProductId} não encontrado. Voltando ao catálogo.`);
        setView("home");
      } else {
        // Still 0 products but safety timeout triggered or no products in DB
        // Maintain intent if possible
        if (targetView) setView(targetView as any);
      }
    } else if (targetView) {
      setView(targetView as any);
    } else {
      setView("home");
    }
    
    // Pre-populate history stack for deep linked view so they can go "back" to home.
    const resolvedView = targetProductId ? (targetView === "shipping" ? "shipping" : "product-detail") : (targetView || "home");
    if ((urlProduct || (urlView && urlView !== "home")) && !isStripeReturn) {
      console.log("[INIT] Deep link detectado. Pre-populando pilha de histórico para navegação segura.");
      // 1. Set the initial landing entry to "home" state
      window.history.replaceState({ view: "home", productId: null }, "", window.location.pathname);
      // 2. Push the deep link state on top of it
      const searchStr = `?v=${resolvedView}${targetProductId ? `&product=${targetProductId}` : ""}`;
      window.history.pushState(
        { view: resolvedView, productId: targetProductId },
        "",
        `${window.location.pathname}${searchStr}`
      );
    }
    
    setIsInitialized(true);
    setLoading(false);
    console.log("[INIT] Aplicação Inicializada. View:", targetView || "home");

    // After initialization, handle potential scroll restoration
    if (targetView === "home" && homeScrollPosRef.current > 0) {
      setTimeout(() => {
        window.scrollTo({ top: homeScrollPosRef.current, behavior: 'instant' as any });
      }, 150);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo("home");
    }
  };
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
    image_mobile: "",
    video_url: "",
    video_mobile_url: "",
    title: "Luxo & Exclusividade",
    subtitle: "A Essência da Exclusividade",
    buttonText: "Explorar Coleção"
  });
  const [siteTheme, setSiteTheme] = useState({ active: "luxury" });

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

  const fetchSiteTheme = async () => {
    try {
      const res = await fetch("/api/settings/theme");
      if (res.ok) {
        const data = await res.json();
        if (data && data.active) {
          setSiteTheme(data);
        }
      }
    } catch (e) {
      console.error("Error fetching site theme:", e);
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
    fetchSiteTheme();
  }, [view]);

  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isCursorTransformed, setIsCursorTransformed] = useState(false);
  const [cursorPreferEnabled, setCursorPreferEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('luxury_cursor_enabled');
      return saved !== 'false';
    }
    return true;
  });
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const progress = Math.min(scrollY / 300, 1); // Shorter distance for faster irritation
      setScrollProgress(progress);
      
      // Trigger transformation earlier (at 75% progress) so it happens while still visible
      if (progress >= 0.75 && !isCursorTransformed) {
        setIsCursorTransformed(true);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isCursorTransformed]);

  const allCategories = useMemo(() => {
    return categories.map(c => c.name).filter(c => c !== "Todos").sort();
  }, [categories]);

  const [isPriceMenuOpen, setIsPriceMenuOpen] = useState(false);

  // Seleciona categoria e rola suavemente até o primeiro produto
  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setIsCategoryMenuOpen(false);
    
    setTimeout(() => {
      const grid = document.getElementById("product-grid");
      if (grid) {
        const navOffset = 135; // Altura acumulada da barra de navegação + barra fixada
        const elementPosition = grid.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({
          top: Math.max(0, elementPosition - navOffset),
          behavior: "smooth"
        });
      }
    }, 60);
  };
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [acceptedTermsCheckout, setAcceptedTermsCheckout] = useState(false);

  const location = useLocation();
  const isReviewPage = location.pathname.startsWith("/evaluate");

  const [shippingInfo, setShippingInfo] = useState({
    fullName: "",
    address: "",
    city: "",
    postalCode: "",
    country: "Portugal",
    phone: "+351 ",
    identification: "",
  });

  const applyCoupon = async () => {
    if (!couponCode) return;
    if (!user) {
        toast.error("Você precisa estar logado para usar um cupom.");
        return;
    }
    if (!selectedProduct) return;

    // 1. Fetch Coupon
    const { data: coupon, error: couponError } = await supabase
        .from('coupons')
        .select('id, percentage_discount')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

    if (couponError || !coupon) {
        toast.error("Cupom inválido ou inativo.");
        setCouponDiscount(0);
        return;
    }

    // 2. Check Usage
    const { data: usage, error: usageError } = await supabase
        .from('coupon_usage')
        .select('id')
        .eq('coupon_id', coupon.id)
        .eq('user_id', user.id)
        .maybeSingle();
    
    if (usage) {
        toast.error("Este cupom já foi utilizado.");
        setCouponDiscount(0);
        return;
    }

    setCouponDiscount(coupon.percentage_discount);
    toast.success(`${coupon.percentage_discount}% de desconto aplicado!`);
  };

  const [quantity, setQuantity] = useState(1);
  const [globalCountry, setGlobalCountry] = useState(COUNTRIES[0]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('https://api.exchangerate-api.com/v4/latest/EUR')
      .then(res => res.json())
      .then(data => setExchangeRates(data.rates))
      .catch(err => console.error("Error fetching rates:", err));
  }, []);

  const formatPrice = (amountInEur: number) => {
    const currencyCode = (globalCountry as any).currency || 'EUR';
    const rate = exchangeRates[currencyCode] || 1;
    const converted = amountInEur * rate;
    
    // Determine locale based on country
    let locale = 'en-US';
    if (globalCountry.code === 'PT') locale = 'pt-PT';
    else if (globalCountry.code === 'BR') locale = 'pt-BR';
    else if (globalCountry.code === 'ES') locale = 'es-ES';
    else if (globalCountry.code === 'FR') locale = 'fr-FR';
    else if (globalCountry.code === 'DE') locale = 'de-DE';
    else if (globalCountry.code === 'IT') locale = 'it-IT';
    else if (globalCountry.code === 'GB') locale = 'en-GB';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(converted);
  };
  const [currentLanguage, setCurrentLanguage] = useState('pt');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);

  useEffect(() => {
    if (view === "home") {
      const scrollPos = homeScrollPosRef.current;
      if (scrollPos > 0) {
        // Use staged, resilient timeouts to handle exit/element fade transitions (typically lasts 300ms-600ms inside AnimatePresence) 
        // across any desktop or mobile size without snapping content or breaking layout heights.
        const timers = [50, 150, 300, 500, 750, 1000].map(delay => {
          return setTimeout(() => {
            window.scrollTo({ top: scrollPos, behavior: "instant" });
          }, delay);
        });
        return () => timers.forEach(clearTimeout);
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [view]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<{
    size: string;
    color: string;
  }>({ size: "", color: "" });
  const [searchQuery, setSearchQuery] = useState("");

  // Intelligent Search: Auto-scroll to Boutique when user starts typing (Browsing views only)
  useEffect(() => {
    const browsingViews = ["home", "dashboard", "product-detail", "admin", "terms"];
    if (searchQuery.trim().length > 0 && browsingViews.includes(view)) {
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
  } | null>(null);
  const theme: string = "light";

  // Pre-fill shipping info from profile if available
  useEffect(() => {
    if (view === "shipping" && user && profile) {
      const address = profile.saved_address || {};
      
      setShippingInfo(prev => {
        // We want to fill if the fields are empty
        const newInfo = { ...prev };
        let updated = false;

        if (!newInfo.fullName && (address.full_name || profile.full_name || user.user_metadata?.full_name)) {
          newInfo.fullName = address.full_name || profile.full_name || user.user_metadata?.full_name || "";
          updated = true;
        }

        if (!newInfo.address && address.address) {
          newInfo.address = address.address;
          updated = true;
        }

        if (!newInfo.city && address.city) {
          newInfo.city = address.city;
          updated = true;
        }

        if (!newInfo.postalCode && address.zip) {
          newInfo.postalCode = address.zip;
          updated = true;
        }

        if (address.country && (newInfo.country !== address.country)) {
          newInfo.country = address.country;
          updated = true;
        }

        if (!newInfo.identification && address.identification) {
          newInfo.identification = address.identification;
          updated = true;
        }

        // Phone normalization and fill
        let phoneToPath = address.phone || "";
        if (phoneToPath && phoneToPath.startsWith('+')) {
          const matchedCountry = COUNTRIES.find(c => phoneToPath.startsWith(c.prefix));
          if (matchedCountry) {
            const prefix = matchedCountry.prefix;
            if (phoneToPath.startsWith(prefix) && phoneToPath.length > prefix.length && phoneToPath[prefix.length] !== ' ') {
              phoneToPath = prefix + " " + phoneToPath.slice(prefix.length);
            }
          }
        }

        if ((!newInfo.phone || newInfo.phone === "+351 " || newInfo.phone === "") && phoneToPath) {
          newInfo.phone = phoneToPath;
          updated = true;
        }

        return updated ? newInfo : prev;
      });
      
      if (address.address) {
        toast.info("Endereço predefinido aplicado.", { 
          icon: '🏠',
          duration: 3000,
          id: 'address-autofill'
        });
      }
    }
  }, [view, user, profile]);
  
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(200);

  useEffect(() => {
    if (view !== "home") return;
    
    const fullText = siteHero.title || "Luxo & Exclusividade";
    
    const handleTyping = () => {
      if (!isDeleting) {
        const nextText = fullText.substring(0, displayText.length + 1);
        setDisplayText(nextText);
        setTypingSpeed(220); // Even slower
        
        if (nextText === fullText) {
          setTypingSpeed(5000); // Wait 5s before starting to delete
          setIsDeleting(true);
        }
      } else {
        const nextText = fullText.substring(0, displayText.length - 1);
        setDisplayText(nextText);
        setTypingSpeed(150); // Slower deletion
        
        if (nextText === "") {
          setIsDeleting(false);
          setTypingSpeed(1000);
        }
      }
    };

    const timer = setTimeout(handleTyping, typingSpeed);
    return () => clearTimeout(timer);
  }, [displayText, isDeleting, siteHero.title, typingSpeed, view]);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/admin") {
      if (user && !(ADMIN_IDS.includes(user.id) || profile?.is_admin || profile?.is_employee)) {
        setView("home");
        window.history.replaceState({}, "", "/");
        toast.error("Acesso restrito.");
      } else {
        setView("admin");
      }
    }
  }, [user, profile]);

  // Gerir subscrição em tempo real para o perfil do utilizador
  useEffect(() => {
    if (!user) return;

    const channelName = `user-profile-realtime-${user.id}`;
    const profileChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload: any) => {
          console.log("[REALTIME] Perfil atualizado detetado:", payload.new);
          setProfile(prev => ({
            ...prev,
            ...payload.new
          }));
          toast.info("As suas permissões foram atualizadas.");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
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
    // Try to fetch with all columns first
    let { data, error } = await supabase
      .from("profiles")
      .select("theme, full_name, avatar_url, welcomed, custom_id, is_admin, is_employee, saved_address")
      .eq("id", userObj.id)
      .single();

    // Fallback if saved_address column doesn't exist yet (prevents app crash)
    if (error && error.message && (error.message.includes('saved_address') || error.message.includes('column'))) {
      console.warn("saved_address column missing, retrying without it...");
      const { data: retryData, error: retryError } = await supabase
        .from("profiles")
        .select("theme, full_name, avatar_url, welcomed, custom_id, is_admin, is_employee")
        .eq("id", userObj.id)
        .single();
      
      data = retryData;
      error = retryError;
    }

    // Get product count for this user
    const { count: pCount } = await supabase
      .from("products")
      .select("*", { count: 'exact', head: true })
      .eq("created_by", userObj.id);

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
          custom_cursor_enabled: newProfile.custom_cursor_enabled !== false,
          is_admin: newProfile.is_admin || false,
          is_employee: newProfile.is_employee || false,
          products_count: pCount || 0
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
          is_admin: false,
          is_employee: false,
          products_count: pCount || 0
        });
      }
      return;
    }

    if (!error && data) {
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
        avatar_url: finalAvatar || googleAvatar || "", 
        is_admin: data.is_admin || false,
        is_employee: data.is_employee || false,
        products_count: pCount || 0,
        saved_address: data.saved_address || {}
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
    const status = params.get("payment_status");
    const sessionId = params.get("session_id");

    if (status === "cancel") {
      setView("cancelled");
      // Limpar estado de navegação persistido para não haver conflito na restauração
      localStorage.removeItem("sart_navigation_state");
      toast.error("O pagamento foi cancelado ou recusado. Se desejar, pode tentar novamente a sua aquisição.", {
        duration: 8000,
        icon: '⚠️',
        id: 'payment-cancel'
      });
      // Tentar recuperar o produto do localStorage para facilitar a re-tentativa
      const pending = localStorage.getItem('sart_pending_checkout');
      if (pending) {
        try {
          const { product } = JSON.parse(pending);
          if (product) setSelectedProduct(product);
        } catch (e) {}
      }
      localStorage.removeItem('sart_pending_checkout');
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // Security & Redirect: If session state is active but no ID is present, kick back to library
    if (view === "success" && !sessionId) {
      setView("dashboard");
      return;
    }

    if (sessionId) {
      // Clear ID from URL to prevent reactivation on refresh
      window.history.replaceState({}, "", window.location.pathname);
      // Limpar estado de navegação persistido para não haver conflito na restauração
      localStorage.removeItem("sart_navigation_state");

      setView("success");
      
      // Tentar recuperar info do produto imediatamente do localStorage para UI não ficar vazia
      const pending = localStorage.getItem('sart_pending_checkout');
      if (pending) {
        try {
          const { product } = JSON.parse(pending);
          if (product) setSuccessProduct(product);
        } catch (e) {}
      }

      try {
 
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
          
          // Trigger immediate dashboard refresh if user is loaded
          if (user?.id) {
            fetchDashboardData(user.id);
          }

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
          
          // Track Meta Pixel Purchase Event
          if (typeof window !== "undefined" && (window as any).fbq) {
            (window as any).fbq('track', 'Purchase', {
              value: Number(order.total_amount),
              currency: 'EUR'
            });
          }
          
          // MENSAGEM DE SUCESSO ELEGANTE E CONFIRMADORA
          toast.success("Pagamento Confirmado! O seu produto foi reservado com sucesso e o comprovativo já segue para o seu e-mail.", { 
            duration: 12000,
            id: "payment-success-final",
            icon: '✨'
          });

          localStorage.removeItem('sart_pending_checkout');
        } else if (order) {
          console.log("[S.ART DEBUG] Order found but status is:", order.status);
          toast.info("Pagamento em processamento...");
        } else {
          console.log("[S.ART DEBUG] Order not found for session:", sessionId);
        }
      } catch (err: any) {
        console.error("[S.ART SESSION ERROR LOG]", err);
      }
    }
  };

  useEffect(() => {
    // Redirecionamento de segurança para evitar página em branco no shipping
    if (view === "shipping" && !selectedProduct) {
      const pending = localStorage.getItem('sart_pending_checkout');
      if (pending) {
        try {
          const { product } = JSON.parse(pending);
          if (product) {
            setSelectedProduct(product);
            return;
          }
        } catch (e) {}
      }
      console.warn("View is shipping but no product selected. Redirecting home.");
      setView("home");
    }
  }, [view, selectedProduct]);

  useEffect(() => {
    if (view === "success") {
      fetchProducts();
      if (user) fetchDashboardData(user.id);
    }
  }, [view]);

  useEffect(() => {
    if (searchQuery.trim() !== "" && view === "home") {
      const element = document.getElementById("product-grid");
      if (element) {
        const yOffset = -200; // Offset to center better or show some context
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
  }, [searchQuery, view]);

  const fetchProducts = async (retryCount = 0) => {
    setLoadingProducts(true);
    console.log(`[DEBUG] Chamando fetchProducts (tentativa ${retryCount + 1})...`);

    const processProductList = (rawProducts: any[]) => {
      const productsWithPvp = (rawProducts || []).map(p => ({
        ...p,
        pvp: p.price || 0,
        is_active: (p.is_active === undefined || p.is_active === null) ? true : p.is_active, 
        supabase_id: p.id
      }));

      if (productsWithPvp.length > 0) {
        setProducts(productsWithPvp);
        try {
          localStorage.setItem("sartorial_cached_products", JSON.stringify(productsWithPvp));
        } catch (e) {
          console.error("[CACHE] Erro ao salvar produtos no localStorage:", e);
        }
        console.log(`[DEBUG] fetchProducts atualizou ${productsWithPvp.length} produtos.`);
        return true;
      }
      return false;
    };

    try {
      // 1. Tentar busca via Supabase Client com timeout de 6s
      const supabasePromise = supabase
        .from("products")
        .select("*")
        .order('created_at', { ascending: false });

      const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) =>
        setTimeout(() => reject(new Error("Supabase request timeout")), 6000)
      );

      const { data: dbProducts, error: dbError } = await Promise.race([
        supabasePromise,
        timeoutPromise
      ]) as any;

      if (!dbError && dbProducts && dbProducts.length > 0) {
        processProductList(dbProducts);
        setLoadingProducts(false);
        return;
      }
    } catch (err) {
      console.warn(`[WARN] Busca via Supabase falhou ou expirou (tentativa ${retryCount + 1}):`, err);
    }

    // 2. Fallback: Endpoint Express do Servidor (/api/products)
    try {
      console.log("[DEBUG] Tentando fallback para /api/products...");
      const res = await fetch("/api/products");
      if (res.ok) {
        const apiProducts = await res.json();
        if (Array.isArray(apiProducts) && apiProducts.length > 0) {
          processProductList(apiProducts);
          setLoadingProducts(false);
          return;
        }
      }
    } catch (err) {
      console.warn(`[WARN] Fallback para /api/products falhou:`, err);
    }

    // 3. Se falhou e ainda tem tentativas, re-tentar automaticamente
    if (retryCount < 3) {
      const delay = (retryCount + 1) * 1200;
      console.log(`[RETRY] Re-tentando fetchProducts em ${delay}ms...`);
      setTimeout(() => {
        fetchProducts(retryCount + 1);
      }, delay);
    } else {
      console.warn("[WARN] Todas as tentativas de buscar produtos falharam. Mantendo estado atual do cache.");
      setLoadingProducts(false);
    }
  };

  const fetchDashboardData = async (userId: string) => {
    if (!userId) {
      setPurchasedProducts([]);
      return;
    }

    try {
      // 1. BUSCAR ORDENS ATUALIZADAS
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["paid", "completed", "pago", "delivered", "succeeded", "refund_requested", "refund_pending", "refunded", "canceled", "cancelled"])
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.warn("[S.ART DEBUG] Aviso ao procurar encomendas do utilizador:", ordersError.message || ordersError);
        setPurchasedProducts([]);
        return;
      }

      if (!orders || orders.length === 0) {
        setPurchasedProducts([]);
        return;
      }

      // Buscar produtos separadamente para garantir compatibilidade
      const productIds = Array.from(new Set(orders.map((o) => o.product_id).filter(Boolean)));
      if (productIds.length === 0) {
        setPurchasedProducts(orders.map((o: any) => ({ ...o, product: null })));
        return;
      }

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
    } catch (err: any) {
      console.warn("[S.ART DEBUG] Exceção ao sincronizar encomendas:", err?.message || err);
      setPurchasedProducts([]);
    }
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
      navigateTo("product-detail", product);
    } else {
      setSelectedProduct(product);
      
      // Track Meta Pixel AddToCart
      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq('track', 'AddToCart', {
          value: Number(product.pvp),
          currency: 'EUR',
          content_ids: [product.id],
          content_type: 'product'
        });
      }

      navigateTo("shipping");
    }
  };

  const handleDetailConfirm = (
    product: Product,
    options: { size: string; color: string },
    qty: number
  ) => {
    setSelectedProduct(product);
    setSelectedOptions(options);
    setQuantity(qty);
    setDetailLoading(true);

    // Track Meta Pixel AddToCart
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq('track', 'AddToCart', {
        value: Number(product.pvp) * qty,
        currency: 'EUR',
        content_ids: [product.id],
        content_type: 'product'
      });
    }

    // Pequeno atraso para feedback visual
    setTimeout(() => {
      setDetailLoading(false);
      setDetailProduct(null);
      navigateTo("shipping");
    }, 500);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLogoutOpen(false);
    navigateTo("home");
    toast.success("Até breve.");
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (view !== "home" && query.trim() !== "") {
      navigateTo("home");
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

      const currencyCode = (globalCountry as any).currency || 'EUR';

      const res = await fetch('/api/create-payment-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: selectedProduct,
          customer: { ...customerData, userId: user.id },
          baseUrl: window.location.origin,
          selectedOptions: selectedOptions,
          couponCode: customerData.couponCode,
          currency: currencyCode
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
        className={`h-screen w-screen flex flex-col items-center justify-center p-4 ${theme === "dark" ? "dark bg-[#0A0A0A] text-white" : "bg-[#FCFAF7] text-luxury-foreground"}`}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <h1 className="font-serif text-3xl sm:text-5xl font-extrabold tracking-[0.25em] text-amber-500 uppercase select-none">
            SART FULL
          </h1>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${theme === "dark" ? "dark" : ""} bg-background text-foreground font-sans selection:bg-primary-foreground selection:text-primary transition-colors duration-700 ${(isCursorTransformed && cursorPreferEnabled) ? 'md:cursor-none' : ''}`}
    >
      <style dangerouslySetInnerHTML={{ __html: getThemeStyle(siteTheme.active) }} />
      <CustomCursor active={isCursorTransformed && cursorPreferEnabled} />
      <ScrollToTop />
      {isReviewPage ? (
        <Routes>
          <Route path="/evaluate/:orderId" element={<ProductReview />} />
        </Routes>
      ) : (
        <>
          {view !== "admin" && (
            <Navbar
              user={user}
              profile={profile}
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
              selectedCountry={globalCountry}
              currentLanguage={currentLanguage}
              onCountryChange={(c) => {
                setGlobalCountry(c);
                const lang = LANGUAGE_MAP[c.code] || 'en';
                setCurrentLanguage(lang);
                setShippingInfo(prev => ({ 
                  ...prev, 
                  country: c.name, 
                  phone: c.prefix + " " 
                }));
              }}
              view={view}
              unreadCount={unreadCount}
              onNotificationClick={() => setIsNotificationOpen(true)}
            />
          )}

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
              Deseja realmente sair da sua conta na boutique S.art?
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
              {t('confirm_logout', currentLanguage)}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsLogoutOpen(false)}
              className="rounded-none h-12 uppercase tracking-[0.2em] text-[10px] text-luxury-foreground/60 hover:text-luxury-foreground transition-all"
            >
              {t('cancel', currentLanguage)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <main className={`overflow-x-clip ${
        view === "home" || view === "admin"
          ? "w-full pt-0" 
          : view === "dashboard"
            ? "w-full pt-24 md:pt-32"
            : "pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full"
      }`}>
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

          {view === "admin" && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className={`admin-dashboard-wrapper theme-${siteTheme.active} w-full min-h-screen dark text-white bg-[#0A0A0A]`}
            >
              {user && (ADMIN_IDS.includes(user.id) || profile?.is_admin || profile?.is_employee) ? (
                <AdminDashboard
                  user={user}
                  onBack={() => {
                    setView("home");
                    fetchProducts();
                  }}
                  formatPrice={formatPrice}
                  siteTheme={siteTheme}
                  onThemeChange={setSiteTheme}
                  unreadCount={unreadCount}
                  onNotificationClick={() => setIsNotificationOpen(true)}
                />
              ) : (
                <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[#0A0A0A] text-white">
                  <div className="max-w-md w-full bg-black/80 border border-amber-500/20 p-8 rounded-2xl shadow-2xl backdrop-blur-xl text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500">
                      <Shield size={32} />
                    </div>
                    <div className="space-y-2">
                      <h2 className="font-serif text-2xl font-bold tracking-wider uppercase text-amber-500">
                        Painel S.art Full
                      </h2>
                      <p className="text-xs text-zinc-400 font-mono">
                        {!user ? "Autenticação necessária para aceder ao painel de administração." : "Esta conta não tem permissões de administrador."}
                      </p>
                    </div>
                    <div className="pt-2 flex flex-col gap-3">
                      {!user ? (
                        <Button
                          onClick={() => setIsAuthOpen(true)}
                          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold uppercase text-xs py-6 rounded-xl shadow-lg"
                        >
                          Entrar como Administrador
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => setView("home")}
                        className="w-full border-white/20 hover:border-white text-white font-mono uppercase text-xs py-5 rounded-xl"
                      >
                        Voltar à Loja
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
                <section className="relative h-[100dvh] min-h-screen w-full flex items-center justify-center overflow-hidden bg-luxury-bg">
                  <MovingParticles activeTheme={siteTheme.active} />
                {/* Background Video/Image Container */}
                <div className="absolute inset-0 z-0 bg-[#050505]">
                  {siteHero.video_url || siteHero.video_mobile_url ? (
                    <>
                      {/* Desktop Video */}
                      <video
                        key={`desktop-v-${siteHero.video_url}`}
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        preload="auto"
                        poster={getImageUrl(siteHero.image)}
                        onEnded={(e) => {
                          (e.target as HTMLVideoElement).pause();
                        }}
                        className={`${siteHero.video_mobile_url ? 'hidden md:block' : 'block'} w-full h-full object-cover opacity-100 transition-opacity duration-1000`}
                      >
                        {siteHero.video_url && <source src={getImageUrl(siteHero.video_url)} type="video/mp4" />}
                        <img 
                          src={getImageUrl(siteHero.image)} 
                          alt="Luxury Background" 
                          className="w-full h-full object-cover"
                        />
                      </video>

                      {/* Mobile Video */}
                      {siteHero.video_mobile_url && (
                        <video
                          key={`mobile-v-${siteHero.video_mobile_url}`}
                          autoPlay
                          muted
                          playsInline
                          preload="auto"
                          poster={getImageUrl(siteHero.image_mobile || siteHero.image)}
                          onEnded={(e) => {
                            (e.target as HTMLVideoElement).pause();
                          }}
                          className="block md:hidden w-full h-full object-cover opacity-100 transition-opacity duration-1000"
                        >
                          <source src={getImageUrl(siteHero.video_mobile_url)} type="video/mp4" />
                          <img 
                            src={getImageUrl(siteHero.image_mobile || siteHero.image)} 
                            alt="Luxury Mobile Background" 
                            className="w-full h-full object-cover"
                          />
                        </video>
                      )}
                    </>
                  ) : (
                    /* Responsive Picture for Images */
                    <picture className="w-full h-full block">
                      {siteHero.image_mobile && (
                        <source media="(max-width: 767px)" srcSet={getImageUrl(siteHero.image_mobile)} />
                      )}
                      <img 
                        src={getImageUrl(siteHero.image)} 
                        alt="Luxury Background" 
                        className="w-full h-full object-cover opacity-85 dark:opacity-60 grayscale-[10%] transition-opacity duration-1000"
                      />
                    </picture>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-transparent to-[#050505]"></div>
                  {/* Soft radial glow to pop the text */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[60%] bg-radial from-black/40 via-transparent to-transparent pointer-events-none"></div>
                </div>

                <div className="hero-content relative z-10 text-center px-4 max-w-5xl mx-auto">
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
                      className="flex flex-col items-center"
                    >
                      <motion.h1 
                        variants={{
                          hidden: { opacity: 0 },
                          visible: { opacity: 1, transition: { duration: 1 } }
                        }}
                        className="font-serif text-[clamp(2.5rem,7vw,9.5rem)] tracking-[-0.05em] text-white leading-[0.85] uppercase h-[1.2em] flex items-center justify-center"
                      >
                        <span className="drop-shadow-[0_10px_40px_rgba(0,0,0,0.9)]">
                          {displayText}
                          <motion.span 
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                            className="inline-block w-[2px] h-[0.8em] bg-luxury-gold ml-2 align-middle"
                          />
                        </span>
                      </motion.h1>
                      
                      {siteHero.subtitle && (
                        <motion.p 
                          variants={{
                            hidden: { opacity: 0, scale: 0.95 },
                            visible: { opacity: 1, scale: 1, transition: { duration: 1.5, ease: "easeOut", delay: 1.2 } }
                          }}
                          className="mt-6 md:mt-8 tracking-[0.4em] md:tracking-[0.8em] uppercase font-serif italic text-sm md:text-base mb-4 md:mb-6 drop-shadow-[0_2px_15px_rgba(0,0,0,0.5)] max-w-[90vw] text-center"
                        >
                          <span className="bg-luxury-gold text-black px-3 py-1 selection:bg-white selection:text-black shadow-[0_0_20px_rgba(212,175,55,0.4)]">
                            {siteHero.subtitle}
                          </span>
                        </motion.p>
                      )}
                      
                      <GlassButton
                        onClick={() => document.getElementById("boutique")?.scrollIntoView({ behavior: "smooth" })}
                        className="mt-6 md:mt-8"
                      >
                        {siteHero.buttonText}
                      </GlassButton>
                    </motion.div>
                </div>

                {/* Scroll Indicator - Bottom edge with Smooth Serene Animation */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 1 }}
                  onClick={() => document.getElementById("boutique")?.scrollIntoView({ behavior: "smooth" })}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer group z-50 pointer-events-auto"
                >
                  <span className="text-[9px] uppercase tracking-[0.3em] font-mono text-white/60 group-hover:text-amber-400 transition-colors">
                    Explorar Coleção
                  </span>
                  <motion.div 
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="w-[22px] h-[36px] border border-white/30 group-hover:border-amber-400/80 rounded-full flex items-start justify-center p-1.5 transition-colors shadow-lg"
                  >
                    <motion.div 
                      animate={{ y: [0, 10, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                    />
                  </motion.div>
                </motion.div>
              </section>

              {(() => {
                const featuredProducts = products.filter(p => p.is_featured && p.is_active !== false);
                if (featuredProducts.length === 0) return null;
                
                // Helper function to get column span class for dynamic bento grid layout
                const getBentoColSpanClass = (index: number, total: number) => {
                  if (total === 1) return 'col-span-12 max-w-5xl mx-auto';
                  if (total === 2) {
                    return index === 0 ? 'col-span-12 lg:col-span-7' : 'col-span-12 lg:col-span-5';
                  }
                  if (total === 3) {
                    if (index === 0) return 'col-span-12 lg:col-span-6';
                    return 'col-span-12 lg:col-span-3';
                  }
                  // For 4 or more items: alternate row proportions (7/5, 5/7, 8/4, etc.)
                  const patternIndex = index % 4;
                  if (patternIndex === 0) return 'col-span-12 lg:col-span-7';
                  if (patternIndex === 1) return 'col-span-12 lg:col-span-5';
                  if (patternIndex === 2) return 'col-span-12 lg:col-span-5';
                  return 'col-span-12 lg:col-span-7';
                };

                return (
                  <section id="featured-section" className="bg-luxury-bg py-20 border-b border-luxury-border overflow-hidden transition-colors duration-500 relative">

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
                            staggerChildren: 0.15
                          }
                        }
                      }}
                      className="px-[5%] mt-12 max-w-7xl mx-auto"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch overflow-visible">
                        {featuredProducts.map((featuredProduct, idx) => {
                          const colSpan = getBentoColSpanClass(idx, featuredProducts.length);
                          const isHero = colSpan.includes('lg:col-span-7') || colSpan.includes('lg:col-span-8') || featuredProducts.length === 1;

                          return (
                            <motion.div 
                              key={featuredProduct.id} 
                              initial={{ opacity: 0, y: 20 }}
                              whileInView={{ 
                                opacity: 1, 
                                y: 0,
                                transition: { duration: 0.5, ease: "easeOut" } 
                              }}
                              viewport={{ once: true, amount: 0.1 }}
                              className={`${colSpan} group relative flex flex-col justify-between rounded-none overflow-hidden bg-[#FAF8F5] dark:bg-[#181818] border border-black/10 dark:border-white/10 hover:border-gold/60 transition-all duration-300 cursor-pointer h-full shadow-md hover:shadow-2xl`}
                              onClick={() => {
                                setSelectedProduct(featuredProduct);
                                setDetailProduct(featuredProduct);
                                setView("product-detail");
                              }}
                            >
                              {/* Starburst discount badge on featured card */}
                              {featuredProduct.discount_percent && featuredProduct.discount_percent > 0 ? (
                                <StarburstDiscountBadge discount={featuredProduct.discount_percent} className="absolute -top-3.5 -right-3.5 z-20 pointer-events-none" />
                              ) : null}

                              {/* Image Header - Dynamic aspect ratio based on card size */}
                              <div className={`relative w-full overflow-hidden bg-[#F5F0E8] dark:bg-[#121212] rounded-none border-b border-black/10 dark:border-white/10 ${isHero ? 'aspect-[16/9] lg:aspect-[16/8.5]' : 'aspect-[16/10] lg:aspect-[4/3]'}`}>
                                <img 
                                  src={getImageUrl(featuredProduct.image_url || "")} 
                                  alt={featuredProduct.title}
                                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                                  loading="lazy"
                                />
                                
                                {/* Category Badge and Original Price if present */}
                                <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                                  {featuredProduct.category && (
                                    <span className="bg-white/95 dark:bg-black/80 border border-black/10 dark:border-white/15 text-luxury-foreground dark:text-white font-mono text-[9px] uppercase tracking-[0.2em] px-3 py-1 rounded-none shadow-sm">
                                      {featuredProduct.category}
                                    </span>
                                  )}
                                  {featuredProduct.discount_percent && featuredProduct.discount_percent > 0 ? (
                                    <span className="bg-white/95 dark:bg-black/80 border border-black/10 dark:border-white/15 line-through text-neutral-400 dark:text-neutral-400 font-mono text-[10px] font-normal px-2.5 py-1 rounded-none shadow-sm">
                                      {formatPrice(featuredProduct.pvp)}
                                    </span>
                                  ) : null}
                                </div>

                                {featuredProduct.free_shipping && (
                                  <div className="absolute bottom-4 left-4 z-10">
                                    <span className="bg-emerald-900/10 dark:bg-emerald-950/80 border border-emerald-600/30 text-emerald-700 dark:text-emerald-400 font-mono text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-none flex items-center gap-1">
                                      <Truck size={12} />
                                      Frete Grátis
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Card Body - Warm nude/cream background in light mode */}
                              <div className="p-6 lg:p-7 flex flex-col justify-between flex-1 space-y-5 relative z-10 bg-[#FAF8F5] dark:bg-[#181818] rounded-none">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1 text-gold">
                                      {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={13} className="fill-gold text-gold" />
                                      ))}
                                      <span className="text-luxury-foreground/60 dark:text-white/60 text-[10px] font-mono ml-1 font-semibold">
                                        5.0 (Exclusivo)
                                      </span>
                                    </div>
                                  </div>

                                  <h3 className={`font-serif ${isHero ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} text-luxury-foreground dark:text-white font-medium tracking-wide group-hover:text-gold transition-colors line-clamp-1`}>
                                    {featuredProduct.title}
                                  </h3>

                                  {featuredProduct.description && (
                                    <p className="text-luxury-foreground/75 dark:text-white/70 text-xs sm:text-sm font-sans line-clamp-2 leading-relaxed">
                                      {featuredProduct.description}
                                    </p>
                                  )}
                                </div>

                                {/* Price & Action Row */}
                                <div className="pt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] uppercase tracking-[0.2em] text-[#8C7A6B] dark:text-white/50 font-mono font-bold">
                                      Valor de Investimento
                                    </span>
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                      <span className="text-xl sm:text-2xl font-serif font-bold text-luxury-foreground dark:text-gold">
                                        {formatPrice(getEffectivePrice(featuredProduct))}
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e: any) => {
                                      e.stopPropagation();
                                      handleBuy(featuredProduct);
                                    }}
                                    disabled={checkoutLoading === featuredProduct.id}
                                    className="bg-gold hover:bg-amber-400 text-black font-extrabold text-[10px] sm:text-xs uppercase tracking-[0.15em] px-5 sm:px-6 py-2.5 sm:py-3 rounded-none transition-all flex items-center gap-2 shrink-0 shadow-md hover:scale-[1.02] active:scale-95"
                                  >
                                    {checkoutLoading === featuredProduct.id ? (
                                      <Loader2 size={14} className="animate-spin text-black" />
                                    ) : (
                                      <>
                                        <span>Comprar</span>
                                        <ShoppingBag size={14} className="stroke-[2.5]" />
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  </section>
                );
              })()}

              <InfiniteProductMarquee products={products} />

              <section className="pt-16 pb-24 w-full relative" id="boutique">
                {/* Section Header Title */}
                <div className="px-[5%] mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-mono font-bold mb-1">
                      Coleção Exclusiva
                    </span>
                    <motion.h2 
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      className="text-4xl md:text-6xl font-serif text-luxury-foreground tracking-tighter"
                    >
                      Boutique
                    </motion.h2>
                  </div>
                </div>

                {/* STICKY FILTER BAR (Fixa-se no topo da tela por baixo da barra de navegação durante o scroll) */}
                <div className="sticky top-[60px] md:top-[70px] z-50 bg-luxury-bg/95 backdrop-blur-md border-y border-luxury-border py-3 px-4 shadow-md mb-10 transition-all duration-300">
                  <div className="max-w-2xl mx-auto flex items-center justify-center gap-2 sm:gap-3.5">
                    
                    {/* Seletor 1: Categoria (Dropdown) */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setIsCategoryMenuOpen(!isCategoryMenuOpen);
                          setIsPriceMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 px-3.5 py-2 text-[10px] uppercase tracking-[0.12em] font-bold border rounded-full transition-all shadow-sm ${
                          selectedCategory !== "Todos"
                            ? 'bg-luxury-gold text-black border-luxury-gold shadow-luxury-gold/20'
                            : 'bg-luxury-card border-luxury-border text-luxury-foreground hover:border-luxury-gold/50'
                        }`}
                      >
                        <Filter size={13} className={selectedCategory !== "Todos" ? "text-black shrink-0" : "text-luxury-gold shrink-0"} />
                        <span className="truncate max-w-[100px] sm:max-w-[150px]">
                          {selectedCategory === "Todos" ? "Categoria" : selectedCategory}
                        </span>
                        <ChevronDown size={12} className={`shrink-0 transition-transform duration-300 ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Menu Popover Categoria */}
                      <AnimatePresence>
                        {isCategoryMenuOpen && (
                          <>
                            <div 
                              onClick={() => setIsCategoryMenuOpen(false)}
                              className="fixed inset-0 z-[100]"
                            />
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.2 }}
                              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-luxury-card border border-luxury-border z-[101] rounded-lg shadow-2xl overflow-hidden"
                            >
                              <div className="p-3 bg-black/10 dark:bg-white/5 border-b border-luxury-border flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-luxury-foreground/70 flex items-center gap-1.5">
                                  <Filter size={12} className="text-luxury-gold" />
                                  Categorias
                                </span>
                                <span className="text-[9px] font-mono text-luxury-gold font-bold">
                                  {allCategories.length + 1} opções
                                </span>
                              </div>

                              <div className="max-h-64 overflow-y-auto luxury-scrollbar p-1.5 space-y-0.5">
                                {["Todos", ...allCategories].map(cat => {
                                  const isSelected = selectedCategory === cat;
                                  return (
                                    <button
                                      key={cat}
                                      onClick={() => {
                                        handleCategorySelect(cat);
                                      }}
                                      className={`w-full text-left px-3.5 py-2 rounded text-[10px] uppercase tracking-wider transition-all flex items-center justify-between ${
                                        isSelected
                                          ? 'bg-luxury-gold text-black font-black'
                                          : 'text-luxury-foreground/80 hover:bg-luxury-bg hover:text-luxury-foreground'
                                      }`}
                                    >
                                      <span>{cat}</span>
                                      {isSelected && <span className="w-2 h-2 rounded-full bg-black shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Seletor 2: Preço (Dropdown) */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setIsPriceMenuOpen(!isPriceMenuOpen);
                          setIsCategoryMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 px-3.5 py-2 text-[10px] uppercase tracking-[0.12em] font-bold border rounded-full transition-all shadow-sm ${
                          (minPrice > 0 || maxPrice < 10000)
                            ? 'bg-luxury-gold text-black border-luxury-gold shadow-luxury-gold/20'
                            : 'bg-luxury-card border-luxury-border text-luxury-foreground hover:border-luxury-gold/50'
                        }`}
                      >
                        <SlidersHorizontal size={13} className={(minPrice > 0 || maxPrice < 10000) ? "text-black shrink-0" : "text-luxury-gold shrink-0"} />
                        <span className="truncate max-w-[110px] sm:max-w-[160px]">
                          {(minPrice > 0 || maxPrice < 10000) 
                            ? `${minPrice > 0 ? Math.round(minPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1)) + ((globalCountry as any).currency || '€') : '0'} - ${maxPrice < 10000 ? Math.round(maxPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1)) + ((globalCountry as any).currency || '€') : 'Máx'}`
                            : 'Preço'}
                        </span>
                        <ChevronDown size={12} className={`shrink-0 transition-transform duration-300 ${isPriceMenuOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Popover Filtro de Preço */}
                      <AnimatePresence>
                        {isPriceMenuOpen && (
                          <>
                            <div 
                              onClick={() => setIsPriceMenuOpen(false)}
                              className="fixed inset-0 z-[100]"
                            />
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.96 }}
                              transition={{ duration: 0.2 }}
                              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 bg-luxury-card border border-luxury-border z-[101] p-4 rounded-lg shadow-2xl space-y-3.5"
                            >
                              <div className="flex items-center justify-between border-b border-luxury-border pb-2.5">
                                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-luxury-foreground flex items-center gap-2">
                                  <SlidersHorizontal size={12} className="text-luxury-gold" />
                                  Faixa de Preço
                                </span>
                                {(minPrice > 0 || maxPrice < 10000) && (
                                  <button
                                    onClick={() => {
                                      setMinPrice(0);
                                      setMaxPrice(10000);
                                    }}
                                    className="text-[9px] uppercase tracking-widest text-amber-500 hover:underline flex items-center gap-1 font-mono"
                                  >
                                    <RotateCcw size={10} />
                                    Limpar
                                  </button>
                                )}
                              </div>

                              {/* Campos Min e Max */}
                              <div className="grid grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                  <label className="text-[8px] uppercase tracking-[0.15em] text-luxury-foreground/50 font-bold block">
                                    Mínimo ({(globalCountry as any).currency || 'EUR'})
                                  </label>
                                  <input 
                                    type="number"
                                    value={minPrice === 0 ? '' : Math.round(minPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                                      setMinPrice(val / (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1));
                                    }}
                                    className="w-full bg-luxury-bg border border-luxury-border text-luxury-foreground text-xs p-2 rounded outline-none focus:border-luxury-gold transition-colors font-mono font-bold"
                                    placeholder="0"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[8px] uppercase tracking-[0.15em] text-luxury-foreground/50 font-bold block">
                                    Máximo ({(globalCountry as any).currency || 'EUR'})
                                  </label>
                                  <input 
                                    type="number"
                                    value={maxPrice === 10000 ? '' : Math.round(maxPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 10000 : Number(e.target.value);
                                      setMaxPrice(val / (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1));
                                    }}
                                    className="w-full bg-luxury-bg border border-luxury-border text-luxury-foreground text-xs p-2 rounded outline-none focus:border-luxury-gold transition-colors font-mono font-bold"
                                    placeholder="Máx"
                                  />
                                </div>
                              </div>

                              {/* Atalhos Rápidos */}
                              <div className="space-y-1.5">
                                <span className="text-[8px] uppercase tracking-[0.15em] text-luxury-foreground/40 font-bold block">
                                  Atalhos Rápidos
                                </span>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {[
                                    { label: "Todos os preços", min: 0, max: 10000 },
                                    { label: "Até 50 €", min: 0, max: 50 },
                                    { label: "50 € - 200 €", min: 50, max: 200 },
                                    { label: "Mais de 200 €", min: 200, max: 10000 },
                                  ].map((preset) => (
                                    <button
                                      key={preset.label}
                                      onClick={() => {
                                        const rate = exchangeRates[(globalCountry as any).currency || 'EUR'] || 1;
                                        setMinPrice(preset.min / rate);
                                        setMaxPrice(preset.max / rate);
                                        setIsPriceMenuOpen(false);
                                        handleCategorySelect(selectedCategory);
                                      }}
                                      className="text-[9px] uppercase tracking-wider py-1.5 px-2 bg-luxury-bg border border-luxury-border/60 hover:border-luxury-gold text-luxury-foreground/80 hover:text-luxury-foreground rounded transition-colors text-center"
                                    >
                                      {preset.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <Button
                                onClick={() => {
                                  setIsPriceMenuOpen(false);
                                  handleCategorySelect(selectedCategory);
                                }}
                                className="w-full bg-luxury-gold text-black font-bold h-8 text-[10px] uppercase tracking-[0.2em] rounded"
                              >
                                Aplicar
                              </Button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Reset rápido se tiver filtro ativo */}
                    {(selectedCategory !== "Todos" || minPrice > 0 || maxPrice < 10000) && (
                      <button
                        onClick={() => {
                          setSelectedCategory("Todos");
                          setMinPrice(0);
                          setMaxPrice(10000);
                          handleCategorySelect("Todos");
                        }}
                        title="Resetar Filtros"
                        className="p-2 rounded-full text-amber-500 hover:text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-all shrink-0"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}

                  </div>
                </div>

                <div className="w-full px-[5%]">
                  <motion.div 
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-20px" }}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.1
                        }
                      }
                    }}
                    className="bento-grid"
                    id="product-grid"
                  >
                      {products
                        .filter((p) => {
                          const title = p.title || "";
                          const desc = p.description || "";
                          const id = p.id || "";
                          const category = p.category || "";
                          const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                          const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                          const query = searchQuery.toLowerCase().trim();
                          const matchesSearch = 
                            id.toLowerCase().includes(query) ||
                            title.toLowerCase().includes(query) ||
                            desc.toLowerCase().includes(query) ||
                            category.toLowerCase().includes(query);
                          const isActive = p.is_active !== false;
                          return matchesCategory && matchesPrice && matchesSearch && isActive;
                        })
                      .map((product, idx) => {
                        return (
                          <ProductCard
                            key={product.id}
                            product={product}
                            onBuy={handleBuy}
                            index={idx}
                            onRead={() => setView("dashboard")}
                            isOwned={purchasedProducts.some(
                              (p) => p.product_id === product.id && ['paid', 'completed', 'pago', 'delivered', 'succeeded'].includes(p.status?.toLowerCase()),
                            )}
                            className=""
                            isProcessing={checkoutLoading === product.id}
                            formatPrice={formatPrice}
                          />
                        );
                      })}
                  </motion.div>

                  {!loadingProducts && products.filter((p) => {
                    const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                    const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                    const query = searchQuery.toLowerCase().trim();
                    const matchesSearch = 
                      (p.id || "").toLowerCase().includes(query) ||
                      (p.title || "").toLowerCase().includes(query) ||
                      (p.description || "").toLowerCase().includes(query) ||
                      (p.category || "").toLowerCase().includes(query);
                    const isActive = p.is_active !== false;
                    return matchesCategory && matchesPrice && matchesSearch && isActive;
                  }).length === 0 && (
                    <div className="py-32 text-center space-y-6">
                      <p className="font-serif text-3xl italic text-luxury-foreground/30 px-8 transition-colors">
                        Lamentamos, mas nenhuma obra em nossa curadoria atual condiz com os critérios selecionados.
                      </p>
                      <button 
                        onClick={() => {
                          setSelectedCategory("Todos");
                          setMinPrice(0);
                          setMaxPrice(10000);
                          setSearchQuery("");
                        }}
                        className="text-luxury-gold uppercase tracking-[0.3em] text-xs font-bold hover:text-luxury-foreground transition-colors"
                      >
                        Redefinir Curadoria
                      </button>
                    </div>
                  )}

                  {loadingProducts && products.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-8 w-full max-w-[1400px] mx-auto px-4">
                      <div className="flex flex-col items-center space-y-2 text-center">
                        <span className="font-serif text-lg md:text-xl font-extrabold tracking-[0.3em] text-amber-500 uppercase">
                          SART FULL
                        </span>
                        <div className="w-24 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-pulse" />
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/50 font-mono pt-1">
                          A carregar coleção de vestuário...
                        </p>
                      </div>

                      {/* High-Fashion Minimalist Skeleton Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                        {[...Array(6)].map((_, i) => (
                          <div 
                            key={i} 
                            className="relative overflow-hidden border border-white/10 rounded-2xl bg-black/40 aspect-[16/9] flex flex-col justify-between p-5 space-y-4 animate-pulse"
                          >
                            <div className="flex justify-end">
                              <div className="w-20 h-5 bg-white/10 rounded-full" />
                            </div>
                            <div className="flex items-end justify-between gap-4 pt-8">
                              <div className="space-y-2 flex-1">
                                <div className="h-5 bg-white/15 rounded-lg w-2/3" />
                                <div className="h-4 bg-amber-500/20 rounded-md w-1/3" />
                              </div>
                              <div className="w-24 h-9 bg-white/10 rounded-lg" />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Manual refresh button */}
                      <button
                        onClick={() => fetchProducts(0)}
                        className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-amber-500/80 hover:text-amber-400 border border-amber-500/30 hover:border-amber-500 px-5 py-2.5 rounded-full transition-all mt-2"
                      >
                        <RefreshCw size={12} />
                        <span>Recarregar Catálogo</span>
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {view === "product-detail" && (
            detailProduct ? (
              <ProductDetailsPage
                product={detailProduct}
                onBack={handleBack}
                onConfirm={handleDetailConfirm}
                isProcessing={detailLoading}
                quantity={quantity}
                setQuantity={setQuantity}
                formatPrice={formatPrice}
              />
            ) : (
              <div className="py-40 flex flex-col items-center justify-center space-y-3">
                <span className="font-serif text-2xl font-extrabold tracking-[0.3em] text-amber-500 uppercase animate-pulse">
                  SART FULL
                </span>
                <div className="w-16 h-[2px] bg-amber-500/50 animate-pulse" />
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-mono">A carregar detalhes da peça...</p>
              </div>
            )
          )}

          {view === "shipping" && (
            selectedProduct ? (
              <div className="max-w-4xl mx-auto py-12 animate-in fade-in duration-700">
                <div className="mb-12 space-y-4 text-center">
                  <h2 className="text-4xl md:text-5xl font-serif text-luxury-foreground">
                    Finalizar Aquisição
                  </h2>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-luxury-foreground/40">
                    Precisamos da sua morada para a entrega física S.art
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
                            address: sanitizeAddress(e.target.value),
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
                          const newCountryName = e.target.value;
                          const countryObj = COUNTRIES.find(c => c.name === newCountryName) || COUNTRIES[0];
                          setShippingInfo({
                            ...shippingInfo,
                            country: newCountryName,
                            phone: countryObj.prefix + " "
                          });
                        }}
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-luxury-bg">Selecione o País</option>
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.name} className="bg-luxury-bg">{c.flag} {c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] uppercase tracking-widest text-luxury-foreground/50 font-bold">
                        Contacto Telefónico *
                      </label>
                      <input
                        type="tel"
                        required
                        value={shippingInfo.phone}
                        onChange={(e) => {
                          const input = e.target.value;
                          const countryObj = COUNTRIES.find(c => c.name === shippingInfo.country);
                          const prefix = countryObj ? countryObj.prefix : "";
                          const prefixWithSpace = prefix ? prefix + " " : "";
                          
                          // Handle deleting the prefix
                          if (prefix && input.length < prefix.length) {
                            setShippingInfo({ ...shippingInfo, phone: prefixWithSpace });
                            return;
                          }

                          // If the user deleted the space but kept the prefix
                          if (prefix && input === prefix) {
                             setShippingInfo({ ...shippingInfo, phone: prefixWithSpace });
                             return;
                          }

                          // Ensure it starts with the prefix (at least without space)
                          if (prefix && !input.startsWith(prefix)) return;

                          // Extract suffix (everything after prefix and potentially space)
                          let suffix = "";
                          if (input.startsWith(prefixWithSpace)) {
                            suffix = input.slice(prefixWithSpace.length);
                          } else if (input.startsWith(prefix)) {
                            suffix = input.slice(prefix.length);
                          }
                          
                          suffix = suffix.replace(/[^\d]/g, '');

                          if (suffix.length <= 15) { // Global phone limit approx
                            setShippingInfo({
                              ...shippingInfo,
                              phone: prefixWithSpace + suffix
                            });
                          }
                        }}
                        className="w-full border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground font-mono"
                        placeholder={shippingInfo.phone || "Número de telefone"}
                      />
                    </div>

                    {COUNTRIES.find(c => c.name === shippingInfo.country)?.requiresIdentification && (
                      <div className="space-y-2 md:col-span-2 animate-in slide-in-from-top-2 duration-500">
                        <label className="text-[9px] uppercase tracking-widest text-luxury-gold font-bold">
                          {COUNTRIES.find(c => c.name === shippingInfo.country)?.requiresIdentification} (Obrigatório para Alfândega) *
                        </label>
                        <input
                          type="text"
                          required
                          value={shippingInfo.identification}
                          onChange={(e) =>
                            setShippingInfo({
                              ...shippingInfo,
                              identification: e.target.value.toUpperCase(),
                            })
                          }
                          className="w-full border-b border-luxury-gold bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground font-mono"
                          placeholder={`Introduza o seu ${COUNTRIES.find(c => c.name === shippingInfo.country)?.requiresIdentification}`}
                        />
                        <p className="text-[8px] text-white/30 uppercase tracking-tighter">
                          Este dado é necessário para que a encomenda não fique retida na alfândega do seu país.
                        </p>
                      </div>
                    )}

                    {/* Coupon System */}
                    <div className="space-y-2 md:col-span-2 mt-4">
                        <label className="text-[9px] uppercase tracking-widest text-white/50 font-bold">
                            Cupom de Desconto (Opcional)
                        </label>
                        <div className="flex gap-2">
                             <input 
                              type="text" 
                              value={couponCode} 
                              onChange={e => setCouponCode(e.target.value)}
                              placeholder="Insira o código"
                              className="flex-grow border-b border-luxury-border bg-transparent py-3 text-sm outline-none focus:border-luxury-gold transition-colors text-luxury-foreground"
                             />
                             <Button type="button" onClick={applyCoupon} className="bg-luxury-gold text-black rounded-none">Aplicar</Button>
                        </div>
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
                          loading="lazy"
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
                        <div className="text-xs font-bold text-luxury-foreground/60 transition-colors flex items-center gap-1.5">
                          <span>{formatPrice(getEffectivePrice(selectedProduct))}</span>
                          {selectedProduct.discount_percent && selectedProduct.discount_percent > 0 ? (
                            <span className="line-through text-neutral-400 text-[10px] font-light font-mono">
                              {formatPrice(Number(selectedProduct.pvp))}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-luxury-border" />

                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-foreground/60 transition-colors">
                        <span>Subtotal ({quantity}x)</span>
                        <span>{formatPrice(getEffectivePrice(selectedProduct) * quantity)}</span>
                      </div>
                      {couponDiscount > 0 && (
                          <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-gold transition-colors">
                            <span>Desconto ({couponDiscount}%)</span>
                            <span>-{formatPrice((getEffectivePrice(selectedProduct) * quantity) * (couponDiscount / 100))}</span>
                          </div>
                      )}
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-foreground/60 transition-colors">
                        <span>Envio S.art VIP</span>
                        {selectedProduct.free_shipping ? (
                          <span className="text-luxury-gold font-bold uppercase tracking-widest">
                            Grátis
                          </span>
                        ) : (
                          <span className="text-white/60">
                            {formatPrice(1.15)}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between text-base font-serif text-luxury-foreground transition-colors pt-2 border-t border-luxury-border">
                        <span>Total</span>
                        <span>{formatPrice((getEffectivePrice(selectedProduct) * quantity) * (1 - couponDiscount / 100) + (selectedProduct.free_shipping ? 0 : 1.15))}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 py-2 text-left bg-luxury-bg/30 p-4 border border-luxury-border/30">
                      <input
                        id="acceptedTermsCheckout"
                        type="checkbox"
                        checked={acceptedTermsCheckout}
                        onChange={(e) => setAcceptedTermsCheckout(e.target.checked)}
                        className="mt-1 h-4 w-4 bg-transparent border-luxury-border text-[#d4af37] focus:ring-0 cursor-pointer accent-[#d4af37]"
                      />
                      <label htmlFor="acceptedTermsCheckout" className="text-[10px] uppercase tracking-wider text-luxury-foreground/60 leading-relaxed select-none cursor-pointer">
                        Eu li e aceito voluntariamente os <button type="button" onClick={() => setView("terms")} className="text-luxury-gold underline hover:text-white transition-all font-bold">Termos de Serviço</button> e a política restrita de <button type="button" onClick={() => setView("terms")} className="text-luxury-gold underline hover:text-white transition-all font-bold">Reembolsos & Devoluções</button> da S.art Boutique para esta compra. *
                      </label>
                    </div>

                    <Button
                      onClick={async () => {
                        if (!acceptedTermsCheckout) {
                          toast.error(
                            "Por favor, deve declarar que aceita os Termos e Política de Reembolso para avançar com a transação segura.",
                          );
                          return;
                        }

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
                          toast.error("Por favor, selecione um país.");
                          return;
                        }

                        const reqId = COUNTRIES.find(c => c.name === shippingInfo.country)?.requiresIdentification;
                        if (reqId && !shippingInfo.identification) {
                          toast.error(`Por favor, preencha o campo ${reqId}.`);
                          return;
                        }

                        if (shippingInfo.country === 'Brasil' && !isValidCPF(shippingInfo.identification)) {
                          toast.error("CPF Inválido. Por favor, verifique.");
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
                          country: COUNTRIES.find(c => c.name === shippingInfo.country)?.code || shippingInfo.country,
                          identification: shippingInfo.identification,
                          quantity: quantity,
                          couponCode: couponCode
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
                      onClick={handleBack}
                      className="w-full text-center text-[8px] uppercase tracking-widest text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-colors"
                    >
                      Cancelar e Voltar à Boutique
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div key="shipping-loader" className="py-40 flex flex-col items-center justify-center space-y-4">
              <span className="font-serif text-2xl font-extrabold tracking-[0.3em] text-amber-500 uppercase animate-pulse">
                SART FULL
              </span>
              <div className="w-16 h-[2px] bg-amber-500/50 animate-pulse" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-mono">Restaurando Checkout...</p>
              <button 
                onClick={() => setView('home')} 
                className="text-amber-500 text-[10px] font-mono uppercase border border-amber-500/40 px-6 py-2.5 mt-2 hover:bg-amber-500 hover:text-black transition-all font-bold tracking-widest rounded-lg"
              >
                Voltar à Loja
              </button>
            </div>
          ))}

          {view === "dashboard" && user && (
            <div className="profile-dashboard-wrapper w-full min-h-screen dark bg-luxury-bg text-white">
              <ProfileDashboard
                user={user}
                purchasedProducts={purchasedProducts}
                formatPrice={formatPrice}
                onProfileUpdate={(data) => {
                  setProfile(prev => prev ? { ...prev, ...data } : data as any);
                  if (typeof data.custom_cursor_enabled !== 'undefined') {
                    setCursorPreferEnabled(data.custom_cursor_enabled);
                  }
                }}
                onRefundRequest={(order) => setRefundOrder(order)}
                onLogout={handleLogout}
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

          {view === "cancelled" && (
            <motion.div
              key="cancelled"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-xl mx-auto py-24 text-center space-y-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12 }}
                className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto shadow-2xl"
              >
                <X size={40} className="text-red-500" />
              </motion.div>

              <div className="space-y-6">
                <h2 className="text-4xl md:text-6xl font-serif text-luxury-foreground leading-[1.1] px-4 transition-colors">
                  Pagamento <br />
                  <span className="text-red-500 italic">Não Concluído.</span>
                </h2>
                <div className="h-px w-24 bg-red-500/30 mx-auto" />
                <p className="text-[11px] uppercase tracking-[0.4em] text-luxury-foreground/40 max-w-sm mx-auto leading-relaxed px-6 transition-colors">
                   A transação foi cancelada ou recusada. Não se preocupe, nenhum valor foi cobrado e pode tentar novamente quando desejar.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
                <Button
                  onClick={() => setView("shipping")}
                  className="bg-black text-white px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-2xl hover:bg-neutral-800 transition-all flex items-center"
                >
                  Tentar Novamente <ArrowRight size={14} className="ml-2" />
                </Button>
                <Button
                  onClick={() => {
                    localStorage.removeItem('sart_pending_checkout');
                    setView("home");
                  }}
                  variant="outline"
                  className="px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-xl transition-all duration-500 text-luxury-foreground/70 border-luxury-border hover:border-luxury-foreground/40 bg-luxury-card"
                >
                  Voltar à Boutique
                </Button>
              </div>

              <div className="pt-12 text-[9px] uppercase tracking-widest text-luxury-foreground/30 italic">
                Se o erro persistir, contacte o suporte do seu banco ou a nossa equipa S.art.
              </div>
            </motion.div>
          )}

          {view === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="max-w-xl mx-auto py-24 text-center space-y-12"
            >
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 100 }}
                className="w-28 h-28 bg-luxury-gold rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(212,175,55,0.3)]"
              >
                <CheckCircle2 size={48} className="text-white" />
              </motion.div>

              <div className="space-y-6">
                <h2 className="text-5xl md:text-7xl font-serif text-luxury-foreground leading-[1] px-4 transition-colors">
                  Produto Recebido <br />
                  <span className="text-luxury-gold italic">com Sucesso.</span>
                </h2>
                <div className="h-px w-32 bg-luxury-gold mx-auto opacity-40" />
                <p className="text-[12px] md:text-[14px] uppercase tracking-[0.4em] text-luxury-foreground/60 max-w-md mx-auto leading-relaxed px-6 transition-colors">
                  Confirmamos o seu pagamento. Um e-mail com todos os detalhes e o seu comprovativo já foi enviado para a sua caixa de entrada.
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
                        loading="lazy"
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
                  onClick={() => {
                    localStorage.removeItem('sart_pending_checkout');
                    setView("dashboard");
                  }}
                  className="bg-luxury-gold text-black px-12 h-14 rounded-none uppercase tracking-[0.3em] text-[10px] font-bold shadow-2xl hover:scale-105 transition-all duration-500 flex items-center"
                >
                  Acompanhar Pedido{" "}
                  <ArrowRight size={14} className="ml-2" />
                </Button>
                <Button
                  onClick={() => {
                    localStorage.removeItem('sart_pending_checkout');
                    setView("home");
                  }}
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
            <div className="text-[9px] uppercase tracking-[0.3em] text-luxury-foreground/40 transition-colors">
              © 2026 Boutique S.art | S.art-full.pt
            </div>
          </div>
          <div className="flex gap-8 text-[9px] uppercase tracking-[0.2em] font-medium text-luxury-foreground/60 transition-colors">
            <a
              href="https://www.instagram.com/sart.full_oficial"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-luxury-gold transition-colors animate-pulse"
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
      {/* Real-time Notifications Slide-out Drawer */}
      <AnimatePresence>
        {isNotificationOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsNotificationOpen(false);
                handleMarkAllRead();
              }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 w-full sm:w-[450px] h-full bg-[#FCFAF7] dark:bg-[#0A0A0A] border-l border-black/10 dark:border-white/5 shadow-2xl z-[10001] flex flex-col text-luxury-foreground dark:text-white"
            >
              {/* Header */}
              <div className="p-6 border-b border-black/10 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-full border border-amber-500/20 text-amber-500">
                    <Bell size={18} className="animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base tracking-widest uppercase font-bold text-black dark:text-white">
                      Notificações
                    </h3>
                    <p className="text-[10px] text-black/50 dark:text-white/40 uppercase tracking-widest mt-0.5">
                      Atualizações em tempo real
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsNotificationOpen(false);
                    handleMarkAllRead();
                  }}
                  className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-black/50 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Actions & Meta */}
              <div className="px-6 py-2.5 bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/5 flex items-center justify-between text-[10px]">
                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/10 p-0.5 rounded-lg border border-black/5 dark:border-white/10">
                  <button
                    onClick={() => setNotificationFilter("all")}
                    className={`px-2.5 py-1 rounded-md font-mono text-[9px] uppercase tracking-wider transition-all ${
                      notificationFilter === "all"
                        ? "bg-amber-500 text-black font-bold shadow-sm"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                    }`}
                  >
                    Todas ({activeStoreEvents.length})
                  </button>
                  <button
                    onClick={() => setNotificationFilter("unread")}
                    className={`px-2.5 py-1 rounded-md font-mono text-[9px] uppercase tracking-wider transition-all ${
                      notificationFilter === "unread"
                        ? "bg-amber-500 text-black font-bold shadow-sm"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                    }`}
                  >
                    Não Lidas ({unreadCount})
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {activeStoreEvents.length > 0 && (
                    <>
                      <button
                        onClick={handleMarkAllRead}
                        className="text-amber-500 hover:text-amber-600 uppercase font-black tracking-widest transition-colors font-mono text-[9px]"
                      >
                        Marcar lidas
                      </button>
                      <button
                        onClick={handleClearAllEvents}
                        className="text-black/40 dark:text-white/40 hover:text-red-500 uppercase font-mono text-[9px] transition-colors"
                      >
                        Limpar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Informative banner about 3-day expiration */}
              <div className="px-6 py-2 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-between text-[10px] text-amber-500/80 shrink-0">
                <div className="flex items-center gap-2">
                  <Info size={12} className="shrink-0 text-amber-500" />
                  <span className="leading-tight">Notificações lidas expiram em 3 dias.</span>
                </div>
                {activeStoreEvents.length > 0 && (
                  <span className="text-[9px] font-mono font-bold uppercase text-amber-500/70 shrink-0">
                    {activeStoreEvents.length} {activeStoreEvents.length === 1 ? 'evento' : 'eventos'}
                  </span>
                )}
              </div>

              {/* Scrollable Events list container */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3 luxury-scrollbar overscroll-contain">
                {(() => {
                  const filteredEvents = activeStoreEvents.filter((event) => {
                    if (notificationFilter === "unread") {
                      const isAfterLastRead = new Date(event.created_at).getTime() > lastReadEvents;
                      const isViewed = !!viewedEventsMap[event.id];
                      return isAfterLastRead && !isViewed;
                    }
                    return true;
                  });

                  if (filteredEvents.length === 0) {
                    return (
                      <div className="py-16 text-center space-y-4 flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-amber-500/5 border border-amber-500/15 flex items-center justify-center text-amber-500/40">
                          <Bell size={24} />
                        </div>
                        <div className="max-w-[260px] space-y-1">
                          <p className="font-serif text-sm font-semibold tracking-wide text-black dark:text-white">
                            {notificationFilter === "unread" ? "Nenhuma notificação não lida" : "Nenhuma notificação ativa"}
                          </p>
                          <p className="text-[11px] text-black/40 dark:text-white/30 leading-relaxed">
                            {notificationFilter === "unread" 
                              ? "Todas as notificações já foram visualizadas. Alterne para 'Todas' para rever o histórico."
                              : "Quando novos produtos forem adicionados à loja, você receberá notificações e alertas em tempo real aqui."}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return filteredEvents.map((event) => {
                    const isAfterLastRead = new Date(event.created_at).getTime() > lastReadEvents;
                    const isViewed = !!viewedEventsMap[event.id];
                    const isUnread = isAfterLastRead && !isViewed;
                    const productPayload = event.payload || {};
                    const countdownText = getExpiryCountdownText(event.id);
                    
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 border rounded-lg flex gap-3.5 items-start relative transition-all duration-300 ${
                          isUnread 
                            ? "bg-amber-500/5 border-amber-500/20 shadow-[0_4px_12px_rgba(245,158,11,0.04)]" 
                            : "opacity-35 hover:opacity-100 grayscale hover:grayscale-0 bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5"
                        }`}
                      >
                        {/* Botão de remover notificação individual */}
                        <button
                          onClick={(e) => handleDismissEvent(event.id, e)}
                          className="absolute top-2.5 right-2.5 p-1 text-black/30 dark:text-white/30 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          title="Remover notificação"
                        >
                          <Trash2 size={13} />
                        </button>

                        {/* Image thumbnail */}
                        {productPayload.image_url ? (
                          <img
                            src={productPayload.image_url}
                            alt=""
                            className="w-14 h-14 rounded object-cover border border-black/10 dark:border-white/10 shrink-0 mt-0.5"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded bg-amber-500/5 border border-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Bell className="w-5 h-5 text-amber-500/40" />
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 space-y-1 text-left min-w-0 pr-5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[9px] text-amber-500 uppercase tracking-widest font-mono flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(event.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                              {" • "}
                              {new Date(event.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                            </p>
                            
                            {/* Contador regressivo de expiração se já foi visto */}
                            {countdownText && (
                              <span className="text-[8px] font-mono font-bold text-amber-600/90 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                ⏱️ {countdownText}
                              </span>
                            )}
                          </div>

                          <h4 className="font-serif text-xs font-semibold tracking-wide text-black dark:text-white truncate">
                            {productPayload.title || event.title}
                          </h4>
                          <p className="text-[11px] text-black/60 dark:text-white/50 line-clamp-2 leading-relaxed">
                            {event.message}
                          </p>
                          {productPayload.price && (
                            <p className="text-xs font-mono font-bold text-amber-500 mt-1">
                              €{parseFloat(productPayload.price).toFixed(2)}
                            </p>
                          )}
                          
                          <div className="pt-2">
                            <button
                              onClick={() => {
                                setIsNotificationOpen(false);
                                
                                const minimalProduct: any = productPayload.id ? {
                                  id: productPayload.id,
                                  title: productPayload.title,
                                  price: productPayload.price,
                                  image_url: productPayload.image_url,
                                  category: productPayload.category || 'Geral',
                                  product_type: 'physical',
                                  is_active: true
                                } : null;

                                handleExploreProduct(productPayload.id || productPayload.product_id, minimalProduct, event.id);
                              }}
                              className="text-[9px] uppercase tracking-widest font-black text-amber-500 hover:text-white hover:bg-amber-500 border border-amber-500/20 hover:border-transparent px-3 py-1 rounded transition-all inline-block"
                            >
                              Explorar Produto
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  });
                })()}
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t border-black/10 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.01] text-center">
                <p className="text-[9px] text-black/40 dark:text-white/30 uppercase tracking-[0.25em] font-mono">
                  S.art Boutique • Event Bus Online
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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

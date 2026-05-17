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
  supabase_id?: string;
  is_featured?: boolean;
  free_shipping?: boolean;
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

const CountryDropdown = ({ value, onChange, className = "" }: { value: any; onChange: (c: any) => void; className?: string }) => {
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
        className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-white/5 border border-white/10 hover:border-luxury-gold/40 transition-all rounded-full group transition-all duration-300"
      >
        <div className="flex items-center gap-1.5">
          <Globe size={14} className="text-luxury-gold md:w-4 md:h-4" />
          <span className="text-[10px] md:text-[11px] font-mono font-bold text-white leading-none">
            {getCurrencySymbol(value.currency)}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="absolute top-full right-0 mt-3 w-64 bg-black/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[101] overflow-hidden rounded-xl"
            >
              <div className="p-2 border-b border-white/5 bg-white/5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold px-2">Seleções Internacionais</span>
              </div>
              <div className="max-h-80 overflow-y-auto luxury-scrollbar p-1">
                {COUNTRIES.map(country => (
                  <button 
                    key={country.code}
                    onClick={() => {
                      onChange(country);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-all hover:bg-white/10 group rounded-lg mb-0.5 ${value.code === country.code ? 'bg-white/5' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl filter grayscale group-hover:grayscale-0 transition-all duration-500">{country.flag}</span>
                      <div className="flex flex-col">
                        <span className={`text-[10px] uppercase tracking-widest font-black ${value.code === country.code ? 'text-luxury-gold' : 'text-white'}`}>
                          {country.name}
                        </span>
                        <span className="text-[8px] text-white/30 uppercase tracking-tighter">Premium Delivery</span>
                      </div>
                    </div>
                    <span className={`text-[11px] font-mono font-black ${value.code === country.code ? 'text-luxury-gold' : 'text-white/40 group-hover:text-white'}`}>
                      {getCurrencySymbol(country.currency)}
                    </span>
                  </button>
                ))}
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
    <header className={`fixed w-full top-0 z-[9999] transition-all duration-1000 ease-in-out ${
      isScrolled 
        ? "py-3 bg-black/80 backdrop-blur-3xl border-b border-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]" 
        : "py-6 bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 flex justify-between items-center">
        <button
          onClick={onHomeClick}
          className={`flex items-center gap-3 hover:opacity-70 transition-all duration-1000 ${
            isScrolled ? "scale-90" : "scale-100"
          }`}
        >
          <span className="text-xl md:text-2xl font-serif tracking-tighter italic font-black text-white drop-shadow-2xl">
            S.art
          </span>
        </button>

        <div className="flex items-center gap-3 md:gap-6">
          <CountryDropdown value={selectedCountry} onChange={onCountryChange} className="hover:ring-2 hover:ring-luxury-gold/50 hover:shadow-lg transition-all" />
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
                    onBlur={() => {
                      if (searchQuery.trim() === "") {
                        setIsSearchOpen(false);
                      }
                    }}
                    placeholder={currentLanguage === 'pt' ? "ENCANTAR COM..." : "ENCHANT WITH..."}
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
                {user ? (
                  <div className="flex items-center gap-3 md:gap-6">
    {(ADMIN_IDS.includes(user.id || "") || String(profile?.is_admin) === 'true') && (
                      <button
                        onClick={() => onDashboardClick("admin")}
                        className={`${iconClass} flex items-center gap-1.5 focus:outline-none group/admin`}
                        title="Admin Panel"
                      >
                        <Shield size={20} className="group-hover/admin:rotate-12 transition-transform duration-500" />
                        <span className="hidden lg:inline text-[8px] tracking-[0.2em] font-bold text-luxury-gold/80">PAINEL</span>
                      </button>
                    )}
                    <button
                      onClick={() => onDashboardClick("dashboard")}
                      className="relative hover:opacity-70 transition-all transform hover:scale-110 active:scale-95 overflow-visible w-8 h-8 flex items-center justify-center shadow-2xl"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-white/30 overflow-hidden shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <User size={20} className="text-white" />
                        )}
                      </div>
                      {profile?.is_admin && (
                        <div className="absolute -top-2 -right-2 bg-luxury-gold rounded-full p-0.5 border border-luxury-black shadow-lg animate-pulse">
                          <Crown size={10} className="text-luxury-black fill-luxury-black" />
                        </div>
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
            className="md:hidden absolute top-full left-0 w-full bg-luxury-bg border-b border-luxury-border p-6 space-y-6 shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
              <span className="font-serif italic font-black text-xl text-white">S.art</span>
            </div>
            
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
  formatPrice?: (p: number) => string;
}

function ProductCard({
  product,
  onBuy,
  onRead,
  isOwned,
  isProcessing,
  className = "",
  index = 0,
  formatPrice,
}: ProductCardProps & { index?: number }) {
  const isEven = index % 2 === 0;
  const comesFromTop = Math.floor(index / 2) % 2 === 0;
  
  return (
    <motion.div 
      initial={{ 
        opacity: 0, 
        x: isEven ? -60 : 60, 
        y: comesFromTop ? -60 : 60,
        scale: 0.9 
      }}
      whileInView={{ 
        opacity: 1, 
        x: 0, 
        y: 0,
        scale: 1,
        transition: { 
          duration: 0.1, 
          ease: [0.22, 1, 0.36, 1], // expoOut style smooth ease
          delay: (index % 3) * 0.01
        } 
      }}
      viewport={{ once: false, amount: 0.1 }}
      whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.3 } }}
      exit={{ 
        opacity: 0, 
        x: isEven ? -40 : 40,
        y: comesFromTop ? -40 : 40,
        scale: 0.95,
        transition: { duration: 0.4 }
      }}
      className={`luxury-card cursor-pointer group relative overflow-hidden ${className}`}
      onClick={() => {
        if (isOwned && product.product_type !== 'physical' && onRead) {
          onRead(product);
        } else {
          onBuy(product);
        }
      }}
    >
      <div className="relative z-0 overflow-hidden bg-[#050505]/20">
        <motion.img
          src={getImageUrl(product.image_url)}
          alt={product.title}
          referrerPolicy="no-referrer"
          className="w-full h-auto object-contain transition-transform duration-[1500ms] ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/40 transition-colors duration-500" />
        
        {/* Shine effect on hover */}
        <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <motion.div 
            initial={{ x: "-100%", skewX: -20 }}
            whileHover={{ x: "200%" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
          />
        </div>
      </div>

      <div className="card-info bg-gradient-to-t from-black/80 via-black/20 to-transparent md:translate-y-6 md:group-hover:translate-y-0 md:opacity-0 md:group-hover:opacity-100 transition-all duration-500 ease-premium p-4 md:p-6">
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
              {formatPrice ? formatPrice(product.pvp) : `€${product.pvp}`}
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
          <DialogTitle className="font-serif text-3xl mb-2 text-luxury-foreground italic">
            S.art Atelier
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-[0.2em] text-luxury-foreground/40">
            {mode === "login"
              ? "Entrar na Boutique Premium"
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
            const url = `${window.location.origin}${window.location.pathname}?product=${product.id}`;
            
            const shareData: any = {
              title: `S.art | Boutique Premium`,
              text: `Curadoria de Luxo - Descubra esta peça exclusiva: ${product.title}`,
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
              <h1 className={`font-serif leading-tight dark:text-white text-balance ${product.title.length > 50 ? 'text-2xl md:text-3xl lg:text-3xl' : 'text-3xl md:text-4xl lg:text-4xl'}`}>
                {product.title}
              </h1>
              <p className="text-2xl md:text-3xl font-black text-black dark:text-luxury-gold tracking-tighter">
                {formatPrice(product.pvp)}
              </p>
            </div>
          </div>

          <Separator className="bg-black/10 dark:bg-white/10" />

          <div className="space-y-6">
            <div className="relative">
              <div 
                className={`text-sm text-black/80 dark:text-zinc-300 leading-relaxed font-normal text-justify prose prose-sm dark:prose-invert max-w-none overflow-hidden transition-all duration-700 ${isExpanded ? "max-h-[2000px]" : "max-h-40"}`} 
                dangerouslySetInnerHTML={{ __html: product.description }} 
              />
              {!isExpanded && product.description.length > 400 && (
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white dark:from-[#050505] to-transparent" />
              )}
              {product.description.length > 400 && (
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

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(error => {
        console.error("Video background failed to play:", error);
      });
    }
  }, []);

  useEffect(() => {
    // Round favicon logic using Canvas
    const roundFavicon = () => {
      const icon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.arc(64, 64, 64, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, 0, 0, 128, 128);
          const roundDataUrl = canvas.toDataURL('image/png');
          
          // Update all possible favicon links
          const links = document.querySelectorAll('link[rel*="icon"]');
          links.forEach((link: any) => {
            link.href = roundDataUrl;
          });
          
          if (appleIcon) appleIcon.href = roundDataUrl;
        }
      };
      // Use a cache-buster to ensure we get a fresh version for canvas
      img.src = 'https://i.imgur.com/LdaKiWv.png' + '?v=' + new Date().getTime();
    };
    roundFavicon();
  }, []);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const getInitialView = () => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const v = params.get("v");
    if (v && ["home", "dashboard", "success", "admin", "reset-password", "terms", "product-detail", "shipping"].includes(v)) {
      return v as any;
    }
    return "home";
  };

  const [view, setView] = useState<
    | "home"
    | "dashboard"
    | "success"
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

    const params = new URLSearchParams(window.location.search);
    params.set("v", view);
    if (view === "product-detail" && detailProduct) {
      params.set("product", detailProduct.id);
    } else {
      params.delete("product");
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    if (window.location.search !== `?${params.toString()}`) {
      window.history.pushState({ view, productId: detailProduct?.id }, "", newUrl);
    }
    
    // Persist to localStorage for refresh reliability
    localStorage.setItem("sart_navigation_state", JSON.stringify({ view, productId: detailProduct?.id, scroll: homeScrollPosRef.current }));
  }, [view, detailProduct, isNavigatingByHistory, isInitialized]);

  // UseEffect for Popstate (Browser Back/Forward)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event && event.state) {
        setIsNavigatingByHistory(true);
        const { view: savedView, productId } = event.state;
        if (productId && products.length > 0) {
          const prod = products.find(p => p.id === productId);
          if (prod) setDetailProduct(prod);
        }
        setView(savedView || "home");
        setTimeout(() => setIsNavigatingByHistory(false), 200);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products]);

  // Initialize from URL or LocalStorage
  useEffect(() => {
    if (products.length === 0 || isInitialized) return;

    const params = new URLSearchParams(window.location.search);
    const urlProduct = params.get("product");
    const urlView = params.get("v");
    
    let targetView = urlView;
    let targetProductId = urlProduct;

    // If no URL params, try localStorage
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

    if (targetProductId) {
      const prod = products.find(p => p.id === targetProductId);
      if (prod) {
        setDetailProduct(prod);
        setView("product-detail");
      } else {
        // Se o produto não for encontrado após o carregamento, volta para a home para não ficar preso
        setView("home");
      }
    } else if (targetView) {
      setView(targetView as any);
    }
    
    setIsInitialized(true);
  }, [products.length, loading, isInitialized]);

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
    video_url: "",
    title: "Luxo & Exclusividade",
    subtitle: "A Essência da Exclusividade",
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
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

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
      if (isNavigatingByHistory) {
        // Use a slightly longer delay to ensure products are fully loaded and layout is stable
        const timer = setTimeout(() => {
          window.scrollTo({ top: homeScrollPosRef.current, behavior: "instant" });
        }, 150); // Increased delay for better stability
        return () => clearTimeout(timer);
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
    is_admin?: boolean;
  } | null>(null);
  const theme = "dark";

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
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/admin") {
      if (user && !(ADMIN_IDS.includes(user.id) || profile?.is_admin)) {
        setView("home");
        window.history.replaceState({}, "", "/");
        toast.error("Acesso restrito ao Administrador.");
      } else {
        setView("admin");
      }
    }
  }, [user, profile]);

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
      .select("theme, full_name, avatar_url, welcomed, custom_id, is_admin")
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
          custom_cursor_enabled: newProfile.custom_cursor_enabled !== false,
          is_admin: newProfile.is_admin || false,
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

  const fetchProducts = async () => {
    try {
      const { data: dbProducts, error: dbError } = await supabase
        .from("products")
        .select("*")
        .order('created_at', { ascending: false });

      if (dbError) {
        console.error("Erro ao carregar produtos:", dbError);
        toast.error("Erro ao carregar o catálogo.");
        return;
      }

      const productsWithPvp = (dbProducts || []).map(p => ({
        ...p,
        pvp: p.price || 0,
        is_active: p.is_active === undefined ? true : p.is_active, // Default to true if field missing
        supabase_id: p.id
      }));

      setProducts(productsWithPvp);
    } catch (err) {
      console.error("Erro no fetchProducts:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async (userId: string) => {
    // 1. BUSCAR ORDENS ATUALIZADAS
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
      navigateTo("product-detail", product);
    } else {
      setSelectedProduct(product);
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
        className={`h-screen flex flex-col items-center justify-center gap-6 ${theme === "dark" ? "dark bg-black text-white" : "bg-white text-black"}`}
      >
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          className="text-4xl font-serif tracking-tighter italic"
        >
          S.art
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${theme === "dark" ? "dark" : ""} bg-background text-foreground font-sans selection:bg-primary-foreground selection:text-primary transition-colors duration-700 ${(isCursorTransformed && cursorPreferEnabled) ? 'md:cursor-none' : ''}`}
    >
      <CustomCursor active={isCursorTransformed && cursorPreferEnabled} />
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

          {view === "admin" && user && (ADMIN_IDS.includes(user.id) || profile?.is_admin) && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <AdminDashboard
                user={user}
                onBack={() => {
                  setView("home");
                  fetchProducts();
                }}
                formatPrice={formatPrice}
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
                      {siteHero.video_url && <source src={siteHero.video_url} type="video/mp4" />}
                      {/* Fallback image if video fails to load */}
                      <img 
                        src={getImageUrl(siteHero.image)} 
                        alt="Luxury Background" 
                        className="w-full h-full object-cover"
                      />
                    </video>
                  ) : (
                    <img 
                      src={getImageUrl(siteHero.image)} 
                      alt="Luxury Background" 
                      className="w-full h-full object-cover opacity-85 dark:opacity-60 grayscale-[10%] transition-opacity duration-1000"
                    />
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
                        onClick={() => document.getElementById("featured-section")?.scrollIntoView({ behavior: "smooth" })}
                        className="mt-6 md:mt-8"
                      >
                        {siteHero.buttonText}
                      </GlassButton>
                    </motion.div>
                </div>

                {/* Scroll Indicator - Bottom edge with Panicked Escape Animation */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isCursorTransformed ? 0 : 1 }}
                  transition={{ delay: 4, duration: 1 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-50"
                >
                  <motion.div 
                    animate={isCursorTransformed ? {
                      y: -300, 
                      opacity: 0,
                      scale: 0.2,
                      transition: { duration: 0.5, ease: "anticipate" }
                    } : { 
                      x: [0, -4, 4, -3, 3, 0].map(v => v * (1 + scrollProgress * 10)),
                      y: [0, 3, -3, 2, -2, 0].map(v => v * (1 + scrollProgress * 10)),
                      rotate: [0, -3, 3, -2, 2, 0].map(v => v * (1 + scrollProgress * 10)),
                    }}
                    transition={{ 
                      duration: Math.max(0.04, 0.12 - scrollProgress * 0.1), 
                      repeat: isCursorTransformed ? 0 : Infinity,
                      repeatDelay: 0
                    }}
                    className="w-[28px] h-[48px] border-2 border-white/40 rounded-[1.2rem] flex items-center justify-center relative overflow-hidden"
                  >
                    <motion.div 
                      animate={isCursorTransformed ? {
                        y: -150,
                        scale: 2,
                        opacity: 0,
                      } : { 
                        y: [-16, 16, -12, 14, -16],
                        x: [0, 8, -8, 6, -6, 0].map(v => v * (1 + scrollProgress * 6)),
                        scale: [1, 1.6, 0.7, 1.5, 1],
                        opacity: [0.8, 1, 0.8, 1, 0.8]
                      }}
                      transition={{ 
                        duration: Math.max(0.1, 0.5 - scrollProgress * 0.4), 
                        repeat: isCursorTransformed ? 0 : Infinity, 
                        ease: "anticipate",
                        repeatType: "mirror"
                      }}
                      className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,1)]"
                    />
                  </motion.div>
                </motion.div>
              </section>

              {(() => {
                const featuredProducts = products.filter(p => p.is_featured && p.is_active !== false);
                if (featuredProducts.length === 0) return null;
                const isFewFeatured = featuredProducts.length <= 2;
                
                return (
                  <section id="featured-section" className="bg-luxury-bg py-20 border-b border-luxury-border overflow-hidden transition-colors duration-500">
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
                      className="px-[5%] mt-8"
                    >
                      <div className={`block columns-1 lg:columns-2 gap-x-8 lg:gap-x-16 ${isFewFeatured ? 'max-w-[1200px]' : 'max-w-[1700px]'} mx-auto`}>
                        {featuredProducts.map((featuredProduct, fIdx) => (
                          <motion.div 
                            key={featuredProduct.id} 
                            initial={{ 
                              opacity: 0, 
                              x: fIdx % 2 === 0 ? -150 : 150,
                              y: fIdx % 2 === 0 ? -60 : 60,
                              scale: 1.15
                            }}
                            whileInView={{ 
                              opacity: 1, 
                              x: 0,
                              y: 0,
                              scale: 0.92, // Subtle smaller scale as requested
                              transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } 
                            }}
                            viewport={{ once: false, amount: 0.1 }}
                            whileHover={{ scale: 0.95, transition: { duration: 0.3 } }}
                            exit={{ 
                              opacity: 0, 
                              x: fIdx % 2 === 0 ? -80 : 80,
                              y: fIdx % 2 === 0 ? -30 : 30,
                              scale: 0.8
                            }}
                            className="break-inside-avoid mb-4 flex flex-col space-y-2"
                          >
                          {/* Main Product Card with internal truncated title */}
                          <div 
                            onClick={() => {
                              setSelectedProduct(featuredProduct);
                              setDetailProduct(featuredProduct);
                              setView("product-detail");
                            }}
                            className="relative overflow-hidden border border-white/5 shadow-2xl group cursor-pointer rounded-[0.85rem] bg-black/20"
                          >
                            <img 
                              src={getImageUrl(featuredProduct.image_url || "")} 
                              alt={featuredProduct.title}
                              className="w-full h-auto object-contain transform group-hover:scale-102 transition-transform duration-[4s] ease-out"
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
                            <div className="flex flex-row items-center justify-between gap-3 pt-6 border-t border-luxury-border">
                              <div className="flex flex-col">
                                <span className="text-luxury-foreground/20 text-[8px] uppercase tracking-widest mb-1 font-bold">Valor Premium</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-luxury-gold text-2xl md:text-3xl font-serif">{formatPrice(featuredProduct.pvp)}</span>
                                </div>
                              </div>
                              
                              <div className="flex-shrink-0">
                                <GlassButton
                                  onClick={(e: any) => {
                                    e.stopPropagation();
                                    handleBuy(featuredProduct);
                                  }}
                                  className="!min-w-0 !px-4 !py-2.5 md:!px-10 md:!py-5"
                                  disabled={checkoutLoading === featuredProduct.id}
                                  loading={checkoutLoading === featuredProduct.id}
                                >
                                {checkoutLoading === featuredProduct.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <>
                                    <span className="text-[9px] md:text-[11px] font-black tracking-tighter">COMPRAR</span>
                                    <ArrowRight size={12} className="hidden xs:block group-hover:translate-x-2 transition-transform duration-300" />
                                  </>
                                )}
                              </GlassButton>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </section>
                );
              })()}

              <InfiniteProductMarquee products={products} />

              <section className="py-24 w-full overflow-hidden" id="boutique">
                <div className="px-[5%] mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-white/5 pb-10">
                  <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-12">
                    <div className="flex flex-col">
                      <motion.span 
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-luxury-gold text-[10px] uppercase tracking-[0.4em] font-bold mb-2"
                      >
                        Curadoria
                      </motion.span>
                      <motion.h2 
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="text-5xl md:text-6xl font-serif text-white tracking-tighter"
                      >
                        Boutique
                      </motion.h2>
                    </div>

                    {/* Category Selector - Desktop: Buttons, Mobile: Custom Dropdown */}
                    <div className="flex items-center gap-2 pb-1 relative">
                      {/* Mobile Custom Dropdown */}
                      <div className="relative md:hidden w-full min-w-[160px]">
                        <button 
                          onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                          className="w-full bg-black/40 border border-white/10 text-white p-3 text-[10px] uppercase tracking-widest outline-none flex justify-between items-center group transition-all hover:border-luxury-gold/50"
                        >
                          <span className="font-bold">{selectedCategory}</span>
                          <ChevronDown size={14} className={`text-luxury-gold transition-transform duration-500 ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <AnimatePresence>
                          {isCategoryMenuOpen && (
                            <>
                              <div 
                                onClick={() => setIsCategoryMenuOpen(false)}
                                className="fixed inset-0 z-[100]"
                              />
                              <motion.div 
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                className="absolute top-full left-0 w-full mt-2 bg-[#0a0a0a] border border-white/10 z-[101] shadow-2xl overflow-hidden rounded-sm"
                              >
                                <div className="max-h-60 overflow-y-auto luxury-scrollbar">
                                  {["Todos", ...allCategories.filter(c => c !== "Todos")].map(cat => (
                                    <button 
                                      key={cat}
                                      onClick={() => {
                                        setSelectedCategory(cat);
                                        setIsCategoryMenuOpen(false);
                                      }}
                                      className={`w-full text-left p-4 text-[9px] uppercase tracking-widest transition-all border-b border-white/5 last:border-0 ${
                                        selectedCategory === cat
                                        ? 'bg-luxury-gold text-black font-black' 
                                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                                      }`}
                                    >
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                                
                                {/* Price Filters in Mobile Dropdown */}
                                <div className="p-4 bg-white/5 border-t border-white/5 space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                      <label className="text-[8px] uppercase tracking-widest text-luxury-gold font-bold">Mínimo ({(globalCountry as any).currency || 'EUR'})</label>
                                      <input 
                                        type="number"
                                        value={Math.round(minPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                                        onChange={(e) => setMinPrice(Number(e.target.value) / (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                                        className="w-full bg-black/40 border border-white/10 text-white p-2 text-[10px] outline-none focus:border-luxury-gold transition-all"
                                        placeholder="0"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[8px] uppercase tracking-widest text-luxury-gold font-bold">Máximo ({(globalCountry as any).currency || 'EUR'})</label>
                                      <input 
                                        type="number"
                                        value={Math.round(maxPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                                        onChange={(e) => setMaxPrice(Number(e.target.value) / (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                                        className="w-full bg-black/40 border border-white/10 text-white p-2 text-[10px] outline-none focus:border-luxury-gold transition-all"
                                        placeholder="10000"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Desktop Buttons */}
                      <div className="hidden md:flex flex-wrap items-center gap-2">
                        {["Todos", ...allCategories].map(cat => (
                          <button 
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-1.5 text-[9px] uppercase tracking-[0.1em] transition-all border ${
                              selectedCategory === cat 
                              ? 'bg-luxury-gold text-black border-luxury-gold font-bold' 
                              : 'border-white/10 text-white/40 hover:border-luxury-gold/30 hover:text-white'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pb-1">
                    <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-2 md:p-3 relative group">
                      <div className="flex flex-col gap-1">
                        <label className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold leading-none">Min {(globalCountry as any).currency || 'EUR'}</label>
                        <input 
                          type="number"
                          value={Math.round(minPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                          onChange={(e) => setMinPrice(Number(e.target.value) / (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                          className="bg-transparent text-white text-[10px] w-16 md:w-20 outline-none focus:text-luxury-gold transition-colors font-bold uppercase tracking-widest"
                          placeholder="MIN"
                        />
                      </div>
                      <div className="w-[1px] h-6 bg-white/10" />
                      <div className="flex flex-col gap-1">
                        <label className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold leading-none">Max {(globalCountry as any).currency || 'EUR'}</label>
                        <input 
                          type="number"
                          value={Math.round(maxPrice * (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                          onChange={(e) => setMaxPrice(Number(e.target.value) / (exchangeRates[(globalCountry as any).currency || 'EUR'] || 1))}
                          className="bg-transparent text-white text-[10px] w-16 md:w-20 outline-none focus:text-luxury-gold transition-colors font-bold uppercase tracking-widest"
                          placeholder="MAX"
                        />
                      </div>
                    </div>
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
                        const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                        const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                        const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) || desc.toLowerCase().includes(searchQuery.toLowerCase());
                        return matchesCategory && matchesPrice && matchesSearch;
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

                  {products.filter((p) => {
                    const matchesCategory = selectedCategory === "Todos" || p.category === selectedCategory;
                    const matchesPrice = p.pvp >= minPrice && p.pvp <= maxPrice;
                    const matchesSearch = (p.title || "").toLowerCase().includes(searchQuery.toLowerCase());
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
              onBack={handleBack}
              onConfirm={handleDetailConfirm}
              isProcessing={detailLoading}
              quantity={quantity}
              setQuantity={setQuantity}
              formatPrice={formatPrice}
            />
          )}

          {view === "shipping" && selectedProduct && (
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
                          const prefix = countryObj ? countryObj.prefix + " " : "";
                          
                          if (input.length < prefix.length) {
                            setShippingInfo({ ...shippingInfo, phone: prefix });
                            return;
                          }
                          if (!input.startsWith(prefix)) return;

                          const suffix = input.slice(prefix.length).replace(/[^\d]/g, '');
                          if (suffix.length <= 15) { // Global phone limit approx
                            setShippingInfo({
                              ...shippingInfo,
                              phone: prefix + suffix
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
                          {formatPrice(Number(selectedProduct.pvp))}
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-luxury-border" />

                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-foreground/60 transition-colors">
                        <span>Subtotal ({quantity}x)</span>
                        <span>{formatPrice(Number(selectedProduct.pvp) * quantity)}</span>
                      </div>
                      {couponDiscount > 0 && (
                          <div className="flex justify-between text-[10px] uppercase tracking-widest text-luxury-gold transition-colors">
                            <span>Desconto ({couponDiscount}%)</span>
                            <span>-{formatPrice((Number(selectedProduct.pvp) * quantity) * (couponDiscount / 100))}</span>
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
                        <span>{formatPrice((Number(selectedProduct.pvp) * quantity) * (1 - couponDiscount / 100) + (selectedProduct.free_shipping ? 0 : 1.15))}</span>
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
          )}

          {view === "dashboard" && user && (
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
            <div className="text-[9px] uppercase tracking-[0.3em] text-luxury-foreground/40 transition-colors">
              © 2026 Boutique S.art | S.art-full.pt
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

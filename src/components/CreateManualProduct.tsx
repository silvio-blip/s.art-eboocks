import React, { useState } from "react";
import { 
  Package, 
  Loader2, 
  Plus, 
  DollarSign, 
  Type, 
  Image as ImageIcon, 
  Hash,
  Zap,
  Truck
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

interface CreateManualProductProps {
  onSuccess?: () => void;
}

export function CreateManualProduct({ onSuccess }: CreateManualProductProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: "Geral", // Default category
    image_url: "",
    extra_images: "", // Added extra images
    external_id: "", 
    sku: "", 
    provider: 'aliexpress' as const,
    free_shipping: false
  });

  React.useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase.from('categories').select('*').order('name');
      if (data) setCategories(data);
    };
    fetchCategories();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.price || !formData.image_url) {
      toast.error("Por favor, preencha os campos obrigatórios (Título, Preço e Imagem).");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('products')
        .insert([
          {
            title: formData.title,
            description: formData.description,
            price: Math.round(parseFloat(formData.price || "0") * 100) / 100,
            category: formData.category, // Added category
            image_url: formData.image_url,
            extra_images: formData.extra_images,
            aliexpress_id: formData.external_id || null,
            provider: formData.provider,
            sku: formData.sku || null,
            is_active: true,
            product_type: 'physical',
            free_shipping: formData.free_shipping
          }
        ]);

      if (error) throw error;

      toast.success(`🎉 Produto Internacional criado!`);
      
      // Reset form
      setFormData({
        title: "",
        description: "",
        price: "",
        category: "Geral",
        image_url: "",
        extra_images: "",
        external_id: "",
        sku: "",
        provider: 'aliexpress',
        free_shipping: false
      });

      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("[MANUAL_CREATE_ERROR]", error);
      toast.error(`Erro ao criar produto: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black border border-zinc-800/50 rounded-[2rem] p-8 lg:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] h-full"
    >
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-amber-500/10">
            <Zap className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-light text-white tracking-tight">
              Criar <span className="italic font-serif text-white/90">Internacional</span>
            </h2>
            <p className="text-sm text-zinc-500 uppercase tracking-widest font-medium mt-1">Registo manual de ativo externo</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Título do Produto</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <Type className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Ex: Pulseira de Prata Minimalista Noir"
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm letter-spacing-wide font-light"
                />
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Preço de Venda</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <DollarSign className="w-4 h-4" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm font-light"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Categoria</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <Package className="w-4 h-4" />
                </div>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white appearance-none outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-xs uppercase tracking-widest font-black"
                >
                  <option value="Geral">Escolher Categoria</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Main Image URL */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Capa do Produto (Link URL)</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="image_url"
                  value={formData.image_url}
                  onChange={handleChange}
                  placeholder="Cole o link da imagem principal..."
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm font-light"
                />
              </div>
            </div>

            {/* Extra Images URL */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Galeria de Visualização (Links separados por vírgula)</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <Plus className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="extra_images"
                  value={formData.extra_images}
                  onChange={handleChange}
                  placeholder="link1.jpg, link2.jpg, link3.png..."
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm font-light"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">
                Fornecedor ID: International Code
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="external_id"
                  value={formData.external_id}
                  onChange={handleChange}
                  placeholder="ID: 100500..."
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm font-light"
                />
              </div>
            </div>

            {/* SKU Field */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Referência Logística (SKU)</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-amber-500 transition-colors">
                  <Package className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="Ex: WATCH-SILVER-01"
                  className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 pl-12 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm font-light"
                />
              </div>
            </div>

            {/* Free Shipping Toggle */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Envio Grátis?</label>
              <div className="flex items-center gap-4 bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 h-14">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Truck className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold flex-1">Habilitar Envio Grátis</span>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, free_shipping: !prev.free_shipping }))}
                  className={`w-10 h-5 relative rounded-full transition-colors ${formData.free_shipping ? "bg-blue-500" : "bg-white/10"}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${formData.free_shipping ? "left-6" : "left-1"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Descrição</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Descreva o produto com tons de exclusividade..."
              className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl py-4 px-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm resize-none font-light"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-white hover:bg-zinc-200 text-black border-none rounded-2xl active:scale-[0.98] transition-all text-sm font-bold uppercase tracking-widest shadow-xl mt-4"
          >
            {loading ? (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Sincronizando com a Loja...</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5" />
                <span>Criar Produto na Loja</span>
              </div>
            )}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}

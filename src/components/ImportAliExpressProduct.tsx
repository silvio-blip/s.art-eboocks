import React, { useState } from "react";
import { 
  Download, 
  ExternalLink, 
  Loader2, 
  Zap, 
  AlertCircle, 
  Package, 
  CheckCircle2 
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AliExpressService } from "../services/AliExpressService";
import { supabase } from "../lib/supabase";

interface ImportAliExpressProductProps {
  onSuccess?: (product: any) => void;
  userId: string;
}

export function ImportAliExpressProduct({ onSuccess, userId }: ImportAliExpressProductProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMock, setLoadingMock] = useState(false);

  // LOGS "MERDA" - Detailed as requested
  const printDebug = (prefix: string, message: any, data: any = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`%c[${timestamp}] [${prefix}] %c${message}`, "color: #fbbf24; font-weight: bold", "color: #d1d5db", data ? data : "");
  };

  const extractProductId = (input: string): string | null => {
    printDebug("EXTRACTOR", "Tentando extrair ID do input:", input);
    // Standard URL: https://www.aliexpress.com/item/1005007426232912.html
    const itemMatch = input.match(/item\/(\d+)\.html/);
    if (itemMatch) {
      printDebug("EXTRACTOR", "✅ ID extraído via padrão /item/ID.html:", itemMatch[1]);
      return itemMatch[1];
    }

    // Mobile URL or direct ID from URL query
    const queryMatch = input.match(/[?&]id=(\d+)/);
    if (queryMatch) {
      printDebug("EXTRACTOR", "✅ ID extraído via query param ?id=:", queryMatch[1]);
      return queryMatch[1];
    }

    // Just ID
    const directIdMatch = input.match(/^\d{10,}$/); 
    if (directIdMatch) {
      printDebug("EXTRACTOR", "✅ ID inserido diretamente:", directIdMatch[0]);
      return directIdMatch[0];
    }

    printDebug("EXTRACTOR", "⚠️ Nenhum ID válido encontrado no input.");
    return null;
  };

  const handleOfficialImport = async () => {
    const productId = extractProductId(url);
    if (!productId) {
      toast.error("Link inválido. Insira um URL do AliExpress.");
      return;
    }

    setLoading(true);
    printDebug("API_OFICIAL", "🚀 INICIANDO IMPORTAÇÃO OFICIAL VIA PROXY SERVER");
    
    try {
      printDebug("API_OFICIAL", `🛰️ Enviando pedido para ID: ${productId}`);
      const productData = await AliExpressService.importProduct(productId);
      printDebug("API_OFICIAL", "📥 DADOS RECEBIDOS COM SUCESSO!", productData);
      
      toast.success("Produto importado com sucesso via API!");
      if (onSuccess) onSuccess(productData);
    } catch (error: any) {
      printDebug("API_OFICIAL", "🔥 ERRO CRÍTICO NA CONEXÃO", {
        message: error.message,
        stack: error.stack,
        raw: error
      });
      
      if (error.message?.includes("IllegalAccessToken") || error.message?.includes("access token is invalid")) {
        toast.error(
          "Aguardando validação do AliExpress. Use o Modo Mock por enquanto.",
          { duration: 5000, icon: <AlertCircle className="text-amber-500" /> }
        );
      } else {
        toast.error(`Erro: ${error.message || "Falha na comunicação com o servidor"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMockImport = async () => {
    const rawProductId = extractProductId(url);
    const productId = rawProductId || `mock_${Date.now().toString().slice(-6)}`;
    
    setLoadingMock(true);
    printDebug("MOCK_SYSTEM", "🛠️ ACIONANDO BYPASS DE API (MODO SIMULAÇÃO)");
    printDebug("MOCK_SYSTEM", `🔮 Gerando dados de luxo para o ID base: ${productId}`);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const luxuryProducts = [
        {
          title: "Relógio Chrono Minimalista S.Art Noir",
          desc: "Um ícone de precisão e elegância. Acabamento em titânio escovado com detalhes em ouro rosa. Movimento automático de alta fidelidade.",
          img: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1000",
          cat: "Relojaria"
        },
        {
          title: "Óculos de Sol Noir Executive",
          desc: "Edição limitada em acetato italiano. Lentes polarizadas com proteção UV total e dobradiças reforçadas a ouro.",
          img: "https://images.unsplash.com/photo-1511499767390-91f99f73948f?q=80&w=1000",
          cat: "Acessórios"
        },
        {
          title: "Mala de Viagem em Pele de Bezerro",
          desc: "Mala executiva feita à mão por artesãos especializados. Couro de grão integral premium que envelhece com distinção.",
          img: "https://images.unsplash.com/photo-1553062407-98eeb94c6a62?q=80&w=1000",
          cat: "Couros"
        },
        {
          title: "Perfume S.Art Absolute - 100ml",
          desc: "Fragrância intensa com notas de sândalo, couro e especiarias orientais. Um aroma que define a presença masculina de luxo.",
          img: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=1000",
          cat: "Fragrâncias"
        }
      ];

      const selectedMock = luxuryProducts[Math.floor(Math.random() * luxuryProducts.length)];
      // Preço entre 100 e 500
      const basePrice = Math.floor(Math.random() * (500 - 100 + 1)) + 100;

      const mockData = {
        title: `${selectedMock.title} (${productId})`,
        description: selectedMock.desc,
        price: basePrice,
        image_url: selectedMock.img,
        extra_images: `${selectedMock.img},https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1000`,
        category: selectedMock.cat,
        product_type: 'physical',
        is_active: true,
        aliexpress_id: productId,
        provider: 'aliexpress_mock',
        metadata: {
          simulated: true,
          original_url: url,
          import_timestamp: new Date().toISOString()
        }
      };

      printDebug("MOCK_SYSTEM", "📦 OBJECTO MOCK CONSTRUÍDO", mockData);

      const { data, error } = await supabase
        .from('products')
        .insert([mockData])
        .select()
        .single();

      if (error) {
        printDebug("DATABASE", "❌ ERRO AO INSERIR NO SUPABASE", error);
        throw error;
      }

      printDebug("DATABASE", "✅ PRODUTO MOCK INSERIDO!", data);
      toast.success("Produto Mock inserido com sucesso na base de dados!");
      
      if (onSuccess) onSuccess(data);
      setUrl("");
    } catch (error: any) {
      toast.error(`Falha no Mock: ${error.message}`);
    } finally {
      setLoadingMock(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-black border border-zinc-800/50 rounded-[2rem] p-8 lg:p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden"
    >
      {/* Decorative luxury gradient */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-amber-500/5 to-transparent pointer-events-none" />
      
      <div className="relative z-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-amber-500/80">S.Art Exclusive Tools</h3>
            </div>
            <h2 className="text-3xl font-light text-white tracking-tight">
              Curadoria de <span className="italic font-serif text-amber-200/90">Produtos</span>
            </h2>
          </div>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-full">
            <div className="p-1 px-2 bg-amber-500/10 rounded-full">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Status: Ready</span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">AliExpress Engine v2.0</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <ExternalLink className="w-5 h-5 text-zinc-600 transition-colors group-focus-within:text-amber-500" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole o link do produto AliExpress aqui..."
              className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl py-5 pl-14 pr-6 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all text-sm font-light letter-spacing-wide"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={handleOfficialImport}
              disabled={loading || loadingMock || !url}
              className="h-16 bg-white hover:bg-zinc-200 text-black border-none rounded-2xl active:scale-[0.98] transition-all text-sm font-bold uppercase tracking-widest shadow-xl"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sincronizando Dados...</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4 fill-black" />
                  <span>Importar via API Oficial</span>
                </div>
              )}
            </Button>

            <Button
              onClick={handleMockImport}
              disabled={loading || loadingMock || !url}
              variant="outline"
              className="h-16 border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900 hover:text-white text-zinc-400 rounded-2xl active:scale-[0.98] transition-all text-sm font-bold uppercase tracking-widest"
            >
              {loadingMock ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                  <span>Gerando Simulação...</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Download className="w-4 h-4" />
                  <span>Importação de Teste / Mock</span>
                </div>
              )}
            </Button>
          </div>
        </div>

        {/* Footer info/logs hint */}
        <div className="pt-4 border-t border-zinc-800/50 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-zinc-600" />
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
            Pode verificar os logs técnicos detalhados no console para auditoria de importação.
          </p>
        </div>
      </div>
    </motion.div>
  );
}


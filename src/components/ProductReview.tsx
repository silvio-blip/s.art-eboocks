import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Star, CheckCircle2, ChevronLeft, Send, Upload, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const ProductReview = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  async function fetchOrder() {
    try {
      if (!orderId) return;
      
      const { data, error } = await supabase
        .from('orders')
        .select('*, products(id, title, image_url, category)')
        .eq('id', orderId)
        .single();
        
      if (error || !data) {
        toast.error("Pedido não encontrado.");
        navigate('/');
        return;
      }
      
      setOrder(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    
    setSubmitting(true);
    try {
      const { error } = await supabase.from('reviews').insert({
        order_id: orderId,
        product_id: order.product_id,
        user_id: order.user_id,
        rating,
        comment,
        created_at: new Date().toISOString()
      });

      if (error) throw error;
      
      // Mark order as reviewed if column exists
      await supabase.from('orders').update({ reviewed: true }).eq('id', orderId);
      
      setSubmitted(true);
      toast.success("Avaliação enviada com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao enviar avaliação: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center font-sans">
        <div className="w-8 h-8 border-2 border-luxury-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight dark:text-white">Obrigado pela sua avaliação!</h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">O seu feedback é essencial para mantermos a excelência dos nossos produtos.</p>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-bold text-sm tracking-widest uppercase hover:bg-luxury-gold dark:hover:bg-luxury-gold transition-colors"
          >
            Voltar à Loja
          </button>
        </motion.div>
      </div>
    );
  }

  const product = order.products;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-black font-sans pb-20">
      <div className="max-w-4xl mx-auto px-6 pt-12">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white mb-12 transition-colors"
        >
          <ChevronLeft size={14} /> Voltar
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Product Preview */}
          <div className="space-y-6">
            <div className="aspect-square bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5 overflow-hidden">
               {product.image_url ? (
                 <img src={product.image_url.startsWith('http') ? product.image_url : supabase.storage.from('assets').getPublicUrl(product.image_url).data.publicUrl} alt={product.title} className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center opacity-20">
                   <Package size={48} />
                 </div>
               )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-luxury-gold font-bold">{product.category}</p>
              <h2 className="text-xl font-bold tracking-tight dark:text-white">{product.title}</h2>
              <p className="text-sm text-black/40 dark:text-white/40">Pedido #{orderId?.slice(0, 8)}</p>
            </div>
          </div>

          {/* Review Form */}
          <div className="bg-white dark:bg-zinc-900 p-8 border border-black/5 dark:border-white/5 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight mb-8 dark:text-white">Avaliar Produto</h1>
            
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest font-bold text-black/50 dark:text-white/50">Sua pontuação</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`p-1 transition-colors ${rating >= star ? 'text-luxury-gold' : 'text-neutral-200 dark:text-neutral-800'}`}
                    >
                      <Star size={32} fill={rating >= star ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest font-bold text-black/50 dark:text-white/50">Seu comentário</label>
                <textarea
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Conte-nos o que achou do produto..."
                  className="w-full min-h-[150px] p-4 bg-neutral-50 dark:bg-black border border-black/10 dark:border-white/10 outline-none focus:border-luxury-gold transition-colors dark:text-white text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-5 bg-black dark:bg-white text-white dark:text-black font-bold text-sm tracking-widest uppercase hover:bg-luxury-gold dark:hover:bg-luxury-gold transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Enviar Avaliação <Send size={16} /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductReview;

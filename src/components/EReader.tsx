import React, { useState, useEffect, useCallback } from 'react';
import { Viewer, Worker, PageChangeEvent } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/page-navigation/lib/styles/index.css';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Bookmark, ChevronLeft, ChevronRight, Maximize, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EReaderProps {
  orderId: string;
  bookId: string;
  bookTitle: string;
  onBack: () => void;
}

const EReader: React.FC<EReaderProps> = ({ orderId, bookId, bookTitle, onBack }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  const pageNavigationPluginInstance = pageNavigationPlugin();
  const { jumpToPage } = pageNavigationPluginInstance;

  useEffect(() => {
    const initializeReader = async () => {
      try {
        setLoading(true);
        
        const res = await fetch(`/api/orders/${orderId}/download`);
        const data = await res.json();
        
        if (!res.ok || !data.url) {
          throw new Error(data.error || 'Não foi possível carregar o livro.');
        }
        
        setSignedUrl(data.url);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: progress } = await supabase
            .from('user_reading_progress')
            .select('last_page_read')
            .eq('user_id', user.id)
            .eq('book_id', bookId)
            .single();
          
          if (progress) {
            setCurrentPage(progress.last_page_read);
          }
        }
      } catch (err: any) {
        console.error('[READER INIT ERROR]', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeReader();
  }, [orderId, bookId]);

  const updateProgress = useCallback(async (page: number, total?: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const payload: any = {
          user_id: user.id,
          book_id: bookId,
          last_page_read: page,
          updated_at: new Date().toISOString()
        };
        if (total) payload.total_pages = total;

        await supabase.from('user_reading_progress').upsert(payload, { onConflict: 'user_id,book_id' });
      }
    } catch (err) {
      console.error('[PROGRESS UPDATE ERROR]', err);
    }
  }, [bookId]);

  const handlePageChange = (e: PageChangeEvent) => {
    setCurrentPage(e.currentPage);
    updateProgress(e.currentPage);
  };

  const handleDocumentLoad = (e: any) => {
    setTotalPages(e.doc.numPages);
    updateProgress(currentPage, e.doc.numPages);
  };

  const progressPercent = totalPages > 0 ? Math.round((currentPage / (totalPages - 1)) * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col items-center justify-center space-y-6">
        <Loader2 className="animate-spin text-luxury-gold" size={48} />
        <div className="text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.4em] text-black/60 dark:text-white/60 font-medium">S.ART ATELIER</p>
          <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-400">A preparar a sua obra digital...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col items-center justify-center space-y-6 text-center px-10">
        <div className="p-6 rounded-full bg-red-50 dark:bg-red-950/20 mb-4">
          <Settings className="text-red-500 animate-pulse" size={32} />
        </div>
        <h2 className="font-serif text-2xl dark:text-white italic">Pedimos Desculpa</h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-xs">{error}</p>
        <Button onClick={onBack} variant="outline" className="rounded-none border-black/10 dark:border-white/10 uppercase tracking-widest text-[9px] h-12 px-10">
          Voltar à Biblioteca
        </Button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col transition-colors duration-500"
    >
      {/* Header Fino e Elegante */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-black/5 dark:border-white/5"
          >
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onBack} className="p-2 h-auto text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <ArrowLeft size={18} />
              </Button>
              <div className="overflow-hidden">
                <h3 className="font-serif text-sm dark:text-white truncate max-w-[150px] sm:max-w-md">{bookTitle}</h3>
                <div className="h-0.5 w-full bg-black/5 dark:bg-white/5 mt-1 overflow-hidden">
                  <div className="h-full bg-luxury-gold transition-all duration-700" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[9px] uppercase tracking-widest font-bold text-luxury-gold">{progressPercent}%</span>
              <Button variant="ghost" className="p-2 h-auto text-black/40 dark:text-white/40">
                <Maximize size={16} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Viewport de Leitura */}
      <div className="flex-1 mt-0 bg-neutral-50 dark:bg-zinc-950 overflow-hidden" onClick={() => setShowControls(!showControls)}>
        <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js`}>
          {signedUrl && (
            <Viewer
              fileUrl={signedUrl}
              initialPage={currentPage}
              onPageChange={handlePageChange}
              onDocumentLoad={handleDocumentLoad}
              plugins={[defaultLayoutPluginInstance, pageNavigationPluginInstance]}
              theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
            />
          )}
        </Worker>
      </div>

      {/* Controlos Inferiores Thumb-Friendly */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="absolute bottom-0 left-0 right-0 z-50 p-6 flex items-center justify-between gap-4 bg-gradient-to-t from-white dark:from-black via-white/80 dark:via-black/80 to-transparent pt-10"
          >
            <Button 
              disabled={currentPage === 0}
              onClick={(e) => {
                e.stopPropagation();
                jumpToPage(currentPage - 1);
              }}
              className="flex-1 bg-black dark:bg-white text-white dark:text-black h-16 rounded-none uppercase tracking-[0.2em] text-[10px] font-bold shadow-2xl disabled:opacity-20"
            >
              <ChevronLeft size={16} className="mr-2" />
              Anterior
            </Button>
            
            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-6 h-16 flex flex-col items-center justify-center border border-black/5 dark:border-white/5 shadow-xl">
              <span className="text-[12px] font-serif italic dark:text-white">{currentPage + 1}</span>
              <div className="w-4 h-[1px] bg-luxury-gold my-0.5" />
              <span className="text-[9px] text-neutral-400 font-medium">{totalPages}</span>
            </div>

            <Button 
              disabled={currentPage === totalPages - 1}
              onClick={(e) => {
                e.stopPropagation();
                jumpToPage(currentPage + 1);
              }}
              className="flex-1 bg-luxury-gold text-white h-16 rounded-none uppercase tracking-[0.2em] text-[10px] font-bold shadow-2xl disabled:opacity-20 translate-y-[-4px] active:translate-y-0 transition-transform"
            >
              Próximo
              <ChevronRight size={16} className="ml-2" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EReader;

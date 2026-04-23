import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  MessageSquare, 
  X, 
  Search, 
  ArrowLeft,
  Loader2,
  Trash2,
  Plus,
  Download,
  PanelRightOpen,
  PanelRightClose
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useInView } from 'react-intersection-observer';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import debounce from 'lodash.debounce';

// Setup PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Heavy-handed fix to suppress AbortException warnings globally
// These are normal during fast scrolling/zooming and react-pdf sometimes leaks them to console
const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args[0]?.toString() || '';
  if (message.includes('AbortException') || message.includes('TextLayer task cancelled')) {
    return;
  }
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  const message = args[0]?.toString() || '';
  if (message.includes('AbortException')) {
    return;
  }
  originalError(...args);
};

interface PDFReaderProps {
  orderId: string;
  bookId: string;
  bookTitle: string;
  purchasedAt: string;
  onBack: () => void;
}

interface UserAnnotation {
  id: string;
  user_id: string;
  product_id: string;
  page_number: number;
  content: string;
  created_at: string;
}

const ReaderPage = React.memo(({ 
  pageNumber, 
  scale, 
  width, 
  onInView 
}: { 
  pageNumber: number; 
  scale: number; 
  width: number; 
  onInView: (page: number) => void 
}) => {
  const [hasBeenInView, setHasBeenInView] = useState(false);
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
    rootMargin: '400px 0px', // Pre-carregar 400px antes de entrar na vista
  });

  useEffect(() => {
    if (inView) {
      setHasBeenInView(true);
      onInView(pageNumber);
    }
  }, [inView, pageNumber, onInView]);

  const loadingPlaceholder = useMemo(() => (
    <div 
      style={{ width: `${width}px`, height: `${width * 1.4}px` }} 
      className="bg-neutral-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center transition-all duration-500"
    >
      <Loader2 className="animate-spin text-luxury-gold" size={24} />
    </div>
  ), [width]);

  return (
    <div ref={ref} className="mb-10 flex flex-col w-fit mx-auto items-center">
      <div className="shadow-2xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/5 transition-all duration-500">
        {hasBeenInView ? (
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            width={width}
            renderMode="canvas"
            renderAnnotationLayer={true}
            renderTextLayer={true}
            onRenderError={(error: any) => {
              const errStr = error?.toString() || '';
              if (error?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('Page render error:', error);
            }}
            onRenderTextLayerError={(error: any) => {
              const errStr = error?.toString() || '';
              if (error?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('TextLayer render error:', error);
            }}
            onRenderAnnotationLayerError={(error: any) => {
              const errStr = error?.toString() || '';
              if (error?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('AnnotationLayer render error:', error);
            }}
            onGetTextError={(error: any) => {
              const errStr = error?.toString() || '';
              if (error?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('GetText error:', error);
            }}
            loading={null} // Remove flickering during scale/zoom updates
          />
        ) : (
          <div 
            style={{ width: `${width}px`, height: `${width * 1.4}px` }} 
            className="bg-neutral-100 dark:bg-zinc-800 flex items-center justify-center"
          >
            <Loader2 className="animate-spin text-luxury-gold/10" size={24} />
          </div>
        )}
      </div>
      <div className="mt-4 px-3 py-1 bg-black/5 dark:bg-white/5 rounded-full backdrop-blur-md">
        <span className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 font-bold">
          Página {pageNumber}
        </span>
      </div>
    </div>
  );
});

const PDFReader: React.FC<PDFReaderProps> = ({ orderId, bookId, bookTitle, purchasedAt, onBack }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);
  
  // Gestures state
  const touchState = useRef({ distance: 0, isPinching: false });
  
  // Annotations
  const [annotations, setAnnotations] = useState<UserAnnotation[]>([]);
  const [newNote, setNewNote] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize and load PDF
  useEffect(() => {
    let isMounted = true;
    const loadPdf = async () => {
      try {
        if (isMounted) setLoading(true);
        // 1. Get file path from products
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('file_url')
          .eq('id', bookId)
          .single();

        if (productError || !product?.file_url) throw new Error('Produto não encontrado');

        // 2. Fetch signed URL
        const res = await fetch(`/api/get-book?filePath=${encodeURIComponent(product.file_url)}&bookTitle=${encodeURIComponent(bookTitle)}`);
        if (!isMounted) return;
        const result = await res.json();
        
        if (!res.ok || !result.url) throw new Error(result.error || 'Erro ao obter URL segura');
        
        if (isMounted) setPdfUrl(result.url);
        
        // 3. Load annotations
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isMounted) {
          const { data: userAnns } = await supabase
            .from('user_annotations')
            .select('*')
            .eq('user_id', user.id)
            .eq('product_id', bookId)
            .order('page_number', { ascending: true });
          
          if (userAnns && isMounted) setAnnotations(userAnns);

          // 4. Load last read page
          const { data: progress } = await supabase
            .from('user_reading_progress')
            .select('last_page_read')
            .eq('user_id', user.id)
            .eq('book_id', bookId)
            .single();
          
          if (progress && isMounted) {
            // We use 0-indexed in DB, 1-indexed in reader
            setCurrentPage((progress.last_page_read || 0) + 1);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          toast.error(err.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPdf();
    return () => { isMounted = false; };
  }, [bookId, bookTitle]);

  // Handle pinch to zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        touchState.current = { distance: dist, isPinching: true };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchState.current.isPinching) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        
        const delta = dist / touchState.current.distance;
        if (Math.abs(delta - 1) > 0.01) {
          setScale(prev => Math.min(Math.max(prev * delta, 0.5), 3));
          touchState.current.distance = dist;
        }
      }
    };

    const handleTouchEnd = () => {
      touchState.current.isPinching = false;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Handle resizing with ResizeObserver for stability
  useEffect(() => {
    if (!containerRef.current) return;

    // Use a Ref to store the actual state to avoid closure issues with debounce
    let lastWidth = 0;

    const debouncedResize = debounce((entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        let newWidth = entry.contentRect.width;
        
        // Responsive width rules
        if (window.innerWidth < 768) {
          newWidth = window.innerWidth - 32;
        } else {
          newWidth = newWidth - 80;
        }

        // Only update if difference is significant (>20px) to prevent flickering on minute changes
        if (Math.abs(lastWidth - newWidth) > 20) {
          lastWidth = newWidth;
          setContainerWidth(newWidth);
        }
      }
    }, 250);

    const observer = new ResizeObserver((entries) => {
      debouncedResize(entries);
    });
    
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      debouncedResize.cancel();
    };
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const syncReadingState = useMemo(() => 
    debounce(async (page: number, total: number) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await fetch('/api/save-reading-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            bookId,
            lastPage: page - 1,
            totalPages: total
          })
        });
      } catch (err) {
        console.error('Failed to sync progress:', err);
      }
    }, 3000), [bookId]);

  const handlePageInView = useCallback((page: number) => {
    setCurrentPage(page);
    syncReadingState(page, numPages);
  }, [syncReadingState, numPages]);

  const handleAddAnnotation = async () => {
    if (!newNote.trim()) return;
    
    setIsSavingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilizador não autenticado');

      const { data, error } = await supabase
        .from('user_annotations')
        .insert({
          user_id: user.id,
          product_id: bookId,
          page_number: currentPage,
          content: newNote
        })
        .select()
        .single();

      if (error) throw error;

      setAnnotations(prev => [...prev, data].sort((a, b) => a.page_number - b.page_number));
      setNewNote('');
      toast.success('Nota guardada com sucesso.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao guardar nota.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      const { error } = await supabase.from('user_annotations').delete().eq('id', id);
      if (error) throw error;
      setAnnotations(prev => prev.filter(a => a.id !== id));
      toast.success('Nota removida.');
    } catch (err: any) {
      toast.error('Erro ao remover nota.');
    }
  };

  const jumpToPage = (targetPage: number) => {
    const el = document.getElementById(`pdf-page-${targetPage}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const daysSincePurchase = (new Date().getTime() - new Date(purchasedAt).getTime()) / (1000 * 3600 * 24);
  const isDownloadLocked = daysSincePurchase <= 14;

  const downloadBook = useCallback(async () => {
    if (isDownloadLocked) {
      toast.error('Download indisponível durante o período de garantia (14 dias).');
      return;
    }
    if (!pdfUrl) {
      toast.error('O PDF ainda não está carregado.');
      return;
    }

    try {
      const toastId = toast.loading('A preparar o descarregamento...');
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Sanitizar o título do livro para o nome do arquivo
      const safeTitle = bookTitle.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Livro';
      link.download = `${safeTitle}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Descarregamento iniciado!', { id: toastId });
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Erro ao descarregar o livro.');
    }
  }, [pdfUrl, bookTitle]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[200] bg-white dark:bg-black flex flex-col items-center justify-center p-6 text-center">
        <X className="text-red-500 mb-4" size={48} />
        <h2 className="font-serif text-2xl dark:text-white mb-2">Erro ao carregar obra</h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-xs mb-8">{error}</p>
        <Button onClick={onBack} variant="outline" className="rounded-none border-black/10 dark:border-white/10 uppercase tracking-widest text-[9px] h-12 px-10 font-bold">
          Voltar à Biblioteca
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-100 dark:bg-zinc-950 flex flex-col z-[150] overflow-hidden">
      {/* Header HUD */}
      <div className="h-16 md:h-20 bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-black/5 dark:border-white/10 flex items-center justify-between px-4 md:px-8 z-50">
        <div className="flex items-center gap-4 md:gap-8">
          <Button variant="ghost" onClick={onBack} className="p-2 h-auto text-black dark:text-white hover:bg-black/5 transition-colors">
            <ArrowLeft size={20} />
            <span className="ml-2 text-[10px] uppercase tracking-[0.3em] font-bold hidden sm:inline text-luxury-gold">Biblioteca</span>
          </Button>
          <div className="hidden sm:block overflow-hidden">
            <h3 className="font-serif text-sm dark:text-white truncate max-w-md">{bookTitle}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-none px-3 py-1.5 gap-2 md:gap-4 border border-black/5 dark:border-white/10">
            <button 
              onClick={() => setScale(s => Math.max(0.5, s - 0.2))} 
              className="text-black/60 dark:text-white/60 hover:text-luxury-gold transition-colors p-1"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            
            <div className="hidden md:flex items-center w-24 lg:w-32">
              <input 
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full h-1 bg-black/10 dark:bg-white/10 appearance-none cursor-pointer accent-luxury-gold rounded-full"
              />
            </div>

            <button 
              onClick={() => setScale(s => Math.min(3, s + 0.2))} 
              className="text-black/60 dark:text-white/60 hover:text-luxury-gold transition-colors p-1"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            
            <span className="text-[10px] font-bold dark:text-white min-w-[3.5rem] text-center border-l border-black/5 dark:border-white/10 ml-2 pl-2">
              {Math.round(scale * 100)}%
            </span>
          </div>

          <Button 
            variant="ghost" 
            onClick={downloadBook}
            disabled={isDownloadLocked}
            className={`p-2 h-auto transition-colors ${isDownloadLocked ? 'opacity-50 cursor-not-allowed text-black/30 dark:text-white/30' : 'text-black dark:text-white hover:text-luxury-gold'}`}
            title={isDownloadLocked ? "Download disponível após período de garantia (14 dias)" : "Descarregar Livro"}
          >
            <Download size={20} />
          </Button>

          <Button 
            variant="ghost" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className={`p-2 h-auto transition-colors ${isSidebarOpen ? 'text-luxury-gold' : 'text-black dark:text-white'}`}
          >
            {isSidebarOpen ? <PanelRightClose size={22} /> : <PanelRightOpen size={22} />}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main PDF Content */}
        <div 
          id="pdf-reader-main"
          className="flex-1 overflow-auto bg-neutral-200 dark:bg-zinc-900/50 flex flex-col custom-scrollbar scroll-smooth"
          ref={containerRef}
        >
          <div className="py-12 md:py-20 w-full flex flex-col">
            {pdfUrl && (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex flex-col items-center gap-4 mt-20">
                    <Loader2 className="animate-spin text-luxury-gold" size={40} />
                    <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 font-bold">A preparar protocolo S.Art...</p>
                  </div>
                }
                className="flex flex-col"
              >
                {Array.from(new Array(numPages), (el, index) => (
                  <div key={`page-wrapper-${index + 1}`} id={`pdf-page-${index + 1}`} className="w-full">
                    <ReaderPage 
                      pageNumber={index + 1}
                      scale={scale}
                      width={containerWidth}
                      onInView={handlePageInView}
                    />
                  </div>
                ))}
              </Document>
            )}
          </div>
        </div>

        {/* Notes Sidebar */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute md:relative right-0 top-0 bottom-0 w-[85vw] md:w-96 bg-white dark:bg-zinc-950 border-l border-black/5 dark:border-white/10 z-[60] flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
                <div>
                  <h4 className="font-serif text-xl dark:text-white">Anotações</h4>
                  <p className="text-[9px] uppercase tracking-widest text-luxury-gold font-bold">O Seu Diário de Leitura</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="rounded-full md:hidden">
                  <X size={20} />
                </Button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] uppercase tracking-widest text-black/40 dark:text-white/40 font-bold">Nova Nota (Pág {currentPage})</label>
                  </div>
                  <textarea 
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Escreva as suas reflexões sobre esta página..."
                    className="w-full bg-neutral-50 dark:bg-zinc-900/50 border border-black/5 dark:border-white/10 p-4 text-xs dark:text-white outline-none focus:border-luxury-gold transition-colors min-h-[120px] resize-none"
                  />
                  <Button 
                    onClick={handleAddAnnotation}
                    disabled={isSavingNote || !newNote.trim()}
                    className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-luxury-gold dark:hover:bg-luxury-gold hover:text-white rounded-none h-12 text-[10px] uppercase tracking-widest font-bold transition-all disabled:opacity-50"
                  >
                    {isSavingNote ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={14} className="mr-2" /> Guardar Nota</>}
                  </Button>
                </div>
              </div>

              <Separator className="opacity-40" />

              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6">
                  {annotations.length === 0 ? (
                    <div className="py-12 text-center space-y-4">
                      <div className="w-12 h-12 bg-neutral-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto">
                        <MessageSquare size={20} className="text-black/20 dark:text-white/20" />
                      </div>
                      <p className="text-[10px] uppercase tracking-widest text-black/40 dark:text-white/40 italic">Nenhuma nota registada nesta obra.</p>
                    </div>
                  ) : (
                    annotations.map((ann) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={ann.id} 
                        className="group bg-neutral-50 dark:bg-zinc-900/40 border border-black/5 dark:border-white/5 p-4 space-y-3 hover:border-luxury-gold transition-all duration-500"
                      >
                        <div className="flex justify-between items-start">
                          <button 
                            onClick={() => jumpToPage(ann.page_number)}
                            className="bg-luxury-gold/10 text-luxury-gold text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded hover:bg-luxury-gold/20 transition-colors"
                          >
                            Pág {ann.page_number}
                          </button>
                          <button 
                            onClick={() => handleDeleteAnnotation(ann.id)}
                            className="text-black/20 dark:text-white/20 hover:text-red-500 transition-colors group-hover:opacity-100 opacity-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p className="text-[11px] leading-relaxed dark:text-zinc-300 italic whitespace-pre-wrap font-serif">
                          "{ann.content}"
                        </p>
                        <p className="text-[8px] uppercase tracking-[0.2em] text-black/30 dark:text-white/30 pt-1">
                          {new Date(ann.created_at).toLocaleDateString('pt-PT')}
                        </p>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Meta */}
      <div className="h-10 bg-white dark:bg-black border-t border-black/5 dark:border-white/10 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <span className="text-[9px] font-black uppercase tracking-widest text-luxury-gold">S.Art Digital Protocol</span>
          <div className="h-3 w-px bg-black/10 dark:bg-white/10" />
          <span className="text-[9px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 font-bold">
            Página {currentPage} de {numPages}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[9px] uppercase tracking-widest text-black/30 dark:text-white/30 font-bold">Encriptação Ativa</span>
        </div>
      </div>
    </div>
  );
};

export default PDFReader;

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { useInView } from 'react-intersection-observer';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Minus,
  StickyNote,
  X,
  MessageSquare,
  Save,
  Trash2,
  Download,
  ScrollText,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import debounce from 'lodash.debounce';
import { toast } from 'sonner';

// Setup PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Suppress AbortException warnings globally
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

interface Annotation {
  id: string;
  page: number;
  text: string;
  date: string;
}

interface EReaderProps {
  orderId: string;
  bookId: string;
  bookTitle: string;
  onBack: () => void;
}

interface ScrollPageProps {
  pageNumber: number;
  scale: number;
  width?: number;
  onInView?: () => void;
}

// Lazy loaded page component for Scroll mode
const ScrollPage: React.FC<ScrollPageProps> = ({ pageNumber, scale, width, onInView }) => {
  const { ref, inView } = useInView({
    threshold: 0.5,
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && onInView) {
      onInView();
    }
  }, [inView, onInView]);

  return (
    <div id={`pdf-page-${pageNumber}`} ref={ref} className="min-h-[400px] flex flex-col items-center py-4 w-full">
      <div className="w-fit mx-auto">
        {inView ? (
          <div className="shadow-2xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/5">
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            width={width}
            loading={null} // Reduced flicker during scroll/scale
            renderAnnotationLayer={true}
            renderTextLayer={true}
            onRenderError={(err: any) => {
              const errStr = err?.toString() || '';
              if (err?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('Page render error:', err);
            }}
            onRenderTextLayerError={(err: any) => {
              const errStr = err?.toString() || '';
              if (err?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('TextLayer Error:', err);
            }}
            onRenderAnnotationLayerError={(err: any) => {
              const errStr = err?.toString() || '';
              if (err?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('AnnotationLayer Error:', err);
            }}
            onGetTextError={(err: any) => {
              const errStr = err?.toString() || '';
              if (err?.name === 'AbortException' || errStr.includes('AbortException')) return;
              console.error('GetText Error:', err);
            }}
          />
        </div>
      ) : (
        <div className="w-[60vw] h-[80vh] bg-neutral-100 dark:bg-zinc-900/50 flex flex-col items-center justify-center border border-black/5">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">A carregar pág {pageNumber}...</span>
          <div className="w-12 h-0.5 bg-luxury-gold/20 mt-2 overflow-hidden">
             <div className="h-full bg-luxury-gold w-1/3 animate-progress-slide" />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

const EReader: React.FC<EReaderProps> = ({ orderId, bookId, bookTitle, onBack }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [showControls, setShowControls] = useState(true);
  
  // Custom Zoom State
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  const [visualScale, setVisualScale] = useState(1);
  const [isGesturing, setIsGesturing] = useState(false);
  const [origin, setOrigin] = useState({ x: '50%', y: '50%' });
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  
  // Measure container width for fluid layout
  useEffect(() => {
    if (!viewportRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Leave some padding for visual comfort
        setContainerWidth(entry.contentRect.width - 32);
      }
    });

    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  const touchState = useRef({ 
    distance: 0, 
    isZooming: false,
    midpoint: { x: 0, y: 0 }
  });
  
  // Annotation State
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isNotesListOpen, setIsNotesListOpen] = useState(false);
  const [currentNote, setCurrentNote] = useState('');

  // Sync logic
  const syncProgress = useMemo(() => debounce(async (page: number, total: number, notes: Annotation[]) => {
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
          totalPages: total,
          annotations: notes
        })
      });
    } catch (err) { console.error('[SYNC ERROR]', err); }
  }, 2000), [bookId]);

  useEffect(() => {
    const initializeReader = async () => {
      try {
        setLoading(true);
        const { data: product, error: productError } = await supabase
          .from('products').select('file_url').eq('id', bookId).single();
        if (productError || !product?.file_url) throw new Error('Obra não encontrada');
        const res = await fetch(`/api/get-book?filePath=${encodeURIComponent(product.file_url)}&bookTitle=${encodeURIComponent(bookTitle)}`);
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error || 'Acesso negado');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: state } = await supabase.from('user_reading_progress').select('*').eq('user_id', user.id).eq('book_id', bookId).single();
          if (state) {
            setCurrentPage((state.last_page_read || 0) + 1);
            setAnnotations(state.annotations || []);
          }
        }
        setSignedUrl(data.url);
      } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    };
    initializeReader();
  }, [bookId, bookTitle]);

  // Gestures Logic (Strictly internal zoom)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        setScale(prev => Math.min(Math.max(prev * delta, 0.4), 8));
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
        
        const viewport = viewportRef.current;
        const content = contentWrapperRef.current;
        if (!viewport || !content) return;

        const rect = content.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        
        // Convert to percentage relative to element current size
        const originX = (midX / rect.width) * 100;
        const originY = (midY / rect.height) * 100;
        
        setOrigin({ x: `${originX}%`, y: `${originY}%` });
        touchState.current = { 
          distance: dist, 
          isZooming: true,
          midpoint: { x: midX, y: midY }
        };
        setIsGesturing(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchState.current.isZooming) {
        e.preventDefault(); 
        const dist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        const newVisualScale = dist / touchState.current.distance;
        setVisualScale(newVisualScale);
      }
    };

    const handleTouchEnd = () => {
      if (touchState.current.isZooming) {
        setScale(prev => Math.min(Math.max(prev * visualScale, 0.4), 8));
        setVisualScale(1);
        setIsGesturing(false);
        touchState.current.isZooming = false;
      }
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd);

    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scale, visualScale]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
    syncProgress(currentPage, numPages, annotations);
  };

  const handlePageChange = (delta: number) => {
    const next = Math.min(Math.max(currentPage + delta, 1), totalPages);
    
    // In scroll mode, we scroll to the element
    const element = document.getElementById(`pdf-page-${next}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Fallback if not rendered yet (though they should be in the DOM as placeholders)
      setCurrentPage(next);
    }
    
    syncProgress(next, totalPages, annotations);
  };

  const downloadBook = async () => {
    if (!signedUrl) {
      toast.error('Acesso ao PDF não disponível.');
      return;
    }

    try {
      const toastId = toast.loading('A preparar o descarregamento...');
      const response = await fetch(signedUrl);
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
  };

  const handleAddNote = () => {
    if (!currentNote.trim()) return;
    const newNote: Annotation = { id: crypto.randomUUID(), page: currentPage, text: currentNote, date: new Date().toISOString() };
    const updated = [newNote, ...annotations];
    setAnnotations(updated); setCurrentNote(''); setIsNoteModalOpen(false);
    syncProgress(currentPage, totalPages, updated);
  };

  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col items-center justify-center space-y-6">
        <Loader2 className="animate-spin text-luxury-gold" size={48} />
        <div className="text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.4em] text-black/60 dark:text-white/60 font-medium font-sans">S.ART ATELIER</p>
          <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-400 font-sans tracking-[.25em]">A preparar a sua obra digital...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col items-center justify-center space-y-6 p-10 text-center">
        <div className="p-6 rounded-full bg-red-50 dark:bg-red-950/20 mb-4">
          <X className="text-red-500" size={32} />
        </div>
        <h2 className="font-serif text-2xl dark:text-white italic">Acesso Restrito</h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-xs">{error}</p>
        <Button onClick={onBack} variant="outline" className="rounded-none border-black/10 dark:border-white/10 uppercase tracking-widest text-[9px] h-12 px-10 font-bold">
          VOLTAR AO PORTAL
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-50 dark:bg-zinc-950 flex flex-col z-[100] select-none overflow-hidden reader-root">
      {/* Header HUD */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            className="h-[10vh] min-h-[70px] bg-white/95 dark:bg-black/95 backdrop-blur-xl border-b border-black/5 dark:border-white/5 flex items-center justify-between px-6 z-50 shadow-sm"
          >
            <div className="flex items-center gap-6">
              <Button variant="ghost" onClick={onBack} className="p-2 h-auto text-black dark:text-white hover:bg-black/5 transition-colors">
                <ArrowLeft size={22} />
                <span className="ml-2 text-[10px] uppercase tracking-[.3em] font-bold hidden sm:inline">Biblioteca</span>
              </Button>
              <div className="overflow-hidden">
                <h3 className="font-serif text-sm dark:text-white truncate max-w-[140px] sm:max-w-md">{bookTitle}</h3>
                <div className="h-0.5 w-full bg-black/5 dark:bg-white/5 mt-1 overflow-hidden">
                  <div className="h-full bg-luxury-gold transition-all duration-700" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={downloadBook} title="Descarregar PDF" className="p-2 h-auto text-black/60 dark:text-white/60">
                <Download size={20} />
              </Button>
              <Button variant="ghost" onClick={() => setIsNotesListOpen(true)} className="p-2 h-auto text-black/60 dark:text-white/60 relative">
                <MessageSquare size={20} />
                {annotations.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-luxury-gold text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white dark:border-black">
                    {annotations.length}
                  </span>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reader Viewport */}
      <div 
        ref={viewportRef}
        className="flex-1 overflow-auto relative flex flex-col py-10 bg-neutral-100 dark:bg-zinc-950 scroll-smooth"
        onDoubleClick={() => {
          setShowControls(!showControls);
          if (scale > 1) {
            setScale(1);
            setOrigin({ x: '50%', y: '50%' });
          }
        }}
        style={{ touchAction: isGesturing ? 'none' : 'auto' }}
      >
        <div 
          ref={contentWrapperRef}
          className={`relative transition-transform flex flex-col m-auto ${isGesturing ? 'will-change-transform' : ''}`}
          style={{ 
            transform: `scale(${visualScale})`,
            transition: !isGesturing ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
            transformOrigin: `${origin.x} ${origin.y}`,
            minHeight: '100%',
            minWidth: 'min-content'
          }}
        >
          {signedUrl && (
            <Document
              file={signedUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<Loader2 className="animate-spin text-luxury-gold mt-20" size={40} />}
              className="flex flex-col w-full"
            >
              <div className="flex flex-col gap-8 w-full">
                {Array.from(new Array(totalPages), (el, index) => (
                  <ScrollPage 
                    key={`page_${index + 1}`} 
                    pageNumber={index + 1} 
                    scale={scale} 
                    width={containerWidth}
                    onInView={() => setCurrentPage(index + 1)}
                  />
                ))}
              </div>
            </Document>
          )}
        </div>
      </div>

      {/* Floating HUD - Navigation & Scaling */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 z-50 pointer-events-none"
          >
            {/* Page Nav */}
            <div className="flex bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl border border-black/5 dark:border-white/5 h-16 pointer-events-auto">
              <Button variant="ghost" onClick={() => handlePageChange(-1)} disabled={currentPage <= 1} className="h-full px-5 hover:bg-black/5 dark:text-white rounded-none">
                <ChevronLeft size={22} />
              </Button>
              <div className="bg-neutral-50 dark:bg-zinc-800/50 h-16 w-20 flex flex-col items-center justify-center border-x border-black/5 dark:border-white/5">
                <span className="text-sm font-serif italic font-bold dark:text-white leading-none">{currentPage}</span>
                <div className="w-4 h-px bg-luxury-gold my-1" />
                <span className="text-[9px] font-bold text-neutral-400 leading-none">{totalPages || '?'}</span>
              </div>
              <Button variant="ghost" onClick={() => handlePageChange(1)} disabled={currentPage >= totalPages} className="h-full px-5 hover:bg-black/5 dark:text-white rounded-none">
                <ChevronRight size={22} />
              </Button>
            </div>

            {/* Scale HUD */}
            <div className="flex bg-white/95 dark:bg-zinc-900/95 h-16 px-4 md:px-6 items-center gap-2 md:gap-4 border border-black/5 dark:border-white/5 shadow-2xl pointer-events-auto text-black dark:text-white">
              <Button variant="ghost" onClick={() => setScale(s => Math.max(s - 0.25, 0.4))} className="p-1 h-auto"><Minus size={16} /></Button>
              <span className="text-[10px] font-bold text-luxury-gold min-w-[32px] text-center">{Math.round(scale * 100)}%</span>
              <Button variant="ghost" onClick={() => setScale(s => Math.min(s + 0.25, 8))} className="p-1 h-auto"><Plus size={16} /></Button>
            </div>

            <Button 
              onClick={() => setIsNoteModalOpen(true)}
              className="bg-luxury-gold hover:bg-luxury-gold/90 text-white h-16 px-8 rounded-none shadow-2xl pointer-events-auto uppercase tracking-[0.3em] font-bold text-[10px] flex items-center gap-2 group"
            >
              <StickyNote size={20} className="group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline">Anotar</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNoteModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 w-full max-w-sm border border-luxury-gold/20 shadow-2xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-serif text-lg dark:text-white italic">Nova Inspiração</h4>
                <Button variant="ghost" onClick={() => setIsNoteModalOpen(false)} className="text-zinc-400 p-0 h-auto hover:text-black dark:hover:text-white"><X size={24} /></Button>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-luxury-gold font-bold mb-3">Página {currentPage}</p>
              <textarea autoFocus value={currentNote} onChange={(e) => setCurrentNote(e.target.value)} placeholder="Registe os seus pensamentos..." className="w-full h-40 bg-zinc-50 dark:bg-black/40 border border-black/5 dark:border-white/5 p-4 text-sm focus:ring-1 focus:ring-luxury-gold outline-none dark:text-white resize-none" />
              <Button onClick={handleAddNote} className="w-full bg-luxury-gold hover:bg-luxury-gold/90 text-white uppercase tracking-[0.3em] font-bold text-[10px] h-14 rounded-none mt-6"><Save size={16} className="mr-2" /> Guardar Reflexão</Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNotesListOpen && (
          <div className="fixed inset-0 z-[200] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setIsNotesListOpen(false)}>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-zinc-900 w-full max-w-sm h-full shadow-2xl flex flex-col">
              <div className="p-8 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                <div><h4 className="font-serif text-xl dark:text-white">Reflexões</h4><p className="text-[9px] uppercase tracking-[.2em] text-zinc-400 mt-1">Anotações salvas</p></div>
                <Button variant="ghost" onClick={() => setIsNotesListOpen(false)} className="p-2 h-auto text-zinc-400 hover:text-black dark:hover:text-white"><X size={28} /></Button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {annotations.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 mt-20"><StickyNote size={56} className="mb-4" /><p className="text-[10px] uppercase tracking-widest">Nenhuma nota registada.</p></div>
                ) : (
                  annotations.map((note) => (
                    <div key={note.id} className="relative bg-neutral-50 dark:bg-white/5 p-6 border-l-2 border-luxury-gold group">
                      <div className="flex justify-between items-center mb-4 text-[9px] uppercase tracking-widest font-bold text-luxury-gold"><span>Pág. {note.page}</span><Button variant="ghost" onClick={() => setAnnotations(a => a.filter(x => x.id !== note.id))} className="p-1 h-auto text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></Button></div>
                      <p className="text-sm dark:text-zinc-300 leading-relaxed italic">"{note.text}"</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes progress-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-progress-slide { animation: progress-slide 1.5s ease-in-out infinite; }
      `}} />
    </div>
  );
};

export default EReader;

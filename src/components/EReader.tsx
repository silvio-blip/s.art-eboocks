import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Viewer, Worker, PageChangeEvent } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/page-navigation/lib/styles/index.css';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Loader2, 
  Bookmark, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Settings,
  Plus,
  StickyNote,
  X,
  MessageSquare,
  Save,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import debounce from 'lodash.debounce';

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

const EReader: React.FC<EReaderProps> = ({ orderId, bookId, bookTitle, onBack }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  
  // Annotation State
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isNotesListOpen, setIsNotesListOpen] = useState(false);
  const [currentNote, setCurrentNote] = useState('');

  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      // Hide thumbnails on mobile to maximize area
      ...(window.innerWidth > 768 ? defaultTabs : [])
    ]
  });

  const pageNavigationPluginInstance = pageNavigationPlugin();
  const { jumpToPage } = pageNavigationPluginInstance;

  useEffect(() => {
    const initializeReader = async () => {
      try {
        setLoading(true);
        console.log(`[READER DATA] Fetching book record for ID: ${bookId}`);
        
        // 1. Get Product Details to find filePath
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('file_url')
          .eq('id', bookId)
          .single();

        if (productError || !product) {
          throw new Error('Não foi possível localizar o ficheiro deste e-book.');
        }

        // 2. Get Signed URL from the new API
        const fetchUrl = `/api/get-book?filePath=${encodeURIComponent(product.file_url)}`;
        const res = await fetch(fetchUrl);
        const responseText = await res.text();
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error('[READER FATAL] Server response is not JSON:', responseText.substring(0, 300));
          throw new Error('Resposta inválida do servidor (Assets Bucket).');
        }
        
        if (!res.ok || !data.url) {
          throw new Error(data.error || 'Não foi possível autorizar o acesso à obra.');
        }
        
        setSignedUrl(data.url);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: progress } = await supabase
            .from('user_reading_progress')
            .select('last_page_read, annotations')
            .eq('user_id', user.id)
            .eq('book_id', bookId)
            .single();
          
          if (progress) {
            setCurrentPage(progress.last_page_read);
            setAnnotations(progress.annotations || []);
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

  // DB Sync with Debounce (Server-side API)
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
          lastPage: page,
          totalPages: total,
          annotations: notes
        })
      });
    } catch (err) {
      console.error('[SYNC ERROR]', err);
    }
  }, 2000), [bookId]);

  const handlePageChange = (e: PageChangeEvent) => {
    setCurrentPage(e.currentPage);
    syncProgress(e.currentPage, totalPages, annotations);
  };

  const handleDocumentLoad = (e: any) => {
    setTotalPages(e.doc.numPages);
    syncProgress(currentPage, e.doc.numPages, annotations);
  };

  const handleAddNote = () => {
    if (!currentNote.trim()) return;
    
    const newNote: Annotation = {
      id: crypto.randomUUID(),
      page: currentPage,
      text: currentNote,
      date: new Date().toISOString()
    };
    
    const updated = [newNote, ...annotations];
    setAnnotations(updated);
    setCurrentNote('');
    setIsNoteModalOpen(false);
    syncProgress(currentPage, totalPages, updated);
  };

  const handleDeleteNote = (id: string) => {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    syncProgress(currentPage, totalPages, updated);
  };

  const progressPercent = totalPages > 0 ? Math.round((currentPage / (totalPages - 1)) * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col items-center justify-center space-y-6">
        <Loader2 className="animate-spin text-luxury-gold" size={48} />
        <div className="text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.4em] text-black/60 dark:text-white/60 font-medium font-sans">S.ART ATELIER</p>
          <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-400 font-sans">A preparar a sua obra digital...</p>
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
      className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col transition-colors duration-500 font-sans"
    >
      {/* HUD - Header */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-black/5 dark:border-white/5"
          >
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onBack} className="p-2 h-auto text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <ArrowLeft size={18} />
                <span className="ml-2 text-[10px] uppercase tracking-widest font-bold hidden sm:inline">Voltar</span>
              </Button>
              <div className="overflow-hidden">
                <h3 className="font-serif text-sm dark:text-white truncate max-w-[150px] sm:max-w-md">{bookTitle}</h3>
                <div className="h-1 w-full bg-black/5 dark:bg-white/5 mt-1 overflow-hidden">
                  <div className="h-full bg-luxury-gold transition-all duration-700" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={onBack} 
                className="bg-black dark:bg-white text-white dark:text-black h-8 px-4 rounded-none text-[8px] uppercase tracking-widest font-bold sm:hidden"
              >
                FECHAR
              </Button>
              <span className="text-[9px] uppercase tracking-widest font-bold text-luxury-gold mr-2">{progressPercent}%</span>
              <Button 
                variant="ghost" 
                onClick={() => setIsNotesListOpen(true)}
                className="p-2 h-auto text-black/60 dark:text-white/60 relative"
              >
                <MessageSquare size={18} />
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

      {/* Main Viewport - 92vh height context */}
      <div 
        className="flex-1 mt-0 bg-neutral-50 dark:bg-zinc-950 overflow-hidden relative cursor-crosshair h-[92vh]" 
        onClick={() => setShowControls(!showControls)}
      >
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

        {/* Floating Note Button */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute right-6 bottom-32 sm:bottom-24 z-50"
            >
              <Button
                onClick={(e) => { e.stopPropagation(); setIsNoteModalOpen(true); }}
                className="w-14 h-14 rounded-full bg-luxury-gold text-white shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
              >
                <Plus size={24} />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HUD - Bottom Navigation */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="absolute bottom-0 left-0 right-0 z-50 p-4 sm:p-6 flex items-center justify-between gap-4 bg-gradient-to-t from-white dark:from-black via-white/95 dark:via-black/95 to-transparent pt-10"
          >
            <Button 
              disabled={currentPage === 0}
              onClick={(e) => { e.stopPropagation(); jumpToPage(currentPage - 1); }}
              className="flex-1 bg-black dark:bg-white text-white dark:text-black h-14 sm:h-16 rounded-none uppercase tracking-[0.2em] text-[9px] sm:text-[10px] font-bold shadow-2xl disabled:opacity-20"
            >
              <ChevronLeft size={16} className="mr-1 sm:mr-2" />
              Anterior
            </Button>
            
            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-4 sm:px-6 h-14 sm:h-16 flex flex-col items-center justify-center border border-black/5 dark:border-white/5 shadow-xl min-w-[70px]">
              <span className="text-[11px] sm:text-[12px] font-serif italic dark:text-white leading-none">{currentPage + 1}</span>
              <div className="w-4 h-[1px] bg-luxury-gold my-1" />
              <span className="text-[8px] sm:text-[9px] text-neutral-400 font-medium leading-none">{totalPages || '?'}</span>
            </div>

            <Button 
              disabled={currentPage === totalPages - 1}
              onClick={(e) => { e.stopPropagation(); jumpToPage(currentPage + 1); }}
              className="flex-1 bg-luxury-gold text-white h-14 sm:h-16 rounded-none uppercase tracking-[0.2em] text-[9px] sm:text-[10px] font-bold shadow-2xl disabled:opacity-20"
            >
              Próximo
              <ChevronRight size={16} className="ml-1 sm:ml-2" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note Modal */}
      <AnimatePresence>
        {isNoteModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-none overflow-hidden shadow-2xl border border-black/10 dark:border-white/10"
            >
              <div className="p-4 border-b border-black/5 dark:border-white/5 flex justify-between items-center">
                <h4 className="text-[10px] uppercase tracking-[0.3em] font-bold dark:text-white">Adicionar Anotação</h4>
                <Button variant="ghost" onClick={() => setIsNoteModalOpen(false)} className="p-1 h-auto text-neutral-400"><X size={18} /></Button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-[9px] uppercase tracking-widest text-luxury-gold font-medium">Página {currentPage + 1}</p>
                <textarea 
                  value={currentNote}
                  onChange={(e) => setCurrentNote(e.target.value)}
                  placeholder="Escreva os seus pensamentos sobre esta obra..."
                  className="w-full h-40 bg-neutral-50 dark:bg-zinc-950 border-none resize-none p-4 text-sm focus:ring-1 focus:ring-luxury-gold outline-none dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-700"
                  autoFocus
                />
                <Button 
                  onClick={handleAddNote}
                  className="w-full bg-black dark:bg-white text-white dark:text-black uppercase tracking-[0.3em] text-[9px] h-12 rounded-none"
                >
                  <Save size={14} className="mr-2" />
                  Guardar Nota
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notes Sidebar/Drawer */}
      <AnimatePresence>
        {isNotesListOpen && (
          <div className="fixed inset-0 z-[200] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setIsNotesListOpen(false)}>
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 w-full max-w-[320px] h-full shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-black/5 dark:border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <StickyNote size={18} className="text-luxury-gold" />
                  <h4 className="text-[10px] uppercase tracking-[0.3em] font-bold dark:text-white">As Minhas Notas</h4>
                </div>
                <Button variant="ghost" onClick={() => setIsNotesListOpen(false)} className="p-2 h-auto text-neutral-400"><X size={20} /></Button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {annotations.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <StickyNote size={32} />
                    <p className="text-[10px] uppercase tracking-widest">Nenhuma nota registada.</p>
                  </div>
                ) : (
                  annotations.map((note) => (
                    <div key={note.id} className="group space-y-2 border-l-2 border-luxury-gold pl-4 py-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] uppercase tracking-widest font-bold text-luxury-gold">Pág. {note.page + 1}</span>
                        <Button 
                          variant="ghost" 
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 h-auto text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                      <p className="text-sm dark:text-neutral-300 leading-relaxed italic">"{note.text}"</p>
                      <p className="text-[8px] text-neutral-400">{new Date(note.date).toLocaleDateString()} • {new Date(note.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EReader;

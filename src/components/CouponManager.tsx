import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

interface Coupon {
  id: string;
  code: string;
  percentage_discount: number;
  is_active: boolean;
}

export const CouponManager = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [code, setCode] = useState('');
    const [discount, setDiscount] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        fetchCoupons();
    }, []);

    const fetchCoupons = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('coupons').select('*');
        if (error) {
            toast.error("Erro ao carregar cupons.");
        } else {
            setCoupons(data || []);
        }
        setLoading(false);
    };

    const handleCreateCoupon = async () => {
        if (!code || !discount) return;
        const { error } = await supabase.from('coupons').insert({
            code: code.toUpperCase(),
            percentage_discount: parseInt(discount),
            is_active: true
        });
        if (error) {
            toast.error("Erro ao criar cupom. Verifique se o código não existe.");
        } else {
            toast.success("Cupom criado!");
            setIsCreateModalOpen(false);
            setCode('');
            setDiscount('');
            fetchCoupons();
        }
    };

    const handleDeleteCoupon = async (id: string) => {
        setDeleting(id);
        const { error } = await supabase.from('coupons').delete().eq('id', id);
        if (error) {
            toast.error("Erro ao remover cupom.");
        } else {
            toast.success("Cupom removido.");
            fetchCoupons();
        }
        setDeleting(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-serif text-white">Gestão de Cupons</h3>
                <Button onClick={() => setIsCreateModalOpen(true)} className="bg-luxury-gold text-black">
                    <Plus size={16} className="mr-2"/> Criar Cupom
                </Button>
            </div>

            <div className="bg-luxury-dark border border-white/5 rounded-none p-6">
                {loading ? <Loader2 className="animate-spin text-white w-8 h-8 mx-auto"/> : (
                    <table className="w-full text-left text-white">
                        <thead>
                            <tr className="border-b border-white/10 uppercase text-[10px] tracking-widest text-white/40">
                                <th className="p-4">Código</th>
                                <th className="p-4">Desconto (%)</th>
                                <th className="p-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {coupons.map(coupon => (
                                <tr key={coupon.id} className="border-b border-white/5">
                                    <td className="p-4 font-mono">{coupon.code}</td>
                                    <td className="p-4">{coupon.percentage_discount}%</td>
                                    <td className="p-4 text-right">
                                        <Button variant="ghost" onClick={() => handleDeleteCoupon(coupon.id)} disabled={deleting === coupon.id}>
                                            {deleting === coupon.id ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16} className="text-red-500"/>}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-900 border border-white/10 w-full max-w-sm p-6 space-y-4">
                        <h3 className="text-white text-lg">Criar Cupom</h3>
                        <input type="text" placeholder="Código (ex: LUXURY20)" value={code} onChange={e => setCode(e.target.value)} className="w-full p-2 bg-black text-white border border-white/10"/>
                        <input type="number" placeholder="Desconto %" value={discount} onChange={e => setDiscount(e.target.value)} className="w-full p-2 bg-black text-white border border-white/10"/>
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleCreateCoupon}>Salvar</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

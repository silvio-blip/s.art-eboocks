-- S.ART - ADD REFUND REASON COLUMN
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.orders.refund_reason IS 'Motivo opcional ou obrigatório fornecido pelo usuário ao solicitar reembolso';

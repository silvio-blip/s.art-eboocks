-- Script para adicionar colunas de controle de e-mail na tabela orders
-- Isso evita disparos duplicados e garante que o sistema de lock funcione

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS email_paid_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS email_shipped_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS email_delivered_sent BOOLEAN DEFAULT FALSE; -- Para review futuro

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS email_canceled_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS email_refunded_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS email_review_sent BOOLEAN DEFAULT FALSE;

-- Comentário para documentar as colunas
COMMENT ON COLUMN orders.email_paid_sent IS 'Indica se o e-mail de confirmação de pagamento já foi enviado';
COMMENT ON COLUMN orders.email_shipped_sent IS 'Indica se o e-mail de rastreio já foi enviado';

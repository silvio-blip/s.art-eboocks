-- Script para REMOVER gatilhos (triggers) automáticos do banco de dados
-- Isso garante que o envio de e-mail seja controlado APENAS pelo código do servidor

-- 1. Remover triggers comuns de notificação se existirem
DROP TRIGGER IF EXISTS tr_order_paid_notification ON orders;
DROP TRIGGER IF EXISTS on_order_status_update ON orders;
DROP TRIGGER IF EXISTS trigger_send_email_on_insert ON orders;

-- 2. Remover as funções associadas a esses triggers para limpar o banco
DROP FUNCTION IF EXISTS handle_order_paid_notification();
DROP FUNCTION IF EXISTS notify_order_change();
DROP FUNCTION IF EXISTS supabase_functions_invoke_email();

-- 3. (Opcional) Garantir que as colunas de controle continuam existindo para o código usar como "lock"
-- Mas sem dependência de automação do banco
ALTER TABLE orders ALTER COLUMN email_paid_sent SET DEFAULT FALSE;

-- Mensagem de confirmação
-- 'Triggers removidos com sucesso. Agora o disparo depende exclusivamente do server.ts'

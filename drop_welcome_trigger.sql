-- O utilizador solicitou a remoção do trigger que causa o erro.
-- Dropando o trigger e a função associada (Usando CASCADE para evitar dependências)

DROP TRIGGER IF EXISTS on_auth_user_created_welcome ON auth.users CASCADE;
DROP FUNCTION IF EXISTS handle_welcome_email() CASCADE;

import React from 'react';

export default function TermsAndPrivacy() {
  return (
    <div className="max-w-4xl mx-auto py-24 px-6">
      <div className="space-y-6 md:space-y-8 text-center mb-16">
        <h1 className="text-3xl md:text-5xl font-serif dark:text-white leading-[1.1]">
          Termos de Serviço e <br /> Política de Privacidade
        </h1>
        <div className="h-px w-24 bg-luxury-gold mx-auto opacity-50" />
        <p className="text-[11px] uppercase tracking-[0.4em] text-black/40 dark:text-white/40 max-w-sm mx-auto leading-relaxed">
          S.Art Boutique Digital
        </p>
      </div>

      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none font-serif leading-relaxed space-y-12 dark:text-white/80">
        
        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">1. Aceitação dos Termos</h2>
          <p>
            Ao aceder e utilizar o site S.Art, o utilizador concorda em cumprir e vincular-se aos seguintes termos. Este site é um atelier digital destinado à venda de conteúdos educativos e artísticos (E-books e Manuais).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">2. Propriedade Intelectual</h2>
          <p>
            Todo o conteúdo disponível (textos, imagens, PDFs e design) é propriedade exclusiva da S.Art.
          </p>
          <p>
            É estritamente proibida a reprodução, distribuição ou revenda dos ficheiros PDF sem autorização prévia.
          </p>
          <p>
            O acesso ao conteúdo é pessoal e intransmissível.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">3. Política de Pagamentos e Preços</h2>
          <p>
            Os pagamentos são processados de forma segura via Stripe.
          </p>
          <p>
            A S.Art não armazena dados de cartões de crédito nos seus servidores.
          </p>
          <p>
            Os preços podem ser alterados sem aviso prévio, mas compras já efetuadas não sofrerão ajustes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">4. Política de Reembolso e Garantia</h2>
          <p>
            Em conformidade com a legislação de produtos digitais:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-4">
            <li><strong>Prazo de Garantia:</strong> O utilizador tem 14 dias a partir da data da compra para solicitar o reembolso total, caso não esteja satisfeito.</li>
            <li><strong>Acesso após Reembolso:</strong> Assim que o reembolso é processado, o acesso ao livro na biblioteca digital é revogado imediatamente.</li>
            <li><strong>Condição de Download:</strong> Para proteger os direitos de autor, o ficheiro PDF para download só estará disponível após o período de 14 dias de garantia. Durante este período, a leitura será feita exclusivamente através do leitor online do site.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">5. Proteção de Dados (RGPD)</h2>
          <p>
            Respeitamos a tua privacidade. Os dados recolhidos (Nome e E-mail) servem apenas para:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-4 mb-4">
            <li>Gerir o teu acesso à biblioteca de produtos comprados.</li>
            <li>Enviar faturas de compra e atualizações de segurança.</li>
          </ul>
          <p>
            <strong>Partilha de Dados:</strong> Os teus dados não são vendidos a terceiros. Apenas são partilhados com a Stripe para fins de processamento de pagamento e com o Supabase para armazenamento seguro da tua conta.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">6. Segurança da Conta</h2>
          <p>
            O utilizador é responsável por manter a segurança da sua senha.
          </p>
          <p>
            Se detetarmos acessos suspeitos em massa a partir de localizações diferentes, a conta poderá ser suspensa temporariamente para investigação de fraude.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 font-serif dark:text-white">7. Limitação de Responsabilidade</h2>
          <p>
            A S.Art esforça-se por manter o site online 24/7, mas não se responsabiliza por interrupções técnicas temporárias ou problemas de ligação do lado do utilizador.
          </p>
        </section>

      </div>
    </div>
  );
}

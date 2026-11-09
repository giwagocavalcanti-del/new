# Como ligar os pedidos de verdade

O checkout, o acompanhamento, o painel da equipe e os emails estão prontos e testados com serviços simulados (`npm run test:e2e`). Para funcionarem no site, faltam as etapas abaixo, **nesta ordem**. Todas dependem de contas ou chaves suas.

## 1. Banco (Supabase, projeto `luxuswand`)

No SQL Editor do Supabase, rode, um de cada vez e nesta ordem:

1. `supabase/migrations/0002_confirmation_email.sql`
2. `supabase/migrations/0003_checkout_tracking_emails.sql`
3. `supabase/migrations/0005_confirmation_details.sql` (forma de pagamento e preço avulso de cada item, para o email de confirmação; não depende da 0004)

Só depois cole `SUPABASE_SECRET_KEY` na Vercel. Sem essas migrations, o checkout grava colunas que não existem e falha.

**Estoque (opcional):** só é controlado o produto que tiver uma linha em `stock_levels` (slug e quantidade). Sem linha, o produto não tem limite.

## 2. Pagamento (Stripe, modo de teste primeiro)

1. Cole `STRIPE_SECRET_KEY` (começa com `sk_test_`) na Vercel.
2. Em Developers → Webhooks, crie o endereço `https://SEU-DOMINIO/api/stripe/webhook`.
   - **Versão da API do endpoint:** `2026-09-30.endive`, a mesma que a biblioteca do Stripe usada na loja (versão 23.0.0). Os eventos chegam no formato da versão do endpoint.
   - **Eventos:**
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
     - `payment_intent.payment_failed`
     - `charge.refunded`
3. Cole o segredo do webhook (`whsec_…`) em `STRIPE_WEBHOOK_SECRET`.
4. Em Settings → Payment methods, ligue o SEPA Direct Debit se quiser aceitá-lo.
5. Teste no checkout, com validade futura e qualquer CVC (dados de teste da documentação do Stripe, conferidos em 06/11/2026):

   | Caso | Dado de teste | O que deve aparecer na loja |
   | --- | --- | --- |
   | Cartão aprovado | `4242 4242 4242 4242` | Pedido pago, email de confirmação, pedido no `/admin` |
   | Cartão recusado | `4000 0000 0000 0002` | Recusa registrada; a página de pagamento continua aberta |
   | Saldo insuficiente | `4000 0000 0000 9995` | Igual à recusa, com o motivo `insufficient_funds` |
   | Cartão com 3D Secure | `4000 0027 6000 3184` | Pede confirmação; depois de aprovar, pedido pago |
   | SEPA aprovado | IBAN `DE89370400440532013000` | Primeiro "em processamento", depois pago |
   | SEPA aprovado com atraso | IBAN `DE08370400440532013003` | "Em processamento" por uns 3 minutos, depois pago |
   | SEPA recusado | IBAN `DE62370400440532013001` | Primeiro "em processamento", depois recusado; nada é enviado |

O Stripe recomenda exatamente o que a loja faz: confirmar pelo webhook (obrigatório) e também pela página de resultado (para o cliente ver na hora), com uma função que pode rodar várias vezes, ao mesmo tempo, sem duplicar nada. A página de pagamento pode durar de 30 minutos a 24 horas; a loja usa 1 hora.

## 3. Emails (Resend)

1. Um domínio próprio verificado no Resend. O `luxuswand.vercel.app` não serve como remetente.
2. Cole `RESEND_API_KEY` e `EMAIL_FROM` na Vercel (exemplo: `bestellung@luxuswand.store`; o nome que o cliente vê como remetente é sempre o da loja, `site.name`, hoje LuxusWand).
3. Cole `CRON_SECRET`, para a nova tentativa diária dos emails que falharem.

## 4. Painel da equipe (`/admin`)

1. Em `ADMIN_ACCOUNTS`, coloque `nome:senha`, uma pessoa por par, separados por vírgula. Use senhas longas e aleatórias.
2. Opcional: `ADMIN_SESSION_SECRET`.
3. Depois de mudar essas variáveis, publique de novo, porque a tela de login lê a configuração na publicação.

## 5. Transportadora

- **Sem parceiro de entrega**, a equipe registra no painel a transportadora, o código, o link e a situação. O email de "despachado" sai sozinho quando o pedido fica despachado e tem código de rastreio.
- **Com parceiro**, ele segue `docs/delivery-partner-api.md`. Os emails de "saiu para entrega" e "entregue" só saem com aviso do parceiro, nunca por registro manual.

## 6. Endereço do site

`NEXT_PUBLIC_SITE_URL` precisa ser o endereço público. Os links dos emails usam esse valor.

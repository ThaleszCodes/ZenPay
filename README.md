# ZenPay

Aplicação de produtos digitais, checkout Pix, entrega protegida, vendas e saques. Backend em Neon PostgreSQL (São Paulo); processamento financeiro pela conta PAGGPAY individual do vendedor. Interface e API executam em Workers via Vinext.

## Começar

Entre com ChatGPT. Em Configurações, informe nome da loja, WhatsApp com DDI, ambiente e sua chave PAGGPAY. A chave é validada consultando transações, criptografada com AES-256-GCM e nunca retornada à interface. Crie um produto com preço, conteúdo de entrega e, opcionalmente, arquivo de até 8 MB. Copie seu checkout na aba Produtos.

Produtos, vendas e credenciais pertencem ao ID autenticado do vendedor. A API autoriza cada operação. O checkout é desenhado para compradores anônimos; liberar vendas externas exige audiência pública na hospedagem. A audiência privada inicial impede compradores externos e callbacks do provedor. O painel continua exigindo autenticação mesmo quando o Site for público.

## Entrega

A entrega é liberada na página após confirmação pela PAGGPAY, com acesso individual por token aleatório de 256 bits. Somente o hash do token é salvo. Recarregamentos do checkout recuperam a sessão no mesmo navegador. Links de entrega carregam o token no fragmento, não em logs da URL. O conteúdo é congelado no pedido para preservar o que foi vendido. Recuperar entrega gera novo token e revoga o anterior. Este MVP não envia e-mail nem mensagens automaticamente; WhatsApp é um link de suporte com o pedido preenchido.

## Pagamentos

API oficial: https://docs.paggpay.com/ (OpenAPI en, consultada em 2026-11-03).
- `POST /pix` com valor em centavos e preço recuperado do banco.
- Callback individual assinado HMAC-SHA256, verificado sobre o corpo original com tolerância de 5 minutos.
- Confirmação adicional via `GET /pix/{transaction_id}`, comparando ID e valor.
- Eventos deduplicados e polling de recuperação no checkout aberto.
- Pedidos usam request_key único. Timeouts não geram tentativa automática de outra cobrança; ficam sinalizados para conferência.
- Chave e ambiente são congelados no pedido para manter conciliação mesmo após troca da integração.
- Reembolso confirmado bloqueia novos acessos. Arquivos já baixados não podem ser revogados.

## Financeiro

Saldo vem de `GET /balance`. Saque usa `GET /balance/cash-out/context`, destino autorizado, PIN e 2FA quando exigido. Contas com destino livre usam resolução prévia; contas restritas usam o documento retornado pelo contexto. Tarifas são descontadas do valor solicitado. O PIN não é salvo. O UUID da solicitação é enviado à PAGGPAY como idempotency_key. Histórico local registra o retorno inicial, não promete liquidação; a confirmação final fica no painel PAGGPAY.

## Infraestrutura

Projeto Neon: `bitter-breeze-45429770`. Banco produtivo: `neondb`; QA: `zenpay_qa`. Schema versionado em `db/schema.sql`. Dados acessados pela API HTTP SQL do Neon, consultas parametrizadas.

Segredos da hospedagem:
- `DATABASE_URL`: conexão Neon, somente servidor.
- `ENCRYPTION_KEY`: 32 bytes em hexadecimal. Necessária para descriptografar as integrações e verificar callbacks. Não a substitua sem migração de credenciais.

Nenhuma chave PAGGPAY global é necessária. A hospedagem fornece os headers autenticados confiáveis; não execute a API publicamente fora dessa plataforma sem substituir a camada de autenticação.

## Verificação

- `node node_modules/typescript/bin/tsc --noEmit`
- `node /root/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs`
- `node tests/integration.mjs` aguarda JSON seguro no stdin contendo DATABASE_URL de QA e ENCRYPTION_KEY. Testa rotas e SQL real no banco de QA. Somente o provedor financeiro é simulado no limite HTTP; não movimenta dinheiro.

A aprovação de pagamento real e saque real depende de credencial individual, permissões, onboarding, limites e tarifas da conta PAGGPAY. Os limites mínimos não são assumidos pelo app. Testar uma cobrança baixa em sandbox e depois em produção antes de divulgar a oferta.

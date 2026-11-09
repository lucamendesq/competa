# Paridade visual React × Vue (2026-11)

Uma linha por imagem do baseline do Vue (`docs/qa/baseline-vue-2026-11/`, M0.1), comparada com a captura equivalente do React em `docs/qa/baseline-react-2026-11/` (mesma rota, viewport e estado). As comparações foram feitas ticket a ticket (detalhes no `migration-progress.md`).

**Resumo:** 117 imagens — 63 igual, 42 diferença aceitável, 12 não recapturado. **Nenhuma regressão aberta.**

Legenda: **igual** = mesmo layout, textos e estados; **diferença aceitável** = diferença explicada (dado do banco local, melhoria pedida em ticket ou artefato da captura do Vue); **não recapturado** = estado que o banco local não reproduz mais, coberto por teste.

| Imagem                                                     | Situação            | Observação                                                                                                         |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `404__desktop__inicial.png`                                | igual               |                                                                                                                    |
| `404__mobile__inicial.png`                                 | igual               |                                                                                                                    |
| `cadastro__desktop__passo-1.png`                           | igual               |                                                                                                                    |
| `cadastro__desktop__passo-2.png`                           | igual               |                                                                                                                    |
| `cadastro__mobile__passo-1.png`                            | igual               |                                                                                                                    |
| `cadastro__mobile__passo-2.png`                            | igual               |                                                                                                                    |
| `competencias-id-pendencias__desktop__com-dados.png`       | igual               |                                                                                                                    |
| `competencias-id-pendencias__desktop__filtro-contador.png` | igual               |                                                                                                                    |
| `competencias-id-pendencias__mobile__com-dados.png`        | igual               |                                                                                                                    |
| `competencias-id-pendencias__mobile__filtro-contador.png`  | igual               |                                                                                                                    |
| `competencias__desktop__com-dados.png`                     | igual               |                                                                                                                    |
| `competencias__desktop__modal-abertura.png`                | diferença aceitável | o banco local ganhou duas Empresas sem template, então a prévia lista mais nomes (M2.3)                            |
| `competencias__desktop__vazio.png`                         | igual               |                                                                                                                    |
| `competencias__mobile__com-dados.png`                      | igual               |                                                                                                                    |
| `competencias__mobile__menu-aberto.png`                    | igual               |                                                                                                                    |
| `competencias__mobile__modal-abertura.png`                 | diferença aceitável | o banco local ganhou duas Empresas sem template, então a prévia lista mais nomes (M2.3)                            |
| `competencias__mobile__vazio.png`                          | igual               |                                                                                                                    |
| `configuracoes-contabilidade__desktop__dono.png`           | igual               |                                                                                                                    |
| `configuracoes-contabilidade__desktop__membro.png`         | igual               |                                                                                                                    |
| `configuracoes-contabilidade__mobile__dono.png`            | igual               |                                                                                                                    |
| `configuracoes-contabilidade__mobile__membro.png`          | igual               |                                                                                                                    |
| `configuracoes-contadores__desktop__convite-pendente.png`  | diferença aceitável | o convite do baseline já foi aceito no banco local; o estado pendente está no teste (M7.2)                         |
| `configuracoes-contadores__desktop__form-convite.png`      | diferença aceitável | o convite do baseline já foi aceito no banco local; o estado pendente está no teste (M7.2)                         |
| `configuracoes-contadores__mobile__convite-pendente.png`   | diferença aceitável | o convite do baseline já foi aceito no banco local; o estado pendente está no teste (M7.2)                         |
| `configuracoes-contadores__mobile__form-convite.png`       | diferença aceitável | o convite do baseline já foi aceito no banco local; o estado pendente está no teste (M7.2)                         |
| `configuracoes-plano__desktop__membro.png`                 | diferença aceitável | texto do CNPJ ganhou link para as configurações da Contabilidade (M7.4)                                            |
| `configuracoes-plano__desktop__plano-essencial.png`        | não recapturado     | banco local todo em trial; "Plano atual"/ativa coberto por MSW em plan-page.spec.tsx (M7.4)                        |
| `configuracoes-plano__desktop__trial.png`                  | diferença aceitável | texto do CNPJ ganhou link para as configurações da Contabilidade (M7.4)                                            |
| `configuracoes-plano__mobile__membro.png`                  | diferença aceitável | texto do CNPJ ganhou link para as configurações da Contabilidade (M7.4)                                            |
| `configuracoes-plano__mobile__plano-essencial.png`         | não recapturado     | banco local todo em trial; "Plano atual"/ativa coberto por MSW em plan-page.spec.tsx (M7.4)                        |
| `configuracoes-plano__mobile__trial.png`                   | diferença aceitável | texto do CNPJ ganhou link para as configurações da Contabilidade (M7.4)                                            |
| `configuracoes-whatsapp__desktop__dono.png`                | igual               |                                                                                                                    |
| `configuracoes-whatsapp__desktop__membro.png`              | igual               |                                                                                                                    |
| `configuracoes-whatsapp__mobile__dono.png`                 | igual               |                                                                                                                    |
| `configuracoes-whatsapp__mobile__membro.png`               | igual               |                                                                                                                    |
| `convite-token__desktop__contador.png`                     | igual               |                                                                                                                    |
| `convite-token__mobile__contador.png`                      | igual               |                                                                                                                    |
| `empresas-id-checklist__desktop__com-override.png`         | diferença aceitável | lupa do picker menor; menu marca "Empresas" nas subpáginas (M4.4)                                                  |
| `empresas-id-checklist__desktop__picker-aberto.png`        | diferença aceitável | lupa do picker menor; menu marca "Empresas" nas subpáginas (M4.4)                                                  |
| `empresas-id-checklist__mobile__com-override.png`          | diferença aceitável | lupa do picker menor; menu marca "Empresas" nas subpáginas (M4.4)                                                  |
| `empresas-id-checklist__mobile__picker-aberto.png`         | diferença aceitável | lupa do picker menor; menu marca "Empresas" nas subpáginas (M4.4)                                                  |
| `empresas-id-editar__desktop__dois-responsaveis.png`       | igual               |                                                                                                                    |
| `empresas-id-editar__mobile__dois-responsaveis.png`        | igual               |                                                                                                                    |
| `empresas-importar__desktop__inicial.png`                  | igual               | só "você já tem N" muda, vem do banco (M4.5)                                                                       |
| `empresas-importar__desktop__previa-com-erro.png`          | igual               | só "você já tem N" muda, vem do banco (M4.5)                                                                       |
| `empresas-importar__desktop__relatorio.png`                | não recapturado     | confirmar criaria outra Empresa no banco de baseline; confirmação coberta em import-companies-page.spec.tsx (M4.5) |
| `empresas-importar__mobile__inicial.png`                   | igual               | só "você já tem N" muda, vem do banco (M4.5)                                                                       |
| `empresas-importar__mobile__previa-com-erro.png`           | igual               | só "você já tem N" muda, vem do banco (M4.5)                                                                       |
| `empresas-importar__mobile__relatorio.png`                 | não recapturado     | confirmar criaria outra Empresa no banco de baseline; confirmação coberta em import-companies-page.spec.tsx (M4.5) |
| `empresas-nova__desktop__inicial.png`                      | igual               |                                                                                                                    |
| `empresas-nova__mobile__inicial.png`                       | igual               |                                                                                                                    |
| `empresas__desktop__com-dados.png`                         | diferença aceitável | banco local tem duas Empresas a mais criadas em capturas anteriores (M4.2)                                         |
| `empresas__desktop__com-selecao.png`                       | diferença aceitável | banco local tem duas Empresas a mais criadas em capturas anteriores (M4.2)                                         |
| `empresas__desktop__inativas.png`                          | diferença aceitável | banco local tem duas Empresas a mais criadas em capturas anteriores (M4.2)                                         |
| `empresas__desktop__vazio.png`                             | não recapturado     | banco local tem Empresas; vazio coberto em companies-list-page.spec.tsx (M4.2)                                     |
| `empresas__mobile__com-dados.png`                          | diferença aceitável | banco local tem duas Empresas a mais criadas em capturas anteriores (M4.2)                                         |
| `empresas__mobile__com-selecao.png`                        | diferença aceitável | banco local tem duas Empresas a mais criadas em capturas anteriores (M4.2)                                         |
| `empresas__mobile__inativas.png`                           | diferença aceitável | banco local tem duas Empresas a mais criadas em capturas anteriores (M4.2)                                         |
| `empresas__mobile__vazio.png`                              | não recapturado     | banco local tem Empresas; vazio coberto em companies-list-page.spec.tsx (M4.2)                                     |
| `entrar__desktop__inicial.png`                             | igual               |                                                                                                                    |
| `entrar__mobile__inicial.png`                              | igual               |                                                                                                                    |
| `envio-token-invalido__desktop__invalido.png`              | igual               |                                                                                                                    |
| `envio-token-invalido__mobile__invalido.png`               | igual               |                                                                                                                    |
| `envio-token__desktop__com-pendencias.png`                 | diferença aceitável | a Responsável já tem acesso e há três extras no banco local (M8.3)                                                 |
| `envio-token__desktop__com-rejeicao.png`                   | diferença aceitável | a Responsável já tem acesso e há três extras no banco local (M8.3)                                                 |
| `envio-token__desktop__sucesso-ofertas.png`                | não recapturado     | exige todos os itens enviados; coberto em upload-page.spec.tsx e public-upload-flow.spec.tsx (M8.3/M10.1)          |
| `envio-token__mobile__com-pendencias.png`                  | diferença aceitável | a Responsável já tem acesso e há três extras no banco local (M8.3)                                                 |
| `envio-token__mobile__com-rejeicao.png`                    | diferença aceitável | a Responsável já tem acesso e há três extras no banco local (M8.3)                                                 |
| `envio-token__mobile__sucesso-ofertas.png`                 | não recapturado     | exige todos os itens enviados; coberto em upload-page.spec.tsx e public-upload-flow.spec.tsx (M8.3/M10.1)          |
| `esqueci-senha__desktop__enviado.png`                      | igual               |                                                                                                                    |
| `esqueci-senha__desktop__inicial.png`                      | igual               |                                                                                                                    |
| `esqueci-senha__mobile__enviado.png`                       | igual               |                                                                                                                    |
| `esqueci-senha__mobile__inicial.png`                       | igual               |                                                                                                                    |
| `mensagens__desktop__com-filtro.png`                       | diferença aceitável | ícone da pílula de status em size-3; no Vue o SVG saía maior (M6.1)                                                |
| `mensagens__desktop__linha-com-erro.png`                   | diferença aceitável | ícone da pílula de status em size-3; no Vue o SVG saía maior (M6.1)                                                |
| `mensagens__desktop__sem-filtro.png`                       | diferença aceitável | ícone da pílula de status em size-3; no Vue o SVG saía maior (M6.1)                                                |
| `mensagens__mobile__com-filtro.png`                        | diferença aceitável | ícone da pílula de status em size-3; no Vue o SVG saía maior (M6.1)                                                |
| `mensagens__mobile__linha-com-erro.png`                    | diferença aceitável | ícone da pílula de status em size-3; no Vue o SVG saía maior (M6.1)                                                |
| `mensagens__mobile__sem-filtro.png`                        | diferença aceitável | ícone da pílula de status em size-3; no Vue o SVG saía maior (M6.1)                                                |
| `minha-area-acesso__desktop__inicial.png`                  | diferença aceitável | toast estilizado no React; no Vue saía sem estilo no rodapé (M9.2)                                                 |
| `minha-area-acesso__desktop__link-enviado.png`             | diferença aceitável | toast estilizado no React; no Vue saía sem estilo no rodapé (M9.2)                                                 |
| `minha-area-acesso__mobile__inicial.png`                   | diferença aceitável | toast estilizado no React; no Vue saía sem estilo no rodapé (M9.2)                                                 |
| `minha-area-acesso__mobile__link-enviado.png`              | diferença aceitável | toast estilizado no React; no Vue saía sem estilo no rodapé (M9.2)                                                 |
| `minha-area-competencias__desktop__lista.png`              | igual               |                                                                                                                    |
| `minha-area-competencias__desktop__periodo-expandido.png`  | igual               |                                                                                                                    |
| `minha-area-competencias__desktop__preview-aberto.png`     | não recapturado     | o Vue abre o documento em nova aba; a página capturada é igual à "periodo-expandido" (M9.4)                        |
| `minha-area-competencias__mobile__lista.png`               | igual               |                                                                                                                    |
| `minha-area-competencias__mobile__periodo-expandido.png`   | igual               |                                                                                                                    |
| `minha-area-competencias__mobile__preview-aberto.png`      | não recapturado     | o Vue abre o documento em nova aba; a página capturada é igual à "periodo-expandido" (M9.4)                        |
| `minha-area-definir-senha__desktop__inicial.png`           | diferença aceitável | a captura React tem sessão e mostra o cabeçalho da Minha Área; o baseline Vue foi tirado sem sessão (M9.2)         |
| `minha-area-definir-senha__mobile__inicial.png`            | diferença aceitável | a captura React tem sessão e mostra o cabeçalho da Minha Área; o baseline Vue foi tirado sem sessão (M9.2)         |
| `minha-area-pendencias__desktop__com-pendencias.png`       | igual               |                                                                                                                    |
| `minha-area-pendencias__mobile__com-pendencias.png`        | igual               |                                                                                                                    |
| `perdi-meu-link-confirmar__desktop__inicial.png`           | igual               |                                                                                                                    |
| `perdi-meu-link-confirmar__mobile__inicial.png`            | igual               |                                                                                                                    |
| `perdi-meu-link__desktop__enviado.png`                     | diferença aceitável | o "enviado" do Vue saiu no meio do envio; o React mostra o estado final (M9.5)                                     |
| `perdi-meu-link__desktop__inicial.png`                     | diferença aceitável | o "enviado" do Vue saiu no meio do envio; o React mostra o estado final (M9.5)                                     |
| `perdi-meu-link__mobile__enviado.png`                      | diferença aceitável | o "enviado" do Vue saiu no meio do envio; o React mostra o estado final (M9.5)                                     |
| `perdi-meu-link__mobile__inicial.png`                      | diferença aceitável | o "enviado" do Vue saiu no meio do envio; o React mostra o estado final (M9.5)                                     |
| `privacidade__desktop__inicial.png`                        | igual               |                                                                                                                    |
| `privacidade__mobile__inicial.png`                         | igual               |                                                                                                                    |
| `redefinir-senha__desktop__invalido.png`                   | igual               |                                                                                                                    |
| `redefinir-senha__mobile__invalido.png`                    | igual               |                                                                                                                    |
| `solicitacoes-id__desktop__com-pendentes.png`              | não recapturado     | a cena local já está depois da revisão; estado coberto em request-review-page.spec.tsx (M3.1)                      |
| `solicitacoes-id__desktop__com-rejeicao.png`               | diferença aceitável | o banco local tem 3 extras, dois enviados durante a captura do baseline (M3.1)                                     |
| `solicitacoes-id__mobile__com-pendentes.png`               | não recapturado     | a cena local já está depois da revisão; estado coberto em request-review-page.spec.tsx (M3.1)                      |
| `solicitacoes-id__mobile__com-rejeicao.png`                | diferença aceitável | o banco local tem 3 extras, dois enviados durante a captura do baseline (M3.1)                                     |
| `templates-id__desktop__derivado-em-edicao.png`            | igual               |                                                                                                                    |
| `templates-id__desktop__dialogo-sair.png`                  | igual               |                                                                                                                    |
| `templates-id__desktop__produto.png`                       | igual               |                                                                                                                    |
| `templates-id__mobile__derivado-em-edicao.png`             | igual               |                                                                                                                    |
| `templates-id__mobile__dialogo-sair.png`                   | igual               |                                                                                                                    |
| `templates-id__mobile__produto.png`                        | igual               |                                                                                                                    |
| `templates__desktop__com-dados.png`                        | igual               |                                                                                                                    |
| `templates__mobile__com-dados.png`                         | igual               |                                                                                                                    |
| `termos__desktop__inicial.png`                             | igual               |                                                                                                                    |
| `termos__mobile__inicial.png`                              | igual               |                                                                                                                    |

## Capturas só do React

- `competencias__*__{layout,menu}.png`: o layout do painel (M2.1), sem par direto no baseline do Vue (o Vue tem `competencias__*__menu.png` com dados).
- `perdi-meu-link-confirmar__*__sem-token.png`: estado "Link inválido" (M9.5).
- `ui__*__{galeria,dialogo,modal,sheet}.png`: galeria `/__ui` dos primitivos (M0.7).

## Acessibilidade (axe-core 4.14, WCAG 2.0/2.1 A e AA + best-practice)

Rodado com Playwright em 34 rotas × 2 viewports (visitante, dono, membro e Responsável), injetando `axe-core` e checando também um `h1` por página. Resultado final em `docs/qa/axe-react-2026-11.json`.

- **Primeira rodada:** 20 violações _serious_ (contraste de cor em 9 rotas e região rolável sem foco no plano) e moderadas de `region`, `heading-order` e `empty-table-header`.
- **Correções:** `--muted-foreground` #64748b → #5f6e82 e `--primary` #b45309 → #a84b08 (texto sobre os fundos claros e as faixas âmbar a 10% passa de 4,2–4,4:1 para ≥ 4,75:1); pílulas "Sem Responsável"/"App" e o resultado da importação usam `text-*-foreground`; a tabela comparativa de planos virou região focável com nome e o cabeçalho vazio ganhou texto para leitor de tela; títulos dos cartões de WhatsApp/Plano são `h2` (o `CardTitle` ganhou `level`); o painel lateral do login/cadastro é `aside` rotulado; a barra do topo do painel no celular é `header`.
- **Rodada final:** **0 violações** em todas as rotas e viewports; todas as páginas com exatamente um `h1`.
- `check:wcag` ganhou os pares novos (primário sobre âmbar 10%, secundário sobre muted, sucesso sobre superfície de sucesso) e passa; `check:no-diamond` passa.

## Nota sobre os tokens de cor

As correções de contraste do M10.2 escurecem um pouco `--primary` e `--muted-foreground`. As capturas anteriores ao M10.2 usam os tons antigos (iguais ao Vue); `competencias__{desktop,mobile}__com-dados.png` foi recapturada com os tons novos. A diferença é de um degrau de tom e não muda layout nem texto. Se a marca preferir manter o âmbar #b45309 nos botões, a alternativa é um token só para texto sobre faixas âmbar (`--primary-ink`), aplicado nas pílulas e abas.

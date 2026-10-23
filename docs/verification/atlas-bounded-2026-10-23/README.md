# REA por blocos verificáveis — Atlas — 23/10/2026

Implementação testada: `9ad7946dd4c4c997216c7276a07e9cb212d5110d`. [Execução real no Ubuntu](https://github.com/guilhermebelo0804-cmd/rea/actions/runs/39989859020). [PR incremental #2](https://github.com/guilhermebelo0804-cmd/rea/pull/2), dependente do diagnóstico seguro de processos do PR #1. Main e produção preservadas.

## Entrega executada

- 10 comandos reais `analyze-javascript-application`, todos com um statement não vazio efetivamente analisado, zero falhas de parse e sem esgotar memória. Cada worker permaneceu limitado a 512 MiB e 30 segundos.
- 10 comandos reais `inspect-analysis-view` leram os resultados já salvos, sem repetir análise. A projeção de rotas retornou **zero itens reconhecidos** nos recortes. Isso não prova ausência de APIs: os wrappers Axios/minificados e o contexto externo permanecem parcialmente desconhecidos.
- Segunda passagem comprovou checkpoints: **10 reutilizações verificadas, zero novas análises**. Identidade inclui commit REA, hash do código do planejador/runner/lockfile, hashes do original e do recorte, intervalo original e opções de recursos. O digest da projeção e do resumo também é verificado.
- Sete regressões do particionador e 19 testes de processo/parser passaram no runner. Verificações locais de sintaxe, formatação, Python e lint focal também passaram.
- Seis páginas oficiais e seis assets de mesma origem foram obtidos com HTTP 200, sem credenciais, sessões ou chamadas a APIs de negócio. A escolha e suas lacunas estão em `platforms.json`.

## Como os blocos preservam a evidência

O Babel lê o bundle como texto inerte. A seleção usa **statements completos do nível superior do AST**, limitados a 30.000 bytes; nunca corta strings, declarações ou funções em posições arbitrárias. Semicolons vazios são excluídos. Famílias explícitas de sinais priorizam geometria, análise de área, tiles, filtros de empresas, qualidade de coordenadas e indicadores, antes de preencher o orçamento com outros statements relevantes.

Cada recorte registra SHA-256 do original e dos bytes selecionados, offsets UTF16 e em bytes, linha/coluna e tipo AST. UTF8 inválido é rejeitado e BOM é preservado. São mantidos o inventário de statements, os motivos de exclusão e o orçamento de seleção. O statement do fornecedor cartográfico com mais de 1 MiB e a função de mapa de cerca de 90 KiB continuam excluídos integralmente.

**Limite fundamental:** um statement analisado isoladamente não tem seus imports, contexto lexical, globais ou diretivas reconstruídos. O recorte não é um módulo executável equivalente nem reconstitui a aplicação completa. Os programas capturados nunca foram executados. O mapeamento dos offsets do recorte para o original exige somar o início UTF16 registrado; os offsets em bytes são registrados separadamente, sem confundir caracteres com bytes.

## Resultados por statement

Colunas AST contam nós visitados pelo REA. Intervalos UTF16 são início incluso/fim exclusivo no arquivo original. O hash e os intervalos em bytes constam no JSON bruto e no inventário.

| Superfície | Statement |  Bytes | Intervalo UTF16 original | Nós AST | Evidence pai                                                          |
| ---------- | --------: | -----: | ------------------------ | ------: | --------------------------------------------------------------------- |
| spacedata  |       501 | 26,869 | 1762238–1789031          |   7,188 | `ev_612b93cd13a0b93d31f1709c1c6e04c76d5f8b89085798217ea7051b0c5cfb43` |
| spacedata  |       351 |    539 | 450138–450677            |     139 | `ev_89ccc466a2433252974fb9d415f3fa33b18f376b972f93a882cc05810f0b1016` |
| spacedata  |       261 | 13,460 | 271214–284674            |   3,555 | `ev_108a552df20223e45df56332f245f324116977c53b8136f00f0a8f915e938a55` |
| spacedata  |       595 | 15,803 | 2091361–2107131          |   3,718 | `ev_70a9ee2cbe657301620ab428975d4ac713d1a2f38117d31337c7f6a1f29e4d07` |
| spacedata  |       479 | 17,421 | 1716355–1733753          |   4,473 | `ev_2c313ef21f7d3dd9004682afacf1b908218656fcddfa0157b48f4cbd8abf3cd6` |
| spacedata  |       546 |  7,477 | 1956894–1964338          |   1,977 | `ev_1aa0e75216621228ee9d6eeeca81676a866edf7c2409a76820f2e0ae36dada52` |
| eyeonfit   |         2 | 27,796 | 285–28081                |   9,034 | `ev_2fd1ed6e9ae7cf66e36722b6c3ae6671ae736b3c01ef3ad5507f21a2c85bae64` |
| eyeonfit   |         1 |    283 | 1–284                    |      64 | `ev_9a6e20a32f2f577cbbae746aeb16ea584f616955b456f7bbee6c955ccb01351a` |
| eyeonfit   |         1 |    283 | 1–284                    |      64 | `ev_9051cb615998c04cfaf35940dbce97dbe88af9108453db6bb5066bcab694b779` |
| economapas |         1 |  1,026 | 876–1902                 |     113 | `ev_8e76805b0c7dc2a9a47701acd922ea26f03aab4221628bd5f25622e8aa74624c` |

No Space Data: **6 de 654 statements**, **81,569 bytes**, aproximadamente **3.67% dos bytes** do bundle foram selecionados. Isso é cobertura de seleção, não cobertura funcional, de testes ou da metodologia do produto.

## Comparação técnica e limites por plataforma

| Plataforma / superfície oficial          | Observado nesta execução                                                                                                                                                            | O que continua desconhecido                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Space Data, entrada pública da aplicação | Seis statements reais analisados, incluindo wrappers de análise/empresas, formulários de círculo/polígono, tiles e relatórios; metadados de origem preservados.                     | Comportamento do servidor, autenticação, cobertura dos dados, pesos, calibração, definição das métricas e método de consumo. |
| EyeOnFit, página pública do produto      | Três statements de assets Next públicos analisados; um com 27.796 bytes e outros dois helpers de 283 bytes. São amostras do frontend público, sem comprovar o algoritmo do produto. | FDI, pesos, treinamento/calibração de demanda, dados licenciados e aplicação autenticada.                                    |
| Economapas, helper público de impressão  | Um statement completo de 1.026 bytes analisado; o script original público tem 1.907 bytes. A execução anterior já analisou o script inteiro selecionado.                            | Método geográfico/socioeconômico e backend. Uma rotina de impressão não revela essas metodologias.                           |
| Geofusion, site institucional            | Página e um jQuery publicado pelo site obtidos e identificados por hash. O statement do asset ultrapassou o limite e não foi fragmentado.                                           | O site institucional não estabelece o stack ou o método do OnMaps. Nenhum recorte de aplicação OnMaps foi analisado.         |
| Nology, página institucional Economapas  | Página observada; nenhum script de mesma origem elegível no prefixo público e orçamento selecionados.                                                                               | Nenhuma conclusão nova sobre algoritmo, API ou stack da aplicação. Scripts externos não foram seguidos.                      |
| Space Hunters, consultoria institucional | Página observada; nenhum asset elegível de mesma origem selecionado. A análise do Space Data foi registrada separadamente.                                                          | O marketing não comprova arquitetura, pesos, metodologia ou equivalência com outras plataformas.                             |

As comparações acima descrevem evidências técnicas e lacunas. Não estabelecem que algum concorrente possui cobertura nacional completa nem que o Atlas reproduz seus modelos.

## Contratos: código identificado versus interface testada

- Objetos de círculo, polígono, perfis/minutos de isócronas e parâmetros de país/versão de tiles foram identificados no JavaScript público do Space Data; os statements associados foram submetidos ao REA quando selecionados. A fonte anterior e os hashes permanecem rastreáveis.
- **Nenhuma API de negócio do concorrente foi testada**, privada ou pública. URLs em código e chamadas estáticas não foram promovidas a endpoints acessíveis. Os testes HTTP desta rodada cobrem somente páginas e assets publicados.
- A projeção automática de rotas do REA não reconheceu esses wrappers como rotas. Os contratos identificados por leitura/AST continuam classificados como evidência estática, sem validação de respostas do servidor.
- O Atlas deve validar suas próprias interfaces e dados separadamente. Geometria, precisão de coordenadas, referência censitária, renda, POIs e classificação de academias exigem fontes autorizadas e testes próprios. Este trabalho não afirma implantação nacional nova no banco.

## O que mudou em relação à falha de memória

O bundle monolítico de 2.222.054 bytes havia esgotado workers de 1 GiB e 3 GiB. Nesta entrega ele **não foi reenviado integralmente** ao analisador semântico. O particionamento permitiu analisar os seis recortes escolhidos com 512 MiB por worker; imports/contexto e os bytes omitidos continuam explicitamente fora da cobertura.

Tempo somado dos seis comandos produtores Space Data: **19.720 s**; dos dez produtores: **35.788 s**. Os tempos não incluem captura, instalação, build ou projeção posterior. Não são comparação de desempenho em trabalho equivalente: o escopo agora é menor. CPU, tokens e pico real de memória da família de processos não foram medidos; 512 MiB é limite configurado, não medição.

## Preservação e operação

`results-executed.json` contém os resumos e projeções reais; `partitions.json`, os hashes e todos os intervalos/exclusões; `platforms.json`, a proveniência; os dois verdicts separam execução de reutilização. Nenhum bundle proprietário original está nos commits ou no artefato.

Artefato do run: ID `12517915412`, SHA-256 `fcd43deb5cb6422a74437992dc6a8d8046455693d0cdce30c81c2d756208c2fb`, retenção até 22/11/2026. Os JSONs e este relatório são preservados também no GitHub, sem depender dessa retenção ou do armazenamento da conversa. O runner pode retomar checkpoints íntegros restaurados no mesmo diretório; não foi configurado agendamento nem serviço pago.

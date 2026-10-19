# Lino Rua · Gestão de obras

Demonstração funcional para validar os fluxos na primeira reunião. Dados inteiramente fictícios.

## Abrir localmente

Com Node.js instalado, executar `node server.cjs` nesta pasta e abrir http://127.0.0.1:4173. Também é possível abrir `dist/index.html` diretamente; a persistência em URLs de ficheiro depende do navegador.

## Demonstração de 5 minutos · versão 0.2

1. Mostrar a visão geral e as obras em curso.
2. Em Equipa, adicionar um ajudante e um oficial com remuneração por dia ou por hora.
3. Em Registos de trabalho, registar dias ou horários, descontar a pausa e validar o registo.
4. Em Pagamentos à equipa, consultar o apuramento e registar um pagamento parcial ou adiantamento.
5. Filtrar o período e mostrar o saldo de abertura e de fecho. Se necessário, anular um movimento indicando o motivo.
6. No perfil Colaborador (João Martins), pedir uma correção de trabalho validado. No perfil Encarregado, aprovar a correção e mostrar a atualização.
7. Em Recebimentos, mostrar o controlo separado dos pagamentos dos clientes. Em Relatórios, exportar o trabalho do mês para CSV.

## Funções

Criar/editar/desativar funcionários; remuneração por hora ou dia; horas diárias de referência; criar/editar clientes e obras; registar dias e horários com pausas; validação/rejeição; pedidos de correção com preservação do original; pagamentos parciais e adiantamentos à equipa; anulação com motivo; transporte de saldos entre períodos; cobranças e recebimentos de clientes; relatórios mensais; dois mapas CSV; pesquisa e filtros; reposição de dados fictícios.

## Regras de apuramento

- Novos registos ficam por validar. Apenas registos validados entram nos apuramentos.
- Cada registo conserva a remuneração, categoria e horas de referência à data da sua criação. Alterar a ficha não recalcula o histórico.
- Valor à hora: minutos / 60 × valor horário. Valor diário: minutos / 60 / horas de referência × diária. Arredondamento ao cêntimo por registo, antes de somar.
- Abertura = trabalho validado anterior ao período − pagamentos anteriores. Fecho = abertura + apurado no período − pago no período.
- Pagamentos de trabalho não podem exceder o saldo validado na data escolhida. Adiantamentos podem originar um crédito a compensar em trabalho futuro.
- Pagamentos anulados permanecem no histórico e são excluídos de todos os saldos.
- O trabalhador simulado só vê João Martins; o encarregado valida trabalho sem consultar remunerações ou pagamentos; o administrador gere todos os dados. Estas restrições são de interface e não são segurança real.
- O original de um pedido de correção mantém-se validado até à decisão; uma correção aprovada guarda uma cópia do original.
- Os dados do protótipo anterior são migrados sem apagar as alterações guardadas no navegador. Valores históricos de trabalho da versão anterior são mantidos; registos anteriores são considerados validados.

## Limites desta versão

- Perfis simulados no navegador. Não existe autenticação nem proteção real de dados. Ocultar controlos na interface não implementa autorização de servidor.
- Persistência em localStorage apenas neste navegador/origem, sem sincronização, contas ou backups de servidor. Não introduzir dados reais.
- Os exemplos são de outubro de 2026. Trabalho e relatórios permitem escolher o mês; pagamentos à equipa permitem escolher um intervalo. A visão geral apresenta acumulados até hoje e os registos visíveis.
- Não existe salário mensal fixo, processamento salarial, impostos, encargos patronais, subsídios, regras de horas extra ou contabilidade. O valor apurado é remuneração de referência, sem representar o custo completo para a empresa.
- Horários referem-se ao mesmo dia; turnos que passam a meia-noite devem ser divididos. Não existe cronómetro, GPS ou sincronização offline.
- Cobranças e pagamentos são controlo interno introduzido manualmente; não emitem documentos fiscais. Sem integração de faturação.
- Obras, custos de mão de obra, cobranças e orçamentos são conceitos distintos. Não se apresenta lucro, pois não há registo de materiais e outros custos.

## Próxima fase

Validar utilizadores/permissões, unidade de remuneração, registo efetivo de trabalho, regras de pagamento, periodicidade de cobrança, software de faturação existente, migração de dados e propriedade/acesso ao sistema atual. Só depois implementar servidor, base de dados, autenticação real, autorização, auditoria e recuperação de dados.

## Verificação

`npm test` executa os sete testes de cálculo e migração com o runtime Node.js, sem dependências externas. Com o servidor local em execução e Chrome instalado, executar `npm install` e `npm run test:browser`. Os testes de navegador verificam validação, remuneração histórica, pagamentos parciais, adiantamentos, anulações, correções, perfis, exportação, migração da versão anterior e apresentação móvel. As capturas resultantes são locais e estão excluídas do Git.

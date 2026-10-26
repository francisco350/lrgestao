# Lino Rua — versão futura 0.13

Aplicação independente com contas próprias por utilizador e palavra-passe, SQLite persistente e autorização no servidor. Usa dados fictícios. O protótipo v0.2 continua preservado em `dist/prototipo/`.

## Executar

Requer Node.js 24 ou superior. O servidor não depende de pacotes externos.

1. Na pasta principal, executar `npm run future:seed` apenas na primeira utilização. Cria dados fictícios e quatro contas, com palavras-passe aleatórias mostradas uma vez na saída. Se já houver dados, recusa substituí-los.
2. Guardar os acessos mostrados. Não os incluir no Git nem em documentação pública.
3. Executar `npm run future:start`.
4. Abrir http://127.0.0.1:4174/app/ . A seleção local de versões está em http://127.0.0.1:4174/ .

Utilizadores fictícios: `lino` (administrador), `antonio` (encarregado), `joao` e `rui` (colaboradores em obras diferentes). Não há uma palavra-passe universal nem credenciais fixas no código. As quatro contas de demonstração já inicializadas não exigem troca imediata; novas contas criadas pelo administrador exigem alterar a palavra-passe provisória na primeira entrada.

O administrador pode criar contas, associá-las a funcionários, atribuir obras aos encarregados, desativar acessos e repor palavras-passe de outras contas. Cada funcionário só pode estar associado a uma conta. A última conta de administrador ativa é preservada.

## Perfis

| Perfil | Acesso |
| --- | --- |
| Administrador | Funcionários, remunerações, obras e equipas, contas, todo o trabalho, validação, pagamentos, anulações, histórico e exportação |
| Encarregado | Obras atribuídas, pessoas dessas obras, registo e validação de trabalho e correções; sem remunerações nem pagamentos |
| Colaborador | Obras a que está associado, os seus registos, pedidos de correção e os seus pagamentos |

As restrições são aplicadas pelo servidor em cada operação e resposta. O servidor não envia campos de remuneração para encarregados nem os registos de outros funcionários para colaboradores. Alterar cabeçalhos ou campos no navegador não altera o perfil da sessão.

## Dados e autenticação

- Base em `operacional/data/lino.sqlite`, excluída do Git. Dados da versão futura são independentes do localStorage do protótipo.
- Tabelas de contas, sessões, migrações, auditoria e limites de login. Os registos operacionais são guardados num documento SQLite transacional, com revisão global para detetar alterações concorrentes. Esta primeira implementação destina-se a uma empresa pequena, num único servidor; não tem ainda isolamento entre múltiplas empresas.
- Palavras-passe com scrypt, salt aleatório por conta e parâmetros N=32768, r=8, p=3. Verificação em tempo constante do resultado. Referência: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Tokens de sessão aleatórios, guardados no servidor apenas como SHA-256. Cookie HttpOnly e SameSite=Strict; Secure e prefixo `__Host-` em produção. Expiração absoluta de 8 horas e inatividade máxima de 1 hora.
- Proteção de escrita por origem exata, token CSRF, limite de tamanho de pedidos, limites persistentes de tentativas de login e limite de operações de hash simultâneas.
- Alterar palavra-passe, repor palavra-passe, desativar ou alterar uma conta revoga sessões. Não existe recuperação automática por email.
- Histórico de operações não guarda palavras-passe, tokens de sessão ou corpos dos pedidos.

## Regras de trabalho

O funcionário tem de estar ativo e associado à obra. O encarregado só atua nas obras atribuídas. Trabalho por dias ou horários com pausas; remuneração histórica por dia ou por hora; novos registos ficam por validar. Pedidos de correção mantêm o original válido até à decisão. Os registos validados geram os valores de referência; pagamentos e adiantamentos são distintos, com anulação rastreável. Um conflito de revisão devolve HTTP 409 em vez de substituir silenciosamente dados de outra sessão.

Não implementa salários mensais fixos, encargos, impostos, subsídios, regras de horas extra ou faturação fiscal. Os valores apurados não equivalem ao salário líquido ou custo total da empresa. Sem stock, notificações externas ou GPS nesta iteração.

## Clientes e recebimentos (0.4)

O administrador dispõe de fichas de clientes com nome, email, telefone, estado e periodicidade (semanal, mensal ou por fase). As obras referenciam estas fichas. As bases anteriores são normalizadas sem apagar dados: os nomes de clientes das obras originam fichas com identificadores estáveis, gravadas na próxima alteração. A periodicidade inicial é mensal e deve ser confirmada com o cliente; não é inferida do programa antigo.

Cada parcela a receber tem obra, cliente, descrição, valor e vencimento explícitos. A periodicidade não gera movimentos automaticamente. O valor acordado da obra também não cria parcelas. Recebimentos parciais são associados a uma parcela e não podem exceder o saldo nem ter data futura. Valores monetários têm até duas casas decimais. O painel identifica parcelas em aberto, vencidas, liquidadas e anuladas; os totais consideram todas as datas. Exportação de todas as parcelas em CSV, com proteção contra fórmulas nos campos de texto.

Anulações exigem motivo, conservam o movimento e identificam o autor. Uma parcela com recebimentos ativos não pode ser anulada; anular os recebimentos reabre o saldo. A mudança de cliente numa obra com parcelas ativas é bloqueada para preservar a associação financeira. Contas de encarregados e colaboradores não recebem fichas de clientes, parcelas ou recebimentos na API.

Dados novos de demonstração incluem uma parcela semanal de 1 500 €, com 500 € recebidos, e uma mensal de 2 400 €. Numa base da demonstração anterior, `node operacional/seed-receivables.cjs` acrescenta estes exemplos apenas se não existirem movimentos de clientes e se identificar as obras fictícias originais. Recusa substituir dados existentes. Faça primeiro uma cópia de segurança.

Estas funcionalidades são controlo interno; não emitem documentos fiscais, avisos automáticos, nem sincronizam bancos ou software de faturação.

## Materiais e despesas por obra (0.5)

Módulo exclusivo do administrador, com autorização aplicada na API. Encarregados e colaboradores não recebem movimentos nem resumos de custos. Cada movimento regista obra, data, descrição, fornecedor/prestador, referência textual do documento e observações. Materiais aceitam quantidade com até três casas decimais e unidades un, m, m², m³, kg, L, saco ou caixa. Despesas registam um valor final e categoria: transporte, aluguer, subcontratação, resíduos ou outras despesas.

O servidor calcula quantidade × custo unitário em cêntimos e milésimos, arredondando cada linha ao cêntimo. O valor enviado pelo navegador nunca substitui o cálculo. Datas futuras, obras inexistentes, valores inválidos e totais abaixo de 0,01 € ou acima de 10 milhões são rejeitados. Movimentos são imutáveis: para corrigir, anular com motivo e registar novamente. A anulação preserva o valor original, autor e data, mas exclui o custo dos totais.

O resumo por obra soma materiais, outras despesas e remuneração de referência de trabalho aprovado. Pendentes e rejeitados não contam. Pagamentos à equipa e recebimentos de clientes não entram neste custo, evitando dupla contagem. Os valores de materiais/despesas são finais (incluindo IVA quando aplicável), sem tratamento fiscal do IVA; a mão de obra não inclui encargos. O total é indicativo, não é lucro nem saldo financeiro. Subcontratação deve excluir trabalho já contabilizado em registos da equipa.

Filtros de obra aplicam-se ao resumo e aos movimentos; filtros de tipo e estado aplicam-se apenas aos movimentos e à sua exportação CSV. O resumo acumula todas as datas e exclui anulações. O CSV preserva valor original, custo ativo e motivo de anulação; campos de texto são protegidos contra interpretação como fórmulas.

Não inclui stock/armazém, encomendas, pagamentos a fornecedores, rateio de uma compra por várias obras ou OCR. A referência de um documento é texto; os ficheiros podem ser guardados na ficha da obra, ainda sem ligação direta a uma linha de custo. Os custos são reconhecidos ao registar, independentemente de pagamento.

Bases antigas recebem uma lista vazia de custos sem alterar os restantes dados. Para acrescentar exemplos apenas à demonstração original, executar `node operacional/seed-costs.cjs` depois de um backup. Recusa executar se houver custos ou se não reconhecer as três obras fictícias. Novas bases geradas por `seed.cjs` já incluem estes exemplos.

Verificação adicional: `node --test operacional/costs.test.cjs`, também incluída em `npm test`. Os testes de navegador incluem materiais, despesas, anulação, filtros, CSV e apresentação móvel. As bases dos testes são temporárias e independentes da demonstração local.

## Ficha da obra, filtros e pendências (0.6)

Cada obra tem um endereço próprio na aplicação (`#obra/<id>`) e uma ficha que reúne morada, contacto operacional, datas previstas, equipa, trabalho recente e notas. A morada e o contacto são campos operacionais partilhados com quem pode consultar a obra. O contacto não altera permissões: as obras atribuídas a encarregados continuam a ser configuradas nas contas. Datas previstas são opcionais; o fim não pode ser anterior ao início.

O administrador consulta também o valor acordado, parcelas, recebimentos, saldo das parcelas e custos indicativos. O valor acordado não é tratado como saldo a receber. Encarregados só consultam as obras atribuídas e não recebem os valores financeiros. Colaboradores consultam apenas a sua participação e trabalho nas obras a que estão associados. Uma ligação para uma obra fora do âmbito mostra “Obra indisponível”.

Administrador e encarregado podem acrescentar notas de acompanhamento nas obras autorizadas. As notas conservam autor e data e são partilhadas com os utilizadores com acesso à obra, incluindo colaboradores; não devem conter informação financeira ou pessoal sensível. São adições ao histórico, sem edição ou remoção nesta fase.

Atalhos na ficha abrem os formulários de trabalho, material e despesa com a obra selecionada. A lista de trabalho filtra por obra, funcionário, estado e intervalo de datas, com Aplicar, Limpar, Hoje e Esta semana (segunda-feira até hoje, em Lisboa). Os filtros de obra, funcionário e período também limitam os pedidos de correção pelo registo original; o estado filtra apenas os registos. São filtros da sessão do navegador, não persistidos após recarregar; a ficha da obra mantém a ligação direta.

O painel inicial mostra trabalho e correções pendentes, registos rejeitados e obras com fim previsto ultrapassado ainda não concluídas. Para o administrador, inclui parcelas vencidas e saldo positivo de remuneração validada por funcionário até hoje. Este saldo não implica que o pagamento esteja contratualmente vencido. Os atalhos abrem os módulos com os filtros correspondentes. Os dados continuam a atualizar-se através do botão Atualizar ou após gravação, sem notificações externas.

Para enriquecer apenas a demonstração anterior: `node operacional/seed-projects.cjs`. Verifica as três obras fictícias e acrescenta morada, contacto e datas apenas quando esses campos não existem. Não substitui campos já preenchidos ou deliberadamente limpos. Fazer backup antes. Novas bases fictícias já têm estes dados.

## Picar o ponto por obra (0.8)

Cada conta com um funcionário ativo associado pode iniciar trabalho numa obra da sua equipa, fazer pausas, retomar e terminar o turno com observação. A identidade vem da sessão e todas as horas são atribuídas pelo servidor. Apenas um turno aberto por funcionário, mesmo entre dispositivos. O turno persiste em SQLite após sair da aplicação, perder a sessão ou reiniciar o servidor. Cada picagem exige ligação ao servidor; não existe modo offline nem registo de localização.

A página **Picar o ponto** mostra o turno próprio e o histórico permitido ao perfil. Colaboradores veem apenas os seus turnos. Encarregados consultam e decidem os turnos das obras atribuídas; administradores acompanham toda a equipa. Um responsável pode fechar um turno esquecido à hora atual, com motivo, para depois confirmar ou rejeitar o horário. O funcionário pode terminar um turno aberto mesmo que entretanto seja retirado da obra. Novas entradas em obras concluídas são impedidas.

A saída coloca o turno **por validar**. A aprovação gera registos de trabalho e integra os custos de mão de obra e apuramentos já existentes. As pausas são excluídas; conta-se tempo real, incluindo mudanças de hora, repartido pelos dias do fuso Europe/Lisbon. Apenas minutos completos por dia entram no apuramento, sem arredondamento para cima. A remuneração é fixada à entrada. A validação deteta sobreposições com outros registos; um registo por dias na mesma data exige resolução prévia porque não tem horário comparável. Turnos superiores a 48 horas ou sem um minuto completo não podem ser aprovados: rejeitar e registar o horário correto manualmente. Não calcula horas extra automaticamente.

Cada turno conserva entradas, pausas, saídas, autor das operações, decisão e motivos. Registos provenientes de ponto validado não são editados diretamente: use os pedidos de correção abaixo. Alterações concorrentes devolvem conflito e atualizam os dados para nova confirmação, sem repetir automaticamente a picagem.

Testes específicos: identidade não falsificável pelo corpo do pedido, acesso por obra, turno único, CSRF, persistência de pausas após reinício, auditoria, desconto de pausas, remuneração histórica, aprovação sem duplicação, sobreposições, meia-noite e mudanças de hora. O teste de navegador cobre entrada/pausa/retoma/saída, recarregamento, decisão por outra sessão e apresentação a 390 px.

## Correções de picagens (0.9)

Na página **Picar o ponto**, o funcionário pode pedir uma correção dos seus turnos terminados (pendentes, rejeitados ou validados), com motivo obrigatório e proposta de 1 a 12 períodos de trabalho, até 48 horas. As pausas correspondem aos espaços entre períodos. Obra e funcionário mantêm-se. Um responsável pode também propor correções nas obras sob o seu acesso. Para um turno ainda aberto, terminar ou fechar primeiro o turno e depois propor o horário correto.

A interface compara o horário em vigor antes do pedido com a proposta. Datas e horas são interpretadas no servidor em Europe/Lisbon; não dependem do fuso do navegador. Não aceita trabalho futuro, períodos invertidos ou sobrepostos. Nas horas repetidas da mudança para hora de inverno, o formulário permite escolher explicitamente UTC+1 ou UTC+0; horas inexistentes são rejeitadas.

Só existe um pedido pendente por turno. Quem propõe pode cancelá-lo. Administradores e encarregados com acesso à obra podem aprovar ou recusar com motivo, mas não podem decidir o seu próprio pedido nem correções do seu próprio ponto. Um turno com correção pendente não pode ser validado/rejeitado pelo fluxo normal até à decisão ou ao cancelamento do pedido.

A aprovação valida todos os dias e sobreposições numa única transação. Mantém as picagens originais e o histórico de pedidos/decisões, marca os registos anteriores como substituídos e cria os novos registos validados. Os custos e apuramentos contam apenas a versão em vigor, com a remuneração fixada à entrada do turno. Os pagamentos efetuados permanecem intactos; uma redução de horas pode deixar crédito no saldo do funcionário. Recusas e cancelamentos não alteram o turno nem os totais. É possível pedir nova correção após uma decisão; compara-se sempre com a última versão em vigor.

Testes cobrem substituição sem duplicação, remuneração histórica, pagamentos preservados, separação de decisão, acesso por obra, pedidos repetidos, cancelamento, recusa, conflitos, sobreposições, aplicação atómica de vários dias, persistência após reinício, auditoria e horas ambíguas/inexistentes. O teste de navegador submete uma correção em formato móvel, compara e aprova noutra sessão, e confirma que uma segunda proposta recusada mantém o turno validado.

## Mapa semanal e mensal de horas (0.10)

A página **Mapa de horas** permite escolher uma semana (segunda a domingo) ou um mês completo, a partir de uma data de referência. Os filtros por funcionário e obra combinam-se e são aplicados pelo botão **Aplicar ao mapa**. Inclui navegação para o período anterior/seguinte/atual, resumo por funcionário e obra, grelha diária com deslocamento horizontal e lista dos registos incluídos. Filtros e período mantêm-se durante a sessão e são repostos ao trocar de utilizador.

Os totais distinguem trabalho validado de trabalho por validar. Incluem registos manuais por dias/horário e picagens terminadas; as picagens ainda pendentes são repartidas pelos dias de Lisboa, descontando pausas e usando minutos completos por dia. Picagens aprovadas contam apenas através dos registos de trabalho gerados, sem duplicação. Registos rejeitados ou substituídos por correção ficam excluídos. Uma correção pendente não soma as horas propostas: mantém-se o horário em vigor.

Turnos abertos, correções pendentes e turnos sem duração apurável (menos de um minuto completo, mais de 48 horas ou dados inválidos) são avisos separados, de acordo com o período e filtros. Não existe inferência de faltas nem cálculo de horas extra. Pessoas sem registos não acrescentam linhas ao resumo. Referências históricas sem nome atualmente disponível usam uma indicação de funcionário/obra anterior.

O cálculo e a exportação usam exclusivamente o estado já autorizado pelo servidor em `/api/state`: administrador vê toda a operação, encarregado apenas os registos das obras a seu cargo e colaborador apenas o próprio trabalho. O mapa e os CSV não incluem remunerações. O botão geral de atualização recarrega os dados; os mapas e exportações correspondem à última atualização, sem consultar uma segunda fonte nem mudar de filtros.

**Exportar resumo CSV** gera uma linha por funcionário/obra com minutos validados e pendentes e a apresentação HH:MM. **Exportar detalhe CSV** gera uma linha por registo/dia, com origem, estado e minutos. Ambos incluem datas do período e momento da consulta ao servidor, usam UTF-8 com BOM e separador ponto e vírgula, escapam aspas e neutralizam nomes que poderiam ser interpretados como fórmulas numa folha de cálculo. Um mapa vazio exporta apenas os cabeçalhos. Os avisos não são horas e não aparecem como trabalho nos CSV.

Testes verificam limites de semanas/meses, ano novo e fevereiro bissexto, meia-noite e mudanças de hora, filtros combinados, ausência de duplicação após correções, igualdade entre resumos/dias/detalhe, acesso por perfil, nomes históricos, mapas vazios e segurança do CSV. O navegador verifica os ficheiros descarregados, totais depois da aprovação de correções, filtros, navegação e apresentação móvel.

## Planeamento semanal da equipa (0.11)

**Planeamento semanal** apresenta as atribuições por dia, de segunda-feira a domingo, com filtros por obra, funcionário e estado. No telemóvel os dias surgem em sequência vertical. Administradores planeiam em todas as obras; encarregados apenas nas obras atribuídas. Colaboradores consultam exclusivamente as suas atribuições nas obras a que continuam associados e não podem criar, alterar ou cancelar.

Um responsável pode selecionar vários funcionários ativos da equipa e vários dias da semana numa única gravação (até 50 funcionários e 7 datas). Define entrada, saída, pausa em minutos e descrição do trabalho. Os horários são previstos para o mesmo dia, em Lisboa; o tempo previsto é a diferença entre entrada e saída, descontando a pausa. Não cria registos de trabalho, picagens, remunerações ou pagamentos e não altera os mapas de horas efetivamente registadas.

O servidor verifica disponibilidade no intervalo completo, incluindo a pausa, em todas as obras. Não permite horários sobrepostos para o mesmo funcionário, mesmo que o encarregado não tenha acesso à outra obra; a mensagem de conflito não revela a obra reservada. Horários adjacentes são permitidos. Toda a seleção é validada antes de gravar: um conflito impede a criação de todas as atribuições daquele pedido. A revisão global protege também de alterações concorrentes.

Cada atribuição pode ser editada individualmente ou cancelada com motivo. O cancelamento liberta o horário e conserva o registo; pode ser consultado com o filtro de estado. O histórico completo de criação, versões anteriores e cancelamento está disponível ao administrador em **Detalhes**. Os outros perfis recebem apenas a versão atual, datas e motivo do cancelamento, evitando expor dados de uma obra anterior após uma transferência.

A indicação **Rever equipa** assinala atribuições ativas quando o funcionário fica inativo, deixa a equipa da obra ou a obra é concluída. O responsável deve corrigir ou cancelar essas atribuições. As férias e indisponibilidades são geridas no módulo descrito abaixo. Não há recorrência automática, notificações externas ou confirmação de leitura. É possível consultar e corrigir planeamento de datas passadas; continua sempre identificado como previsto.

Os testes verificam atribuição em lote, validação de horários/pausas/datas, conflitos entre obras, ausência de gravações parciais, isolamento por perfil, revogação de acesso, histórico, cancelamento, persistência após reinício e ausência de efeitos nos custos e pagamentos. O navegador verifica criação para dois funcionários em dois dias, edição por encarregado, conflito, consulta pelo colaborador, cancelamento e apresentação móvel.

## Férias e indisponibilidades (0.12)

A página **Férias e indisponibilidades** regista períodos já confirmados para um funcionário ativo. Apenas o administrador pode criar, editar e cancelar. O colaborador consulta as suas próprias ausências, mesmo que deixe de estar associado a uma obra. O encarregado consulta a disponibilidade dos funcionários atualmente associados às suas obras: recebe datas, horários e estado, mas não o tipo, observações, autores, motivos de cancelamento ou versões anteriores. Retirar a associação à equipa retira esse acesso.

Existem dois tipos (férias e indisponibilidade) e duas durações: **dias completos**, com primeiro e último dia inclusivos, ou **intervalo de horas**, num único dia em Lisboa. Cada período pode ter até 366 dias; dias completos incluem fins de semana. Não se calculam direitos, saldos anuais de férias, dias úteis, feriados, faltas, subsídios ou efeitos salariais. As observações são breves e visíveis ao funcionário; não se destinam a informação clínica. Não há ainda pedidos de férias pelo colaborador nem circuito de aprovação: guardar ativa o registo.

O servidor impede sobreposições entre ausências ativas da mesma pessoa e bloqueia novos planeamentos e alterações de planeamento que colidam com elas, em qualquer obra. Os horários adjacentes são permitidos. A pausa de uma atribuição continua a fazer parte do seu intervalo reservado. Se existir trabalho planeado, a criação ou alteração da ausência falha e o administrador deve reagendar ou cancelar explicitamente essas atribuições antes de tentar novamente. Nenhuma atribuição é cancelada automaticamente. As validações usam a mesma transação e revisão global dos restantes módulos, impedindo gravações parciais e conflitos entre sessões.

Editar mantém a pessoa original e guarda a versão anterior no histórico reservado ao administrador. Para trocar de funcionário é necessário cancelar e criar outro registo. Cancelar exige motivo, preserva o histórico e liberta o período; também é possível cancelar ausências de funcionários entretanto inativos. Os motivos atuais são visíveis ao próprio funcionário. Os dados são acrescentados de forma compatível com bases anteriores, sem substituir a informação existente.

Os filtros de datas, funcionário e estado incluem registos que se sobrepõem ao período consultado. O calendário semanal mostra as ausências ativas em cartões distintos, segundo os filtros de funcionário e equipa da obra, independentemente do estado selecionado para o planeamento. Ausências não criam nem modificam picagens, registos de trabalho, remunerações, pagamentos ou totais do mapa de horas. A picagem continua disponível para registar o trabalho que efetivamente ocorreu.

Testes cobrem datas e intervalos, fronteiras inclusivas, horários adjacentes, conflitos nos dois sentidos, lotes atómicos, histórico, cancelamento, privacidade, revogação de acesso, revisões concorrentes, persistência após reinício, auditoria e ausência de efeitos financeiros. O navegador percorre criação, edição, consulta pelos três perfis, bloqueio de planeamento, cancelamento e libertação do horário, incluindo apresentação móvel.

## Fotografias e documentos (0.7)

A ficha de cada obra inclui anexos JPG, PNG e PDF até 5 MB. Administradores e encarregados carregam ficheiros; colaboradores consultam os anexos da equipa nas obras autorizadas. O administrador escolhe entre equipa e acesso exclusivo do administrador (predefinição). Encarregados apenas podem carregar para a equipa. A autorização é verificada na listagem, nos downloads e nas pré-visualizações; retirar a obra ou desativar a conta retira também o acesso aos ficheiros.

Cada anexo tem descrição, nome original, autor, data, tipo, tamanho e hash SHA-256. O servidor atribui um identificador aleatório ao ficheiro, valida extensão e assinatura do conteúdo e impõe quotas de 200 anexos/100 MB por obra e 1 GB por instalação, incluindo arquivados. PNG tem limite de dimensões; a validação de formatos não substitui análise antivírus. PDF é sempre descarregado como anexo, sem visualização embebida. Apenas JPG/PNG têm miniatura. Não suporta vídeos, HEIC, SVG, OCR ou partilha pública nesta versão.

O administrador pode arquivar com motivo e restaurar. Arquivar retira o anexo da equipa mas conserva o ficheiro e histórico. Não existe eliminação definitiva nem alteração de visibilidade de um ficheiro já carregado: arquivar e carregar com o acesso correto. O arquivo não recupera espaço em disco.

Ficheiros guardados junto da base, na pasta `<DATABASE_PATH>.files`, fora dos recursos públicos. Com a configuração local, ficam em `operacional/data/lino.sqlite.files`, excluídos do Git. Esta pasta tem de residir no mesmo disco persistente da base em produção. A API JSON de exportação inclui metadados, nunca os bytes dos anexos.

## Cópias de segurança e recuperação

`npm run future:backup` cria uma pasta em `operacional/backups/` com `lino.sqlite`, `lino.sqlite.files/` e `backup.json`. Faz snapshot SQLite com `VACUUM INTO`, lê os anexos referenciados nessa cópia, copia ativos e arquivados e verifica tamanho e SHA-256. Só escreve `backup.json` com `complete: true` depois de concluir; uma pasta sem esse manifesto está incompleta. Inclui contas, hashes e documentos reservados e deve ter acesso restrito. O teste de recuperação inicia a aplicação a partir de um backup e descarrega os mesmos anexos com os acessos originais.

Para recuperar: confirmar o manifesto completo, parar o servidor, conservar a base e anexos atuais, copiar toda a pasta de backup para uma localização nova e iniciar com `DATABASE_PATH` a apontar para o `lino.sqlite` dessa pasta. Manter `lino.sqlite.files` ao lado, com esse nome. Nunca substituir uma base em utilização. A exportação JSON da interface não inclui hashes, sessões ou conteúdo dos ficheiros e não substitui este backup. Backups SQLite anteriores à versão 0.7 continuam válidos para dados sem anexos.

## Controlo global da demonstração (0.13)

O prazo da demonstração aplica-se a toda a empresa, incluindo administradores e contas criadas pelo cliente. O proprietário do servidor gere o prazo através de `npm run future:trial -- estado` e dos comandos documentados em [Controlo da demonstração](../CONTROLO-DEMONSTRACAO.md). O administrador da empresa continua a criar funcionários e a gerir os seus acessos; essa permissão não permite gerir o prazo.

O controlo reside nas tabelas `trial_access` e `trial_events`, fora do documento de negócio e das exportações JSON. Não há operação HTTP que as altere. Suspender, alterar ou renovar o prazo invalida todas as sessões. Cada pedido à API é bloqueado se o período estiver expirado ou suspenso; a expiração não depende de um agendador. A interface verifica o estado a cada 15 segundos e ao retomar o separador. O bloqueio conserva todos os dados, incluindo turnos por terminar, que podem necessitar de correção quando o acesso for retomado.

Em produção, a ausência de configuração bloqueia o acesso até o proprietário ativar o período. Em desenvolvimento, bases antigas sem período configurado continuam disponíveis. Cada instalação tem uma única empresa: para outros clientes, usar instalações/bases separadas. A gestão remota por painel e o alojamento online não fazem parte desta entrega; os comandos executam-se no servidor que aloja a empresa.

## Publicação online

A versão futura ainda não está publicada online. O Sites atual continua a alojar o seletor e o protótipo, com acesso privado. A aplicação Node com contas próprias requer um servidor separado; não é colocado um login fictício sobre o protótipo.

Para disponibilizar à equipa:

1. Escolher um serviço Node.js 24 com disco persistente ou VPS. SQLite precisa de uma pasta persistente e de uma única instância de escrita nesta fase; um alojamento sem disco persistente não serve esta configuração.
2. Configurar domínio/subdomínio e proxy HTTPS, preservando o cabeçalho Host original.
3. Definir `NODE_ENV=production`, `APP_ORIGIN=https://<domínio>`, `DATABASE_PATH=<pasta-persistente>/lino.sqlite`, `HOST` e `PORT` conforme o servidor. A aplicação recusa produção com origem HTTP.
4. Criar uma base nova e contas próprias para o piloto, em vez de usar os acessos fictícios. Definir quem será administrador e o âmbito de cada encarregado. Ativar o período no servidor com `npm run future:trial -- iniciar 14` (ou renovar um período já configurado quando começar o teste).
5. Configurar backups automáticos fora do servidor, retenção, reinício do processo, monitorização e testar a recuperação. Nesta versão o comando de backup existe; ainda não há agendamento automático.
6. Executar os testes de acesso e um piloto antes de introduzir dados reais. A implementação não foi objeto de uma auditoria externa.

## Demonstração de agosto a outubro de 2026

`npm run future:demo:quarter` mostra uma previsão sem gravar. `npm run future:demo:quarter -- --apply` acrescenta o cenário à base de demonstração existente, depois de criar uma cópia completa em `operacional/backups/before-quarter-demo-*`. Preserva movimentos, contas e palavras-passe anteriores. Um marcador impede duplicação em execuções posteriores. O âmbito do encarregado António inclui também as novas obras da sua equipa. A atualização é atómica, incluindo essas associações.

O cenário tem data de referência fixa em **22/10/2026**, com trabalho efetivo apenas até essa data e planeamento até ao fim de outubro. Inclui quatro obras históricas concluídas, três obras originais em curso e uma obra planeada para 26–30 de outubro. As horas incluem registos manuais e picagens com pausa; algumas aguardam validação, há um registo rejeitado e um pedido de correção. Férias não geram horas nem remuneração. Agosto fica regularizado; setembro/outubro mostram pagamentos parciais, adiantamento, parcelas vencidas, pagamentos de clientes e custos por obra. Os valores são apenas fictícios para apresentação, sem documentos fiscais.

Percurso sugerido: **Obras** → abrir uma obra concluída → **Mapa de horas**, selecionar **Mensal** e datas 15/08/2026, 15/09/2026 e 15/10/2026 → **Pagamentos à equipa**, ajustar início/fim do período → **Materiais e despesas** e **Recebimentos** → **Planeamento semanal**, referência 22/10/2026 ou 28/10/2026 → **Férias e indisponibilidades**. Entrar também como João para mostrar a vista individual. Atualizar a página após carregar o cenário. O protótipo alojado no Sites tem dados independentes.

## Testes

Na raiz, `npm test` executa os testes do modelo e da API. `npm run future:test:browser` requer Playwright e um navegador instalado; usa Edge por defeito ou `BROWSER_CHANNEL=chrome`. Cria uma base temporária própria, quatro contas de teste e três contextos de navegador isolados. Os testes nunca alteram a base de demonstração.

São verificados acesso anónimo, credenciais, origem/CSRF, restrições de funcionário e obra, campos financeiros, tentativas de elevação de perfil, validação entre sessões, correções, conflitos, pagamentos, troca obrigatória de palavra-passe, revogação de sessões, persistência após reinício, cópia/restauro, exportação e navegação móvel.

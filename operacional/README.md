# Lino Rua — versão futura 0.3

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

Não implementa salários mensais fixos, encargos, impostos, subsídios, regras de horas extra ou faturação fiscal. Os valores apurados não equivalem ao salário líquido ou custo total da empresa. Sem stock, ficheiros anexos, notificações ou GPS nesta iteração.

## Cópias de segurança e recuperação

`npm run future:backup` cria uma cópia consistente SQLite com `VACUUM INTO`, em `operacional/backups/`, excluída do Git. A cópia inclui contas e hashes e deve ter acesso restrito. O teste de recuperação abre a cópia e verifica dados e contas.

Para recuperar manualmente: parar o servidor, conservar a base atual e os ficheiros WAL/SHM, copiar o backup para uma localização nova e iniciar com `DATABASE_PATH` a apontar para essa cópia. Nunca substituir uma base em utilização. A exportação JSON da interface inclui dados operacionais e metadados de contas, mas não hashes nem sessões; não substitui o backup SQLite completo.

## Publicação online

A versão futura ainda não está publicada online. O Sites atual continua a alojar o seletor e o protótipo, com acesso privado. A aplicação Node com contas próprias requer um servidor separado; não é colocado um login fictício sobre o protótipo.

Para disponibilizar à equipa:

1. Escolher um serviço Node.js 24 com disco persistente ou VPS. SQLite precisa de uma pasta persistente e de uma única instância de escrita nesta fase; um alojamento sem disco persistente não serve esta configuração.
2. Configurar domínio/subdomínio e proxy HTTPS, preservando o cabeçalho Host original.
3. Definir `NODE_ENV=production`, `APP_ORIGIN=https://<domínio>`, `DATABASE_PATH=<pasta-persistente>/lino.sqlite`, `HOST` e `PORT` conforme o servidor. A aplicação recusa produção com origem HTTP.
4. Criar uma base nova e contas próprias para o piloto, em vez de usar os acessos fictícios. Definir quem será administrador e o âmbito de cada encarregado.
5. Configurar backups automáticos fora do servidor, retenção, reinício do processo, monitorização e testar a recuperação. Nesta versão o comando de backup existe; ainda não há agendamento automático.
6. Executar os testes de acesso e um piloto antes de introduzir dados reais. A implementação não foi objeto de uma auditoria externa.

## Testes

Na raiz, `npm test` executa os testes do modelo e da API. `npm run future:test:browser` requer Playwright e um navegador instalado; usa Edge por defeito ou `BROWSER_CHANNEL=chrome`. Cria uma base temporária própria, quatro contas de teste e três contextos de navegador isolados. Os testes nunca alteram a base de demonstração.

São verificados acesso anónimo, credenciais, origem/CSRF, restrições de funcionário e obra, campos financeiros, tentativas de elevação de perfil, validação entre sessões, correções, conflitos, pagamentos, troca obrigatória de palavra-passe, revogação de sessões, persistência após reinício, cópia/restauro, exportação e navegação móvel.

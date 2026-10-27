# Controlo da demonstração — reservado ao proprietário do servidor

Na pasta `lino-gestao`, estes comandos gerem o acesso da empresa inteira. O Lino continua administrador da empresa e pode criar funcionários e contas, incluindo outros administradores. Nenhuma dessas contas pode alterar o prazo ou a suspensão. Não há endpoint HTTP de gestão do prazo, nem esta configuração é incluída na exportação de dados da empresa.

| Objetivo | Comando |
|---|---|
| Consultar estado e data de fim | `npm run future:trial -- estado` |
| Ativar pela primeira vez, por 14 dias | `npm run future:trial -- iniciar 14` |
| Alterar a duração total para 30 dias, desde a ativação original | `npm run future:trial -- dias 30` |
| Acrescentar 7 dias ao prazo atual | `npm run future:trial -- prolongar 7` |
| Cancelar/suspender o acesso imediatamente | `npm run future:trial -- cancelar` |
| Reativar um prazo ainda válido | `npm run future:trial -- reativar` |
| Abrir um novo período de 14 dias a partir de agora | `npm run future:trial -- renovar 14` |

`suspender` e `cancelar` fazem o mesmo: bloqueiam todos os utilizadores e preservam os dados. `dias` pode antecipar a expiração: se a duração total escolhida já tiver decorrido, a empresa fica bloqueada. `prolongar` acrescenta dias à data final, ou a agora se já expirou, mas mantém uma suspensão manual; nesse caso execute depois `reativar`. `renovar` começa um novo período e remove a suspensão. Aceitam-se inteiros de 1 a 3650 dias. Cada dia corresponde a 24 horas; o comando apresenta o fim em hora de Lisboa.

Todas as alterações invalidam as sessões anteriores, exigindo novo início de sessão. O servidor verifica o acesso em cada pedido, incluindo exportação, anexos e criação de utilizadores. A página aberta verifica também o estado a cada 15 segundos e ao voltar ao separador, para retirar a informação do ecrã quando o acesso termina. Uma página offline não pode ser apagada remotamente, e ficheiros já descarregados não são recuperados por este controlo.

Os comandos atuam na base local `operacional/data/lino.sqlite` por defeito. Quando a aplicação estiver alojada, execute-os **no servidor que aloja a demonstração**, com `DATABASE_PATH` a apontar para a base usada pelo servidor. Alterar a base do seu computador não altera uma demonstração alojada noutro servidor. O estado e o histórico do controlo ficam em tabelas separadas, incluídas no backup completo SQLite.

A plataforma suporta várias empresas, cada uma com base e período independentes. Use `npm run company -- listar` para consultar as bases e defina `DATABASE_PATH` com a base da empresa pretendida antes de executar estes comandos. Sem essa variável, os comandos atuam na empresa Lino Rua. Consulte [EMPRESAS.md](EMPRESAS.md). Em produção (`NODE_ENV=production`), uma base sem prazo configurado fica bloqueada até `iniciar`. Em desenvolvimento local, bases antigas sem configuração continuam a funcionar. O cliente recebe apenas o link e as credenciais da empresa; quem tiver controlo do alojamento ou dos ficheiros da base pode administrar este mecanismo.

Antes de disponibilizar online: configurar HTTPS e alojamento, proteger as credenciais do servidor, trocar os acessos fictícios simples e renovar o período para a duração acordada. A publicação online é uma etapa separada.

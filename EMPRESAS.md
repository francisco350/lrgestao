# Empresas e acessos — 0.14

`npm run dev` abre a aplicação em http://127.0.0.1:4174/ diretamente no login. O endereço `/app/` também funciona. O protótipo continua em `dist/prototipo/` e só é servido pelo comando separado `npm run prototype:start` (porta 4173).

## Empresa e utilizadores

Cada conta pertence a uma empresa. O nome de utilizador é único na plataforma; o login identifica automaticamente a empresa. Os funcionários entram com contas individuais e mantêm os perfis Administrador, Encarregado ou Colaborador. Não devem partilhar a conta de administração.

Na instalação local existente, o administrador Lino usa o utilizador `linorua`, preservando o seu identificador, histórico e dados. A palavra-passe inicial foi configurada diretamente na base local, sem a incluir no código ou redefinir a cada arranque. Em **Administração da empresa**, pode alterar o nome da empresa, o próprio utilizador (confirmando a palavra-passe atual) e a palavra-passe. Alterar credenciais termina as outras sessões dessa conta. As novas palavras-passe seguem a política existente de 12–128 caracteres.

**Utilizadores e acessos** permite ao administrador criar contas da sua empresa, associar funcionários e definir permissões. Um administrador de empresa não pode criar outras empresas ou controlar o prazo de teste.

## Criar outra empresa — proprietário do servidor

Com a empresa principal já inicializada, executar na raiz:

```powershell
npm run company -- listar
npm run company -- criar "Empresa Exemplo" empresa.exemplo 14
```

O segundo comando cria uma empresa vazia, uma conta de administrador e um período de 14 dias. Apresenta uma palavra-passe aleatória uma vez; entregar esse acesso apenas ao responsável. O servidor reconhece a nova empresa no pedido seguinte, sem reinício. Não existe registo público de empresas nem painel central de gestão nesta versão.

## Persistência e controlo

- `operacional/data/lino.sqlite`: empresa Lino Rua, incluindo os dados já existentes.
- `operacional/data/platform.sqlite`: registo de empresas e caminhos das suas bases.
- `operacional/data/companies/<id>/company.sqlite`: base de cada nova empresa.
- `<base>.files/`: anexos da respetiva empresa.

Cada base contém as suas contas, sessões, dados operacionais, auditoria e prazo. O identificador no cookie apenas encaminha o pedido: o token tem de ser válido nessa base para autorizar operações. Campos ou cabeçalhos enviados pelo cliente não escolhem outra empresa.

`DATABASE_PATH` define a base principal no servidor; `PLATFORM_PATH` permite escolher o registo central (por defeito, na mesma pasta da base principal). Use caminhos absolutos. O registo guarda caminhos absolutos: numa mudança de servidor, é necessário atualizar esses caminhos antes do arranque. Esta versão pressupõe um único processo de aplicação e disco persistente.

Para controlar o prazo de outra empresa, definir `DATABASE_PATH` **na sessão do comando de controlo** com a base listada por `company -- listar`, sem alterar o ambiente do servidor em execução. Depois seguir [CONTROLO-DEMONSTRACAO.md](CONTROLO-DEMONSTRACAO.md). Suspender uma empresa não suspende as restantes.

## Cópias de segurança

`npm run future:backup` copia apenas a base selecionada por `DATABASE_PATH` (Lino Rua por defeito) e os seus anexos. Para recuperar toda a plataforma, são necessários o registo central e uma cópia completa de cada empresa. Não copiar apenas o ficheiro SQLite enquanto há escritas: usar o comando de backup para cada empresa e guardar também o registo central com o servidor e comandos de gestão parados, ou usar uma ferramenta de backup SQLite consistente. Guardar as cópias fora do servidor e testar o restauro. O agendamento e a publicação online continuam a ser etapas separadas.

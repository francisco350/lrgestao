# Lino Rua · Gestão de obras

Demonstração funcional para validar os fluxos na primeira reunião. Dados inteiramente fictícios.

## Abrir localmente

Com Node.js instalado, executar `node server.cjs` nesta pasta e abrir http://127.0.0.1:4173. Também é possível abrir `dist/index.html` diretamente; a persistência em URLs de ficheiro depende do navegador.

## Demonstração de 5 minutos

1. Mostrar a visão geral e as obras em curso.
2. Em Equipa, adicionar um ajudante e um oficial com valores diários diferentes.
3. Em Registos de trabalho, registar um dia de trabalho para cada pessoa.
4. Em Relatórios, mostrar os custos diferentes e exportar CSV.
5. Em Pagamentos, alternar cobranças semanais/mensais e registar um recebimento parcial.
6. No topo, alternar para Encarregado e Colaborador para demonstrar vistas diferentes.

## Funções

Criar/editar/desativar funcionários; criar/editar clientes e obras; criar/editar registos de trabalho; guardar o valor diário histórico por registo; criar cobranças; registar recebimentos parciais; consultar relatórios; exportar CSV; pesquisar e filtrar; repor dados de exemplo.

## Limites desta versão

- Perfis simulados no navegador. Não existe autenticação nem proteção real de dados. Ocultar controlos na interface não implementa autorização de servidor.
- Persistência em localStorage apenas neste navegador/origem, sem sincronização, contas ou backups de servidor. Não introduzir dados reais.
- Os exemplos são de outubro de 2026; os totais abrangem todos os registos existentes, sem filtro temporal automático.
- Custos calculados em dias (inclui frações), a partir do valor diário histórico; não existe processamento salarial, impostos, horas extra ou contabilidade.
- Cobranças e pagamentos são controlo interno introduzido manualmente; não emitem documentos fiscais. Sem integração de faturação.
- Obras, custos de mão de obra, cobranças e orçamentos são conceitos distintos. Não se apresenta lucro, pois não há registo de materiais e outros custos.

## Próxima fase

Validar utilizadores/permissões, unidade de remuneração, registo efetivo de trabalho, regras de pagamento, periodicidade de cobrança, software de faturação existente, migração de dados e propriedade/acesso ao sistema atual. Só depois implementar servidor, base de dados, autenticação real, autorização, auditoria e recuperação de dados.

## Verificação

Com o servidor local em execução e Chrome instalado, executar `npm install` e `npm test`. Os testes abrem um navegador isolado, verificam os fluxos principais, reposição de dados, exportação e apresentação móvel. As capturas resultantes são locais e estão excluídas do Git.

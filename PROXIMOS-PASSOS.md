# Preparação da reunião e da proposta

## Objetivo da demonstração

Mostrar que os fluxos essenciais podem ser adaptados ao trabalho do Lino. O protótipo v0.2 é uma demonstração com dados fictícios e perfis simulados. A página inicial permite escolhê-lo; a aplicação operacional está identificada como fase futura. A seleção de versão não implementa controlo de acesso.

## Percurso de apresentação — 5 a 10 minutos

1. Abrir o protótipo na página de versões.
2. Mostrar um ajudante e um oficial, com remunerações distintas.
3. Registar trabalho e validá-lo.
4. Consultar o apuramento e registar um pagamento parcial.
5. Mostrar o saldo e a vista de colaborador.
6. Pedir ao Lino que compare o percurso com um caso real. Anotar diferenças e prioridades.

## Decisões a fechar antes de orçamentar

- Quantos trabalhadores, responsáveis, utilizadores e obras em simultâneo?
- Que três problemas precisam de estar resolvidos na primeira entrega?
- Quem regista e quem valida? Acesso de cada perfil?
- Remuneração à hora, ao dia ou ao mês? Horas extra, pausas, faltas, subsídios e alterações de valor?
- Pagamentos semanais/mensais referem-se a clientes, trabalhadores ou ambos?
- O responsável regista dias ou cada trabalhador marca horários? Precisa de funcionar sem internet?
- Qual o programa de faturação existente e o que deve ser transferido para ele?
- O que o RADAR não resolve que justifique desenvolvimento à medida?
- Existem dados a migrar? Quem tem acesso ao programa, código, alojamento e exportação atuais?
- Que orçamento e disponibilidade existem para validar e experimentar o sistema?

## Proposta por etapas

1. Diagnóstico: requisitos, regras de cálculo, exemplos e âmbito da primeira versão, com preço próprio que pode ser creditado no projeto.
2. Primeira versão operacional: autenticação, autorização no servidor, dados centrais, equipa, obras, trabalho e apuramentos acordados. Definir critérios de aceitação por fluxo.
3. Piloto: uma obra e um grupo pequeno, com cenários reais e comparação dos totais com o método atual. Registar defeitos e validar a recuperação de dados.
4. Entrada em utilização: migração acordada, formação e apoio inicial.
5. Evolução: materiais, despesas, orçamentos e integrações, conforme prioridade e orçamento próprios.

## Elementos da proposta comercial

- Funcionalidades incluídas, entregas e exclusões concretas.
- Critérios de aceitação, número de revisões e responsabilidades do cliente.
- Preço de implementação, plano de pagamentos por marcos e prazos dependentes dos acessos e validações.
- Alojamento, licenças e serviços externos identificados.
- Correções de defeitos da entrega, manutenção e novas funcionalidades com condições distintas.
- Direitos de utilização, propriedade do código, acesso às contas e exportação dos dados a acordar por escrito.
- Processo para pedidos fora do âmbito: estimativa e aceitação antes de implementar.

## Preservar o protótipo

A versão 0.2 está em `dist/prototipo/`, identificada em `releases/prototipo-v0.2.json`. O commit de base registado permite recuperar a implementação anterior à página de versões. Desenvolver a aplicação operacional numa pasta distinta e com armazenamento separado. Não acrescentar automaticamente novos módulos ao protótipo de apresentação.

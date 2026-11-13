# Espaçamento na interface operacional

Use as classes partilhadas de `operacional/public/future.css` nos novos ecrãs e ao alterar componentes existentes.

- Agrupe secções consecutivas do mesmo nível em `.section-stack`. O contentor reserva 24 px entre painéis. Deixe as margens verticais exteriores dos painéis a zero.
- Em formulários verticais simples, use `.form-stack`. O intervalo de 12 px separa os campos e o botão de ação. Mantenha cada rótulo junto do respetivo campo.
- Quando uma ligação dá seguimento direto a uma instrução, coloque-a no mesmo bloco de texto com `.description-action`. A ligação começa 8 px abaixo da instrução e acompanha o seu alinhamento.

Aplique estes intervalos em computador e telemóvel. Quando um componente precisar de uma exceção, limite a regra CSS a esse componente e registe o motivo junto da regra.


## Regras permanentes para tabelas

Consultar estas regras antes de alterar qualquer interface da aplicação. Preservar a altura e a densidade atuais de cada tabela, incluindo o espaço vertical, a disposição do texto e o tamanho das ações. Qualquer alteração que mude a altura de um registo requer autorização expressa do utilizador para a tabela em causa. Um pedido para alterar outra parte da interface não constitui essa autorização.

Em Obras, a altura de referência é 71 px, com 16 px de espaço vertical nas células. Mostrar a obra sobre o cliente, com 5 px entre ambos. Manter os botões de ação na mesma linha e o estado completo, separado do valor acordado. Preservar o scroll vertical interno de cerca de dez registos.

As tabelas devem caber na largura disponível sem deslocação horizontal. Em cada tabela nova, antes da implementação, perguntar ao utilizador **quais as colunas que podem ceder espaço, em que ordem e quais podem usar reticências**. Registar aqui a decisão específica. Por defeito, mostrar o conteúdo completo. Se os mínimos das colunas protegidas já não couberem, pedir uma decisão sobre a apresentação antes de cortar conteúdo ou alterar a altura.

| Tabela | Colunas que podem ceder espaço e apresentar reticências | Colunas protegidas |
| --- | --- | --- |
| Obras | Obra / cliente em primeiro lugar. Localidade e Equipa também podem encolher quando necessário. Disponibilizar o conteúdo completo. | Estado, Valor acordado e Ações. Reservar largura pelo conteúdo real, incluindo o símbolo da moeda e as casas decimais. |

Antes de concluir uma alteração às tabelas, testar a largura disponível, a altura dos registos, os valores longos e a visibilidade das ações. Em Obras testar também um montante de dez dígitos com cêntimos.

Exceção autorizada para telemóvel (até 760 px): se a tabela não couber, apresentar cada registo com campos identificados abaixo do primeiro campo e ações no fim. A altura pode crescer nesta vista. Se a tabela couber, manter as linhas normais.

Nas tabelas, reservar o espaço livre para a identificação do registo (cliente, obra ou descrição). Dimensionar as colunas monetárias pelo cabeçalho e pelo maior valor apresentado, com margem de ambos os lados. Alinhar o conteúdo de todas as colunas à esquerda, incluindo montantes, totais e botões de ação.
Todos os cabeçalhos das tabelas, incluindo «Periodicidade», «Ações» e os dos montantes, devem aparecer por inteiro numa única linha, alinhados à esquerda. Reservar pelo menos a largura do rótulo e das margens. Aplicar a mesma regra aos rótulos dos registos em telemóvel.

Em Pagamentos à equipa, distribuir a largura do apuramento por Funcionário (referência de 28%) e pelas quatro colunas financeiras (18% cada). Permitir o ajuste pelo comprimento real dos montantes.
Nas tabelas de trabalho, apresentar a data sobre o horário completo e «Ver observação» por baixo do nome da obra. Em «Mão de obra por funcionário», mostrar o montante sobre as horas em Por validar, Pago e Em falta. Reservar espaço para todas as ações disponíveis, com margem à direita.
Regra geral para todas as tabelas: preservar a disposição original dos campos dentro de cada célula. Mostrar os detalhes secundários abaixo do campo principal, incluindo fornecedor sob a descrição. Permitir que o texto e os grupos de ações se distribuam pela largura disponível. Aplicar reticências apenas nas colunas expressamente autorizadas.

Decisão do utilizador em 13/11/2026: manter as funcionalidades novas e repor o formato das tabelas da produção, alterando apenas a distribuição horizontal necessária. As colunas de texto (funcionário, obra, cliente, descrição e respetivos detalhes textuais) podem ceder largura e apresentar reticências com o conteúdo completo disponível. Montantes e estados devem aparecer inteiros numa linha; todas as ações ficam lado a lado, com 16 px de margem à direita da coluna. Preservar as linhas secundárias originais e a altura dos registos.

Nas colunas autorizadas a usar reticências, disponibilizar um botão visível para abrir o conteúdo completo, acessível por clique, toque e teclado. O título ao passar o rato é apenas complementar. Não aplicar esta redução às colunas protegidas nem aumentar a altura das linhas para mostrar o texto completo.

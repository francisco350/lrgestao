# Espaçamento na interface operacional

Use as classes partilhadas de `operacional/public/future.css` nos novos ecrãs e ao alterar componentes existentes.

- Agrupe secções consecutivas do mesmo nível em `.section-stack`. O contentor reserva 24 px entre painéis. Deixe as margens verticais exteriores dos painéis a zero.
- Em formulários verticais simples, use `.form-stack`. O intervalo de 12 px separa os campos e o botão de ação. Mantenha cada rótulo junto do respetivo campo.
- Quando uma ligação dá seguimento direto a uma instrução, coloque-a no mesmo bloco de texto com `.description-action`. A ligação começa 8 px abaixo da instrução e acompanha o seu alinhamento.

Aplique estes intervalos em computador e telemóvel. Quando um componente precisar de uma exceção, limite a regra CSS a esse componente e registe o motivo junto da regra.

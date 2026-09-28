# SGF — Acompanhamento de implementação

Última atualização: 28/09/2026
Repositório oficial: https://github.com/GuiPaicheco/SGF.git

## Concluído

- [x] Reorganizar o protótipo em HTML, CSS e JavaScript separados, sem etapa de build.
- [x] Preservar identidade visual institucional e responsividade.
- [x] Criar entrada separada para solicitação e gerenciamento.
- [x] Retirar qualquer senha padrão do frontend e usar Supabase Auth no painel.
- [x] Implementar perfis `servidor`, `gerencia`, `rh` e `administrador`.
- [x] Restringir chefias às lotações atribuídas em `profile_scopes`.
- [x] Corrigir RLS, privilégios excessivos e funções privilegiadas públicas.
- [x] Implementar solicitações reais, protocolo, múltiplos períodos e histórico de status.
- [x] Implementar etapas de aprovação da chefia imediata e do RH.
- [x] Implementar simulação pela data de início ou pela data desejada de retorno.
- [x] Considerar data de admissão e término do período aquisitivo na escolha do regime.
- [x] Implementar férias regulamentares, férias-prêmio, banco de horas e day-off.
- [x] Permitir saldo declaratório de banco de horas e acréscimo às férias.
- [x] Criar comprovante formal de uma página com protocolo, assinatura e carimbo.
- [x] Implementar campos verdes quando válidos e vermelhos quando inválidos.
- [x] Criar função segura para envio sem login, com validação funcional e rate limit.
- [x] Fixar a versão do cliente Supabase usada pelo navegador e pela Edge Function.
- [x] Criar migrations versionadas e executar advisors de segurança.

## Preparação administrativa antes do piloto

- [ ] Importar lotações, cargos, funções, categorias e servidores da base oficial.
- [ ] Normalizar CPF no banco usando apenas os 11 dígitos.
- [ ] Criar as contas institucionais de RH/chefias e atribuir seus escopos.
- [ ] Revisar o calendário oficial de feriados e pontos facultativos de cada ano.
- [ ] Confirmar com RH/STI o marco legal exato da data de admissão para o regime de 25 dias úteis.
- [ ] Confirmar se day-off em fim de semana/feriado passa para o próximo dia útil.
- [ ] Confirmar se banco de horas pode prolongar férias ou deve gerar período separado.
- [ ] Definir política oficial de arredondamento para saldo inferior a uma jornada completa.
- [ ] Configurar domínio, HTTPS, cabeçalhos de segurança e política de backup no ambiente de publicação.
- [ ] Realizar homologação com casos reais anonimizados de RH, chefia e servidor.

## Próxima evolução recomendada

- [ ] Tela administrativa de cadastros e importação CSV.
- [ ] Notificações institucionais por e-mail após cada mudança de status.
- [ ] Relatórios gerenciais e exportação com minimização de dados pessoais.
- [ ] Testes automatizados das regras de calendário assim que Node.js estiver disponível no ambiente.
- [ ] Política formal de retenção e descarte de dados alinhada à LGPD e à STI.

> O SGF é um sistema auxiliar. Simulações, protocolos e comprovantes não substituem a autorização administrativa competente.

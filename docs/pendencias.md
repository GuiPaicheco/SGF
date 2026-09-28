# Pendências - SGF (Sistema de Gerenciamento de Funcionários)

Repositório foi alterado para: https://github.com/GuiPaicheco/SGF.git <br>
Preciso que altere e continue versionando.

---

(Se preciso, pode alterar, ordenar e estruturar as tasks!)

[ ] Assim como a data do retorno é verde, quero que seja esclarecido também que a data em que o funcionário clicar é a data que ele não quer vir. (marque a data de vermelho, isso de vermelho de vermelho para início e verde para o retorno ajuda muito!)<br>
[ ] Considere dayoff de aniversário.<br>
[ ] Na tela do funcionário, só permitirá que faça a impressão do comprovante e que copie o texto (preciso que formate para em formato de e-mail). Daí no final ele vai recomendar que faça os 2, copiar o texto com Assuto e Mensagem da solicitação, enviar no RH e/ou chefia da Unidade e imprimir o comprovante, assinar e entregar ao RH/chefia.<br>
[ ] Na tela de gerenciamento que vai aparecer o gerenciamento facilitado em forma de planilha ou visualmente pelo sistema. <br>
[ ] Na hora de simular, permita solicitar com base na data que deseja iniciar as férias ou na data que deseja retornar.<br>
[ ] Por enquanto só temos suporte para "férias". Quero suporte para solicitar dias de folga utilizando banco de horas (o sistema pergunta quantas horas o funcionário tem na casa, pergunta a carga horária e realiza a simulação de quantos dias quer tirar e quais dias serão de forma similiar às férias).<br>
[ ] Permita que o funcionário possa escrever o seu Banco de Horas para que acrescente nas férias também.<br>
[ ] Quero mais formalidade no comprovante final. Faça com que gere apenas 1 página estilizada com a possibilidade de no final da página, carimbo e assinatura do profissional e de quem recebeu.<br>
[ ] Desenvolva o sistema que vai gerenciar as autorizações das solicitações dos pedidos de Férias, dias de folga, uso do Banco de Horas para o RH e a Chefia Imediata.<br>
[ ] Na tela inicial, deverá conter a opção de entrar no sistema de gerenciamento (por enquanto senha padrão 1234, mas não deverá ficar exposta) ou no de solicitação (sem senha, apenas verificação dos dados do funcionário).<br>
[ ] Agora a solicitação final, vai gerar realmente uma solicitação para quem administra. Porém ainda sim vai continuar gerando o comprovante final da solicitação. <br>
[ ] A data de admissão deverá ser considerada também para o cálculo de qual será o regimento, afinal quem iniciou a partir de uma determinada data, obrigatóriamente vai tirar os 25 dias úteis.<br>
[ ] O sistema de gerenciamento vai servir para o RH/chefia ter um controle facilitado de quais funcionários de quais funções/cargos estão de férias, dessa forma, facilitando evitar buracos de falta de funcionário para as funções.<br>
[ ] Melhore um pouco as cores dos inputs dos dados. Onde ele ficará verde nos dados confirmados e vermelho nos incompletos ou errados.<br>
[ ] Imprimir comprovante ainda não funciona. <br>

[ ] Será perguntado sobre o cargo ao realizar o login. Dessa forma, o fluxo será "LOGIN (matrícula e senha) -> Cargo (permanecerá salvo no DB) e Lotação (permanecerá salvo no DB) -> Perfil de Acesso (O nosso incial terá acesso de Administrador, Diretor, RH e Funcionário, dessa forma realizaremos os testes inciais, mas os próximos solicitados serão gerenciados por nós).<br>

[ ] Tela inicial de Login (apenas matrícula e senha e botão de esqueceu a senha e solicitar acesso). <br>

- Perfis de Acesso (definido sempre após realizar login):<br>
  - Administração: Controla os funcionários e diretoria de cada lotação.<br>
  - Diretor(a): Controla o RH e os Servidores. Têm controle sobre a lotação, podendo alterar o nome, os funcionários e ter uma visão completa da situação.<br>
  - RH: Controle das autorizações.<br>
  - Servidor: Solicitador.<br>

Login de administradores (acesso com todos os perfis para realizar os testes e cadastramentos inciais):

- Login: "admin";
- Senha: "12345678" (será alterado depois);

Login padrão:

- Login: "CNES" (fácilmente utilizado nas UBS, UPAS, etc. Caso seja uma secretaria, a lotação será aplicada para especificar melhor onde daquela secretaria o funcionário pertence e direcionando para o diretor ou RH referente);
- Senha: "GerenciaPMB";

## Adicionar as Unidades/Lotações: <br>

CNES de Acesso Unidade/Lotações

- 2126028 UBS ALCIDES BRAZ <br>
- 2126060 UBS ALTEROSAS ANTONIO JOSE SALOMAO <br>
- 2126427 UBS ALVORADA JOAO GREGORIO FERREIRA <br>
- 6305245 UBS AMAZONAS <br>
- 2125919 UBS ANGOLA ROGERIO GUSTAVO REZENDE <br>
- 3419371 UBS BANDEIRINHAS ROSA MIGUEL SALOMAO <br>
- 2125935 UBS BUENO FRANCO MARIA OLIVEIRA E SILVA <br>
- 2125994 UBS CACHOEIRA WILSON OLIVEIRA ANTUNES <br>
- 5320348 UBS CAIC CAPELINHA <br>
- 6213618 UBS CAMPOS ELISEOS <br>
- 0856762 UBS CELSO ALVES PEDROSA <br>
- 2125951 UBS CIDADE VERDE MARCIO FIRMIANO GALLO <br>
- 2125978 UBS CITROLANDIA ANALIA MARQUES DE OLIVEIRA <br>
- 5128218 UBS COLONIA <br>
- 3419363 UBS CRUZEIRO DO SUL <br>
- 2126087 UBS DOM BOSCO SEBASTIAO DA SILVA VIANA <br>
- 7924097 UBS DUQUE DE CAXIAS ELIAS VIEIRA DE SA <br>
- 5139074 UBS GUANABARA <br>
- 2125927 UBS HOMERO GIL <br>
- 2126192 UBS ICAIVERA <br>
- 2126141 UBS IMBIRUCU ANTONIO SABINO DE SOUZA <br>
- 2126176 UBS LARANJEIRAS ANTONIO CAETANO <br>
- 2125900 UBS MARIMBA <br>
- 4659031 UBS NITEROI <br>
- 6935699 UBS NOSSA SENHORA DE FATIMA <br>
- 5896002 UBS NOVA BADEN VIRGINIA MARIA DE CARVALHO <br>
- 3910865 UBS PARQUE DO CEDRO CECILIA DE PAULA OLIVEIRA <br>
- 6409296 UBS PAULO CAMILO <br>
- 2125986 UBS PETROPOLIS ROSA CAPUCHE <br>
- 2126095 UBS PETROVALE EDUARDO ANTONIO ROCHA <br>
- 2126109 UBS PTB SANTA CRUZ <br>
- 4702301 UBS SAO JOAO <br>
- 4796020 UBS SAO LUIZ BETIM <br>
- 2894912 UBS SITIO POCOES TEREZINHA DE JESUS LARA BRAGA <br>
- 9860673 UBS TERESOPOLIS SONIA AUGUSTA DOS SANTOS SILVA <br>
- 5307767 UBS TRINCHEIRA NEUSA MARIA BARBIZAN FERREIRA <br>
- 5505844 UBS UNIVERSAL JOAO NARCIZIO DE BARROS <br>
- 2126435 UBS VIANOPOLIS OSVALDO CRUZ <br>
- 2126117 UBS VILA BEMGE CRISTOVINA C G DE SOUZA <br>
- 2126168 UBS VILA CRISTINA <br>
- 9814809 UBS VILA RECREIO GENI ROSA DOS SANTOS <br>
- 2126052 UPA Alterosas<br>
- 2126133 UPA Teresópolis José Sabino Neto<br>
- 2126419 UPA Guanabara Nilda Nogueira de Andrade<br>
- 9804145 UPA Norte Betim<br>
- 2126494 Hospital Público Regional Prefeito Osvaldo Rezende Franco (HPR)<br>
- 2126486 SECRETARIA MUNICIPAL DE SAUDE DE BETIM/DAPS/DAES/DGETS/...<br>
- 7175930 Diretoria de Regulação, Controle e Avaliação (DIREG)<br>

---

Lembre-se: manter a responsividade, a identidade visual profissional (sem alterar muito a estrutura).

---

## Andamento técnico — área autenticada

- [x] Criar login individual do servidor com matrícula e senha.
- [x] Criar o fluxo “Solicitar acesso” com validação de nome, CPF, nascimento e matrícula.
- [x] Salvar o cargo e a lotação declarados no banco durante a solicitação de acesso.
- [x] Vincular com atomicidade a conta do Supabase Auth ao cadastro em `servidores`.
- [x] Definir o perfil inicial do novo acesso como `servidor`.
- [x] Permitir nova solicitação com os dados funcionais já preenchidos.
- [x] Criar o painel “Meus pedidos”, limitado pelo RLS aos protocolos do próprio servidor.
- [x] Criar a visualização individual de protocolo, período, retorno e situação.
- [x] Separar visualmente a área do servidor da área de gerenciamento.
- [x] Aplicar limitação de tentativas por matrícula e origem no login e primeiro acesso.
- [ ] Implementar recuperação segura de senha; até a homologação, o botão orienta procurar o RH.
- [ ] Criar o fluxo administrativo para aprovar o acesso solicitado e converter cargo/lotação declarados em referências oficiais.
- [ ] Ampliar os perfis para distinguir formalmente `diretor` de `gerencia` após definição dos escopos.
- [ ] Importar os CNES e nomes de unidades listados acima para `lotacoes` antes de habilitar login por unidade.
- [ ] Definir se os logins compartilhados `admin` e CNES serão mantidos; contas individuais são mais rastreáveis e seguras.
- [ ] Ativar a proteção contra senhas vazadas no Supabase Auth antes da produção.

### Funcionalidades relacionadas desta lista

- O requisito “Login → Cargo e Lotação → Perfil de acesso” está parcialmente concluído: cargo e lotação declarados são persistidos e o perfil inicial é `servidor`; a aprovação e atribuição de perfis administrativos continuam pendentes.
- A “Tela inicial de Login” já possui matrícula, senha, “Esqueci a senha” e “Solicitar acesso”. A recuperação automática ainda depende da política oficial.
- O acompanhamento do funcionário está concluído; impressão, cópia do texto em formato de e-mail e orientação de entrega continuam como próxima etapa do comprovante.

# Competa: test flows, simple list

Written on 2026-11-10 from the React code now on `main` (`fee8cda`). Button and screen names are the ones on screen, in Portuguese.

## Before you start

- Test on staging: https://staging-app.competa.com.br
- Use two browsers that do not share a login: Browser 1 is the accountant, Browser 2 is the client. Two different browsers work, or one normal and one private window.
- Have four e-mail addresses you can read, because staging sends real e-mails: OWNER, MEMBER, CLIENT A and CLIENT B. Gmail "plus" addresses work (`you+owner@gmail.com`).
- Have one small PDF and one photo ready.
- Do the flows in order. Each one uses what the earlier ones created.

---

## Part 1: Set up the firm

### Flow 1: Create account

- Step 1: In Browser 1, open `/cadastro`.
- Step 2: Fill "Seu nome completo", "Seu e-mail profissional" (OWNER) and "Senha" (8 characters or more). Click "Continuar".
- Step 3: Fill "Nome da Contabilidade", leave the CNPJ empty and click "Criar conta".
- Step 4: Check that you land on "Competências" and see "Nenhuma competência aberta".

### Flow 2: Sign out and sign in

- Step 1: Click your name at the bottom of the menu, then "Sair". Check that you land on the login page.
- Step 2: Type the OWNER e-mail with a wrong password and click "Entrar". Check the message "E-mail ou senha inválidos."
- Step 3: Type the right password and click "Entrar". Check that you land on "Competências".
- Step 4: Sign out, then open `/empresas` directly. Check that you are sent to the login page.
- Step 5: Sign in. Check that you land on "Empresas", not on "Competências".

### Flow 3: Reset the password

- Step 1: Sign out. On the login page click "Esqueci minha senha".
- Step 2: Type the OWNER e-mail and click "Enviar e-mail". Check the screen "Verifique seu e-mail".
- Step 3: Open the e-mail and click the link. On "Nova senha", type a new password and click "Redefinir senha".
- Step 4: Check the screen "Senha alterada". Click "Entrar no painel" and sign in with the new password.
- Step 5: Click the link in the e-mail a second time. Check the screen "Link inválido ou expirado".

### Flow 4: Firm settings

- Step 1: Click "Contabilidade" in the menu.
- Step 2: Change "Nome da Contabilidade", fill "E-mail de contato" and click "Salvar configurações". Check the message "Configurações salvas."
- Step 3: Under "Lembretes automáticos", change "Máximo de lembretes por item" and save again.
- Step 4: Reload the page. Check that the three values stayed.

### Flow 5: Checklist template

- Step 1: Click "Checklists" in the menu. Check that the ready-made templates ("Padrão Competa") are listed.
- Step 2: Click "Ver" on one of them. Check that it says it is read-only. Go back.
- Step 3: Click "Criar checklist", name it "Teste 3 docs" and click "Criar template". The template opens.
- Step 4: Click "Adicionar documento" and pick a document. Repeat until the template has three documents.
- Step 5: Click "Salvar template". Check the message "Template salvo."
- Step 6: Back in the list, click "Duplicar" on any template, then "Criar cópia". Check the message "Template copiado com sucesso."
- Step 7: In the copy, click "Excluir template inteiro" and confirm. Check the message "Template excluído."

### Flow 6: Create companies

- Step 1: Click "Empresas" in the menu, then "Nova empresa".
- Step 2: Fill "Nome da empresa" (Company A), "Nome do contato" and "E-mail" (CLIENT A).
- Step 3: In "Checklist aplicado", choose "Teste 3 docs". Check that the preview on the side shows its three documents.
- Step 4: Click "Salvar empresa". Check the message "Empresa cadastrada." and that the company's checklist page opens.
- Step 5: Click "Está bom assim". Check that Company A is in the list as "Ativa".
- Step 6: Click "Nova empresa" again and create Company B with only a name. Check that it is listed with "Sem template".

### Flow 7: Edit, deactivate and find a company

- Step 1: Click "Editar" on Company B, change the name and click "Salvar empresa". Check the message "Empresa atualizada."
- Step 2: Click "Desativar" on Company B and confirm. Check the message "Empresa desativada." and the status "Inativa".
- Step 3: Click the "Inativas" filter. Check that only Company B shows.
- Step 4: Click "Reativar". Check the message "Empresa reativada."
- Step 5: Click "Todas" and type part of Company A's name in the search box. Check that only Company A shows.

### Flow 8: Adjust one company's checklist

- Step 1: On Company A's row, click "Checklist".
- Step 2: Click the remove button on one document. Check that it is marked "Removido".
- Step 3: Click "Adicionar documento" and pick one. Check that it is marked "Adicionado".
- Step 4: Click "Restaurar padrão do template", then "Restaurar padrão". Check the message "Checklist restaurado para o padrão do template." and that the three original documents are back.

---

## Part 2: One month, start to finish

### Flow 9: Open a competência

- Step 1: Click "Competências" in the menu, then "Abrir competência".
- Step 2: Pick last month. Set "Prazo geral da competência" to a date next week.
- Step 3: Check that the box says 1 solicitação will be created, and that the warning lists Company B as having no template.
- Step 4: Click "Revisar envios", then "Confirmar e enviar 1 e-mails".
- Step 5: Check the screen "Competência aberta com sucesso" and click "Entendi".
- Step 6: Check that CLIENT A received an e-mail with a link to send documents.
- Step 7: Click "Abrir competência" again and pick the same month. Check the message saying this competência was already opened.

### Flow 10: Client sends documents by link

- Step 1: In Browser 2, open the link from CLIENT A's e-mail.
- Step 2: Check that the page shows your firm's name, the month and the three documents.
- Step 3: Click the first document and choose the PDF. Check the message "Arquivo enviado com sucesso." and that the document now says "Enviado".
- Step 4: Send the photo to the second document and the PDF to the third.
- Step 5: Check the banner "Tudo enviado!".
- Step 6: Under "Enviar documento extra", send one more file. Check that "Documento extra 1" appears.

### Flow 11: Review, accept and refuse

- Step 1: In Browser 1, click "Competências" and open the month. Check that Company A's row has a "Conferir" button with a number.
- Step 2: Click "Conferir". Click "Abrir" on a file. Check that the file opens.
- Step 3: Click "Aceitar item" on the first document.
- Step 4: Click "Recusar" on the second document's file and type a reason.
- Step 5: Click "Publicar revisão". Check the message "Revisão publicada: 1 aceite(s), 1 recusa(s)."
- Step 6: Check that CLIENT A received an e-mail with the reason.

### Flow 12: Client sends again, accountant approves everything

- Step 1: In Browser 2, open the link from the refusal e-mail. Check that the refused document shows the reason.
- Step 2: Send a new file for that document. Check that it says "Enviado".
- Step 3: In Browser 1, open the month and expand Company A's row. Check the text "Reenviado após recusa".
- Step 4: Click "Conferir", click "Aceitar item" on the two documents still waiting and click "Publicar revisão". Check the message "Revisão publicada. Solicitação completa."
- Step 5: In Browser 2, reload the page. Check the banner "Tudo entregue e aprovado!".

### Flow 13: Undo an acceptance

- Step 1: In Browser 1, on the same review page, find the list "Demais itens" and click "Desfazer aceite" on one document. Check the message saying the acceptance was undone.
- Step 2: Click "Aceitar item" on it again and "Publicar revisão". Check the message "Revisão publicada. Solicitação completa."

### Flow 14: Client creates an account

- Step 1: In Browser 2, reload the upload page and click "Criar meu acesso". Check the message saying a link was sent to CLIENT A's e-mail.
- Step 2: Open that e-mail in Browser 2 and click the link. Check that you land on "O que falta" and see "Tudo certo por aqui!".
- Step 3: Click "Criar senha", type a password and click "Definir senha". Check the screen "Senha definida".
- Step 4: Click "Histórico". Check that the month is listed with the files you sent, and that "Ver" and "Baixar" work on one file.
- Step 5: Click "Sair". Sign in again with CLIENT A's e-mail and the password. Check that you are back in.
- Step 6: Click "Sair". In the lower form, type the e-mail and click "Receber link por e-mail". Check that the link in the e-mail signs you in.

### Flow 15: Download the files and close the month

- Step 1: In Browser 1, open the month. Click ".zip" on Company A's row. Check that a zip downloads and has the files inside.
- Step 2: Click "Baixar Tudo (.zip)". Check the message "Download da competência concluído."
- Step 3: Click "Encerrar" at the top of the page, then "Encerrar competência". Check the message "Competência encerrada."
- Step 4: Click "Competências". Check that the month is listed as "Encerrada".

---

## Part 3: A second month, with the harder cases

### Flow 16: Add a company after the month is open

- Step 1: In Browser 1, open a competência for the month before last, as in Flow 9. Only Company A gets an e-mail.
- Step 2: Click "Empresas", then "Editar" on Company B. Add a contact name and the CLIENT B e-mail, choose "Teste 3 docs" and save.
- Step 3: Go back to the new month's page and click "Incluir empresas novas". Check the message "Link enviado para" Company B.
- Step 4: Check that CLIENT B received the e-mail with the link.

### Flow 17: Client sends from their account

- Step 1: In Browser 2, signed in as CLIENT A, click "O que falta". Check that the new month's three documents are listed.
- Step 2: Click "Enviar arquivos" on one document and choose the PDF. Check the message "Arquivo enviado com sucesso."
- Step 3: In Browser 1, reload the new month's page. Check that Company A's row now has "Conferir (1)".

### Flow 18: Copy the link and chase

- Step 1: In Browser 1, on the new month's page, click "Copiar link" on Company B's row. Check that the button says "Link copiado!".
- Step 2: Paste the link in Browser 2. Check that Company B's upload page opens. Keep the link for Flow 19.
- Step 3: In Browser 1, click "Cobrar atrasados". Check that a message says how many reminders were sent, or why none was. Either one is fine.

### Flow 19: Client lost the link

- Step 1: In Browser 2, signed out, open `/perdi-meu-link`.
- Step 2: Type the CLIENT B e-mail and click "Enviar e-mail". Check the screen "Verifique seu e-mail".
- Step 3: Open the e-mail and click the link. Click "Gerar novo link". Check the screen "Link renovado".
- Step 4: Check that a new e-mail arrived and that its link opens Company B's upload page.
- Step 5: Open the link you copied in Flow 18. Check the screen "Link indisponível ou expirado".

### Flow 20: On a phone: camera, notifications and install

- Step 1: On an Android phone, open Company B's newest link in Chrome.
- Step 2: Tap a document, then "Tirar foto do documento". Take a photo. Check that it uploads.
- Step 3: Send files for the other two documents. Check the banner "Tudo enviado!".
- Step 4: Tap "Me avise neste aparelho" and allow notifications.
- Step 5: In Browser 1, refuse one of Company B's documents and publish. Check that the phone gets a notification.
- Step 6: On the phone, tap "Instalar app" at the top of the page. Check that Competa opens from the home screen like an app.
- Step 7: On an iPhone, open the same link in Safari and tap "Instalar app". Check that it explains how to add Competa to the home screen.

### Flow 21: Invite a client to the app

- Step 1: In Browser 1, click "Empresas". On Company B's row, click "Convidar para o app". Check the message "Convite enviado por e-mail."
- Step 2: In Browser 2, signed out, open the link from CLIENT B's invite e-mail. Check that the screen "Aceitar convite" names your firm and Company B.
- Step 3: Fill "Seu nome" and "Defina uma senha" and click "Criar conta". Check that you land on "O que falta".

### Flow 22: Take a client's access away

- Step 1: In Browser 1, click "Editar" on Company B. Under "Acesso ao app", click "Revogar acesso" next to CLIENT B and confirm.
- Step 2: Check the message saying the access was revoked.
- Step 3: In Browser 2, reload. Check that CLIENT B no longer sees Company B's documents.

### Flow 23: Close one company with documents still missing

- Step 1: In Browser 1, on the second month's page, click "Encerrar" on Company A's row, then "Encerrar solicitação". Check the message saying Company A's request was closed.
- Step 2: In Browser 2, open Company A's link from the second month's e-mail. Check the notice "Competência encerrada com pendências".
- Step 3: Check that the documents no longer take files and that "Enviar documento extra" still does.

---

## Part 4: Team

### Flow 24: Invite an accountant and cancel the invite

- Step 1: In Browser 1 as OWNER, click your name at the bottom of the menu, then "Convidar contador". On the "Equipe" page, click "Convidar contador".
- Step 2: Type the MEMBER e-mail and click "Enviar convite". Check the message "Convite enviado para" that e-mail, and that it shows under "Convites pendentes".
- Step 3: Under "Convites pendentes", revoke the invite and confirm. Check the message "Convite revogado."
- Step 4: In Browser 2, signed out, open the link from the invite e-mail. Check the screen "Convite inválido".

### Flow 25: Accountant joins by invite

- Step 1: In Browser 1, invite the MEMBER e-mail again.
- Step 2: In Browser 2, open the link from the newest invite e-mail. Check that the screen "Aceitar convite" names your firm.
- Step 3: Fill "Seu nome" and "Defina uma senha" and click "Criar conta". Check that you land on "Competências" and see the same months and companies as the owner.
- Step 4: As the member, open "Contabilidade", "WhatsApp" and "Plano e Assinatura". Check that each one says "Somente leitura".

### Flow 26: Remove an accountant

- Step 1: In Browser 1, on the "Equipe" page, click the remove button on the member's row, then "Remover". Check that the member leaves the list.
- Step 2: In Browser 2, reload. Check that the member is sent to the login page.

---

## Part 5: The rest

### Flow 27: Import companies from a spreadsheet

- Step 1: In Browser 1, click "Empresas", then "Importar CSV".
- Step 2: Click "Baixar planilha modelo". Open the file, replace the example row with two companies (a name is enough) and save it as CSV.
- Step 3: Drop the file on the page. Check that the two companies show in the preview.
- Step 4: Click "Importar 2 empresas". Check that "Resumo da importação" says both were created.
- Step 5: Click "Empresas". Check that both are in the list.

### Flow 28: Change several companies at once

- Step 1: On "Empresas", tick the two imported companies.
- Step 2: In the bar that appears, choose "Teste 3 docs" and click "Aplicar a 2 empresas". Check the message "Template aplicado a 2 empresa(s)."
- Step 3: Click "Desativar" on one of them and confirm. Tick it and click "Ativar selecionadas". Check that it is "Ativa" again.

### Flow 29: Message log

- Step 1: Click "Mensagens". Check that the e-mails sent in the flows above are listed, with company, type and status.
- Step 2: Choose Company A in the company filter. Check that only its messages show.
- Step 3: Click "Reenviar mensagem" on one row. Check the message "Mensagem reenviada para" the address, and that the e-mail arrives.

### Flow 30: Plan and payment

Staging uses the Asaas sandbox, so no real money moves. Do this one last: cancelling at the end can block changes in this test firm.

- Step 1: As OWNER, click "Plano e Assinatura". Check that "Assinatura Atual" shows the trial and the day it ends.
- Step 2: Type a CNPJ in "CNPJ da Contabilidade". `11.222.333/0001-81` is valid; if it is already taken, use `44.555.666/0001-81`.
- Step 3: Leave "Mensal" selected and click "Assinar Essencial". Check that you are taken to an Asaas payment page.
- Step 4: Pay it in the Asaas sandbox. Go back to "Plano e Assinatura" and reload. Check that the subscription is active and that Essencial says "Plano atual".
- Step 5: Click "Assinar Profissional". Check that the plan changes, or that you get a new payment page.
- Step 6: Click "Cancelar assinatura" and confirm. Check the message "Assinatura cancelada." and the date your access runs until.

### Flow 31: WhatsApp

- Step 1: Click "WhatsApp" in the menu, then "Conectar com o Facebook".
- Step 2: Check that you get an error message. This is expected for now: the connection is switched off on staging and production.

### Flow 32: Public pages and wrong addresses

- Step 1: Signed out, open `/termos` and `/privacidade`. Check that both show their text.
- Step 2: Open `/abc`. Check the screen "Página não encontrada".
- Step 3: Open `/envio/abc`. Check the screen "Link indisponível ou expirado".
- Step 4: Open `/convite/abc`. Check the screen "Convite inválido".
- Step 5: Open `/redefinir-senha`. Check the screen "Link inválido ou expirado".

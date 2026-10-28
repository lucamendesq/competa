-- O contrato passa a gravar e-mail em minúsculas, mas os Responsáveis já cadastrados ficaram
-- como foram digitados: o "Perdi meu link" compara com o e-mail minúsculo e nunca os achava,
-- e trocar só a caixa do e-mail contava como troca de pessoa. Sem unique em contact.email,
-- não há colisão a resolver.
update "contact"
set "email" = lower("email")
where "email" <> lower("email");

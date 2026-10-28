-- Antes do ramo security-followup o checkout gravava plan_name direto: firma que escolheu um
-- plano e nunca pagou ficou com plano pago e capabilities liberadas. Nunca ter aberto um
-- período (current_period_start nulo) é a prova de que nenhum pagamento chegou. A escolha
-- volta para a intenção; o webhook a promove quando a fatura for paga.
update "subscription"
set "pending_plan_name" = "plan_name",
    "pending_cycle" = "cycle",
    "plan_name" = 'trial',
    "cycle" = 'monthly'
where "plan_name" <> 'trial'
  and "current_period_start" is null;

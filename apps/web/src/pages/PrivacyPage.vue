<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { ArrowLeft } from 'lucide-vue-next';
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
    <RouterLink
      to="/"
      class="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="mr-2 h-4 w-4" /> Voltar
    </RouterLink>

    <h1 class="mt-8 text-3xl font-bold tracking-tight">Política de Privacidade</h1>

    <div class="mt-8 space-y-6 text-sm text-foreground/80 leading-relaxed">
      <p>
        O Competa trata documentos fiscais e dados de contato <strong>como operador</strong>, por
        conta da contabilidade que contratou o serviço (controladora dos dados), nos termos da LGPD.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">1. O que coletamos</h2>
      <p>
        Nome, e-mail e telefone dos responsáveis pelas empresas; os documentos enviados (notas,
        extratos, folhas e afins); e registros técnicos de acesso.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">2. Para quê</h2>
      <p>
        Exclusivamente para a coleta e organização de documentos solicitados pela sua contabilidade.
        Não vendemos dados nem os usamos para publicidade.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">3. Suboperadores</h2>
      <p>
        Armazenamento de documentos na Cloudflare (R2), banco de dados na Supabase e envio de
        e-mails pela Resend. Todos sob contrato e criptografia em trânsito.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">4. Retenção</h2>
      <p>
        Documentos fiscais ficam guardados pelo prazo legal (em geral 5 anos). Quando uma
        contabilidade encerra o contrato, os dados são retidos por 90 dias e depois eliminados.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">5. Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou eliminação dos seus dados (arts. 18 e seguintes da LGPD)
        pelo e-mail contato@competa.com.br — respondemos em até 15 dias. Pedidos sobre documentos
        fiscais são encaminhados à contabilidade responsável, que é a controladora.
      </p>
    </div>
  </div>
</template>

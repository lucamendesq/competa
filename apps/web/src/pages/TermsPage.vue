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

    <h1 class="mt-8 text-3xl font-bold tracking-tight">Termos de Uso</h1>

    <div class="mt-8 space-y-6 text-sm text-foreground/80 leading-relaxed">
      <p>
        O Competa é um serviço de SaaS para gestão e coleta de documentos contábeis. Ao utilizar a
        plataforma, você concorda com estes termos.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">1. Licença e Uso</h2>
      <p>
        A licença de uso do Competa é intransferível e não exclusiva, concedida apenas às
        contabilidades assinantes. Você não pode copiar, revender, ou usar o Competa de modo ilícito
        ou abusivo, incluindo mas não limitando à distribuição de malware nos uploads.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">2. Responsabilidade do Cliente</h2>
      <p>
        Você (a contabilidade) é inteiramente responsável pelo conteúdo submetido, cobrado, e pelos
        dados pessoais fornecidos, incluindo as obrigações que surgem deles com as Empresas que você
        atende, de acordo com a LGPD e o contrato firmado com o seu cliente.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">3. Suspensão de Serviço</h2>
      <p>
        A Competa se reserva ao direito de suspender ou encerrar o serviço nos casos de falta de
        pagamento, fraude, violação de segurança ou qualquer descumprimento destes termos.
      </p>

      <h2 class="text-base font-semibold text-foreground mt-8">4. Foro e Modificações</h2>
      <p>
        Podemos atualizar estes Termos no futuro mediante aviso. Em caso de litígio, fica eleito o
        Foro da Comarca de São Paulo/SP.
      </p>
    </div>
  </div>
</template>

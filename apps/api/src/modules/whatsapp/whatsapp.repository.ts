import { run } from '../../effect/runtime.js';
import type { FirmScope } from '../auth/scope.js';
import { WhatsappRepo } from './whatsapp.repo.js';

/** Casca Nest sobre o serviço Effect (`whatsapp.repo.ts`): mantém a DI dos controllers e do
 *  `WhatsappProvider` até cada consumidor migrar; morre na fase final. */
export class WhatsappRepository {
  getIntegrationByFirm(scope: FirmScope) {
    return run(WhatsappRepo.use((repo) => repo.getIntegrationByFirm(scope)));
  }

  getIntegrationByRequestId(requestId: string) {
    return run(WhatsappRepo.use((repo) => repo.getIntegrationByRequestId(requestId)));
  }

  upsertIntegration(
    scope: FirmScope,
    data: {
      wabaId: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
      accessToken: string;
    },
  ) {
    return run(WhatsappRepo.use((repo) => repo.upsertIntegration(scope, data)));
  }

  deleteIntegration(scope: FirmScope) {
    return run(WhatsappRepo.use((repo) => repo.deleteIntegration(scope)));
  }

  getIntegrationByTenantId(tenantId: string) {
    return run(WhatsappRepo.use((repo) => repo.getIntegrationByTenantId(tenantId)));
  }

  updateMessageDeliveryStatus(
    metaMessageId: string,
    payload: { status: 'delivered' | 'read' | 'failed'; error?: string; date?: Date },
  ) {
    return run(
      WhatsappRepo.use((repo) => repo.updateMessageDeliveryStatus(metaMessageId, payload)),
    );
  }
}

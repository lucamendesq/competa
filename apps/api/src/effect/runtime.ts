import { Cause, Effect, Exit, Layer, ManagedRuntime } from 'effect';
import { Db, DbError } from '../infra/database/effect.js';
import { AccountantsRepo } from '../modules/auth/accountant.repo.js';
import { InvitesRepo } from '../modules/auth/invite.repo.js';
import { UserDevicesRepo } from '../modules/auth/user-device.repo.js';
import { SubscriptionsRepo } from '../modules/billing/subscription.repo.js';
import { ChecklistsRepo } from '../modules/checklists/checklist.repo.js';
import { CompaniesRepo } from '../modules/companies/company.repo.js';
import { ContactsRepo } from '../modules/contacts/contact.repo.js';
import { MessagesRepo } from '../modules/messaging/message.repo.js';
import { PeriodsRepo } from '../modules/periods/period.repo.js';
import { DocumentsRepo } from '../modules/requests/document.repo.js';
import { RequestsRepo } from '../modules/requests/request.repo.js';
import { UploadLinksRepo } from '../modules/requests/upload-link.repo.js';
import { WhatsappRepo } from '../modules/whatsapp/whatsapp.repo.js';

/* ChecklistsRepo entra por provideMerge, não por mergeAll: PeriodsRepo depende dele e o
 * mergeAll não alimenta uma layer com a outra. */
export const AppLayer = Layer.mergeAll(
  PeriodsRepo.layerNoDeps,
  ContactsRepo.layerNoDeps,
  CompaniesRepo.layerNoDeps,
  RequestsRepo.layerNoDeps,
  DocumentsRepo.layerNoDeps,
  UploadLinksRepo.layerNoDeps,
  WhatsappRepo.layerNoDeps,
  SubscriptionsRepo.layerNoDeps,
  MessagesRepo.layerNoDeps,
  AccountantsRepo.layerNoDeps,
  InvitesRepo.layerNoDeps,
  UserDevicesRepo.layerNoDeps,
).pipe(Layer.provideMerge(ChecklistsRepo.layerNoDeps), Layer.provideMerge(Db.layer));

export type AppContext = Layer.Success<typeof AppLayer>;

export const runtime = ManagedRuntime.make(AppLayer);

/** `DbError` é desembrulhado para o erro cru do driver: o mapa de erros e os logs veem
 *  exatamente o que viam antes da migração. */
export const squashError = (cause: Cause.Cause<unknown>): unknown => {
  const error = Cause.squash(cause);

  return error instanceof DbError ? error.cause : error;
};

/** Fronteira promise→Effect, para quem ainda vive fora de um Effect (listeners de evento). */
export async function run<A, E>(effect: Effect.Effect<A, E, AppContext>): Promise<A> {
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;

  throw squashError(exit.cause);
}

/** Mesma fronteira, para quem já está DENTRO de um Effect (rotas e middleware). Mantém UM
 *  runtime no processo: dois construiriam um segundo provider de storage e um segundo
 *  cliente de email. O erro volta como defeito cru, que é o que o mapa de erros espera ver. */
export const fromRuntime = <A, E>(effect: Effect.Effect<A, E, AppContext>): Effect.Effect<A> =>
  Effect.promise(() => run(effect));

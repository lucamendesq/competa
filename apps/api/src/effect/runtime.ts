import { Effect, Exit, Layer, ManagedRuntime } from 'effect';
import { Db } from '../infra/database/effect.js';
import { squashError } from '../infra/database/error.js';
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
export const AppRepos = Layer.mergeAll(
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
).pipe(Layer.provideMerge(ChecklistsRepo.layerNoDeps));

/** A MESMA árvore de repositórios sobre a trava sem banco (`Db.layerTest`), para quem testa o
 *  que não deve consultar. Montada aqui porque a ordem do `provideMerge` acima é a parte que
 *  desatualizaria se o teste a copiasse. */
export const AppReposWithoutDb = AppRepos.pipe(Layer.provideMerge(Db.layerTest));

export const AppLayer = AppRepos.pipe(Layer.provideMerge(Db.layer));

export type AppContext = Layer.Success<typeof AppLayer>;

const runtime = ManagedRuntime.make(AppLayer);

/** Não é `Layer.provide(AppLayer)` de propósito: assim os finalizadores continuam
 *  pertencendo a este runtime, e o `dispose()` de uma app (a suíte sobe dezenas no mesmo
 *  processo) não leva junto o pool que as próximas vão usar. Também é o que garante UMA
 *  construção por processo — duas dariam um segundo provider de storage e um segundo
 *  cliente de email. */
export const appServices: Layer.Layer<AppContext> = Layer.effectContext(runtime.contextEffect);

/** Fronteira Effect→promise, para quem vive fora de um Effect: listeners do eventemitter2,
 *  as entradas dos crons e os scripts de verificação. */
export async function run<A, E>(effect: Effect.Effect<A, E, AppContext>): Promise<A> {
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;

  throw squashError(exit.cause);
}

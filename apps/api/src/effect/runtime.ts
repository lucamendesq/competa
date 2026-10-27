import { Layer } from 'effect';
import { Db } from '../infra/database/effect.js';
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
import { EventsLive } from '../modules/messaging/listeners.js';
import { DeadlineScan } from '../modules/requests/deadline.cron.js';
import { Reminders } from '../modules/requests/reminders.cron.js';

/* `provideMerge`, não `mergeAll`, para quem depende de outro repositório: o `mergeAll` não
 * alimenta uma layer com a outra. PeriodsRepo usa ChecklistsRepo; MessagesRepo, WhatsappRepo. */
export const AppRepos = Layer.mergeAll(
  PeriodsRepo.layerNoDeps,
  ContactsRepo.layerNoDeps,
  CompaniesRepo.layerNoDeps,
  RequestsRepo.layerNoDeps,
  DocumentsRepo.layerNoDeps,
  UploadLinksRepo.layerNoDeps,
  SubscriptionsRepo.layerNoDeps,
  MessagesRepo.layerNoDeps,
  AccountantsRepo.layerNoDeps,
  InvitesRepo.layerNoDeps,
  UserDevicesRepo.layerNoDeps,
).pipe(
  Layer.provideMerge(ChecklistsRepo.layerNoDeps),
  Layer.provideMerge(WhatsappRepo.layerNoDeps),
);

export type RepoContext = Layer.Success<typeof AppRepos> | Db;

/** Tudo de que uma rota, um listener ou um cron pode depender, sobre um `Db` a escolher. */
export const AppServices = Layer.mergeAll(DeadlineScan.layer, Reminders.layer).pipe(
  Layer.provideMerge(EventsLive),
  Layer.provideMerge(AppRepos),
);

/** A MESMA árvore sobre a trava sem banco (`Db.layerTest`), para quem testa o que não deve
 *  consultar. Montada aqui porque a ordem dos `provideMerge` acima é a parte que
 *  desatualizaria se o teste a copiasse. */
export const AppServicesWithoutDb = AppServices.pipe(Layer.provideMerge(Db.layerTest));

/** A árvore do app sobre o pool real; quem a usa escolhe se é dono do pool (`DbPool.layer`)
 *  ou o pega emprestado (`DbPool.layerBorrowed`). */
export const AppLayer = AppServices.pipe(Layer.provideMerge(Db.layerNoDeps));

export type AppContext = Layer.Success<typeof AppLayer>;

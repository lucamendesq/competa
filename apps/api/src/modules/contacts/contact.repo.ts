import { Context, Effect, Layer } from 'effect';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Db } from '../../infra/database/effect.js';
import {
  account,
  accountant,
  accountingFirm,
  company,
  contact,
  period,
  pushSubscription,
  request,
  uploadLink,
  user,
} from '../../infra/database/schema/index.js';
import { contactIdsOf, type ContactScope, type FirmScope } from '../auth/scope.js';

const make = Effect.gen(function* () {
  const db = yield* Db;

  const profile = Effect.fn('ContactsRepo.profile')(function* (scope: ContactScope) {
    return yield* db.use(async (d) => {
      const rows = await d
        .select({
          contactId: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          companyId: company.id,
          companyName: company.name,
          accountingFirmName: accountingFirm.name,
        })
        .from(contact)
        .innerJoin(company, eq(company.id, contact.companyId))
        .innerJoin(accountingFirm, eq(accountingFirm.id, company.accountingFirmId))
        .where(inArray(contact.id, contactIdsOf(scope)))
        .orderBy(asc(contact.createdAt), asc(contact.id));

      const [first] = rows;
      if (!first) return undefined;

      const [pwdAccount] = await d
        .select({ id: account.id })
        .from(account)
        .innerJoin(contact, eq(contact.authUserId, account.userId))
        .where(and(eq(contact.id, first.contactId), isNotNull(account.password)))
        .limit(1);

      return {
        contactId: first.contactId,
        name: first.name,
        email: first.email,
        phone: first.phone,
        companyId: first.companyId,
        companyName: first.companyName,
        accountingFirmName: first.accountingFirmName,
        hasPassword: Boolean(pwdAccount),
        companies: rows.map((row) => ({
          companyId: row.companyId,
          companyName: row.companyName,
          accountingFirmName: row.accountingFirmName,
        })),
      };
    });
  });

  const findByEmailInCompany = Effect.fn('ContactsRepo.findByEmailInCompany')(function* (
    companyId: string,
    email: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          authUserId: contact.authUserId,
        })
        .from(contact)
        .where(and(eq(contact.companyId, companyId), eq(contact.email, email)))
        .limit(1);

      return row;
    });
  });

  /** Solicitações abertas de um email de Responsável, para o "perdi meu link" reenviar o
   *  Link de Upload. Único método sem escopo branded: a entrada É o email, e quem chama é
   *  a rota pública de recuperação, que responde igual em todos os casos e nunca devolve
   *  nada ao cliente. Não usar em rota que exiba dado. */
  const openRequestsForEmail = Effect.fn('ContactsRepo.openRequestsForEmail')(function* (
    email: string,
  ) {
    return yield* db.use((d) =>
      d
        .select({
          requestId: request.id,
          contactId: contact.id,
          contactName: contact.name,
          contactEmail: contact.email,
          companyName: company.name,
          referenceMonth: period.referenceMonth,
          periodDueDate: period.dueDate,
          hasAccess: contact.authUserId,
          uploadLinkTokenHash: uploadLink.tokenHash,
        })
        .from(contact)
        .innerJoin(company, eq(company.id, contact.companyId))
        .innerJoin(request, eq(request.companyId, company.id))
        .innerJoin(period, eq(period.id, request.periodId))
        .leftJoin(uploadLink, eq(uploadLink.requestId, request.id))
        .where(
          and(
            eq(contact.email, email),
            eq(company.active, true),
            eq(request.status, 'open'),
            eq(period.status, 'open'),
          ),
        )
        .orderBy(desc(period.referenceMonth)),
    );
  });

  /** Existe conta com este email? A ativação passwordless pelo Link de Upload NÃO pode
   *  rodar quando existe: o magic link interno logaria NA conta existente e o vínculo
   *  entregaria a sessão dela a quem controla o Link (AUTHZ-1). */
  const userByEmail = Effect.fn('ContactsRepo.userByEmail')(function* (email: string) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email.toLowerCase()))
        .limit(1);

      if (!row) return undefined;

      const [[asAccountant], [asContact]] = await Promise.all([
        d
          .select({ id: accountant.id })
          .from(accountant)
          .where(eq(accountant.authUserId, row.id))
          .limit(1),
        d.select({ id: contact.id }).from(contact).where(eq(contact.authUserId, row.id)).limit(1),
      ]);

      return { id: row.id, isAccountant: Boolean(asAccountant), isContact: Boolean(asContact) };
    });
  });

  /** O token do convite foi entregue no email do contato: posse provada. Sem isto, o
   *  primeiro magic link nessa conta dispara o revokeUnprovenAccountAccess do better-auth
   *  e apaga a senha recém-criada. O aceite dos Termos é carimbado junto: a tela informa
   *  que criar a conta implica no aceite. */
  const markUserEmailVerified = Effect.fn('ContactsRepo.markUserEmailVerified')(function* (
    userId: string,
  ) {
    yield* db.use((d) =>
      d
        .update(user)
        .set({ emailVerified: true, termsAcceptedAt: new Date() })
        .where(eq(user.id, userId)),
    );
  });

  /** Aceite dos Termos no fluxo passwordless (a conta nasce/vincula pelo Link). */
  const markTermsAccepted = Effect.fn('ContactsRepo.markTermsAccepted')(function* (userId: string) {
    yield* db.use((d) =>
      d
        .update(user)
        .set({ termsAcceptedAt: new Date() })
        .where(and(eq(user.id, userId), isNull(user.termsAcceptedAt))),
    );
  });

  const linkAuthUser = Effect.fn('ContactsRepo.linkAuthUser')(function* (
    contactId: string,
    authUserId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .update(contact)
        .set({ authUserId })
        .where(eq(contact.id, contactId))
        .returning({ id: contact.id, companyId: contact.companyId });

      return row;
    });
  });

  /** Revogação pelo Contador (F10-7): tira o vínculo, as sessões e as passkeys. Conceder
   *  acesso sem poder revogar é defeito de segurança, não falta de feature. */
  const revokeAccess = Effect.fn('ContactsRepo.revokeAccess')(function* (
    scope: FirmScope,
    companyId: string,
    contactId: string,
  ) {
    return yield* db.withTransaction(
      db.use(async (tx) => {
        const [row] = await tx
          .select({ id: contact.id, authUserId: contact.authUserId })
          .from(contact)
          .innerJoin(company, eq(company.id, contact.companyId))
          .where(
            and(
              eq(contact.id, contactId),
              eq(contact.companyId, companyId),
              eq(company.accountingFirmId, scope),
            ),
          )
          .limit(1)
          .for('update');

        if (!row) return undefined;
        if (!row.authUserId) return { revoked: false as const };

        await tx.update(contact).set({ authUserId: null }).where(eq(contact.id, contactId));
        await tx.delete(pushSubscription).where(eq(pushSubscription.contactId, contactId));

        /* O Link de Upload é credencial separada da sessão e sobrevivia à revogação — e por
         * `POST /upload/:token/access` o revogado reativava a conta. Revogar de verdade
         * precisa matar os dois. */
        await tx
          .update(uploadLink)
          .set({ revoked: true })
          .where(eq(uploadLink.contactId, contactId));

        /* Multi-empresa: o `user` só morre quando este era o ÚLTIMO vínculo — apagá-lo com
         * outro vínculo vivo derrubaria o acesso das outras Empresas. Com vínculo restante,
         * as sessões ficam: os guards re-resolvem o escopo a cada request e a Empresa
         * revogada some na hora. Sem nenhum, apagar o `user` derruba sessões e passkeys por
         * cascade, e o Responsável volta a ser só destinatário de Link. */
        const [still] = await tx
          .select({ id: contact.id })
          .from(contact)
          .where(eq(contact.authUserId, row.authUserId!))
          .limit(1);

        if (!still) await tx.delete(user).where(eq(user.id, row.authUserId!));

        return { revoked: true as const };
      }),
    );
  });

  const findOwnedCompany = Effect.fn('ContactsRepo.findOwnedCompany')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
        .limit(1);

      return Boolean(row);
    });
  });

  const withAccess = Effect.fn('ContactsRepo.withAccess')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use((d) =>
      d
        .select({ id: contact.id, name: contact.name, email: contact.email })
        .from(contact)
        .innerJoin(company, eq(company.id, contact.companyId))
        .where(
          and(
            eq(contact.companyId, companyId),
            eq(company.accountingFirmId, scope),
            isNotNull(contact.authUserId),
          ),
        ),
    );
  });

  const contactsOf = Effect.fn('ContactsRepo.contactsOf')(function* (companyIds: string[]) {
    if (!companyIds.length) return [];

    return yield* db.use((d) =>
      d
        .select({ id: contact.id, companyId: contact.companyId, name: contact.name })
        .from(contact)
        .where(inArray(contact.companyId, companyIds)),
    );
  });

  const findMembershipsByAuthUser = Effect.fn('ContactsRepo.findMembershipsByAuthUser')(function* (
    authUserId: string,
  ) {
    return yield* db.use((d) =>
      d
        .select({ contactId: contact.id, companyId: company.id, active: company.active })
        .from(contact)
        .innerJoin(company, eq(company.id, contact.companyId))
        .where(eq(contact.authUserId, authUserId))
        .orderBy(asc(contact.createdAt), asc(contact.id)),
    );
  });

  const findUploadOwnership = Effect.fn('ContactsRepo.findUploadOwnership')(function* (
    authUserId: string,
    requestId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({ requestId: request.id, contactId: contact.id, active: company.active })
        .from(contact)
        .innerJoin(company, eq(company.id, contact.companyId))
        .innerJoin(request, eq(request.companyId, company.id))
        .where(and(eq(contact.authUserId, authUserId), eq(request.id, requestId)))
        .limit(1);

      return row;
    });
  });

  const existsByAuthUser = Effect.fn('ContactsRepo.existsByAuthUser')(function* (
    authUserId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({ id: contact.id })
        .from(contact)
        .where(eq(contact.authUserId, authUserId))
        .limit(1);

      return Boolean(row);
    });
  });

  return {
    profile,
    findByEmailInCompany,
    openRequestsForEmail,
    userByEmail,
    markUserEmailVerified,
    markTermsAccepted,
    linkAuthUser,
    revokeAccess,
    findOwnedCompany,
    withAccess,
    contactsOf,
    findMembershipsByAuthUser,
    findUploadOwnership,
    existsByAuthUser,
  };
});

export class ContactsRepo extends Context.Service<ContactsRepo, Effect.Success<typeof make>>()(
  'competa/api/contacts/ContactsRepo',
) {
  static readonly layerNoDeps = Layer.effect(ContactsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}

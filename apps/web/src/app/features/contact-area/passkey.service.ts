import { Service, inject, signal } from '@angular/core';
import { authClient } from '../../core/auth/auth-client';
import { Toaster } from '../../core/ui/toast';

/** Registro de passkey (F10-2). O login por biometria já existia na API, mas nenhuma tela
 *  registrava a credencial — sem isto o botão "Entrar com biometria" nunca teria o que
 *  usar. Exige sessão ativa, então o convite é feito depois de entrar. */
@Service()
export class PasskeyService {
  private readonly toaster = inject(Toaster);

  readonly available = typeof PublicKeyCredential !== 'undefined' && 'credentials' in navigator;

  readonly registering = signal(false);
  readonly registered = signal(false);

  async register() {
    if (!this.available) return;

    this.registering.set(true);

    try {
      const result = await authClient.passkey.addPasskey();

      if (result?.error) {
        this.toaster.error('Não foi possível ativar a biometria neste aparelho.');
        return;
      }

      this.registered.set(true);
      this.toaster.success('Biometria ativada. Na próxima vez, entre com um toque.');
    } catch {
      // recusar o prompt do aparelho é escolha do usuário, não erro a esfregar na cara
      this.toaster.info('Biometria não ativada neste aparelho.');
    } finally {
      this.registering.set(false);
    }
  }
}

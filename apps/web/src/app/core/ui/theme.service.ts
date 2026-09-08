import { DOCUMENT } from '@angular/common';
import { Service, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'competa:theme';

/** O tema escuro existia em `styles.css` (37 linhas de token) e nada o ligava. Aqui:
 *  preferência do usuário, `prefers-color-scheme` como padrão e a classe `.dark` no
 *  `<html>`, que é o que os tokens escutam. */
@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly systemDark = signal(
    this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false,
  );

  readonly preference = signal<ThemePreference>(this.stored());
  readonly dark = computed(() =>
    this.preference() === 'system' ? this.systemDark() : this.preference() === 'dark',
  );

  constructor() {
    const media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
    media?.addEventListener('change', (event) => this.systemDark.set(event.matches));

    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.dark());
      // `theme-color` fora do efeito ficaria dessincronizado do tema depois do toggle
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', this.dark() ? '#0B1220' : '#111B34');
    });

    effect(() => {
      const preference = this.preference();
      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        // navegação privada pode recusar storage: o tema só deixa de ser lembrado
      }
    });
  }

  /** Alterna entre claro e escuro a partir do que está NA TELA (não da preferência):
   *  quem está em `system` e clica espera inverter o que vê. */
  toggle() {
    this.preference.set(this.dark() ? 'light' : 'dark');
  }

  private stored(): ThemePreference {
    try {
      const value = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);

      return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}

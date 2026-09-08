import { form, submit, validateStandardSchema } from '@angular/forms/signals';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AcceptContactInviteBody } from '@contabilidade/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

/** `submit()` não chama a ação quando o formulário está inválido, e não avisa ninguém: o
 *  botão simplesmente não faz nada. Este teste prende a validade do modelo que a tela
 *  realmente usa — foi por aqui que "Ativar acesso" e "Criar acesso e entrar" morreram. */
describe('formulário de aceite do convite', () => {
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    injector = TestBed.inject(Injector);
  });

  const build = (value: { name: string; password: string }) =>
    runInInjectionContext(injector, () => {
      const model = signal(value);
      return form(model, (path) => validateStandardSchema(path, AcceptContactInviteBody));
    });

  const submitted = async (value: { name: string; password: string }) => {
    const f = build(value);
    let ran = false;

    await runInInjectionContext(injector, () =>
      submit(f, async () => {
        ran = true;
        return undefined;
      }),
    );

    return { ran, valid: f().valid(), errors: f().errors() };
  };

  it('nome em branco com senha boa é VÁLIDO e o submit roda', async () => {
    const result = await submitted({ name: '', password: 'senha-forte-123' });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.ran).toBe(true);
  });

  it('senha curta é inválida e o submit não roda', async () => {
    const result = await submitted({ name: '', password: 'curta' });

    expect(result.valid).toBe(false);
    expect(result.ran).toBe(false);
  });
});

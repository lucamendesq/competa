import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvitePage } from './invite-page';

/** Cobre a interação que quebrou duas vezes: digitar a senha e clicar no botão. Os dois
 *  defeitos anteriores eram invisíveis em teste de unidade — o formulário ficava inválido
 *  e o `submit()` não chamava a ação, sem erro nenhum na tela. */
describe('InvitePage — convite de Responsável', () => {
  let fixture: ComponentFixture<InvitePage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixture = TestBed.createComponent(InvitePage);
    fixture.componentRef.setInput('token', 'token-de-teste');
    http = TestBed.inject(HttpTestingController);

    TestBed.tick();
    http.expectOne('/invites/token-de-teste').flush({
      data: {
        email: 'ana@padaria.com',
        invitedBy: 'Contabilidade Alfa',
        companyName: 'Padaria Central',
        target: 'company',
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const passwordInput = () =>
    fixture.nativeElement.querySelector('#access-password') as HTMLInputElement;

  const submitButton = () =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLElement).textContent?.includes('Criar acesso'),
    ) as HTMLButtonElement;

  it('renderiza o formulário do Responsável com senha', () => {
    expect(passwordInput()).toBeTruthy();
    expect(submitButton()).toBeTruthy();
  });

  it('clicar em "Criar acesso e entrar" dispara o POST', async () => {
    const input = passwordInput();
    input.value = 'senha-forte-123';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    submitButton().click();
    await fixture.whenStable();

    const posted = http.expectOne('/invites/token-de-teste/contact-account');
    expect(posted.request.method).toBe('POST');
    expect(posted.request.body.password).toBe('senha-forte-123');
  });
});

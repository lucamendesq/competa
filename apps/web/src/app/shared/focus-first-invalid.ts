export function focusFirstInvalid(host: HTMLElement): void {
  const selector =
    'input.ng-invalid, select.ng-invalid, textarea.ng-invalid, ' +
    'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]';

  const first = host.querySelector<HTMLElement>(selector);
  if (!first) return;

  first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  first.focus({ preventScroll: true });
}

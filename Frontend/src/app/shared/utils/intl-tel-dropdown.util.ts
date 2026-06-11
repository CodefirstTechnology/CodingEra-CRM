const ITI_DROPDOWN_HIDE = 'iti__hide';

/**
 * Closes open intl-tel-input country dropdowns when the user clicks outside them.
 * Uses capture phase so it still runs inside CRM modals that call stopPropagation().
 */
export function handleCrmIntlTelDocumentMouseDown(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const openDropdowns = document.querySelectorAll(
    `.iti__dropdown-content:not(.${ITI_DROPDOWN_HIDE})`,
  );
  if (!openDropdowns.length) return;

  openDropdowns.forEach((dropdownEl) => {
    const dropdown = dropdownEl as HTMLElement;
    if (dropdown.contains(target)) return;

    const idMatch = dropdown.id.match(/^iti-(\d+)__dropdown-content$/);
    const itiId = idMatch?.[1];
    if (!itiId) return;

    const input = document.querySelector(
      `.iti__tel-input[data-intl-tel-input-id="${itiId}"]`,
    );
    const itiRoot = input?.closest('.iti');
    if (itiRoot?.contains(target) && target.closest('.iti__selected-country')) {
      return;
    }

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

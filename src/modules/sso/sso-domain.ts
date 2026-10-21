const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(value: string): string | null {
  const domain = value.trim().toLowerCase();

  return DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function domainOfEmail(email: string): string | null {
  const at = email.lastIndexOf('@');

  return at > 0 ? normalizeDomain(email.slice(at + 1)) : null;
}

export interface RichtextAllow {
  tags: string[];
  attributes: Record<string, string[]>;
  schemes: string[];
}

// Never allowed, whatever the allow-list published by the API says: the
// preview runs in the admin origin, so it keeps its own wall in front of it.
const NEVER_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
]);
const NEVER_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'cite']);

function attributeAllowed(name: string): boolean {
  return !(name.startsWith('on') || name === 'style' || name === 'srcdoc');
}

function schemeOf(value: string): string | null {
  // Control characters and spaces are dropped by browsers before the scheme
  // is read, so they are dropped here too.
  const compact = Array.from(value)
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('');
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(compact);

  return match ? match[1]!.toLowerCase() : null;
}

function urlAllowed(value: string, allow: RichtextAllow): boolean {
  const scheme = schemeOf(value);

  if (scheme === null) {
    return !value.trim().startsWith('//');
  }

  return allow.schemes.includes(scheme) && !NEVER_SCHEMES.has(scheme);
}

function copyAttributes(
  from: Element,
  to: Element,
  allow: RichtextAllow,
): void {
  const permitted = allow.attributes[from.localName] ?? [];

  for (const attribute of Array.from(from.attributes)) {
    const name = attribute.name.toLowerCase();

    if (!permitted.includes(name) || !attributeAllowed(name)) {
      continue;
    }

    if (URL_ATTRIBUTES.has(name) && !urlAllowed(attribute.value, allow)) {
      continue;
    }

    to.setAttribute(name, attribute.value);
  }

  if (to.localName === 'a') {
    to.setAttribute('rel', 'noopener noreferrer nofollow');
  }
}

function cloneSafe(
  node: Node,
  allow: RichtextAllow,
  into: ParentNode,
  document: Document,
): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(child.textContent ?? ''));
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = child as Element;
    const tag = element.localName;

    if (NEVER_TAGS.has(tag)) {
      continue;
    }

    if (!allow.tags.includes(tag)) {
      cloneSafe(element, allow, into, document);
      continue;
    }

    const copy = document.createElement(tag);
    copyAttributes(element, copy, allow);
    cloneSafe(element, allow, copy, document);
    into.appendChild(copy);
  }
}

/**
 * Draws what the API would keep of this HTML into the container. It parses in
 * an inert document and rebuilds the result from createElement and text
 * nodes, never from the markup itself, so nothing the person typed can run in
 * the admin. The API stays the authority: this only previews its answer.
 */
export function renderSafeHtml(
  container: HTMLElement,
  html: string,
  allow: RichtextAllow,
): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const fragment = container.ownerDocument.createDocumentFragment();

  cloneSafe(parsed.body, allow, fragment, container.ownerDocument);
  container.replaceChildren(fragment);
}

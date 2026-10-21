import sanitizeHtml from 'sanitize-html';

export const RICHTEXT_DEFAULT_MAX_LENGTH = 20000;

export const RICHTEXT_DEFAULT_TAGS: readonly string[] = [
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'a',
];

export const RICHTEXT_DEFAULT_ATTRIBUTES: Readonly<
  Record<string, readonly string[]>
> = { a: ['href', 'title'] };

export const RICHTEXT_DEFAULT_SCHEMES: readonly string[] = [
  'http',
  'https',
  'mailto',
];

// Whatever an allow-list says, these never get through: a tag that runs or
// embeds something, an attribute that runs script or styles, a scheme that
// carries code. A blueprint naming one is refused at generation, and this is
// the second wall for a spec written by hand.
export const RICHTEXT_FORBIDDEN_TAGS: readonly string[] = [
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
];

export const RICHTEXT_FORBIDDEN_SCHEMES: readonly string[] = [
  'javascript',
  'data',
  'vbscript',
  'file',
];

export function isForbiddenRichtextAttribute(name: string): boolean {
  const lower = name.toLowerCase();

  return lower.startsWith('on') || lower === 'style' || lower === 'srcdoc';
}

export interface RichtextAllow {
  tags?: readonly string[];
  attributes?: Readonly<Record<string, readonly string[]>>;
  schemes?: readonly string[];
}

export interface ResolvedRichtextAllow {
  tags: string[];
  attributes: Record<string, string[]>;
  schemes: string[];
}

export interface RichtextFieldSpec {
  name: string;
  maxLength: number;
  allow?: RichtextAllow;
}

export function resolveRichtextAllow(
  allow: RichtextAllow = {},
): ResolvedRichtextAllow {
  const tags = (allow.tags ?? RICHTEXT_DEFAULT_TAGS).filter(
    (tag) => !RICHTEXT_FORBIDDEN_TAGS.includes(tag.toLowerCase()),
  );
  const attributes = Object.fromEntries(
    Object.entries(allow.attributes ?? RICHTEXT_DEFAULT_ATTRIBUTES).map(
      ([tag, names]) => [
        tag,
        names.filter((name) => !isForbiddenRichtextAttribute(name)),
      ],
    ),
  );
  const schemes = (allow.schemes ?? RICHTEXT_DEFAULT_SCHEMES).filter(
    (scheme) => !RICHTEXT_FORBIDDEN_SCHEMES.includes(scheme.toLowerCase()),
  );

  return { tags: [...tags], attributes, schemes: [...schemes] };
}

/**
 * Strips everything outside the allow-list: a tag that is not listed is
 * dropped (its text stays, except for script, style and the like whose content
 * goes with them), so is an attribute that is not listed for its tag, and a
 * link whose scheme is not listed loses its href. Links get
 * rel="noopener noreferrer nofollow" so a link in user content cannot reach
 * back to the page that shows it.
 */
export function sanitizeRichtext(html: string, allow?: RichtextAllow): string {
  const resolved = resolveRichtextAllow(allow);

  return sanitizeHtml(html, {
    allowedTags: resolved.tags,
    // rel is set by the transform below, which overrides whatever was sent.
    allowedAttributes: resolved.tags.includes('a')
      ? { ...resolved.attributes, a: [...(resolved.attributes.a ?? []), 'rel'] }
      : resolved.attributes,
    allowedSchemes: resolved.schemes,
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: resolved.tags.includes('a')
      ? {
          a: sanitizeHtml.simpleTransform('a', {
            rel: 'noopener noreferrer nofollow',
          }),
        }
      : {},
  });
}

/** What goes into the column: every richtext string of a write, sanitised. */
export function sanitizeRichtextWrite<T extends object>(
  data: T,
  specs: readonly RichtextFieldSpec[],
): T {
  const clean = { ...data } as Record<string, unknown>;

  for (const spec of specs) {
    const value = clean[spec.name];

    if (typeof value === 'string') {
      clean[spec.name] = sanitizeRichtext(value, spec.allow);
    }
  }

  return clean as T;
}

/**
 * What comes out of the column: sanitised again, because a row can reach the
 * table without passing a write that did (an import, a script, a column that
 * was text before it became richtext, an allow-list that has since narrowed).
 */
export function sanitizeRichtextRead<T extends object>(
  record: T,
  specs: readonly RichtextFieldSpec[],
): T {
  return sanitizeRichtextWrite(record, specs);
}

export function describeRichtext(
  specs: readonly RichtextFieldSpec[],
  name: string,
): { maxLength: number; allow: ResolvedRichtextAllow } {
  const spec = specs.find((candidate) => candidate.name === name);

  return {
    maxLength: spec?.maxLength ?? RICHTEXT_DEFAULT_MAX_LENGTH,
    allow: resolveRichtextAllow(spec?.allow),
  };
}

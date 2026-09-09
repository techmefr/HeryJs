interface WeightedTag {
  tag: string;
  quality: number;
}

function parseAcceptLanguage(header: string): WeightedTag[] {
  return header
    .split(',')
    .map((part) => {
      const [tag, qParam] = part.trim().split(';q=');
      const quality = qParam ? Number(qParam) : 1;

      return {
        tag: (tag ?? '').trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 1,
      };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Matches by base language subtag ("fr-FR" satisfies a supported "fr") since
 * a project declares the languages it ships translations for, not every
 * region variant a browser might send.
 */
export function negotiateLocale(
  acceptLanguageHeader: string | undefined,
  supportedLocales: string[],
  fallback: string,
): string {
  if (!acceptLanguageHeader) {
    return fallback;
  }

  const requested = parseAcceptLanguage(acceptLanguageHeader);

  for (const { tag } of requested) {
    if (tag === '*') {
      return fallback;
    }

    const base = tag.split('-')[0] ?? tag;
    const match = supportedLocales.find(
      (locale) => locale.toLowerCase() === tag || locale.toLowerCase() === base,
    );

    if (match) {
      return match;
    }
  }

  return fallback;
}

export type TranslationTemplate =
  string | ((details: Record<string, unknown>) => string);

export type Catalogue = Record<string, Record<string, TranslationTemplate>>;

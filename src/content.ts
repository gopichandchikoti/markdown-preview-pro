(function (root) {
  'use strict';
  function validate(model:ContentModelShape) {
    if (model.schemaVersion !== 1 || typeof model.defaultLocale !== 'string' || !model.locales?.[model.defaultLocale])
      throw Error('Invalid content model');
    const defaults = model.locales[model.defaultLocale];
    const keys = Object.keys(defaults).sort();
    const slots = (value:string) => [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    for (const dictionary of Object.values(model.locales)) {
      if (Object.keys(dictionary).sort().join('|') !== keys.join('|')) throw Error('Content key mismatch');
      for (const key of keys) if (typeof dictionary[key] !== 'string' || slots(dictionary[key]) !== slots(defaults[key]))
        throw Error('Content placeholder mismatch: ' + key);
    }
    return model;
  }
  function create(model:ContentModelShape, requested?:string) {
    validate(model);
    const locale = requested && model.locales[requested] ? requested : model.defaultLocale;
    /** @param {string} key @param {Record<string,string|number>} values */
    const t = (key:string, values:Record<string,string|number> = {}) => {
      const value = model.locales[locale][key] ?? model.locales[model.defaultLocale][key];
      if (typeof value !== 'string') throw Error('Missing content: ' + key);
      return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
    };
    return { t, locale };
  }
  const api = { create, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Content = create(root.ContentModel, root.navigator.language);
})(globalThis);

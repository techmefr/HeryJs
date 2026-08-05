import { resolvePruneRule } from './prune.config';

// hery.config.ts's prune.default applies to any model name, prunable or
// not -- resolvePruneRule only resolves the rule, it does not know which
// models actually carry deletedAt. Filtering that is prunableModels()'s job.
describe('resolvePruneRule', () => {
  it("resolves the project's configured default retention", () => {
    expect(resolvePruneRule('BlogPost')).toEqual({
      retentionDays: 30,
      lock: false,
    });
  });

  it('applies the same default to a model with no override', () => {
    expect(resolvePruneRule('AnyModelName')).toEqual({
      retentionDays: 30,
      lock: false,
    });
  });
});

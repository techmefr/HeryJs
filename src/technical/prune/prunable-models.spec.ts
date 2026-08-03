import { prunableModels } from './prunable-models';

describe('prunableModels', () => {
  it('names exactly the models that carry deletedAt', () => {
    const models = prunableModels();

    expect(models).toContain('Workout');
    expect(models).not.toContain('User');
    expect(models).not.toContain('Team');
    expect(models).not.toContain('AuditLog');
  });
});

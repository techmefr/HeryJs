import { FeatureFlagsService } from './feature-flags.service';
import type { FeatureFlagsDriverRegistry } from './feature-flags-driver.registry';

describe('FeatureFlagsService', () => {
  it('delegates every call to the registry active driver', async () => {
    const isEnabled = jest.fn().mockResolvedValue(true);
    const list = jest.fn().mockResolvedValue([]);
    const listAll = jest.fn().mockResolvedValue({ records: [], total: 0 });
    const set = jest.fn().mockResolvedValue({});
    const registry = {
      active: { isEnabled, list, listAll, set },
    } as unknown as FeatureFlagsDriverRegistry;
    const service = new FeatureFlagsService(registry);

    await service.isEnabled('beta', 'tenant-1');
    await service.list('tenant-1');
    await service.listAll({ skip: 0, take: 10 } as never);
    await service.set('beta', true, 'tenant-1');

    expect(isEnabled).toHaveBeenCalledWith('beta', 'tenant-1');
    expect(list).toHaveBeenCalledWith('tenant-1');
    expect(listAll).toHaveBeenCalledWith({ skip: 0, take: 10 });
    expect(set).toHaveBeenCalledWith('beta', true, 'tenant-1');
  });
});

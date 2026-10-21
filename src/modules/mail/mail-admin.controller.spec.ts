import { MailAdminController } from './mail-admin.controller';
import type { MailDriverRegistry } from './mail-driver.registry';
import type { MailService } from './mail.service';
import { TestMail } from './test-mail.mailable';

function controller(send = jest.fn().mockResolvedValue(undefined)) {
  const drivers = {
    summary: { active: 'smtp', declared: ['log', 'smtp'] },
  } as unknown as MailDriverRegistry;

  return {
    send,
    instance: new MailAdminController(
      { send } as unknown as MailService,
      drivers,
    ),
  };
}

describe('MailAdminController', () => {
  it('lists every declared driver and marks the active one', () => {
    expect(controller().instance.driversList().data).toEqual([
      { driver: 'log', active: false },
      { driver: 'smtp', active: true },
    ]);
  });

  it('queues a test mail to the address the operator typed', async () => {
    const { send, instance } = controller();

    const result = await instance.sendTest({ to: 'ops@example.com' });

    expect(send).toHaveBeenCalledWith(expect.any(TestMail));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@example.com' }),
    );
    expect(result.data).toEqual({ to: 'ops@example.com' });
  });
});

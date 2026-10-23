import { everyone } from '#kernel/public/capabilities';

export const canManageOwnNotificationPreferences = everyone('own');

import { faker } from '@faker-js/faker';

export interface WorkoutFactoryOverrides {
  ownerId: string;
  tenantId?: string;
  title?: string;
  trashed?: boolean;
}

export interface WorkoutFactoryOptions {
  count?: number;
}

function buildWorkout(overrides: WorkoutFactoryOverrides) {
  return {
    title: overrides.title ?? faker.lorem.words(3),
    ownerId: overrides.ownerId,
    ...(overrides.tenantId ? { tenantId: overrides.tenantId } : {}),
    deletedAt: overrides.trashed ? new Date() : null,
  };
}

export function workoutFactory(
  overrides: WorkoutFactoryOverrides,
): ReturnType<typeof buildWorkout>;
export function workoutFactory(
  overrides: WorkoutFactoryOverrides,
  options: Required<WorkoutFactoryOptions>,
): ReturnType<typeof buildWorkout>[];
export function workoutFactory(
  overrides: WorkoutFactoryOverrides,
  options: WorkoutFactoryOptions = {},
) {
  if (options.count === undefined) {
    return buildWorkout(overrides);
  }

  return Array.from({ length: options.count }, () => buildWorkout(overrides));
}

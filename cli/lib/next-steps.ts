import pc from 'picocolors';

/**
 * The closing list every command that leaves work for the developer ends with.
 * Shared so `install` and `module:new` cannot drift into two formats for the
 * same thing.
 */
export function printNextSteps(steps: string[]): void {
  console.log('');
  console.log(pc.cyan('Next steps:'));
  steps.forEach((step, index) => {
    console.log(`  ${index + 1}. ${step}`);
  });
}

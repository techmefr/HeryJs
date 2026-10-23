import pc from 'picocolors';
import { loadOfficialModules } from '../cli/lib/module-discovery';
import { KERNEL_DIR, kernelWritesOf } from '../cli/lib/module-destinations';
import { recordPatches } from '../cli/lib/module-patches';

/**
 * No module installs into the kernel or edits one of its files. A project
 * receives the kernel as @heryjs/core; a module that copied itself into
 * src/technical, or patched a file there, would be lost on the next upgrade
 * and would keep `hery new` copying the kernel to make room for it.
 */
export async function checkModuleDestinations(): Promise<boolean> {
  const modules = loadOfficialModules();
  const problems: string[] = [];

  for (const module of modules) {
    problems.push(...kernelWritesOf(module, await recordPatches(module)));
  }

  problems.forEach((problem) => console.error(pc.red(`✖ ${problem}`)));

  if (problems.length > 0) {
    console.error(
      `\nA module lands in src/modules/<name> (or its own workspace) and reaches the\nkernel through @heryjs/core: a registry, a provider or a hook it exposes.`,
    );

    return false;
  }

  console.log(
    pc.green(
      `✔ none of the ${modules.length} modules installs into or patches ${KERNEL_DIR}`,
    ),
  );

  return true;
}

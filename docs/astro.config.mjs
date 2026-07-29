// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: 'HeryJs',
			description: 'A convention framework for NestJS. Generate once. Own your code.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/techmefr/HeryJs' },
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ label: 'Introduction', slug: 'introduction' },
						{ label: 'Project structure', slug: 'guides/project-structure' },
					],
				},
				{
					label: 'Core concepts',
					items: [
						{ label: 'Capabilities', slug: 'guides/capabilities' },
						{ label: 'Multi-tenancy', slug: 'guides/tenancy' },
						{ label: 'Errors and responses', slug: 'guides/errors-and-responses' },
					],
				},
				{
					label: 'The generator',
					items: [
						{ label: 'The hery CLI', slug: 'guides/cli' },
						{ label: 'The blueprint contract', slug: 'guides/blueprint' },
						{ label: 'What gets generated', slug: 'guides/generated-files' },
					],
				},
			],
		}),
	],
});

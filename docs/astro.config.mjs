// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://techmefr.github.io',
	base: '/HeryJs',
	integrations: [
		starlight({
			title: 'HeryJs',
			description: 'A convention framework for NestJS. Generate once. Own your code.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/techmefr/HeryJs' },
			],
			customCss: ['./src/styles/custom.css'],
			components: {
				Sidebar: './src/components/Sidebar.astro',
			},
			sidebar: [
				{
					label: 'Backend',
					collapsed: true,
					items: [
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
								{ label: 'Authentication', slug: 'guides/authentication' },
								{ label: 'Capabilities', slug: 'guides/capabilities' },
								{ label: 'Teams', slug: 'guides/teams' },
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
								{ label: 'Testing conventions', slug: 'guides/testing' },
							],
						},
						{
							label: 'Modules',
							items: [
								{ label: 'The module system', slug: 'guides/modules' },
								{ label: 'Full-text search', slug: 'guides/search' },
								{ label: 'Realtime', slug: 'guides/realtime' },
								{ label: 'Mail and storage', slug: 'guides/mail-and-storage' },
								{ label: 'Impersonation', slug: 'guides/impersonation' },
								{ label: 'GraphQL and MCP', slug: 'guides/graphql-and-mcp' },
							],
						},
						{
							label: 'Admin panel',
							items: [{ label: 'Admin panel and introspection', slug: 'guides/admin' }],
						},
					],
				},
				{
					label: 'Frontend',
					collapsed: true,
					items: [
						{ label: 'Overview', slug: 'guides/endpoints/overview' },
						{ label: 'Search', slug: 'guides/endpoints/search' },
						{ label: 'Details', slug: 'guides/endpoints/details' },
						{ label: 'Create and update', slug: 'guides/endpoints/mutate' },
						{ label: 'Delete and restore', slug: 'guides/endpoints/destroy' },
					],
				},
				{
					label: 'Debug',
					collapsed: true,
					items: [
						{ label: 'Developer tooling', slug: 'guides/devtools' },
						{ label: 'Pipeline trace', slug: 'guides/debugging' },
					],
				},
			],
		}),
	],
});

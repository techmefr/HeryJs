// Adds a per-line copy button inside every Expressive Code block, next to the
// whole-file copy button that ships with the `frames` plugin.

const COPY_ICON =
	'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON =
	'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function legacyCopy(text: string): boolean {
	const pre = document.createElement('pre');
	Object.assign(pre.style, {
		opacity: '0',
		pointerEvents: 'none',
		position: 'absolute',
		left: '0',
		top: '0',
		width: '1px',
		height: '1px',
		userSelect: 'all',
	});
	pre.textContent = text;
	document.body.append(pre);
	const range = document.createRange();
	range.selectNode(pre);
	const selection = getSelection();
	if (!selection) {
		pre.remove();
		return false;
	}
	selection.removeAllRanges();
	selection.addRange(range);
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} finally {
		selection.removeAllRanges();
		pre.remove();
	}
	return ok;
}

async function copyLine(button: HTMLButtonElement, line: HTMLElement) {
	const text = (line.textContent ?? '').replace(/​/g, '');
	let ok = false;
	try {
		await navigator.clipboard.writeText(text);
		ok = true;
	} catch {
		ok = legacyCopy(text);
	}
	if (!ok) return;
	button.classList.add('is-copied');
	button.innerHTML = CHECK_ICON;
	window.setTimeout(() => {
		button.classList.remove('is-copied');
		button.innerHTML = COPY_ICON;
	}, 1200);
}

function wireLine(line: HTMLElement) {
	if (line.querySelector(':scope > .line-copy')) return;
	if (!line.textContent?.trim()) return;
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'line-copy';
	button.setAttribute('aria-label', 'Copy line');
	button.innerHTML = COPY_ICON;
	button.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		void copyLine(button, line);
	});
	line.append(button);
}

function wireBlock(root: ParentNode) {
	root.querySelectorAll?.('.expressive-code .ec-line').forEach(line => wireLine(line as HTMLElement));
}

wireBlock(document);

new MutationObserver(mutations => {
	for (const mutation of mutations) {
		mutation.addedNodes.forEach(node => {
			if (node instanceof Element) wireBlock(node);
		});
	}
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener('astro:page-load', () => wireBlock(document));

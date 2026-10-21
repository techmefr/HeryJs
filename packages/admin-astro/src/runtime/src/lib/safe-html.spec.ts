import { describe, expect, it } from 'vitest';
import { renderSafeHtml } from './safe-html';
import type { RichtextAllow } from './safe-html';

const ALLOW: RichtextAllow = {
  tags: ['p', 'strong', 'em', 'ul', 'li', 'a'],
  attributes: { a: ['href', 'title'] },
  schemes: ['http', 'https', 'mailto'],
};

function render(html: string, allow: RichtextAllow = ALLOW): HTMLElement {
  const container = document.createElement('div');
  renderSafeHtml(container, html, allow);

  return container;
}

const PAYLOADS = [
  '<script>window.pwned = 1</script><p>ok</p>',
  '<img src=x onerror="window.pwned = 1">',
  '<a href="javascript:window.pwned=1">x</a>',
  '<a href="JaVaScRiPt:window.pwned=1">x</a>',
  '<a href="&#106;avascript:window.pwned=1">x</a>',
  '<a href=" \tjavascript:window.pwned=1">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="//evil.example/x">x</a>',
  '<p onclick="window.pwned=1">x</p>',
  '<p style="background:url(javascript:1)">x</p>',
  '<svg onload="window.pwned=1"><script>window.pwned=1</script></svg>',
  '<iframe srcdoc="<script>window.pwned=1</script>"></iframe>',
  '<form action="javascript:1"><input></form>',
  '<style>*{x:y}</style>',
  '<math><mi xlink:href="javascript:1">x</mi></math>',
];

describe('renderSafeHtml', () => {
  it.each(PAYLOADS)('leaves nothing executable of %j', (payload) => {
    const container = render(payload);
    const html = container.innerHTML;

    expect(html).not.toMatch(
      /<\s*(script|iframe|svg|math|style|form|input|img)|javascript:|data:|\son[a-z]+\s*=|\sstyle\s*=|srcdoc/i,
    );
    expect(
      container.querySelector(
        'script, iframe, svg, math, style, form, input, img',
      ),
    ).toBeNull();
    expect((window as { pwned?: number }).pwned).toBeUndefined();
  });

  it('keeps the formatting the allow-list names', () => {
    expect(
      render('<p>a <strong>b</strong> <em>c</em></p><ul><li>d</li></ul>')
        .innerHTML,
    ).toBe('<p>a <strong>b</strong> <em>c</em></p><ul><li>d</li></ul>');
  });

  it('keeps the text of a tag it drops, and none of a script', () => {
    expect(render('<div>kept</div><script>gone()</script>').innerHTML).toBe(
      'kept',
    );
  });

  it('keeps a safe link and hardens it', () => {
    const link = render(
      '<a href="https://example.com/x" title="t" target="_blank">go</a>',
    ).querySelector('a')!;

    expect(link.getAttribute('href')).toBe('https://example.com/x');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(link.hasAttribute('target')).toBe(false);
  });

  it('never allows a tag the API forbids, even if the published list names it', () => {
    const container = render('<script>x()</script><p>ok</p>', {
      ...ALLOW,
      tags: ['p', 'script'],
    });

    expect(container.innerHTML).toBe('<p>ok</p>');
  });

  it('shows text as text: an angle bracket is escaped, not parsed into a tag', () => {
    expect(render('1 &lt; 2').textContent).toBe('1 < 2');
    expect(render('1 &lt; 2').children).toHaveLength(0);
  });
});

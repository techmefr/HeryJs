import {
  describeRichtext,
  resolveRichtextAllow,
  sanitizeRichtext,
  sanitizeRichtextRead,
  sanitizeRichtextWrite,
} from './richtext';

const PAYLOADS = [
  '<script>alert(1)</script><p>ok</p>',
  '<SCRIPT SRC=//evil.example/x.js></SCRIPT>',
  '<img src=x onerror=alert(1)>',
  '<img src="x" onerror="alert(1)">',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="  javascript:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="//evil.example/phish">x</a>',
  '<p onclick="alert(1)">x</p>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<svg><script>alert(1)</script></svg>',
  '<svg onload=alert(1)>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="data:text/html,<script>alert(1)</script>"></object>',
  '<embed src="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><input type=submit></form>',
  '<body onload=alert(1)>',
  '<style>*{background:url(javascript:alert(1))}</style>',
  '<link rel=stylesheet href="javascript:alert(1)">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<p>a<script>alert(1)</script>b</p>',
  '<textarea><script>alert(1)</script></textarea>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
];

const DANGEROUS =
  /<\s*(script|iframe|svg|math|style|object|embed|form|input|link|meta|body|textarea|noscript)|javascript:|vbscript:|data:|\son[a-z]+\s*=|\sstyle\s*=|srcdoc/i;

describe('sanitizeRichtext', () => {
  it.each(PAYLOADS)('strips the payload %j', (payload) => {
    const clean = sanitizeRichtext(payload);

    expect(clean).not.toMatch(DANGEROUS);
    expect(clean).not.toContain('alert(1)</');
  });

  it('keeps the formatting the default allow-list names', () => {
    expect(
      sanitizeRichtext(
        '<h2>Title</h2><p>a <strong>b</strong> <em>c</em></p><ul><li>d</li></ul>',
      ),
    ).toBe(
      '<h2>Title</h2><p>a <strong>b</strong> <em>c</em></p><ul><li>d</li></ul>',
    );
  });

  it('keeps the text of a tag it drops, but not the content of a script', () => {
    expect(sanitizeRichtext('<div>kept</div><script>gone()</script>')).toBe(
      'kept',
    );
  });

  it('keeps a safe link and hardens it', () => {
    expect(
      sanitizeRichtext('<a href="https://example.com/x?a=1" title="t">go</a>'),
    ).toBe(
      '<a href="https://example.com/x?a=1" title="t" rel="noopener noreferrer nofollow">go</a>',
    );
  });

  it('drops the href of a link whose scheme is not allowed', () => {
    expect(sanitizeRichtext('<a href="ftp://example.com">x</a>')).not.toContain(
      'href',
    );
  });

  it('escapes a bare angle bracket instead of letting it open a tag', () => {
    expect(sanitizeRichtext('1 < 2 && 3 > 2')).toBe(
      '1 &lt; 2 &amp;&amp; 3 &gt; 2',
    );
  });
});

describe('a configured allow-list', () => {
  it('narrows or widens what is kept', () => {
    expect(
      sanitizeRichtext('<p>a <strong>b</strong></p>', { tags: ['p'] }),
    ).toBe('<p>a b</p>');
    expect(
      sanitizeRichtext('<img src="https://example.com/a.png" alt="a">', {
        tags: ['img'],
        attributes: { img: ['src', 'alt'] },
      }),
    ).toBe('<img src="https://example.com/a.png" alt="a" />');
  });

  it('never lets a dangerous tag, attribute or scheme in, even when it is listed', () => {
    const allow = {
      tags: ['p', 'script', 'iframe', 'svg', 'a'],
      attributes: {
        p: ['onclick', 'style', 'class'],
        a: ['href', 'onmouseover'],
      },
      schemes: ['https', 'javascript', 'data'],
    };
    const resolved = resolveRichtextAllow(allow);

    expect(resolved.tags).toEqual(['p', 'a']);
    expect(resolved.attributes).toEqual({ p: ['class'], a: ['href'] });
    expect(resolved.schemes).toEqual(['https']);

    for (const payload of PAYLOADS) {
      expect(sanitizeRichtext(payload, allow)).not.toMatch(DANGEROUS);
    }
  });
});

describe('writing and reading a record', () => {
  const specs = [{ name: 'body', maxLength: 100 }];

  it('sanitises only the richtext fields of a write', () => {
    expect(
      sanitizeRichtextWrite(
        { body: '<script>x()</script><p>ok</p>', title: '<b>raw</b>' },
        specs,
      ),
    ).toEqual({ body: '<p>ok</p>', title: '<b>raw</b>' });
  });

  it('leaves an absent field absent', () => {
    expect(sanitizeRichtextWrite({ title: 'x' }, specs)).toEqual({
      title: 'x',
    });
  });

  it('never trusts what the column holds on read', () => {
    expect(
      sanitizeRichtextRead(
        { id: '1', body: '<img src=x onerror=alert(1)><p>ok</p>' },
        specs,
      ),
    ).toEqual({ id: '1', body: '<img /><p>ok</p>'.replace('<img />', '') });
  });

  it('describes the limit and the resolved allow-list', () => {
    const described = describeRichtext(specs, 'body');

    expect(described.maxLength).toBe(100);
    expect(described.allow.tags).toContain('p');
    expect(described.allow.schemes).toEqual(['http', 'https', 'mailto']);
  });
});

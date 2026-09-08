import { describe, expect, it } from 'vitest';
import { ICONS, icon, iconFor, tintOf } from './icons';

describe('icon rendering', () => {
  it('draws an svg at the default size', () => {
    const element = icon(ICONS.brand);

    expect(element.tagName.toLowerCase()).toBe('svg');
    expect(element.getAttribute('width')).toBe('16');
    expect(element.getAttribute('height')).toBe('16');
  });

  it('draws at the size it was given', () => {
    const element = icon(ICONS.brand, 26);

    expect(element.getAttribute('width')).toBe('26');
    expect(element.getAttribute('height')).toBe('26');
  });

  // Every icon here sits next to its own label, so a screen reader announcing
  // it would read the label twice.
  it('hides itself from assistive technology', () => {
    expect(icon(ICONS.brand).getAttribute('aria-hidden')).toBe('true');
  });
});

describe('icon lookup', () => {
  it('gives a known route its own icon', () => {
    expect(iconFor('/mail')).not.toBe(iconFor('/notifications'));
  });

  // A module this admin has never heard of still has to get an entry rather
  // than a hole in the nav, so the fallback is a real icon, not undefined.
  it('falls back to the table icon for a route it has never heard of', () => {
    expect(iconFor('/something-nobody-planned-for')).toBeTruthy();
    expect(iconFor('/something-nobody-planned-for')).toBe(
      iconFor('/blog-posts'),
    );
  });

  it('renders the fallback without complaint', () => {
    expect(icon(iconFor('/unknown')).tagName.toLowerCase()).toBe('svg');
  });
});

// The tint is derived rather than configured, so a section keeps its colour
// across reloads and a route nobody planned for still gets one.
describe('route tints', () => {
  it('gives the same route the same tint every time', () => {
    expect(tintOf('/blog-posts')).toBe(tintOf('/blog-posts'));
  });

  it('stays inside the accent hues the stylesheet defines', () => {
    const routes = [
      '/blog-posts',
      '/seeders',
      '/audit-logs',
      '/mail',
      '/notifications',
      '/feature-flags',
      '/inspector/requests',
      '/scheduler/tasks',
      '',
    ];

    routes.forEach((route) => expect(tintOf(route)).toMatch(/^tint-[0-5]$/));
  });

  it('does not give every route the same tint', () => {
    const tints = new Set(
      ['/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h'].map(tintOf),
    );

    expect(tints.size).toBeGreaterThan(1);
  });
});

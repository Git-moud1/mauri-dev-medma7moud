import { test, expect } from '@playwright/test';
import { projectSchema, settingsSchema, projectToStored } from '../src/lib/content/types';
import { projects as bundled } from '../src/data/projects';

/**
 * Unit tests on the fallback contract.
 *
 * A cold store is the normal case, not an edge case: it is what every first
 * deploy looks like, and what a Blobs outage looks like. If the bundled
 * catalogue ever stops satisfying the schema the public site falls back to
 * nothing, so this is checked before anything can read from it.
 */
test.describe('content schemas', () => {
  test('every bundled project satisfies the schema', () => {
    for (const project of bundled) {
      const result = projectSchema.safeParse(project);
      expect(
        result.success,
        `${project.id}: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    }
  });

  test('the bundled catalogue converts to stored shape', () => {
    expect(bundled.map(projectToStored)).toHaveLength(bundled.length);
  });

  test('a project missing one locale is rejected', () => {
    const [first] = bundled;
    if (!first) throw new Error('no bundled projects to derive a fixture from');
    const broken = { ...first, title: { ar: 'x', en: 'y' } };
    expect(projectSchema.safeParse(broken).success).toBe(false);
  });

  test('a non-https link is rejected', () => {
    const [first] = bundled;
    if (!first) throw new Error('no bundled projects to derive a fixture from');
    expect(
      projectSchema.safeParse({ ...first, link: 'http://example.com' }).success,
    ).toBe(false);
  });

  test('an id with spaces or capitals is rejected', () => {
    const [first] = bundled;
    if (!first) throw new Error('no bundled projects to derive a fixture from');
    expect(projectSchema.safeParse({ ...first, id: 'Not Valid' }).success).toBe(false);
  });

  test('settings derive the wa.me URL from the number', () => {
    const parsed = settingsSchema.parse({
      whatsappNumber: '22231317501',
      socials: [],
      heroStats: { years: 5, projects: 120, stacks: 10 },
      availableForWork: true,
    });
    expect(parsed.whatsappUrl).toBe('https://wa.me/22231317501');
  });

  test('a non-https social link is rejected', () => {
    const result = settingsSchema.safeParse({
      whatsappNumber: '22231317501',
      socials: [{ platform: 'GitHub', url: 'http://github.com/x', label: 'GitHub' }],
      heroStats: { years: 5, projects: 120, stacks: 10 },
      availableForWork: true,
    });
    expect(result.success).toBe(false);
  });

  test('a WhatsApp number with punctuation is rejected', () => {
    const result = settingsSchema.safeParse({
      whatsappNumber: '+222 31 31 75 01',
      socials: [],
      heroStats: { years: 5, projects: 120, stacks: 10 },
      availableForWork: true,
    });
    expect(result.success).toBe(false);
  });
});

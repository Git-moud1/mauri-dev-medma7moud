import { test, expect } from '@playwright/test';
import { projectSchema, settingsSchema, projectToStored } from '../src/lib/content/types';
import { projects as bundled } from '../src/data/projects';
import { SOCIAL_PLATFORMS, socialPlatform, type SocialKey } from '../src/lib/social';

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
    const parsed = settingsSchema.parse(settings());
    expect(parsed.whatsappUrl).toBe('https://wa.me/22231317501');
  });

  /**
   * Was "a non-https social link is rejected". The rule changed with the fixed
   * platform set: the host is now checked against that platform's own domains,
   * so an `http://github.com` link is known to be GitHub and is upgraded
   * rather than refused. Rejecting it made the owner retype a URL the site
   * could already see was correct.
   */
  test('an http social link is upgraded rather than rejected', () => {
    const parsed = settingsSchema.parse(
      settings({ socials: { github: 'http://github.com/baycheikh' } }),
    );
    expect(parsed.socials.github).toBe('https://github.com/baycheikh');
  });

  test('a link on the wrong platform is rejected', () => {
    const result = settingsSchema.safeParse(
      settings({ socials: { instagram: 'https://github.com/baycheikh' } }),
    );
    expect(result.success).toBe(false);
  });

  /**
   * Was "a WhatsApp number with punctuation is rejected". Punctuation is how
   * people write phone numbers, and the brief asks for normalisation on save
   * instead of refusal.
   */
  test('a WhatsApp number with punctuation is normalised, not rejected', () => {
    const parsed = settingsSchema.parse(settings({ whatsappNumber: '+222 31-31-75-01' }));
    expect(parsed.whatsappNumber).toBe('22231317501');
    expect(parsed.whatsappUrl).toBe('https://wa.me/22231317501');
  });
});

/** Everything the settings schema needs, minus whatever a test overrides. */
function settings(overrides: Record<string, unknown> = {}) {
  return {
    whatsappNumber: '22231317501',
    email: 'baymed000@gmail.com',
    socials: {},
    heroStats: { years: 5, projects: 120, stacks: 10 },
    availableForWork: true,
    ...overrides,
  };
}

test.describe('social platform normalisation', () => {
  const cases: [SocialKey, string, string | null][] = [
    // Bare handles.
    ['github', 'baycheikh', 'https://github.com/baycheikh'],
    ['instagram', 'bay.cheikh', 'https://instagram.com/bay.cheikh'],
    ['tiktok', '@baycheikh', 'https://tiktok.com/@baycheikh'],
    ['x', '@baycheikh', 'https://x.com/baycheikh'],
    ['linkedin', 'bay-cheikh', 'https://linkedin.com/in/bay-cheikh'],
    // Full URLs, canonicalised: www dropped, trailing slash dropped.
    ['github', 'https://www.github.com/baycheikh/', 'https://github.com/baycheikh'],
    ['x', 'https://twitter.com/baycheikh', 'https://x.com/baycheikh'],
    [
      'linkedin',
      'https://linkedin.com/company/mauri-dev',
      'https://linkedin.com/company/mauri-dev',
    ],
    // Facebook keeps its query — profile.php and share links live in it.
    [
      'facebook',
      'https://www.facebook.com/profile.php?id=61550',
      'https://facebook.com/profile.php?id=61550',
    ],
    // Contact pair.
    ['whatsapp', '(222) 31 31 75 01', '22231317501'],
    ['email', '  Bay@Example.com  ', 'Bay@Example.com'],
    // Refused.
    ['github', 'https://gitlab.com/baycheikh', null],
    ['email', 'not-an-email', null],
    ['whatsapp', '12', null],
    ['x', 'javascript:alert(1)', null],
    ['instagram', 'https://instagram.com/', null],
  ];

  for (const [key, input, expected] of cases) {
    test(`${key}: ${JSON.stringify(input)}`, () => {
      expect(socialPlatform(key).toStored(input)).toBe(expected);
    });
  }

  test('every platform has a mark, a placeholder and an error message', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(platform.placeholder, platform.key).not.toBe('');
      expect(platform.invalid, platform.key).not.toBe('');
    }
  });
});

/**
 * The owner's stored links predate the fixed platform set. If this fold breaks,
 * every link they have already published disappears from the site — so it is
 * checked against the shape actually in the store, not a hypothetical one.
 */
test.describe('legacy socials migration', () => {
  test('an old array is folded into the keyed object', () => {
    const parsed = settingsSchema.parse(
      settings({
        socials: [
          { platform: 'GitHub', url: 'https://github.com/baycheikh', label: 'GitHub' },
          { platform: 'Twitter', url: 'https://twitter.com/baycheikh', label: 'Twitter' },
          { platform: 'Myspace', url: 'https://myspace.com/baycheikh', label: 'Myspace' },
        ],
      }),
    );
    expect(parsed.socials.github).toBe('https://github.com/baycheikh');
    // Aliased to the platform's current name, and canonicalised with it.
    expect(parsed.socials.x).toBe('https://x.com/baycheikh');
    // A platform the site no longer renders is dropped, not carried as dead data.
    expect(Object.values(parsed.socials).filter(Boolean)).toHaveLength(2);
  });

  test('an empty array migrates to no published links', () => {
    const parsed = settingsSchema.parse(settings({ socials: [] }));
    expect(Object.values(parsed.socials).filter(Boolean)).toHaveLength(0);
  });

  test('the new object shape passes through unchanged', () => {
    const parsed = settingsSchema.parse(
      settings({ socials: { github: 'https://github.com/baycheikh' } }),
    );
    expect(parsed.socials.github).toBe('https://github.com/baycheikh');
  });
});

test.describe('optional platforms', () => {
  test('every field may be blank', () => {
    const parsed = settingsSchema.parse(
      settings({ whatsappNumber: '', email: '', socials: {} }),
    );
    expect(parsed.whatsappNumber).toBeUndefined();
    expect(parsed.email).toBeUndefined();
    // No number means no derived URL — consumers fall back rather than linking
    // to the string "undefined".
    expect(parsed.whatsappUrl).toBeUndefined();
  });

  test('one bad field does not block the others', () => {
    const result = settingsSchema.safeParse(
      settings({ socials: { github: 'baycheikh', instagram: 'https://gitlab.com/x' } }),
    );
    expect(result.success).toBe(false);
    // Exactly one issue, against exactly the field that caused it.
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path.join('.')).toBe('socials.instagram');
  });
});

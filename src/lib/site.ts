/** Central place for the developer's real contact details & links. */
export const SITE = {
  name: 'Mauri-Dev',
  // The person behind the brand (used in the About section copy).
  altName: 'Bay Cheikh',
  tagline: 'Develop Solutions',
  roleKey: 'Full Stack & Mobile App Developer',
  email: 'baymed000@gmail.com',
  // WhatsApp: Mauritania (+222) + 31317501
  whatsappNumber: '22231317501',
  whatsappUrl: 'https://wa.me/22231317501',
  yearsExperience: 5,
  projectsDelivered: 120,
} as const;

export function whatsappLink(message?: string): string {
  const base = SITE.whatsappUrl;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Tech stack for the marquee / about badges. */
export const TECH_STACK = [
  'React',
  'Next.js',
  'React Native',
  'Flutter',
  'Vue',
  'Node.js',
  'Laravel',
  'Django',
  'Python',
  'PHP',
  'C++',
  'MySQL',
  'REST API',
  'TypeScript',
] as const;

export const SKILLS = {
  languages: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Python', 'PHP', 'C++'],
  frameworks: ['React', 'Next.js', 'Vue', 'Laravel', 'Node.js', 'Django', 'MySQL', 'REST API'],
  mobile: ['React Native', 'Flutter'],
} as const;

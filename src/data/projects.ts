import type { Locale } from '@/i18n/config';

export type ProjectCategory = 'web' | 'app';

export interface Project {
  id: string;
  /** Localized title (ar / en / fr). */
  title: Record<Locale, string>;
  /** Localized short description shown on the card and inside the gallery. */
  description: Record<Locale, string>;
  category: ProjectCategory;
  /**
   * How the screenshots are framed in the card and lightbox.
   * - 'phone'   → portrait mobile screenshots shown inside a device mockup.
   * - 'browser' → landscape shots shown edge-to-edge (default).
   */
  frame?: 'phone' | 'browser';
  /** Card cover image (in /public/projects/<id>/). */
  cover: string;
  /** Gallery images per project. Swap the placeholders for real images. */
  images: string[];
  /** Optional live link. Leave empty to hide the button. */
  link?: string;
}

/**
 * PROJECT DATA
 * ────────────────────────────────────────────────────────────────────────
 * To add/replace a project:
 *   1. Drop images into  public/projects/<id>/  (cover.svg/jpg, 1.jpg, 2.jpg …)
 *   2. Update the `cover` and `images` paths below.
 *   3. Translate `title` and `description` for all three languages.
 * Placeholder SVGs are shipped now so the site renders before real images arrive.
 */
export const projects: Project[] = [
  {
    id: 'skin-beauty',
    title: {
      en: 'Skin Beauty — Korean Skincare Store',
      ar: 'Skin Beauty — متجر الجمال الكوري',
      fr: 'Skin Beauty — Boutique Skincare Coréenne',
    },
    description: {
      en: 'A multilingual Korean skincare e-commerce web app with product catalog, cart, phone-based auth and local delivery — built and deployed end-to-end.',
      ar: 'متجر إلكتروني متعدد اللغات لمنتجات العناية الكورية مع كتالوج منتجات وسلة وتسجيل دخول بالهاتف وتوصيل محلي — مبني ومنشور بالكامل.',
      fr: 'Une boutique e-commerce multilingue de skincare coréen avec catalogue produits, panier, authentification par téléphone et livraison locale — développée et déployée de bout en bout.',
    },
    category: 'web',
    frame: 'phone',
    cover: '/projects/skin-beauty/cover.jpg',
    images: [
      '/projects/skin-beauty/1.jpg',
      '/projects/skin-beauty/2.jpg',
      '/projects/skin-beauty/3.jpg',
      '/projects/skin-beauty/4.jpg',
      '/projects/skin-beauty/5.jpg',
      '/projects/skin-beauty/6.jpg',
    ],
    link: 'https://skin-beauty-nine.vercel.app',
  },
  {
    id: 'ml-scores',
    title: {
      en: 'ML Scores — Live Football App',
      ar: 'ML Scores — تطبيق نتائج كرة القدم المباشرة',
      fr: 'ML Scores — Appli de Scores de Football en Direct',
    },
    description: {
      en: 'A multilingual live-football mobile app: real-time scores, fixtures and results, a World Cup 2026 hub, league standings and top scorers, a competitions browser across football, basketball and tennis, plus profile settings with dark/light themes and English/Arabic switching.',
      ar: 'تطبيق موبايل متعدد اللغات لنتائج كرة القدم المباشرة: نتائج لحظية ومباريات ونتائج سابقة، وركن كأس العالم 2026، وترتيب الدوريات والهدّافين، ومتصفّح للمسابقات يشمل كرة القدم والسلة والتنس، مع إعدادات الملف الشخصي وأوضاع داكن/فاتح وتبديل بين الإنجليزية والعربية.',
      fr: 'Une application mobile multilingue de football en direct : scores en temps réel, calendrier et résultats, un hub Coupe du Monde 2026, classements et meilleurs buteurs, un navigateur de compétitions (football, basket, tennis), et des réglages de profil avec thèmes clair/sombre et bascule anglais/arabe.',
    },
    category: 'app',
    frame: 'phone',
    cover: '/projects/ml-scores/1.jpeg',
    images: [
      '/projects/ml-scores/1.jpeg',
      '/projects/ml-scores/2.jpeg',
      '/projects/ml-scores/3.jpeg',
      '/projects/ml-scores/4.jpeg',
      '/projects/ml-scores/5.jpeg',
    ],
    link: '',
  },
  {
    id: 'ecommerce',
    title: {
      en: 'AURA — E-Commerce Platform',
      ar: 'AURA — منصة تجارة إلكترونية',
      fr: 'AURA — Plateforme E-Commerce',
    },
    description: {
      en: 'A full-stack luxury storefront: product discovery, rich product pages, a cart and secure checkout with promo codes, and an admin dashboard with revenue analytics, top products and order management.',
      ar: 'متجر إلكتروني فاخر متكامل: تصفّح المنتجات، وصفحات منتج غنية، وسلة وإتمام دفع آمن مع أكواد خصم، ولوحة تحكم إدارية مع تحليلات الإيرادات وأفضل المنتجات وإدارة الطلبات.',
      fr: 'Une boutique de luxe full-stack : découverte des produits, fiches produit détaillées, panier et paiement sécurisé avec codes promo, et un back-office avec analytics de revenus, meilleurs produits et gestion des commandes.',
    },
    category: 'web',
    frame: 'browser',
    cover: '/projects/ecommerce/1.webp',
    images: [
      '/projects/ecommerce/1.webp',
      '/projects/ecommerce/2.webp',
      '/projects/ecommerce/3.webp',
      '/projects/ecommerce/4.webp',
    ],
    link: '',
  },
  {
    id: 'swift-eats',
    title: {
      en: 'Swift Eats — Food Delivery App',
      ar: 'Swift Eats — تطبيق توصيل الطعام',
      fr: 'Swift Eats — Appli de Livraison de Repas',
    },
    description: {
      en: 'A food-delivery mobile app: restaurant discovery, a rich menu and cart flow, promo codes and checkout, plus live courier tracking on a map with delivery status steps.',
      ar: 'تطبيق موبايل لتوصيل الطعام: اكتشاف المطاعم، وقائمة طعام وسلة متكاملة، وأكواد خصم وإتمام الطلب، مع تتبّع مباشر للسائق على الخريطة ومراحل حالة التوصيل.',
      fr: 'Une application mobile de livraison de repas : découverte des restaurants, menu et panier détaillés, codes promo et paiement, et suivi du livreur en temps réel sur carte avec étapes de livraison.',
    },
    category: 'app',
    frame: 'phone',
    cover: '/projects/swift-eats/1.webp',
    images: [
      '/projects/swift-eats/1.webp',
      '/projects/swift-eats/2.webp',
      '/projects/swift-eats/3.webp',
      '/projects/swift-eats/4.webp',
    ],
    link: '',
  },
  {
    id: 'pharmanet',
    title: {
      en: 'PharmaNet — Pharmacy Management Platform',
      ar: 'PharmaNet — منصة إدارة الصيدليات',
      fr: 'PharmaNet — Plateforme de Gestion Pharmaceutique',
    },
    description: {
      en: 'A multilingual pharmacy platform with a dual pharmacist/client experience: medication catalog, cart, orders, stock dashboard, profiles and dark/light themes — built and deployed end-to-end.',
      ar: 'منصة صيدلية متعددة اللغات بتجربة مزدوجة للصيدلي والعميل: كتالوج أدوية وسلة وطلبات ولوحة مخزون وملفات تعريف وأوضاع داكن/فاتح — مبنية ومنشورة بالكامل.',
      fr: 'Une plateforme pharmaceutique multilingue à double expérience pharmacien/client : catalogue de médicaments, panier, commandes, tableau de bord des stocks, profils et thèmes clair/sombre — développée et déployée de bout en bout.',
    },
    category: 'web',
    frame: 'phone',
    cover: '/projects/pharmanet/1.jpeg',
    images: [
      '/projects/pharmanet/1.jpeg',
      '/projects/pharmanet/2.jpeg',
      '/projects/pharmanet/3.jpeg',
      '/projects/pharmanet/4.jpeg',
      '/projects/pharmanet/5.jpeg',
      '/projects/pharmanet/6.jpeg',
      '/projects/pharmanet/7.jpeg',
      '/projects/pharmanet/8.jpeg',
      '/projects/pharmanet/9.jpeg',
      '/projects/pharmanet/10.jpeg',
      '/projects/pharmanet/11.jpeg',
    ],
    link: 'https://phamanet.site.je',
  },
  {
    id: 'presencia',
    title: {
      en: 'PrésencIA — AI Attendance System',
      ar: 'PrésencIA — نظام حضور بالتعرّف على الوجه',
      fr: 'PrésencIA — Pointage par Reconnaissance Faciale',
    },
    description: {
      en: 'A web app that automates class attendance with facial recognition: create sessions, register students, let the camera mark presence automatically, and track statistics and reports from an admin dashboard.',
      ar: 'تطبيق ويب يؤتمت تسجيل الحضور عبر التعرّف على الوجه: إنشاء الجلسات وتسجيل الطلاب وتسجيل الحضور تلقائياً بالكاميرا، مع متابعة الإحصائيات والتقارير من لوحة تحكم.',
      fr: 'Une application web qui automatise le pointage des présences par reconnaissance faciale : création de séances, enregistrement des étudiants, pointage automatique par caméra, et suivi des statistiques et rapports depuis un tableau de bord.',
    },
    category: 'web',
    frame: 'browser',
    cover: '/projects/presencia/1.png',
    images: [
      '/projects/presencia/1.png',
      '/projects/presencia/2.png',
      '/projects/presencia/3.png',
      '/projects/presencia/4.png',
    ],
  },
  {
    id: 'pulse-analytics',
    title: {
      en: 'Pulse Analytics — SaaS Dashboard',
      ar: 'Pulse Analytics — لوحة تحليلات SaaS',
      fr: 'Pulse Analytics — Tableau de Bord SaaS',
    },
    description: {
      en: 'A SaaS analytics dashboard: KPI cards, interactive revenue and traffic charts, traffic-source breakdowns, and a filterable customer table with plans, MRR and status — dark, data-dense and responsive.',
      ar: 'لوحة تحليلات SaaS: بطاقات مؤشرات أداء، ورسوم بيانية تفاعلية للإيرادات والزيارات، وتحليل مصادر الزيارات، وجدول عملاء قابل للتصفية مع الخطط والإيراد الشهري والحالة — بتصميم داكن كثيف بالبيانات ومتجاوب.',
      fr: 'Un tableau de bord analytique SaaS : cartes de KPI, graphiques interactifs de revenus et de trafic, répartition des sources de trafic, et un tableau clients filtrable avec forfaits, MRR et statut — sombre, dense en données et responsive.',
    },
    category: 'web',
    frame: 'browser',
    cover: '/projects/pulse-analytics/1.webp',
    images: [
      '/projects/pulse-analytics/1.webp',
      '/projects/pulse-analytics/2.webp',
      '/projects/pulse-analytics/3.webp',
    ],
    link: '',
  },
];

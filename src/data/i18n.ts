import type { LanguageCode } from '../types/editor.ts';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  rtl?: boolean;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbekcha', flag: '🇺🇿' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша', flag: '🇰🇿' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
];

type TranslationDict = {
  appTagline: string;
  chooseLanguage: string;
  continueBtn: string;
  createAccount: string;
  signInGoogle: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  male: string;
  female: string;
  unspecified: string;
  email: string;
  phone: string;
  sendCode: string;
  verifyCode: string;
  enterCode: string;
  acceptTerms: string;
  acceptPrivacy: string;
  parentalConsentLabel: string;
  under13Blocked: string;
  under18Warning: string;
  newProject: string;
  aiVideo: string;
  recentProjects: string;
  templates: string;
  profile: string;
  settings: string;
  plans: string;
  back: string;
  exportBtn: string;
  publishBtn: string;
  publishNow: string;
  undo: string;
  redo: string;
  split: string;
  delete: string;
  duplicate: string;
  speed: string;
  reverse: string;
  freeze: string;
  effects: string;
  color: string;
  text: string;
  stickers: string;
  audio: string;
  masks: string;
  keyframes: string;
  transitions: string;
  canvas: string;
  retouch: string;
  aiStudioTitle: string;
  ideaPlaceholder: string;
  generateScript: string;
  otherMode: string;
  generateVideo: string;
  generatePhoto: string;
  firstYear: string;
  subscribe: string;
  cancelSubscription: string;
  home: string;
  noProjectsYet: string;
  openInEditor: string;
};

const RU: TranslationDict = {
  appTagline: 'Мобильный и десктопный видеоредактор нового поколения',
  chooseLanguage: 'Выберите язык приложения',
  continueBtn: 'Продолжить',
  createAccount: 'Регистрация и вход',
  signInGoogle: 'Войти через Google',
  firstName: 'Имя',
  lastName: 'Фамилия',
  birthDate: 'Дата рождения',
  gender: 'Пол',
  male: 'Мужской',
  female: 'Женский',
  unspecified: 'Не указывать',
  email: 'Эл. почта',
  phone: 'Номер телефона',
  sendCode: 'Получить код',
  verifyCode: 'Подтвердить и войти',
  enterCode: 'Код подтверждения (6 цифр)',
  acceptTerms: 'Я принимаю Условия использования',
  acceptPrivacy: 'Я принимаю Политику конфиденциальности',
  parentalConsentLabel: 'Подтверждаю согласие родителя/опекуна (для пользователей до 18 лет)',
  under13Blocked: 'Регистрация запрещена пользователям младше 13 лет.',
  under18Warning: 'До 18 лет платные тарифы и публикация доступны только с согласия родителя.',
  newProject: 'Новый проект',
  aiVideo: 'ИИ-видео',
  recentProjects: 'Недавние проекты',
  templates: 'Шаблоны',
  profile: 'Профиль',
  settings: 'Настройки',
  plans: 'Тарифы',
  back: 'Назад',
  exportBtn: 'Экспорт',
  publishBtn: 'Опубликовать',
  publishNow: 'Опубликовать сейчас',
  undo: 'Отменить',
  redo: 'Повторить',
  split: 'Разделить',
  delete: 'Удалить',
  duplicate: 'Дублировать',
  speed: 'Скорость',
  reverse: 'Реверс',
  freeze: 'Стоп-кадр',
  effects: 'Эффекты',
  color: 'Цвет',
  text: 'Текст',
  stickers: 'Стикеры',
  audio: 'Звук',
  masks: 'Маски',
  keyframes: 'Ключи',
  transitions: 'Переходы',
  canvas: 'Формат',
  retouch: 'Ретушь',
  aiStudioTitle: 'ИИ-генератор видео и фото',
  ideaPlaceholder: 'Опишите вашу идею или мысль — ИИ напишет сценарий, разобьёт на сцены и создаст видео...',
  generateScript: 'Создать сценарий и сцены',
  otherMode: 'Другой режим',
  generateVideo: 'Создать видео',
  generatePhoto: 'Создать фото по описанию',
  firstYear: 'Первый год',
  subscribe: 'Подписаться',
  cancelSubscription: 'Отменить подписку',
  home: 'Главная',
  noProjectsYet: 'Проектов пока нет — создайте новый ролик или используйте ИИ-генератор',
  openInEditor: 'Открыть в редакторе',
};

const EN: TranslationDict = {
  appTagline: 'Next-generation mobile & desktop AI video studio',
  chooseLanguage: 'Choose your language',
  continueBtn: 'Continue',
  createAccount: 'Sign up & Sign in',
  signInGoogle: 'Continue with Google',
  firstName: 'First name',
  lastName: 'Last name',
  birthDate: 'Date of birth',
  gender: 'Gender',
  male: 'Male',
  female: 'Female',
  unspecified: 'Prefer not to say',
  email: 'Email',
  phone: 'Phone number',
  sendCode: 'Send code',
  verifyCode: 'Verify & Enter',
  enterCode: '6-digit verification code',
  acceptTerms: 'I accept the Terms of Use',
  acceptPrivacy: 'I accept the Privacy Policy',
  parentalConsentLabel: 'I confirm parental/guardian consent (required under 18)',
  under13Blocked: 'Registration is prohibited for users under 13 years old.',
  under18Warning: 'Under 18: paid plans and social publishing require parental consent.',
  newProject: 'New Project',
  aiVideo: 'AI Video',
  recentProjects: 'Recent Projects',
  templates: 'Templates',
  profile: 'Profile',
  settings: 'Settings',
  plans: 'Plans',
  back: 'Back',
  exportBtn: 'Export',
  publishBtn: 'Publish',
  publishNow: 'Publish Now',
  undo: 'Undo',
  redo: 'Redo',
  split: 'Split',
  delete: 'Delete',
  duplicate: 'Duplicate',
  speed: 'Speed',
  reverse: 'Reverse',
  freeze: 'Freeze',
  effects: 'Effects',
  color: 'Color',
  text: 'Text',
  stickers: 'Stickers',
  audio: 'Audio',
  masks: 'Masks',
  keyframes: 'Keyframes',
  transitions: 'Transitions',
  canvas: 'Format',
  retouch: 'Retouch',
  aiStudioTitle: 'AI Video & Photo Studio',
  ideaPlaceholder: 'Write your idea — AI turns it into a script, scenes, and prompts for editing...',
  generateScript: 'Generate Script & Scenes',
  otherMode: 'Custom Mode',
  generateVideo: 'Generate Video',
  generatePhoto: 'Generate AI Photo',
  firstYear: 'First Year',
  subscribe: 'Subscribe',
  cancelSubscription: 'Cancel Subscription',
  home: 'Home',
  noProjectsYet: 'No projects yet — tap New Project or launch AI Video',
  openInEditor: 'Open in Editor',
};

const UZ: TranslationDict = {
  ...EN,
  appTagline: 'Yangi avlod mobil va kompyuter video muharriri',
  chooseLanguage: 'Ilova tilini tanlang',
  continueBtn: 'Davom etish',
  createAccount: 'Roʻyxatdan oʻtish va kirish',
  signInGoogle: 'Google orqali kirish',
  firstName: 'Ism',
  lastName: 'Familiya',
  birthDate: 'Tugʻilgan sana',
  gender: 'Jins',
  male: 'Erkak',
  female: 'Ayol',
  unspecified: 'Koʻrsatmaslik',
  email: 'Elektron pochta',
  phone: 'Telefon raqami',
  sendCode: 'Kodni yuborish',
  verifyCode: 'Tasdiqlash va kirish',
  newProject: 'Yangi loyiha',
  aiVideo: 'AI-video',
  recentProjects: 'Oxirgi loyihalar',
  templates: 'Shablonlar',
  profile: 'Profil',
  settings: 'Sozlamalar',
  plans: 'Tariflar',
  back: 'Orqaga',
  exportBtn: 'Eksport',
  publishBtn: 'Nashr qilish',
  publishNow: 'Hozir nashr qilish',
  firstYear: 'Birinchi yil',
  subscribe: 'Obuna boʻlish',
  home: 'Bosh sahifa',
};

const KK: TranslationDict = {
  ...EN,
  chooseLanguage: 'Қолданба тілін таңдаңыз',
  continueBtn: 'Жалғастыру',
  newProject: 'Жаңа жоба',
  aiVideo: 'ЖИ-бейне',
  recentProjects: 'Соңғы жобалар',
  templates: 'Үлгілер',
  profile: 'Профиль',
  settings: 'Баптаулар',
  plans: 'Тарифтер',
  back: 'Артқа',
  exportBtn: 'Экспорт',
  publishBtn: 'Жариялау',
  firstYear: 'Бірінші жыл',
  subscribe: 'Жазылу',
  home: 'Басты бет',
};

const TR: TranslationDict = {
  ...EN,
  chooseLanguage: 'Uygulama dilini seçin',
  continueBtn: 'Devam et',
  newProject: 'Yeni Proje',
  aiVideo: 'Yapay Zeka Video',
  recentProjects: 'Son Projeler',
  templates: 'Şablonlar',
  profile: 'Profil',
  settings: 'Ayarlar',
  plans: 'Planlar',
  back: 'Geri',
  exportBtn: 'Dışa Aktar',
  publishBtn: 'Yayınla',
  firstYear: 'İlk Yıl',
  subscribe: 'Abone Ol',
  home: 'Ana Sayfa',
};

const AR: TranslationDict = {
  ...EN,
  chooseLanguage: 'اختر لغة التطبيق',
  continueBtn: 'متابعة',
  newProject: 'مشروع جديد',
  aiVideo: 'فيديو بالذكاء الاصطناعي',
  recentProjects: 'المشاريع الأخيرة',
  templates: 'القوالب',
  profile: 'الملف الشخصي',
  settings: 'الإعدادات',
  plans: 'الخطط',
  back: 'رجوع',
  exportBtn: 'تصدير',
  publishBtn: 'نشر',
  firstYear: 'السنة الأولى',
  subscribe: 'اشتراك',
  home: 'الرئيسية',
};

const ES: TranslationDict = {
  ...EN,
  chooseLanguage: 'Elige tu idioma',
  continueBtn: 'Continuar',
  newProject: 'Nuevo proyecto',
  aiVideo: 'Video IA',
  recentProjects: 'Proyectos recientes',
  templates: 'Plantillas',
  profile: 'Perfil',
  settings: 'Ajustes',
  plans: 'Planes',
  back: 'Atrás',
  exportBtn: 'Exportar',
  publishBtn: 'Publicar',
  firstYear: 'Primer año',
  subscribe: 'Suscribirse',
  home: 'Inicio',
};

const ZH: TranslationDict = {
  ...EN,
  chooseLanguage: '选择应用语言',
  continueBtn: '继续',
  newProject: '新建项目',
  aiVideo: 'AI 视频',
  recentProjects: '最近项目',
  templates: '模板',
  profile: '个人资料',
  settings: '设置',
  plans: '套餐',
  back: '返回',
  exportBtn: '导出',
  publishBtn: '发布',
  firstYear: '首年特惠',
  subscribe: '立即订阅',
  home: '首页',
};

const FR: TranslationDict = {
  ...EN,
  chooseLanguage: 'Choisissez votre langue',
  continueBtn: 'Continuer',
  newProject: 'Nouveau projet',
  aiVideo: 'Vidéo IA',
  recentProjects: 'Projets récents',
  templates: 'Modèles',
  profile: 'Profil',
  settings: 'Paramètres',
  plans: 'Tarifs',
  back: 'Retour',
  exportBtn: 'Exporter',
  publishBtn: 'Publier',
  firstYear: 'Première année',
  subscribe: "S'abonner",
  home: 'Accueil',
};

const DE: TranslationDict = {
  ...EN,
  chooseLanguage: 'Sprache auswählen',
  continueBtn: 'Weiter',
  newProject: 'Neues Projekt',
  aiVideo: 'KI-Video',
  recentProjects: 'Letzte Projekte',
  templates: 'Vorlagen',
  profile: 'Profil',
  settings: 'Einstellungen',
  plans: 'Tarife',
  back: 'Zurück',
  exportBtn: 'Exportieren',
  publishBtn: 'Veröffentlichen',
  firstYear: 'Erstes Jahr',
  subscribe: 'Abonnieren',
  home: 'Startseite',
};

const TRANSLATIONS: Record<LanguageCode, TranslationDict> = {
  ru: RU,
  en: EN,
  uz: UZ,
  kk: KK,
  tr: TR,
  ar: AR,
  es: ES,
  zh: ZH,
  fr: FR,
  de: DE,
  ko: EN,
  ja: EN,
  pt: ES,
  hi: EN,
};

export function t(lang: LanguageCode): TranslationDict {
  return TRANSLATIONS[lang] || RU;
}

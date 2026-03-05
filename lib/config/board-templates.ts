export interface BoardTemplate {
  key: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  columns: { name: string; color: string; isDoneColumn?: boolean }[];
  labels: { name: string; color: string }[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    key: 'general',
    name: 'General',
    nameAr: 'عام',
    description: 'Simple task board',
    descriptionAr: 'لوحة مهام بسيطة',
    icon: 'Layout',
    columns: [
      { name: 'قائمة المهام', color: 'gray' },
      { name: 'قيد التنفيذ', color: 'blue' },
      { name: 'مراجعة', color: 'yellow' },
      { name: 'مكتمل', color: 'green', isDoneColumn: true },
    ],
    labels: [
      { name: 'عاجل', color: 'red' },
      { name: 'مهم', color: 'orange' },
      { name: 'تحسين', color: 'blue' },
      { name: 'بحث', color: 'purple' },
    ],
  },
  {
    key: 'content',
    name: 'Content Production',
    nameAr: 'إنتاج المحتوى',
    description: 'Content creation workflow',
    descriptionAr: 'سير عمل إنشاء المحتوى',
    icon: 'FileText',
    columns: [
      { name: 'أفكار', color: 'purple' },
      { name: 'كتابة', color: 'blue' },
      { name: 'تصميم', color: 'pink' },
      { name: 'مراجعة', color: 'yellow' },
      { name: 'جاهز للنشر', color: 'orange' },
      { name: 'منشور', color: 'green', isDoneColumn: true },
    ],
    labels: [
      { name: 'مقال', color: 'blue' },
      { name: 'فيديو', color: 'red' },
      { name: 'سوشال ميديا', color: 'pink' },
      { name: 'بودكاست', color: 'purple' },
    ],
  },
  {
    key: 'design',
    name: 'Design',
    nameAr: 'التصميم',
    description: 'Design project workflow',
    descriptionAr: 'سير عمل مشاريع التصميم',
    icon: 'Palette',
    columns: [
      { name: 'طلبات جديدة', color: 'gray' },
      { name: 'بحث وتحليل', color: 'purple' },
      { name: 'تصميم أولي', color: 'blue' },
      { name: 'تعديلات', color: 'yellow' },
      { name: 'اعتماد نهائي', color: 'orange' },
      { name: 'تم التسليم', color: 'green', isDoneColumn: true },
    ],
    labels: [
      { name: 'شعار', color: 'orange' },
      { name: 'UI/UX', color: 'blue' },
      { name: 'طباعة', color: 'green' },
      { name: 'موشن', color: 'red' },
    ],
  },
  {
    key: 'campaign',
    name: 'Marketing Campaign',
    nameAr: 'حملة تسويقية',
    description: 'Marketing campaign tracker',
    descriptionAr: 'متتبع الحملات التسويقية',
    icon: 'Megaphone',
    columns: [
      { name: 'تخطيط', color: 'gray' },
      { name: 'إنتاج', color: 'blue' },
      { name: 'مراجعة العميل', color: 'yellow' },
      { name: 'نشط', color: 'orange' },
      { name: 'مكتمل', color: 'green', isDoneColumn: true },
    ],
    labels: [
      { name: 'Google Ads', color: 'blue' },
      { name: 'Meta Ads', color: 'indigo' },
      { name: 'SEO', color: 'green' },
      { name: 'Email', color: 'orange' },
    ],
  },
  {
    key: 'video',
    name: 'Video Production',
    nameAr: 'إنتاج الفيديو',
    description: 'Video production pipeline',
    descriptionAr: 'خط إنتاج الفيديو',
    icon: 'Video',
    columns: [
      { name: 'سكريبت', color: 'purple' },
      { name: 'تصوير', color: 'blue' },
      { name: 'مونتاج', color: 'orange' },
      { name: 'مراجعة', color: 'yellow' },
      { name: 'تسليم نهائي', color: 'green', isDoneColumn: true },
    ],
    labels: [
      { name: 'ريلز', color: 'pink' },
      { name: 'يوتيوب', color: 'red' },
      { name: 'إعلان', color: 'orange' },
      { name: 'بودكاست', color: 'purple' },
    ],
  },
  {
    key: 'social',
    name: 'Social Media',
    nameAr: 'السوشال ميديا',
    description: 'Social media content calendar',
    descriptionAr: 'تقويم محتوى السوشال ميديا',
    icon: 'Share2',
    columns: [
      { name: 'أفكار', color: 'gray' },
      { name: 'إعداد', color: 'blue' },
      { name: 'تصميم', color: 'pink' },
      { name: 'جدولة', color: 'orange' },
      { name: 'منشور', color: 'green', isDoneColumn: true },
    ],
    labels: [
      { name: 'Instagram', color: 'pink' },
      { name: 'Twitter', color: 'blue' },
      { name: 'LinkedIn', color: 'indigo' },
      { name: 'TikTok', color: 'gray' },
    ],
  },
];

export function getBoardTemplate(key: string): BoardTemplate | undefined {
  return BOARD_TEMPLATES.find(t => t.key === key);
}

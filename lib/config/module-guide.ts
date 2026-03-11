/**
 * Centralized module guide / documentation metadata.
 *
 * Every dashboard module (sidebar page) has:
 * - description: short Arabic description shown in tooltips
 * - goal: what the module helps the user achieve
 * - tips: quick usage tips (array of strings)
 * - keywords: for search in the guide page
 */

export interface ModuleGuide {
  /** Sidebar href / route key */
  href: string;
  /** Arabic short description (1 line, for tooltip) */
  description: string;
  /** English short description */
  descriptionEn: string;
  /** Arabic goal / purpose (1-2 sentences) */
  goal: string;
  /** Quick usage tips in Arabic */
  tips: string[];
  /** Search keywords */
  keywords: string[];
}

export const MODULE_GUIDES: Record<string, ModuleGuide> = {
  /* ═══════════════ عام (General) ═══════════════ */
  '/dashboard': {
    href: '/dashboard',
    description: 'نظرة عامة على حالة العمل والإحصائيات الرئيسية',
    descriptionEn: 'Overview of business status and key statistics',
    goal: 'تعطيك لوحة التحكم الرئيسية صورة شاملة وسريعة عن حالة أعمالك: الملفات، المشاريع، العملاء، الإيرادات، والنشاطات الأخيرة.',
    tips: [
      'الإحصائيات تتحدث تلقائياً — لا حاجة لتحديث يدوي',
      'الرسوم البيانية تظهر للمديرين فقط',
      'استخدم الإجراءات السريعة في أسفل الصفحة لرفع ملفات أو إنشاء مشروع بسرعة',
      'انقر على أي بطاقة إحصائية للانتقال لصفحتها مباشرة',
    ],
    keywords: ['dashboard', 'الرئيسية', 'إحصائيات', 'ملخص'],
  },
  '/dashboard/notifications': {
    href: '/dashboard/notifications',
    description: 'إشعارات النظام والتنبيهات المهمة',
    descriptionEn: 'System notifications and important alerts',
    goal: 'تابع كل ما يحدث في مساحة العمل: تعليقات جديدة، موافقات معلقة، تحديثات المشاريع، والتنبيهات المالية.',
    tips: [
      'الإشعارات غير المقروءة تظهر بخلفية مميزة',
      'يمكنك تحديد الكل كمقروء من الزر أعلى الصفحة',
      'انقر على الإشعار للانتقال مباشرة للعنصر المعني',
    ],
    keywords: ['notifications', 'إشعارات', 'تنبيهات'],
  },

  /* ═══════════════ إدارة الملفات ═══════════════ */
  '/dashboard/files': {
    href: '/dashboard/files',
    description: 'رفع وتنظيم ومشاركة الملفات والمجلدات',
    descriptionEn: 'Upload, organize, and share files and folders',
    goal: 'مستودع ملفات متكامل لتنظيم جميع ملفات المشاريع والعملاء. يدعم رفع الملفات، إنشاء المجلدات، المشاركة عبر روابط، وإدارة الصلاحيات.',
    tips: [
      'اسحب وأفلت الملفات مباشرة لرفعها',
      'استخدم النقر المزدوج للدخول إلى المجلدات',
      'يمكنك مشاركة أي ملف عبر رابط خارجي',
      'أضف الملفات المهمة للمفضلة بنقرة واحدة',
      'الملفات المحذوفة تذهب للمحذوفات ويمكن استعادتها',
    ],
    keywords: ['files', 'ملفات', 'رفع', 'مجلدات', 'مشاركة'],
  },
  '/dashboard/favorites': {
    href: '/dashboard/favorites',
    description: 'الملفات والمجلدات المحفوظة في المفضلة',
    descriptionEn: 'Bookmarked files and folders',
    goal: 'وصول سريع للملفات والمجلدات الأكثر استخداماً. أضف أي عنصر للمفضلة من مستعرض الملفات.',
    tips: [
      'أضف ملف للمفضلة بالنقر على أيقونة النجمة',
      'المفضلة شخصية — كل مستخدم له قائمته الخاصة',
      'انقر على العنصر لفتحه مباشرة في مستعرض الملفات',
    ],
    keywords: ['favorites', 'مفضلة', 'نجمة', 'وصول سريع'],
  },
  '/dashboard/reviews': {
    href: '/dashboard/reviews',
    description: 'طلبات مراجعة الملفات والموافقات',
    descriptionEn: 'File review requests and approvals',
    goal: 'إدارة دورة مراجعة الملفات: اطلب مراجعة من الفريق، تابع الحالة، واعتمد أو ارفض الملفات.',
    tips: [
      'يمكنك طلب مراجعة من أي صفحة ملف',
      'المراجعات المعلقة تظهر أولاً',
      'أضف تعليقات على المراجعة لتوضيح الملاحظات',
    ],
    keywords: ['reviews', 'مراجعات', 'موافقات', 'اعتماد'],
  },
  '/dashboard/trash': {
    href: '/dashboard/trash',
    description: 'الملفات المحذوفة مع إمكانية الاستعادة',
    descriptionEn: 'Deleted files with restore capability',
    goal: 'استعرض الملفات المحذوفة واستعدها عند الحاجة. الملفات تبقى في المحذوفات لحين الحذف النهائي.',
    tips: [
      'يمكنك استعادة أي ملف بنقرة واحدة',
      'الحذف النهائي لا يمكن التراجع عنه',
      'استخدم البحث للعثور على ملف محذوف بسرعة',
    ],
    keywords: ['trash', 'محذوفات', 'استعادة', 'حذف'],
  },
  '/dashboard/storage': {
    href: '/dashboard/storage',
    description: 'إحصائيات استخدام مساحة التخزين',
    descriptionEn: 'Storage usage statistics and analytics',
    goal: 'لوحة تحليلية لمراقبة استخدام مساحة التخزين: إجمالي الحجم، التوزيع حسب نوع الملفات، أكبر المجلدات والملفات.',
    tips: [
      'الرسم الدائري يعرض التوزيع حسب نوع الملفات (صور، فيديو، PDF، إلخ)',
      'الرسم الشريطي يعرض أكبر 10 مجلدات من حيث الحجم',
      'جدول أكبر الملفات يساعدك على تحديد الملفات التي تستهلك أكبر مساحة',
      'الإحصائيات تتحدث تلقائياً عند كل زيارة',
    ],
    keywords: ['storage', 'تخزين', 'مساحة', 'حجم', 'إحصائيات'],
  },

  /* ═══════════════ العمل ═══════════════ */
  '/dashboard/projects': {
    href: '/dashboard/projects',
    description: 'إدارة المشاريع وتتبع التقدم والمهام',
    descriptionEn: 'Manage projects, track progress and tasks',
    goal: 'مركز إدارة المشاريع: أنشئ مشاريع جديدة، عيّن الفريق، حدد الميزانية، وتابع التقدم بالمراحل والنسب المئوية.',
    tips: [
      'أنشئ مشروع جديد من الزر "مشروع جديد" أعلى الصفحة',
      'ربط المشروع بعميل لتتبع الإيرادات والمصاريف',
      'تحديث نسبة الإنجاز يظهر تلقائياً في التقارير',
      'أضف ميزانية للمشروع لتتبع استخدام الميزانية في التقارير المالية',
    ],
    keywords: ['projects', 'مشاريع', 'مهام', 'تقدم', 'ميزانية'],
  },
  '/dashboard/quotes': {
    href: '/dashboard/quotes',
    description: 'إنشاء وإدارة عروض الأسعار للعملاء',
    descriptionEn: 'Create and manage client quotes',
    goal: 'أنشئ عروض أسعار احترافية مع بنود مفصلة، أرسلها للعملاء بتوقيع إلكتروني، وحوّلها لفواتير بنقرة واحدة.',
    tips: [
      'استخدم منشئ العروض لإضافة بنود بالأسعار والكميات',
      'العرض يُحسب تلقائياً (المجموع الفرعي + الضريبة + الإجمالي)',
      'يمكن للعميل التوقيع إلكترونياً عبر البوابة',
      'حوّل العرض المقبول إلى فاتورة مباشرة',
      'صدّر العرض كـ PDF لمشاركته',
    ],
    keywords: ['quotes', 'عروض أسعار', 'تسعير', 'توقيع'],
  },
  '/dashboard/invoices': {
    href: '/dashboard/invoices',
    description: 'إصدار وتتبع الفواتير والمدفوعات',
    descriptionEn: 'Issue and track invoices and payments',
    goal: 'أنشئ فواتير احترافية، تابع حالة الدفع، وأرسل تذكيرات للعملاء. تدعم الدفع الإلكتروني عبر Stripe.',
    tips: [
      'أنشئ فاتورة من الصفر أو حوّل عرض أسعار مقبول',
      'حالات الفاتورة: مسودة ← مرسلة ← مدفوعة جزئياً ← مدفوعة',
      'يمكن للعميل الدفع إلكترونياً عبر بوابة العملاء',
      'صدّر الفاتورة كـ PDF مع دعم كامل للعربية',
      'الفواتير المتأخرة تظهر تنبيهات في لوحة التحكم',
    ],
    keywords: ['invoices', 'فواتير', 'مدفوعات', 'دفع', 'Stripe'],
  },
  '/dashboard/clients': {
    href: '/dashboard/clients',
    description: 'إدارة حسابات العملاء والبوابة الخاصة بهم',
    descriptionEn: 'Manage client accounts and their portal',
    goal: 'نقطة مركزية لإنشاء وتعديل حسابات العملاء، إدارة التصنيفات، تصدير البيانات، ومتابعة العلاقات المالية والمشاريع.',
    tips: [
      'استخدم البحث والتصنيفات للعثور على عميل بسرعة',
      'بدّل بين عرض الجدول والبطاقات من شريط الأدوات',
      'انقر على اسم العميل للانتقال لصفحة التفاصيل الشاملة',
      'صدّر بيانات العملاء بصيغة CSV من زر التصدير',
      'أضف تصنيفات ملونة لتنظيم العملاء حسب النوع أو القطاع',
    ],
    keywords: ['clients', 'عملاء', 'شركات', 'تصنيفات', 'تصدير', 'بطاقات'],
  },
  '/dashboard/clients/[id]': {
    href: '/dashboard/clients',
    description: 'تفاصيل العميل وإدارة العلاقة',
    descriptionEn: 'Client details and relationship management',
    goal: 'عرض شامل لمعلومات العميل: المشاريع، الفواتير، عروض الأسعار، الملاحظات، النشاط، والهوية البصرية.',
    tips: [
      'استخدم الملاحظات لتوثيق الاجتماعات والقرارات المهمة',
      'تابع الرصيد المعلق لكل عميل من بطاقات الإحصائيات',
      'أضف تصنيفات للعملاء لتسهيل الفلترة والتنظيم',
      'خصص الهوية البصرية لبوابة العميل من تبويب الهوية البصرية',
    ],
    keywords: ['عميل', 'تفاصيل', 'ملاحظات', 'مشاريع', 'فواتير', 'client', 'details'],
  },
  '/dashboard/script-reviews': {
    href: '/dashboard/script-reviews',
    description: 'مراجعة واعتماد سكريبتات المحتوى',
    descriptionEn: 'Review and approve content scripts',
    goal: 'إدارة دورة مراجعة سكريبتات المحتوى: من التسليم إلى المراجعة والاعتماد النهائي.',
    tips: [
      'ارفع السكريبت وعيّن مراجعين',
      'تابع حالة المراجعة من القائمة',
      'أضف ملاحظات وتعديلات على كل سكريبت',
    ],
    keywords: ['scripts', 'سكريبتات', 'محتوى', 'مراجعة'],
  },

  /* ═══════════════ الدليل ═══════════════ */
  '/dashboard/guide': {
    href: '/dashboard/guide',
    description: 'دليل شامل لجميع وحدات النظام',
    descriptionEn: 'Comprehensive guide to all system modules',
    goal: 'دليل مرجعي يشرح جميع وحدات النظام مع النصائح والأهداف. استخدم البحث للعثور على أي وحدة بسرعة.',
    tips: [
      'استخدم البحث للعثور على أي وحدة بالعربي أو الإنجليزي',
      'انقر على أي بطاقة لعرض نصائح الاستخدام',
      'انقر على أيقونة الرابط للانتقال مباشرة للوحدة',
    ],
    keywords: ['دليل', 'guide', 'مساعدة', 'help', 'شرح'],
  },

  /* ═══════════════ شخصي + سير العمل ═══════════════ */
  '/dashboard/profile': {
    href: '/dashboard/profile',
    description: 'إدارة الملف الشخصي والإعدادات',
    descriptionEn: 'Personal profile and settings management',
    goal: 'تحديث معلوماتك الشخصية، تغيير كلمة المرور، وعرض دورك وصلاحياتك في النظام.',
    tips: [
      'يمكنك رفع صورة شخصية تظهر في جميع أنحاء النظام',
      'تغيير كلمة المرور يتطلب 12 حرف على الأقل',
      'صلاحياتك تظهر للعرض فقط — تواصل مع المسؤول لتغييرها',
      'يمكنك مراجعة جلساتك النشطة وإنهاء أي جلسة مشبوهة',
    ],
    keywords: ['ملف شخصي', 'profile', 'كلمة مرور', 'صورة', 'avatar', 'إعدادات'],
  },
  '/dashboard/my-tasks': {
    href: '/dashboard/my-tasks',
    description: 'عرض جميع المهام المسندة إليك',
    descriptionEn: 'View all tasks assigned to you',
    goal: 'مركز مهامك الشخصي: تابع كل المهام المسندة إليك عبر جميع المشاريع، مع تصنيفها حسب الأولوية والحالة.',
    tips: [
      'المهام مجمعة حسب: اليوم، هذا الأسبوع، متأخرة',
      'انقر على أي مهمة للانتقال مباشرة للوحة المشروع',
      'استخدم الفلاتر لعرض مهام مشروع محدد أو أولوية معينة',
      'المهام المتأخرة تظهر بتنبيه أحمر في الأعلى',
    ],
    keywords: ['مهامي', 'my tasks', 'مهام', 'معلقة', 'متأخرة', 'أولوية'],
  },
  '/dashboard/boards': {
    href: '/dashboard/boards',
    description: 'لوحات إدارة المهام (كانبان)',
    descriptionEn: 'Kanban task management boards',
    goal: 'إنشاء وإدارة لوحات عمل بنمط كانبان. كل لوحة تحتوي أعمدة تمثل مراحل العمل، والمهام تنتقل بينها بالسحب والإفلات.',
    tips: [
      'كل مشروع يحصل تلقائياً على لوحة عمل افتراضية',
      'اسحب المهام بين الأعمدة لتحديث حالتها',
      'يمكنك إنشاء لوحات مستقلة للعمليات الداخلية',
      'استخدم القوالب الجاهزة لتسريع إنشاء اللوحات',
      'أضف تسميات ملونة لتصنيف المهام بصرياً',
    ],
    keywords: ['لوحات', 'كانبان', 'boards', 'kanban', 'سحب', 'drag', 'أعمدة'],
  },
  '/dashboard/directory': {
    href: '/dashboard/directory',
    description: 'دليل أعضاء الفريق',
    descriptionEn: 'Team member directory',
    goal: 'عرض جميع أعضاء الفريق مع معلومات التواصل والأدوار. يمكنك البحث والتصفية حسب الفريق أو الدور.',
    tips: [
      'انقر على بطاقة الموظف لعرض تفاصيله',
      'استخدم فلتر الفريق لعرض أعضاء فريق محدد',
      'الأدوار تظهر ببادج ملونة حسب اللون المحدد في إعدادات الدور',
    ],
    keywords: ['دليل', 'فريق', 'موظفين', 'directory', 'team', 'تواصل'],
  },
  '/dashboard/timesheet': {
    href: '/dashboard/timesheet',
    description: 'تسجيل ومتابعة ساعات العمل والعمل الإضافي',
    descriptionEn: 'Track work hours, periods, and overtime',
    goal: 'سجّل ساعات عملك اليومية مربوطة بالمشاريع والمهام. جمّع الساعات في فترات أسبوعية أو شهرية وأرسلها للاعتماد. العمل الإضافي يُكتشف تلقائياً.',
    tips: [
      'سجّل ساعاتك يومياً للحصول على تقارير دقيقة',
      'اربط الساعات بمهام محددة لتتبع أدق',
      'أرسل فترتك الأسبوعية للاعتماد قبل نهاية الأسبوع',
      'العمل الإضافي يُحسب تلقائياً بناء على جدول عملك',
      'ملخص العمل الإضافي يظهر بطاقة منفصلة بالمضاعف المعتمد',
      'يمكنك مراجعة إجماليك الشهري في التقارير',
    ],
    keywords: ['ساعات', 'عمل', 'timesheet', 'وقت', 'تسجيل', 'اعتماد', 'عمل إضافي', 'overtime'],
  },
  '/dashboard/announcements': {
    href: '/dashboard/announcements',
    description: 'الإعلانات والتنبيهات الداخلية',
    descriptionEn: 'Internal announcements and alerts',
    goal: 'متابعة إعلانات الشركة وآخر التحديثات. الإعلانات العاجلة تظهر كبانر في أعلى لوحة التحكم.',
    tips: [
      'الإعلانات المثبتة تظهر دائماً في الأعلى',
      'الإعلانات غير المقروءة تظهر بتمييز خاص',
      'المسؤولون يمكنهم إنشاء وتعديل الإعلانات',
      'يمكن استهداف إعلان لفرق محددة',
    ],
    keywords: ['إعلانات', 'تنبيهات', 'announcements', 'أخبار', 'داخلية'],
  },
  '/dashboard/leave': {
    href: '/dashboard/leave',
    description: 'طلبات الإجازة وأرصدة الإجازات',
    descriptionEn: 'Leave requests and balances',
    goal: 'تقديم طلبات إجازة ومتابعة حالتها. عرض رصيد إجازاتك حسب أنواع الإجازات المخصصة مع دعم ترحيل الرصيد السنوي.',
    tips: [
      'تأكد من رصيدك قبل تقديم الطلب',
      'أضف سبباً واضحاً لتسريع الموافقة',
      'يمكنك إلغاء طلب معلق أو حتى إجازة معتمدة مع ذكر السبب',
      'النظام يكشف تداخل إجازات الفريق تلقائياً عند إنشاء طلب جديد',
      'الرصيد المُرحّل من السنة السابقة يظهر في بطاقة كل نوع إجازة',
      'تقويم الفريق يوضح من في إجازة',
    ],
    keywords: ['إجازة', 'leave', 'رصيد', 'طلب', 'سنوية', 'مرضية', 'إلغاء', 'ترحيل'],
  },
  '/dashboard/leave/settings': {
    href: '/dashboard/leave/settings',
    description: 'إدارة أنواع الإجازات وإعداداتها',
    descriptionEn: 'Manage leave types and settings',
    goal: 'أنشئ وعدّل أنواع الإجازات المخصصة (سنوية، مرضية، شخصية، وغيرها) مع تحديد الرصيد الافتراضي وسياسة الترحيل.',
    tips: [
      'حدد عدد الأيام الافتراضية لكل نوع إجازة',
      'فعّل الترحيل التلقائي مع تحديد الحد الأقصى',
      'بعض أنواع الإجازات تتطلب مرفقات (مثل المرضية)',
      'رتّب أنواع الإجازات لتظهر بالترتيب المطلوب',
    ],
    keywords: ['أنواع إجازات', 'leave types', 'ترحيل', 'carry-over', 'إعدادات'],
  },

  '/dashboard/attendance': {
    href: '/dashboard/attendance',
    description: 'تسجيل الحضور والانصراف ومتابعة الدوام',
    descriptionEn: 'Clock in/out and attendance tracking',
    goal: 'سجّل حضورك وانصرافك يومياً. تابع سجل الحضور الشهري مع إحصائيات التأخير والغياب وإجمالي ساعات العمل.',
    tips: [
      'اضغط زر "تسجيل الحضور" عند بداية الدوام',
      'اضغط "تسجيل الانصراف" عند نهاية الدوام — يُحسب الوقت تلقائياً',
      'التقويم الشهري يعرض أيام الحضور بألوان مختلفة حسب الحالة',
      'إحصائيات الشهر تشمل: أيام الحضور، التأخير، الغياب، إجمالي الساعات',
      'المسؤولون يمكنهم عرض حضور جميع الموظفين',
    ],
    keywords: ['حضور', 'attendance', 'تسجيل دخول', 'clock', 'دوام', 'انصراف'],
  },
  '/dashboard/org-chart': {
    href: '/dashboard/org-chart',
    description: 'الهيكل التنظيمي وسلسلة المسؤولين',
    descriptionEn: 'Organization chart and reporting hierarchy',
    goal: 'عرض شجري للهيكل التنظيمي يوضح سلسلة المسؤولين والمرؤوسين. يساعد في فهم خط التقارير والموافقات.',
    tips: [
      'الشجرة تبدأ من المدير العام وتتفرع للأسفل',
      'انقر على أي موظف لعرض تفاصيله',
      'خط التقارير يحدد من يعتمد الإجازات وسجلات الدوام',
      'يمكن للمسؤول تعيين المدير المباشر من إعدادات المستخدم',
    ],
    keywords: ['هيكل تنظيمي', 'org chart', 'مدير', 'تقارير', 'شجرة'],
  },
  '/dashboard/my-payslips': {
    href: '/dashboard/my-payslips',
    description: 'عرض وتحميل كشوف الراتب الشهرية',
    descriptionEn: 'View and download monthly payslips',
    goal: 'استعرض كشوف راتبك الشهرية مع تفاصيل الراتب الأساسي، مدفوعات المهام، العمل الإضافي، المكافآت، والخصومات.',
    tips: [
      'كشف الراتب يتوفر بعد اعتماد مسير الرواتب الشهري',
      'يمكنك تحميل كشف الراتب كـ PDF',
      'التفاصيل تشمل: الراتب الأساسي + مهام + عمل إضافي + مكافآت - خصومات = صافي',
    ],
    keywords: ['كشف راتب', 'payslip', 'راتب', 'salary', 'مرتب'],
  },

  /* ═══════════════ المالية ═══════════════ */
  '/dashboard/finance': {
    href: '/dashboard/finance',
    description: 'لوحة الإدارة المالية الشاملة',
    descriptionEn: 'Comprehensive financial management dashboard',
    goal: 'نظرة عامة على الوضع المالي: الإيرادات، المصاريف، الأرباح، التنبيهات المالية، وملخص سريع لكل الأقسام المالية.',
    tips: [
      'البطاقات العلوية تعرض ملخص سريع للإيرادات والمصاريف',
      'التنبيهات المالية تظهر فواتير متأخرة واشتراكات قاربت على الانتهاء',
      'انقر على أي قسم للانتقال لصفحته التفصيلية',
    ],
    keywords: ['finance', 'مالية', 'إيرادات', 'مصاريف', 'أرباح'],
  },
  '/dashboard/finance/expenses': {
    href: '/dashboard/finance/expenses',
    description: 'تسجيل وتصنيف المصاريف التشغيلية',
    descriptionEn: 'Record and categorize operational expenses',
    goal: 'سجّل جميع مصاريف الشركة مع التصنيف والمشروع المرتبط. يدعم الضريبة والعملات المتعددة.',
    tips: [
      'أضف مصروف جديد من الزر أعلى الصفحة',
      'ربط المصروف بمشروع لحساب ربحية المشاريع',
      'أضف مبلغ الضريبة (VAT) لتقارير ضريبية دقيقة',
      'استخدم التصنيفات لتحليل أنماط الإنفاق',
      'يمكنك إدارة التصنيفات من صفحة "التصنيفات"',
    ],
    keywords: ['expenses', 'مصاريف', 'إنفاق', 'ضريبة'],
  },
  '/dashboard/finance/expenses/categories': {
    href: '/dashboard/finance/expenses/categories',
    description: 'إدارة تصنيفات المصاريف',
    descriptionEn: 'Manage expense categories',
    goal: 'أنشئ وعدّل تصنيفات المصاريف لتنظيم الإنفاق وتحليله بشكل أفضل.',
    tips: [
      'أنشئ تصنيفات تناسب طبيعة عملك',
      'التصنيفات تستخدم في إنشاء المصاريف وفي التقارير',
      'يمكنك تعديل أو حذف أي تصنيف',
    ],
    keywords: ['تصنيفات', 'categories', 'مصاريف', 'فئات'],
  },
  '/dashboard/finance/client-statement': {
    href: '/dashboard/finance/client-statement',
    description: 'كشف حساب العميل المالي',
    descriptionEn: 'Client financial statement',
    goal: 'عرض كشف حساب مفصّل لكل عميل يشمل الفواتير والمدفوعات والرصيد المتبقي.',
    tips: [
      'اختر العميل لعرض كشف حسابه',
      'الكشف يشمل الفواتير والمدفوعات والرصيد',
      'يمكنك تصدير الكشف كملف',
    ],
    keywords: ['كشف حساب', 'statement', 'عميل', 'رصيد', 'مالي'],
  },
  '/dashboard/finance/subscriptions': {
    href: '/dashboard/finance/subscriptions',
    description: 'تتبع الاشتراكات الشهرية والسنوية',
    descriptionEn: 'Track monthly and annual subscriptions',
    goal: 'تابع جميع اشتراكات الشركة (برامج، خدمات، أدوات) مع تواريخ التجديد والتكلفة.',
    tips: [
      'أضف اشتراك جديد مع تاريخ البدء ودورة التجديد',
      'النظام ينبهك قبل تجديد الاشتراك',
      'تابع إجمالي تكلفة الاشتراكات الشهرية والسنوية',
    ],
    keywords: ['subscriptions', 'اشتراكات', 'تجديد', 'SaaS'],
  },
  '/dashboard/finance/cards': {
    href: '/dashboard/finance/cards',
    description: 'إدارة بطاقات الدفع والشركة',
    descriptionEn: 'Manage payment and company cards',
    goal: 'سجّل بطاقات الشركة وتابع المصاريف المرتبطة بكل بطاقة.',
    tips: [
      'أضف بطاقة جديدة مع تفاصيلها',
      'ربط المصاريف ببطاقة محددة لتتبع الإنفاق',
      'تابع حد البطاقة والرصيد المستخدم',
    ],
    keywords: ['cards', 'بطاقات', 'دفع', 'visa'],
  },
  '/dashboard/finance/contracts': {
    href: '/dashboard/finance/contracts',
    description: 'إدارة العقود مع العملاء — عقود شهرية ومراحل',
    descriptionEn: 'Manage contracts — retainers and milestones',
    goal: 'تتبع جميع العقود: شهرية (retainer) بفوترة تلقائية، أو مراحل (milestone) بإنشاء فواتير لكل مرحلة.',
    tips: [
      'عقد "ثابت شهري" ينشئ فوترة تلقائية عند التفعيل',
      'حدد المبلغ الشهري ودورة الفوترة ويوم الفوترة',
      'تغيير حالة العقد إلى "نشط" يُفعّل الفوترة التلقائية',
      'إلغاء أو إكمال العقد يوقف الفوترة المتكررة',
      'عقد "مراحل" يتيح إنشاء فواتير لكل مرحلة منجزة',
    ],
    keywords: ['contracts', 'عقود', 'retainer', 'اشتراك شهري', 'دفع شهري', 'مراحل'],
  },
  '/dashboard/finance/recurring': {
    href: '/dashboard/finance/recurring',
    description: 'إعداد فواتير متكررة تلقائياً',
    descriptionEn: 'Set up automatic recurring invoices',
    goal: 'أنشئ قوالب فواتير تصدر تلقائياً حسب جدول محدد (شهري، ربع سنوي، سنوي).',
    tips: [
      'حدد العميل والبنود ودورة التكرار',
      'الفاتورة تُنشأ تلقائياً في الموعد المحدد',
      'يمكنك إيقاف أو تعديل الفاتورة المتكررة في أي وقت',
    ],
    keywords: ['recurring', 'فواتير متكررة', 'تلقائي', 'جدولة'],
  },
  '/dashboard/finance/reports': {
    href: '/dashboard/finance/reports',
    description: 'تقارير مالية تفصيلية وتحليلات الربحية',
    descriptionEn: 'Detailed financial reports and profitability analytics',
    goal: 'تحليل مالي شامل يشمل: الأرباح والخسائر، الضريبة، ربحية العملاء، وربحية المشاريع.',
    tips: [
      'اختر الفترة الزمنية من فلتر التاريخ',
      'تاب "الأرباح والخسائر" يعرض إيرادات ومصاريف كل فترة',
      'تاب "الضريبة" يحسب صافي VAT المستحق',
      'تاب "ربحية العملاء" يرتب العملاء حسب الربح',
      'تاب "ربحية المشاريع" يتتبع استخدام الميزانية لكل مشروع',
      'صدّر التقرير كملف للمشاركة',
    ],
    keywords: ['reports', 'تقارير', 'أرباح', 'خسائر', 'ضريبة', 'ربحية'],
  },
  '/dashboard/finance/targets': {
    href: '/dashboard/finance/targets',
    description: 'تحديد ومتابعة أهداف الإيرادات',
    descriptionEn: 'Set and track revenue targets',
    goal: 'حدد أهداف إيرادات شهرية أو سنوية وتابع التقدم نحو تحقيقها.',
    tips: [
      'حدد هدف إيرادات لكل فترة',
      'شريط التقدم يتحدث تلقائياً مع الفواتير المدفوعة',
      'قارن الأداء الفعلي بالهدف المحدد',
    ],
    keywords: ['targets', 'أهداف', 'إيرادات', 'أداء'],
  },

  '/dashboard/payroll': {
    href: '/dashboard/payroll',
    description: 'إدارة مسير الرواتب الشهري',
    descriptionEn: 'Monthly payroll management',
    goal: 'أنشئ مسير رواتب شهري يجمع: الراتب الأساسي + مدفوعات المهام + العمل الإضافي + المكافآت - الخصومات. اعتمده وصرف الرواتب.',
    tips: [
      'أنشئ مسير رواتب جديد لكل شهر',
      'زر "حساب" يحسب جميع بنود الموظفين تلقائياً',
      'يمكنك إضافة مكافآت أو خصومات يدوية لكل موظف',
      'اعتمد المسير ثم سجّل الصرف لإصدار كشوف الرواتب',
      'صدّر كشف الراتب كـ PDF لكل موظف',
    ],
    keywords: ['رواتب', 'payroll', 'مسير', 'صرف', 'مكافأة', 'خصم'],
  },
  '/dashboard/evaluations': {
    href: '/dashboard/evaluations',
    description: 'تقييم أداء الموظفين ومتابعة الأهداف',
    descriptionEn: 'Employee performance evaluations and KPIs',
    goal: 'أنشئ فترات تقييم دورية وقيّم أداء الموظفين بمعايير محددة. تابع مؤشرات الأداء (KPIs) وحقق الأهداف.',
    tips: [
      'أنشئ فترة تقييم (ربع سنوية أو سنوية) ثم أضف التقييمات',
      'كل تقييم يتضمن درجات على معايير متعددة (جودة، إنتاجية، تواصل...)',
      'الرسم البياني الشعاعي (Radar) يعرض نقاط القوة والتحسين',
      'حدد أهداف KPI لكل موظف وتابع التقدم',
      'الموظف يرى تقييمه ويؤكد اطلاعه عليه',
    ],
    keywords: ['تقييم', 'أداء', 'evaluation', 'KPI', 'مراجعة', 'أهداف'],
  },
  '/dashboard/evaluations/settings': {
    href: '/dashboard/evaluations/settings',
    description: 'إدارة معايير وفترات التقييم',
    descriptionEn: 'Manage evaluation criteria and periods',
    goal: 'خصّص معايير تقييم الأداء (فنية وسلوكية) وأوزانها. أدر فترات التقييم وحالاتها.',
    tips: [
      'أضف معايير جديدة مع تحديد الوزن والفئة (فنية أو سلوكية)',
      'المعايير الافتراضية: جودة العمل، الإنتاجية، التواصل، العمل الجماعي',
      'يمكنك تعطيل معيار بدون حذفه',
    ],
    keywords: ['معايير تقييم', 'criteria', 'فترات', 'أوزان'],
  },
  '/dashboard/content-pipeline': {
    href: '/dashboard/content-pipeline',
    description: 'خط إنتاج المحتوى من السكريبت للتسليم',
    descriptionEn: 'Content production pipeline from script to delivery',
    goal: 'تابع مراحل إنتاج المحتوى: كتابة السكريبت → المراجعة → التعديل → التصوير → المونتاج → مراجعة العميل → التسليم.',
    tips: [
      'أنشئ عنصر محتوى جديد وحدد المشروع والنوع (فيديو، صور...)',
      'لوحة كانبان تعرض المراحل بأعمدة متتالية',
      'عيّن مسؤول لكل مرحلة لتوزيع العمل',
      'سجّل ملاحظات على كل مرحلة لتوثيق القرارات',
      'اربط المحتوى بمراجعة سكريبت لتتبع كامل',
    ],
    keywords: ['محتوى', 'إنتاج', 'pipeline', 'فيديو', 'مراحل', 'كانبان'],
  },

  /* ═══════════════ الفريق ═══════════════ */
  '/dashboard/teams': {
    href: '/dashboard/teams',
    description: 'إنشاء وإدارة فرق العمل',
    descriptionEn: 'Create and manage work teams',
    goal: 'نظّم فريقك في مجموعات عمل مع صلاحيات وصول للملفات حسب الفريق.',
    tips: [
      'أنشئ فريق جديد وأضف الأعضاء',
      'كل فريق يمكنه الوصول لمجلدات محددة',
      'عيّن قائد لكل فريق لإدارة الأعضاء',
    ],
    keywords: ['teams', 'فرق', 'مجموعات', 'أعضاء'],
  },
  '/dashboard/users': {
    href: '/dashboard/users',
    description: 'إدارة المستخدمين وتعيين الأدوار',
    descriptionEn: 'Manage users and assign roles',
    goal: 'أضف مستخدمين جدد، عيّن لهم أدوار وصلاحيات، وتابع نشاطهم في النظام.',
    tips: [
      'أضف مستخدم جديد بالبريد الإلكتروني واسم المستخدم',
      'عيّن الدور المناسب من القائمة المنسدلة',
      'الدور يحدد ما يمكن للمستخدم الوصول إليه',
      'يمكنك تعطيل حساب مستخدم بدون حذفه',
    ],
    keywords: ['users', 'مستخدمون', 'حسابات', 'أدوار'],
  },
  '/dashboard/roles': {
    href: '/dashboard/roles',
    description: 'إدارة الأدوار والصلاحيات المخصصة',
    descriptionEn: 'Manage custom roles and permissions',
    goal: 'أنشئ أدوار مخصصة بصلاحيات محددة لكل وحدة في النظام. حدد ما يراه ويفعله كل دور.',
    tips: [
      'الأدوار الافتراضية (نظام) لا يمكن حذفها',
      'أنشئ أدوار مخصصة حسب احتياجات فريقك',
      'الصلاحيات مجمّعة حسب الوحدة لسهولة الإدارة',
      'تغيير صلاحيات الدور يؤثر فوراً على جميع المستخدمين بهذا الدور',
    ],
    keywords: ['roles', 'أدوار', 'صلاحيات', 'RBAC'],
  },

  '/dashboard/permissions': {
    href: '/dashboard/permissions',
    description: 'إدارة صلاحيات الملفات والمجلدات',
    descriptionEn: 'Manage file and folder permissions',
    goal: 'تحكم في من يمكنه الوصول لملفات ومجلدات محددة. عيّن صلاحيات قراءة، كتابة، حذف، ومشاركة لكل مستخدم أو فريق.',
    tips: [
      'عيّن صلاحيات لمستخدم أو فريق على مجلد محدد',
      'يمكنك تحديد تاريخ انتهاء للصلاحية المؤقتة',
      'الصلاحيات: قراءة، كتابة، حذف، مشاركة',
      'احذف صلاحية لإزالة وصول مستخدم لمجلد معين',
    ],
    keywords: ['صلاحيات', 'permissions', 'وصول', 'ملفات', 'أمان'],
  },

  /* ═══════════════ النظام ═══════════════ */
  '/dashboard/reports': {
    href: '/dashboard/reports',
    description: 'تقارير شاملة عن المشاريع والعملاء والفريق',
    descriptionEn: 'Comprehensive reports on projects, clients, and team',
    goal: 'مركز التقارير العامة: تقارير المشاريع، العملاء، التخزين، الإيرادات، وأداء الفريق.',
    tips: [
      'اختر نوع التقرير من البطاقات المتاحة',
      'كل تقرير يعرض بيانات محدّثة',
      'يمكن تصدير التقارير كملفات',
    ],
    keywords: ['reports', 'تقارير', 'تحليلات'],
  },
  '/dashboard/automations': {
    href: '/dashboard/automations',
    description: 'إعداد أتمتة العمليات والإشعارات',
    descriptionEn: 'Set up workflow automation and notifications',
    goal: 'أتمتة المهام المتكررة: إرسال إشعارات تلقائية، تحديث حالات، وتنفيذ إجراءات بناءً على أحداث محددة.',
    tips: [
      'أنشئ قاعدة أتمتة جديدة مع شرط ومحفّز',
      'اختر الإجراء: إشعار، تحديث حالة، أو webhook',
      'تابع سجل التنفيذ لكل قاعدة',
      'يمكنك تعطيل قاعدة مؤقتاً بدون حذفها',
    ],
    keywords: ['automations', 'أتمتة', 'قواعد', 'تلقائي'],
  },
  '/dashboard/knowledge-base': {
    href: '/dashboard/knowledge-base',
    description: 'قاعدة معرفية للأسئلة الشائعة والتوثيق',
    descriptionEn: 'Knowledge base for FAQs and documentation',
    goal: 'أنشئ مقالات معرفية للعملاء والفريق. تظهر المقالات في بوابة العملاء كمركز مساعدة.',
    tips: [
      'أنشئ فئات لتنظيم المقالات',
      'المقالات المنشورة تظهر في بوابة العملاء',
      'استخدم المحرر لتنسيق المقالات بسهولة',
    ],
    keywords: ['knowledge', 'معرفة', 'مقالات', 'أسئلة شائعة'],
  },
  '/dashboard/integrations': {
    href: '/dashboard/integrations',
    description: 'ربط خدمات خارجية عبر Webhooks',
    descriptionEn: 'Connect external services via Webhooks',
    goal: 'اربط مساحة العمل بخدمات خارجية (Slack، Zapier، إلخ) عبر Webhooks لتبادل البيانات تلقائياً.',
    tips: [
      'أنشئ Webhook جديد مع URL الخدمة الخارجية',
      'اختر الأحداث التي تريد إرسالها',
      'تابع سجل الإرسال ونجاح/فشل كل طلب',
    ],
    keywords: ['integrations', 'تكاملات', 'webhooks', 'API'],
  },
  '/dashboard/activity': {
    href: '/dashboard/activity',
    description: 'سجل شامل لجميع الأنشطة في النظام',
    descriptionEn: 'Comprehensive log of all system activities',
    goal: 'راقب كل ما يحدث في مساحة العمل: من رفع الملفات إلى تعديل المشاريع وإنشاء الفواتير.',
    tips: [
      'فلتر حسب المستخدم أو نوع النشاط',
      'النشاطات مرتبة من الأحدث للأقدم',
      'انقر على النشاط لرؤية التفاصيل',
    ],
    keywords: ['activity', 'نشاط', 'سجل', 'تتبع'],
  },
  '/dashboard/login-history': {
    href: '/dashboard/login-history',
    description: 'سجل عمليات تسجيل الدخول للمستخدمين',
    descriptionEn: 'User login history log',
    goal: 'تابع من قام بتسجيل الدخول ومتى وأين، لضمان أمان الحسابات.',
    tips: [
      'راقب محاولات الدخول المشبوهة',
      'تابع آخر نشاط لكل مستخدم',
      'المواقع الجغرافية تظهر إن توفرت',
    ],
    keywords: ['login', 'تسجيل دخول', 'أمان', 'سجل'],
  },
  '/dashboard/sessions': {
    href: '/dashboard/sessions',
    description: 'إدارة الجلسات النشطة للمستخدمين',
    descriptionEn: 'Manage active user sessions',
    goal: 'استعرض الجلسات النشطة وأنهِ أي جلسة مشبوهة لحماية الحسابات.',
    tips: [
      'الجلسات النشطة تظهر مع معلومات الجهاز والمتصفح',
      'يمكنك إنهاء جلسة أي مستخدم',
      'الجلسة الحالية مميزة ولا يمكن إنهاؤها من هنا',
    ],
    keywords: ['sessions', 'جلسات', 'أمان', 'أجهزة'],
  },
  '/dashboard/settings': {
    href: '/dashboard/settings',
    description: 'إعدادات النظام العامة والتخصيصات',
    descriptionEn: 'General system settings and customizations',
    goal: 'خصّص إعدادات مساحة العمل: اسم الشركة، البادئات (للفواتير والعروض)، الشعار، والإعدادات العامة.',
    tips: [
      'غيّر بادئة أرقام الفواتير وعروض الأسعار',
      'أضف شعار الشركة لملفات PDF',
      'خصّص إعدادات البريد الإلكتروني',
      'التغييرات تُطبق فوراً على النظام',
    ],
    keywords: ['settings', 'إعدادات', 'تخصيص', 'شعار'],
  },
};

/**
 * Get module guide by href (exact match or prefix match).
 */
export function getModuleGuide(pathname: string): ModuleGuide | undefined {
  // Try exact match first
  if (MODULE_GUIDES[pathname]) return MODULE_GUIDES[pathname];

  // Try prefix match (e.g., /dashboard/files/some/path → /dashboard/files)
  const segments = pathname.split('/');
  while (segments.length > 2) {
    segments.pop();
    const prefix = segments.join('/');
    if (MODULE_GUIDES[prefix]) return MODULE_GUIDES[prefix];
  }

  return undefined;
}

/**
 * Get all module guides as an array, optionally filtered by search.
 */
export function searchModuleGuides(query?: string): ModuleGuide[] {
  const all = Object.values(MODULE_GUIDES);
  if (!query || query.trim() === '') return all;

  const q = query.toLowerCase();
  return all.filter(
    (m) =>
      m.description.includes(q) ||
      m.descriptionEn.toLowerCase().includes(q) ||
      m.goal.includes(q) ||
      m.keywords.some((k) => k.includes(q))
  );
}

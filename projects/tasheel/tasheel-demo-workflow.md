# Tasheel AI WhatsApp Demo — Workflow Spec

## Architecture

```
Evolution API Webhook (test1 instance)
    │
    ├── Filter: fromMe = false
    │
    ├── Switch (Media Type):
    │   ├── Text → AI Agent (بايرا)
    │   ├── Audio → Whisper Transcribe → AI Agent
    │   ├── Image → Upload to Drive → AI Agent (with file link)
    │   └── PDF/Document → Upload to Drive → AI Agent (with file link)
    │
    ├── AI Agent Tools:
    │   ├── Save Client Data (Google Sheets)
    │   ├── Upload Document (Google Drive)
    │   ├── Send Document to Client (Evolution API)
    │   ├── Create Digital Case (Google Sheets)
    │   ├── Think Tool
    │   └── DateTime Tool
    │
    └── Response → Evolution API Send Text
```

## Google Sheets Structure
**Sheet Name:** Tasheel AI - Cases

### Tab 1: Cases (المعاملات)
| Column | Description |
|--------|------------|
| Case ID | TAS-001, TAS-002... |
| Client Name | اسم العميل |
| Phone | رقم الواتساب |
| Service Type | نوع الخدمة |
| Status | جديد / قيد التجهيز / مكتمل / بانتظار مستندات |
| Documents Received | قائمة المستندات المستلمة |
| Documents Missing | المستندات الناقصة |
| Drive Folder | رابط مجلد Google Drive |
| Created At | تاريخ الإنشاء |
| Updated At | آخر تحديث |
| Notes | ملاحظات |

### Tab 2: Clients (العملاء)
| Column | Description |
|--------|------------|
| Phone | رقم الواتساب |
| Name | الاسم |
| Company | اسم المنشأة |
| Language | ar / en |
| Total Cases | عدد المعاملات |
| First Contact | أول تواصل |

## Google Drive Structure
```
Pyra-publich-share/
└── Tasheel-Demo/
    ├── TAS-001_[ClientName]/
    │   ├── passport.pdf
    │   ├── trade_license.jpg
    │   └── ...
    ├── TAS-002_[ClientName]/
    └── ...
```

## AI Prompt (بايرا - مساعدة تسهيل)
See below in workflow build.

# WhatsApp & Evolution API — Full Reference

## ⚠️ WhatsApp LID Migration (مارس 2026)
- واتساب غيّر نظام الـ IDs — بعض الأرقام صارت بـ **LID format** (`123456@lid` بدل `971xxx@s.whatsapp.net`)
- **البحث بالرقم مباشرة ممكن ما يلاقي الرسائل!**
- **الطريقة الصحيحة:** بحث الرقم في contacts → جيب الـ LID → بحث الرسائل بالـ LID
- **Contacts API:** `POST /chat/findContacts/pyraai` → `{"where":{"pushName":"Name"}}` أو `{"where":{"remoteJid":"971xxx@s.whatsapp.net"}}`
- **ملاحظة:** لما نبعث رسالة نستخدم الرقم العادي — الـ LID بس للقراءة

## Evolution API — n8n Community Node
- **Package:** `n8n-nodes-evolution-api-english` (v1.1.2)
- **NPM:** https://www.npmjs.com/package/n8n-nodes-evolution-api-english
- **GitHub:** https://github.com/bsormagec/n8n-nodes-evolution-api
- **Requirements:** n8n ≥ 1.54.4 + Evolution API ≥ 2.2.0
- **محمد بيستخدم هذا الباكدج لكل شغل الواتساب على n8n**

### Available Resources & Operations:

**🖥️ Instance:**
- Create Instance, Generate QR-Code, Fetch Instance
- Set Behavior, Set Presence, Set Proxy, Fetch Proxy
- Disconnect WhatsApp, Delete Instance

**✉️ Message (الأهم!):**
- Send Text, Send Image, Send Video, Send Audio
- Send Document, Send Poll, Send Contact
- Send List, Send Button, Send Pix (payment)
- Send Status, React to Message

**👥 Group:**
- Create Group, Update Picture/Name/Description/Settings
- Update Members, Fetch/Revoke/Send Invite Link
- Find Participants, Temporary Messages
- Leave Group, Join Group

**💬 Chat:**
- Verify Number, Read Message, Manage Archive
- Mark as Unread, Delete Message, Fetch Profile Picture
- Get Media in Base64, Edit Message, Send Presence
- Block Contact, Fetch Contacts
- Search Messages, Search Status, Search Chats

**⚡ Event:**
- Webhook, RabbitMQ

**🔗 Integration:**
- Chatwoot, Evolution Bot, Typebot, Dify, Flowise

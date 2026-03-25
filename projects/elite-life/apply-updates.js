const fs = require('fs');

// Load current workflow
const workflow = JSON.parse(fs.readFileSync('/home/node/openclaw/elite-life/current-workflow.json', 'utf8'));

// Load new system prompt
const newSystemPrompt = fs.readFileSync('/home/node/openclaw/elite-life/new-system-prompt.md', 'utf8');

// Find and update the AI Agent node
const agentNode = workflow.nodes.find(n => n.name === 'Elite Life AI Agent');
if (agentNode) {
  // Keep the user message part, update system message
  agentNode.parameters.options.systemMessage = newSystemPrompt;
  console.log('✅ Updated System Prompt');
}

// Find the last node position to add new nodes after
let maxY = 0;
let maxX = 0;
workflow.nodes.forEach(n => {
  if (n.position) {
    maxY = Math.max(maxY, n.position[1]);
    maxX = Math.max(maxX, n.position[0]);
  }
});

// Create Get Patient Context tool node
const patientContextTool = {
  "id": "patient-context-tool-001",
  "name": "Get Patient Context",
  "type": "n8n-nodes-base.postgresTool",
  "position": [maxX + 200, 500],
  "parameters": {
    "descriptionType": "manual",
    "toolDescription": "جلب السياق الكامل للمريض - بياناته + مواعيده.\n\n⭐ استخدم هذه الأداة أول شي في كل محادثة!\n\nالمُخرجات:\n• patient: بيانات المريض (name, reliability_score, total_visits, noshow_count, departments_visited)\n• appointments: آخر 5 مواعيد\n• tier: VIP/Regular/New\n• is_new: هل عميل جديد\n\n💡 استخدم للـ personalization والـ cross-selling",
    "operation": "executeQuery",
    "query": `=SELECT json_build_object(
  'patient', (
    SELECT row_to_json(p.*)
    FROM patient_profiles p
    WHERE p.whatsapp_number = '{{ $('Extract Message Data').item.json.whatsapp_number }}'
  ),
  'appointments', (
    SELECT COALESCE(json_agg(a ORDER BY a.date DESC), '[]'::json)
    FROM (
      SELECT 
        id, date, time, status, attended,
        (SELECT name_ar FROM doctors WHERE id = appointments.doctor_id) as doctor_name,
        (SELECT name_ar FROM services WHERE id = appointments.service_id) as service_name
      FROM appointments
      WHERE patient_id = (
        SELECT id FROM patients WHERE whatsapp_number = '{{ $('Extract Message Data').item.json.whatsapp_number }}'
      )
      ORDER BY date DESC
      LIMIT 5
    ) a
  ),
  'tier', CASE
    WHEN (SELECT total_spent FROM patient_profiles WHERE whatsapp_number = '{{ $('Extract Message Data').item.json.whatsapp_number }}') >= 5000 THEN 'VIP'
    WHEN (SELECT total_visits FROM patient_profiles WHERE whatsapp_number = '{{ $('Extract Message Data').item.json.whatsapp_number }}') >= 5 THEN 'Regular'
    ELSE 'New'
  END,
  'is_new', NOT EXISTS (
    SELECT 1 FROM patients WHERE whatsapp_number = '{{ $('Extract Message Data').item.json.whatsapp_number }}'
  )
) as context`,
    "options": {}
  },
  "typeVersion": 2.5,
  "credentials": workflow.nodes.find(n => n.type === 'n8n-nodes-base.postgresTool')?.credentials
};

// Create Get Config tool node
const configTool = {
  "id": "config-tool-001", 
  "name": "Get Clinic Config",
  "type": "n8n-nodes-base.postgresTool",
  "position": [maxX + 200, 700],
  "parameters": {
    "descriptionType": "manual",
    "toolDescription": "جلب إعدادات العيادة.\n\nيرجع:\n• clinic_name_ar/en\n• clinic_phone\n• clinic_address\n• google_maps_link\n• google_review_link\n• working_hours_start/end\n• assistant_name_ar: بايرا\n\n💡 استخدم بدل الـ hardcoded values",
    "operation": "executeQuery",
    "query": "SELECT json_object_agg(key, value) as config FROM config",
    "options": {}
  },
  "typeVersion": 2.5,
  "credentials": workflow.nodes.find(n => n.type === 'n8n-nodes-base.postgresTool')?.credentials
};

// Add new tool nodes
workflow.nodes.push(patientContextTool);
workflow.nodes.push(configTool);
console.log('✅ Added Get Patient Context tool');
console.log('✅ Added Get Clinic Config tool');

// Update Get Services to use doctor_available_services view
const servicesNode = workflow.nodes.find(n => n.name === 'Get Services');
if (servicesNode) {
  servicesNode.parameters.table = {
    "__rl": true,
    "value": "doctor_available_services",
    "mode": "list",
    "cachedResultName": "doctor_available_services"
  };
  servicesNode.parameters.options.outputColumns = [
    "service_id", "service_code", "service_name_ar", "service_name_en",
    "doctor_id", "doctor_code", "doctor_name_ar",
    "department_code", "department_name_ar",
    "duration_minutes", "service_type"
  ];
  servicesNode.parameters.toolDescription = "=جلب الخدمات مع الأطباء المرتبطين.\n\nالمُدخلات:\n• department_code (اختياري): DEP-0001/DEP-0002/DEP-0003\n\nالمُخرجات:\n• service_id, service_name_ar\n• doctor_id, doctor_name_ar\n• department_code, duration_minutes\n\n💡 يربط الخدمة بالطبيب مباشرة";
  console.log('✅ Updated Get Services to use doctor_available_services view');
}

// Connect new tools to the AI Agent
const agentNodeId = agentNode?.id;
if (agentNodeId) {
  // Add connections (the agent uses sub-nodes, so we need to connect them as tools)
  // In n8n, tools connect to the agent's tool input
  // This is handled by the agent's internal configuration, not explicit connections
  console.log('ℹ️ Tools will be connected via AI Agent configuration');
}

// Save updated workflow
fs.writeFileSync('/home/node/openclaw/elite-life/updated-workflow.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved updated workflow');

// Create clean version for API
const cleanWorkflow = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings,
  staticData: workflow.staticData
};
fs.writeFileSync('/home/node/openclaw/elite-life/workflow-for-api.json', JSON.stringify(cleanWorkflow));
console.log('✅ Saved clean workflow for API');

console.log('\n📋 Summary:');
console.log('- System Prompt: Updated (shorter, smarter)');
console.log('- New Tool: Get Patient Context');
console.log('- New Tool: Get Clinic Config');  
console.log('- Updated: Get Services (uses doctor_available_services)');
console.log('- Already Updated: Get Available Slots (uses smart query)');

const SUPABASE_URL = 'https://pyraworkspacedb.pyramedia.cloud';
const SERVICE_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTEwOTA0MCwiZXhwIjo0OTI2NzgyNjQwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.jn_uFr92HhADYlgWzVoNXz7G7yk-OogjyHPY6I-IzpI';

async function run() {
  const queries = [
    "ALTER TABLE pyra_expenses ADD COLUMN IF NOT EXISTS project_id varchar(20) REFERENCES pyra_projects(id) ON DELETE SET NULL",
    "ALTER TABLE pyra_projects ADD COLUMN IF NOT EXISTS budget numeric(12,2) DEFAULT NULL",
    "CREATE TABLE IF NOT EXISTS pyra_contract_milestones (id varchar(20) PRIMARY KEY, contract_id varchar(20) NOT NULL REFERENCES pyra_contracts(id) ON DELETE CASCADE, title text NOT NULL, description text, percentage numeric(5,2) NOT NULL DEFAULT 0, amount numeric(12,2) NOT NULL DEFAULT 0, due_date date, status varchar(20) NOT NULL DEFAULT 'pending', invoice_id varchar(20) REFERENCES pyra_invoices(id) ON DELETE SET NULL, sort_order int NOT NULL DEFAULT 0, completed_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())",
    "CREATE INDEX IF NOT EXISTS idx_milestones_contract ON pyra_contract_milestones(contract_id)",
    "CREATE TABLE IF NOT EXISTS pyra_recurring_invoices (id varchar(20) PRIMARY KEY, contract_id varchar(20) REFERENCES pyra_contracts(id) ON DELETE SET NULL, client_id varchar(20) REFERENCES pyra_clients(id) ON DELETE SET NULL, title text NOT NULL, items jsonb NOT NULL DEFAULT '[]', currency varchar(10) DEFAULT 'AED', billing_cycle varchar(20) NOT NULL DEFAULT 'monthly', next_generation_date date NOT NULL, last_generated_at timestamptz, status varchar(20) DEFAULT 'active', auto_send boolean DEFAULT false, created_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())",
    "CREATE TABLE IF NOT EXISTS pyra_revenue_targets (id varchar(20) PRIMARY KEY, period_type varchar(20) NOT NULL, period_start date NOT NULL, period_end date NOT NULL, target_amount numeric(12,2) NOT NULL, currency varchar(10) DEFAULT 'AED', notes text, created_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())",
    "CREATE TABLE IF NOT EXISTS pyra_stripe_payments (id varchar(20) PRIMARY KEY, invoice_id varchar(20) NOT NULL REFERENCES pyra_invoices(id) ON DELETE CASCADE, stripe_session_id text, stripe_payment_intent_id text, amount numeric(12,2) NOT NULL, currency varchar(10) DEFAULT 'AED', status varchar(20) DEFAULT 'pending', client_id varchar(20) REFERENCES pyra_clients(id) ON DELETE SET NULL, metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())",
    "CREATE INDEX IF NOT EXISTS idx_stripe_invoice ON pyra_stripe_payments(invoice_id)",
    "CREATE INDEX IF NOT EXISTS idx_stripe_session ON pyra_stripe_payments(stripe_session_id)",
    "ALTER TABLE pyra_expenses ADD COLUMN IF NOT EXISTS subscription_id varchar(20) REFERENCES pyra_subscriptions(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS idx_expenses_subscription ON pyra_expenses(subscription_id)",
  ];

  for (const query of queries) {
    try {
      const res = await fetch(SUPABASE_URL + '/pg/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'apikey': SERVICE_KEY,
        },
        body: JSON.stringify({ query }),
      });
      const text = await res.text();
      const shortQ = query.substring(0, 70);
      console.log(res.status === 200 ? 'OK: ' + shortQ : 'FAIL(' + res.status + '): ' + shortQ + ' -> ' + text);
    } catch(e) {
      console.log('ERROR: ' + e.message);
    }
  }

  // Update v_project_summary view to include budget
  const viewQuery = "SELECT pg_get_viewdef('v_project_summary', true)";
  const vRes = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SERVICE_KEY },
    body: JSON.stringify({ query: viewQuery }),
  });
  const viewDef = await vRes.json();
  console.log('\nView definition check:', JSON.stringify(viewDef).substring(0, 200));

  console.log('\nAll schema changes done.');
}
run();

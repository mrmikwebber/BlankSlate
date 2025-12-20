import { createClient } from '@supabase/supabase-js';

/**
 * Reset the test database and seed base data.
 *
 * IMPORTANT: This function must be called from a Node context where you provide
 * the Supabase URL, service key and test user id (do not rely on Cypress globals
 * at module load time).
 */
export async function resetDatabase(supabaseUrl: string, serviceRoleKey: string, testUserId: string) {
  if (!supabaseUrl || !serviceRoleKey || !testUserId) {
    throw new Error('Missing supabaseUrl, serviceRoleKey, or testUserId for resetDatabase');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  // Delete all existing data for a clean slate
  // Order matters: transactions reference accounts, so clear transactions first
  const userId = testUserId;

  try {
  // Only delete rows for the test user to avoid touching other data
  const { data: delTx, error: errTx } = await supabase.from('transactions').delete().eq('user_id', userId);
    if (errTx) throw errTx;
  console.log('Deleted transactions:', Array.isArray(delTx as any) ? (delTx as any).length : 0);

  const { data: delPayees, error: errPayees } = await supabase.from('transaction_payees').delete().eq('user_id', userId);
    if (errPayees) throw errPayees;
  console.log('Deleted transaction_payees:', Array.isArray(delPayees as any) ? (delPayees as any).length : 0);

  const { data: delBudget, error: errBudget } = await supabase.from('budget_data').delete().eq('user_id', userId);
    if (errBudget) throw errBudget;
  console.log('Deleted budget_data rows:', Array.isArray(delBudget as any) ? (delBudget as any).length : 0);

  const { data: delAccounts, error: errAccounts } = await supabase.from('accounts').delete().eq('user_id', userId);
    if (errAccounts) throw errAccounts;
  console.log('Deleted accounts:', Array.isArray(delAccounts as any) ? (delAccounts as any).length : 0);
  } catch (err) {
    console.error('Error deleting existing data in resetDatabase:', err);
    throw err;
  }

  // Create a default debit account and a credit card account
  let checking: any = null;
  let card: any = null;
  let savings: any = null;
  let amex: any = null;
  try {
    const { data: checkingData, error: checkingErr } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name: 'Checking Account',
        issuer: null,
        type: 'debit',
        balance: 1000,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (checkingErr) throw checkingErr;
    checking = checkingData;
    console.log('Seeded checking account:', checking?.id);

    const { data: cardData, error: cardErr } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name: 'Visa Card',
        issuer: 'Visa',
        type: 'credit',
        balance: 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

      
    if (cardErr) throw cardErr;
    card = cardData;
    console.log('Seeded card account:', card?.id);
    
    // Add an extra debit account for tests (e.g., Savings)
    const { data: savingsData, error: savingsErr } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name: 'Savings Account',
        issuer: null,
        type: 'debit',
        balance: 5000,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
  if (savingsErr) throw savingsErr;
  savings = savingsData;
  console.log('Seeded savings account:', savingsData?.id);

    // Add an extra credit card account for tests (e.g., Amex)
    const { data: amexData, error: amexErr } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name: 'Amex Card',
        issuer: 'Amex',
        type: 'credit',
        balance: -2000,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
  if (amexErr) throw amexErr;
  amex = amexData;
  console.log('Seeded amex account:', amexData?.id);
  } catch (err) {
    console.error('Error seeding accounts in resetDatabase:', err);
    throw err;
  }

  // Seed a budget_data row using the same JSON shape your app expects
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const defaultCategories = [
    {
      name: 'Bills',
      categoryItems: [
        { name: 'Rent', assigned: 0, activity: 0, available: 0 },
        { name: 'Electricity', assigned: 0, activity: 0, available: 0 },
        { name: 'Water', assigned: 0, activity: 0, available: 0 },
      ],
    },
    {
      name: 'Subscriptions',
      categoryItems: [
        { name: 'Spotify', assigned: 0, activity: 0, available: 0 },
        { name: 'Netflix', assigned: 0, activity: 0, available: 0 },
      ],
    },
    {
      name: 'Credit Card Payments',
      categoryItems: [],
    },
  ];

  try {
    const { data: bdData, error: bdErr } = await supabase.from('budget_data').insert([
      {
        user_id: userId,
        month,
        data: { categories: defaultCategories },
        assignable_money: 0,
        ready_to_assign: 0,
      },
    ]).select();
    if (bdErr) throw bdErr;
    console.log('Seeded budget_data rows:', bdData?.length ?? 0);
  } catch (err) {
    console.error('Error seeding budget_data in resetDatabase:', err);
    throw err;
  }

  return {
    success: true,
    message: 'Database reset complete',
    accounts: {
      checking: {
        id: checking?.id ?? '',
        name: 'Checking Account',
        type: 'debit' as const,
      },
      visa: {
        id: card?.id ?? '',
        name: 'Visa Card',
        type: 'credit' as const,
      },
      savings: {
        id: savings?.id ?? '',
        name: 'Savings Account',
        type: 'debit' as const,
      },
      amex: {
        id: amex?.id ?? '',
        name: 'Amex Card',
        type: 'credit' as const,
      },
    },
  };
}
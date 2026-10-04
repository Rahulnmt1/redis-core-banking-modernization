export const CUSTOMERS = [
  {
    custId: 'CUST00001',
    name: 'Aarav Sharma',
    segment: 'Priority',
    kyc: 'VERIFIED',
    city: 'Mumbai',
    email: 'aarav.sharma@example.com',
    phone: '+91-98XXXXXX01',
  },
  {
    custId: 'CUST00002',
    name: 'Diya Patel',
    segment: 'Retail',
    kyc: 'VERIFIED',
    city: 'Bengaluru',
    email: 'diya.patel@example.com',
    phone: '+91-98XXXXXX02',
  },
  {
    custId: 'CUST00003',
    name: 'Vihaan Iyer',
    segment: 'Wealth',
    kyc: 'VERIFIED',
    city: 'Chennai',
    email: 'vihaan.iyer@example.com',
    phone: '+91-98XXXXXX03',
  },
  {
    custId: 'CUST00004',
    name: 'Ananya Gupta',
    segment: 'Retail',
    kyc: 'VERIFIED',
    city: 'Delhi',
    email: 'ananya.gupta@example.com',
    phone: '+91-98XXXXXX04',
  },
  {
    custId: 'CUST00005',
    name: 'Kabir Singh',
    segment: 'Priority',
    kyc: 'VERIFIED',
    city: 'Pune',
    email: 'kabir.singh@example.com',
    phone: '+91-98XXXXXX05',
  },
];

export const ACCOUNTS = [
  { acctId: 'ACC1001', custId: 'CUST00001', type: 'SAVINGS', balance: 245678.5, currency: 'INR' },
  { acctId: 'ACC1002', custId: 'CUST00001', type: 'CURRENT', balance: 89200.1, currency: 'INR' },
  { acctId: 'ACC1003', custId: 'CUST00002', type: 'SAVINGS', balance: 124500.0, currency: 'INR' },
  { acctId: 'ACC1004', custId: 'CUST00003', type: 'WEALTH', balance: 1845000.0, currency: 'INR' },
  { acctId: 'ACC1005', custId: 'CUST00004', type: 'SAVINGS', balance: 56234.75, currency: 'INR' },
  { acctId: 'ACC1006', custId: 'CUST00005', type: 'SAVINGS', balance: 312890.0, currency: 'INR' },
];

export const LOANS = [
  { loanId: 'LN5001', custId: 'CUST00001', product: 'HOME', principal: 4500000, outstanding: 3120000 },
  { loanId: 'LN5002', custId: 'CUST00003', product: 'AUTO', principal: 1800000, outstanding: 950000 },
  { loanId: 'LN5003', custId: 'CUST00005', product: 'PERSONAL', principal: 500000, outstanding: 320000 },
];

export const CARDS = [
  { cardId: 'CRD9001', custId: 'CUST00001', type: 'CREDIT', limit: 500000, used: 84500 },
  { cardId: 'CRD9002', custId: 'CUST00002', type: 'DEBIT', limit: 0, used: 0 },
  { cardId: 'CRD9003', custId: 'CUST00003', type: 'CREDIT', limit: 1000000, used: 215000 },
];

export const WATCHLIST = ['ACC9999', 'CUST_BLOCKED01', 'IBAN_FRAUD_001'];

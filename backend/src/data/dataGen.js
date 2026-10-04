const FIRST = [
  'Aarav','Vihaan','Aditya','Vivaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Shaurya',
  'Atharv','Advait','Pranav','Dhruv','Kabir','Ayaan','Yash','Veer','Rudra','Aryan',
  'Diya','Aanya','Aadya','Ananya','Pari','Ira','Myra','Sara','Anika','Navya',
  'Riya','Kiara','Saanvi','Avni','Ishita','Tara','Mira','Khushi','Zara','Aisha',
  'Rohan','Karan','Manish','Rajesh','Suresh','Anil','Sunil','Vikram','Ravi','Amit',
  'Priya','Neha','Sneha','Pooja','Kavita','Anjali','Meera','Sonia','Divya','Nisha',
];

const LAST = [
  'Sharma','Verma','Patel','Iyer','Reddy','Nair','Menon','Pillai','Kapoor','Khanna',
  'Singh','Gupta','Joshi','Mehta','Desai','Shah','Agarwal','Bhattacharya','Sen','Bose',
  'Rao','Naidu','Krishnan','Subramaniam','Pandey','Mishra','Tiwari','Saxena','Chauhan','Choudhary',
  'Malhotra','Bansal','Goel','Aggarwal','Jha','Dutta','Banerjee','Chatterjee','Mukherjee','Ghosh',
];

const CITIES = [
  'Mumbai','Delhi','Bengaluru','Chennai','Kolkata','Hyderabad','Pune','Ahmedabad','Jaipur','Surat',
  'Lucknow','Kanpur','Nagpur','Indore','Bhopal','Patna','Vadodara','Ghaziabad','Coimbatore','Visakhapatnam',
  'Chandigarh','Mysuru','Kochi','Thiruvananthapuram','Guwahati','Bhubaneswar','Dehradun','Ranchi','Raipur','Faridabad',
];

const SEGMENTS = ['Retail','Retail','Retail','Priority','Priority','Wealth'];
const CHANNELS = ['MOBILE','WEB','BRANCH','ATM','UPI','IMPS','POS','NEFT'];
const TXN_TYPES = ['DEBIT','CREDIT'];
const NARRATIVES = [
  'POS Purchase','Salary Credit','UPI Transfer','Bill Payment','ATM Withdrawal',
  'NEFT Transfer','Refund','EMI Debit','Mutual Fund SIP','FD Maturity',
  'Insurance Premium','Loan Disbursal','Interest Credit','Fee Debit','Cashback',
];
const ACCT_TYPES = ['SAVINGS','SAVINGS','SAVINGS','CURRENT','WEALTH','SALARY'];
const LOAN_PRODUCTS = ['HOME','AUTO','PERSONAL','EDUCATION','GOLD','BUSINESS'];
const CARD_TYPES = ['CREDIT','DEBIT','PREPAID'];

function seeded(i, salt) {
  return Math.abs(((i + 1) * (salt + 13)) ^ ((i + 1) << 5)) >>> 0;
}

export const SCALE = {
  customers: 50_000,
  accountsPerCustomerMin: 1,
  accountsPerCustomerMax: 3,
  loans: 10_000,
  cards: 25_000,
  transactions: 200_000,
};

export function generateCustomers(n = SCALE.customers) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const fn = FIRST[seeded(i, 1) % FIRST.length];
    const ln = LAST[seeded(i, 2) % LAST.length];
    const segIdx = seeded(i, 3) % SEGMENTS.length;
    const cityIdx = seeded(i, 4) % CITIES.length;
    out.push({
      cust_id: 'CUST' + String(i + 1).padStart(6, '0'),
      name: `${fn} ${ln}`,
      segment: SEGMENTS[segIdx],
      kyc: 'VERIFIED',
      city: CITIES[cityIdx],
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i + 1}@example.com`,
      phone: '+91-9' + String(800000000 + i).padStart(9, '0'),
    });
  }
  return out;
}

export function generateAccounts(customers) {
  const out = [];
  let n = 1;
  for (const c of customers) {
    const i = parseInt(c.cust_id.slice(4), 10);
    const count =
      SCALE.accountsPerCustomerMin +
      (seeded(i, 5) % (SCALE.accountsPerCustomerMax - SCALE.accountsPerCustomerMin + 1));
    for (let k = 0; k < count; k++) {
      const t = ACCT_TYPES[seeded(n, 6) % ACCT_TYPES.length];
      const base =
        c.segment === 'Wealth'
          ? 1_000_000 + (seeded(n, 7) % 5_000_000)
          : c.segment === 'Priority'
            ? 200_000 + (seeded(n, 7) % 800_000)
            : 5_000 + (seeded(n, 7) % 250_000);
      out.push({
        acct_id: 'ACC' + String(1000 + n).padStart(6, '0'),
        cust_id: c.cust_id,
        type: t,
        balance: Number(base.toFixed(2)),
        currency: 'INR',
      });
      n++;
    }
  }
  return out;
}

export function generateLoans(customers, n = SCALE.loans) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const cust = customers[seeded(i, 8) % customers.length];
    const product = LOAN_PRODUCTS[seeded(i, 9) % LOAN_PRODUCTS.length];
    const principal =
      product === 'HOME'
        ? 2_000_000 + (seeded(i, 10) % 8_000_000)
        : product === 'AUTO'
          ? 500_000 + (seeded(i, 10) % 2_000_000)
          : 100_000 + (seeded(i, 10) % 500_000);
    const outstanding = Math.round(principal * (0.3 + (seeded(i, 11) % 70) / 100));
    out.push({
      loan_id: 'LN' + String(50000 + i).padStart(6, '0'),
      cust_id: cust.cust_id,
      product,
      principal,
      outstanding,
    });
  }
  return out;
}

export function generateCards(customers, n = SCALE.cards) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const cust = customers[seeded(i, 12) % customers.length];
    const t = CARD_TYPES[seeded(i, 13) % CARD_TYPES.length];
    const limit = t === 'CREDIT' ? 100_000 + (seeded(i, 14) % 1_500_000) : 0;
    const used = limit > 0 ? Math.round(limit * ((seeded(i, 15) % 80) / 100)) : 0;
    out.push({
      card_id: 'CRD' + String(90000 + i).padStart(6, '0'),
      cust_id: cust.cust_id,
      type: t,
      limit,
      used,
    });
  }
  return out;
}

export function generateTransactions(accounts, n = SCALE.transactions) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    const acct = accounts[seeded(i, 16) % accounts.length];
    const type = TXN_TYPES[seeded(i, 17) % TXN_TYPES.length];
    const amount = 50 + (seeded(i, 18) % 50_000);
    const channel = CHANNELS[seeded(i, 19) % CHANNELS.length];
    const narrative = NARRATIVES[seeded(i, 20) % NARRATIVES.length];
    const ts = new Date(now - i * 12_000 - (seeded(i, 21) % 30_000));
    out.push({
      txn_id: 'TXN' + String(100000 + i).padStart(8, '0'),
      acct_id: acct.acct_id,
      type,
      amount,
      channel,
      narrative,
      ts,
    });
  }
  return out;
}

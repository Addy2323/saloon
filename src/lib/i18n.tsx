import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'sw' | 'en';

type Dict = Record<string, { sw: string; en: string }>;

const dict: Dict = {
  // Brand
  brand: { sw: 'Lucentia Beauty & Salon', en: 'Lucentia Beauty & Salon' },

  // Navigation
  dashboard: { sw: 'Dashibodi', en: 'Dashboard' },
  inventory: { sw: 'Bidhaa & Stock', en: 'Inventory & Stock' },
  purchases: { sw: 'Ununuzi', en: 'Purchases' },
  expenses: { sw: 'Matumizi', en: 'Expenses' },
  sales: { sw: 'Huduma & Mauzo', en: 'Services & Sales' },
  reports: { sw: 'Ripoti', en: 'Reports' },
  settings: { sw: 'Mipangilio', en: 'Settings' },

  // Dashboard
  todaysOverview: { sw: 'Muhtasari wa Leo', en: "Today's Overview" },
  salesToday: { sw: 'Mauzo ya Leo', en: 'Sales Today' },
  expensesToday: { sw: 'Matumizi ya Leo', en: 'Expenses Today' },
  profitToday: { sw: 'Faida ya Leo', en: 'Profit Today' },
  customersToday: { sw: 'Wateja wa Leo', en: 'Customers Today' },
  productsInStock: { sw: 'Bidhaa Zilizopo', en: 'Products In Stock' },
  lowStockAlerts: { sw: 'Bidhaa Zinazokaribia Kuisha', en: 'Low Stock Alerts' },
  monthlyRevenue: { sw: 'Mapato ya Mwezi', en: 'Monthly Revenue' },
  monthlyExpenses: { sw: 'Matumizi ya Mwezi', en: 'Monthly Expenses' },
  monthlyProfit: { sw: 'Faida ya Mwezi', en: 'Monthly Profit' },
  revenueVsExpenses: { sw: 'Mapato vs Matumizi', en: 'Revenue vs Expenses' },
  last7Days: { sw: 'Siku 7 Zilizopita', en: 'Last 7 Days' },
  last6Months: { sw: 'Miezi 6 Iliyopita', en: 'Last 6 Months' },
  recentSales: { sw: 'Mauzo ya Karibuni', en: 'Recent Sales' },
  topServices: { sw: 'Huduma Zinazouza Zaidi', en: 'Top Services' },

  // Common
  add: { sw: 'Ongeza', en: 'Add' },
  edit: { sw: 'Hariri', en: 'Edit' },
  delete: { sw: 'Futa', en: 'Delete' },
  save: { sw: 'Hifadhi', en: 'Save' },
  cancel: { sw: 'Ghairi', en: 'Cancel' },
  search: { sw: 'Tafuta', en: 'Search' },
  date: { sw: 'Tarehe', en: 'Date' },
  amount: { sw: 'Kiasi', en: 'Amount' },
  total: { sw: 'Jumla', en: 'Total' },
  name: { sw: 'Jina', en: 'Name' },
  category: { sw: 'Kundi', en: 'Category' },
  notes: { sw: 'Maelezo', en: 'Notes' },
  actions: { sw: 'Vitendo', en: 'Actions' },
  noData: { sw: 'Hakuna taarifa', en: 'No data' },
  loading: { sw: 'Inapakia...', en: 'Loading...' },
  confirmDelete: { sw: 'Una uhakika unataka kufuta?', en: 'Are you sure you want to delete?' },

  // Inventory
  productName: { sw: 'Jina la Bidhaa', en: 'Product Name' },
  unit: { sw: 'Kipimo', en: 'Unit' },
  unitCost: { sw: 'Bei ya Kununulia', en: 'Unit Cost' },
  currentStock: { sw: 'Stock Iliyopo', en: 'Current Stock' },
  lowStockThreshold: { sw: 'Kiwango cha Onyo', en: 'Low Stock Threshold' },
  recordUsage: { sw: 'Rekodi Matumizi', en: 'Record Usage' },
  usageType: { sw: 'Aina ya Matumizi', en: 'Usage Type' },
  used: { sw: 'Imetumika', en: 'Used' },
  spoiled: { sw: 'Imeharibika', en: 'Spoiled' },
  finished: { sw: 'Imeisha', en: 'Finished' },
  quantity: { sw: 'Idadi', en: 'Quantity' },
  inStock: { sw: 'Zilizopo', en: 'In Stock' },
  lowStock: { sw: 'Karibia Kuisha', en: 'Low Stock' },
  outOfStock: { sw: 'Imeisha', en: 'Out of Stock' },

  // Purchases
  newPurchase: { sw: 'Ununuzi Mpya', en: 'New Purchase' },
  supplier: { sw: 'Muuzaji', en: 'Supplier' },
  purchaseDate: { sw: 'Tarehe ya Ununuzi', en: 'Purchase Date' },
  product: { sw: 'Bidhaa', en: 'Product' },
  unitPrice: { sw: 'Bei kwa Moja', en: 'Unit Price' },
  lineTotal: { sw: 'Jumla ya Safu', en: 'Line Total' },
  addItem: { sw: 'Ongeza Bidhaa', en: 'Add Item' },
  grandTotal: { sw: 'Jumla Kuu', en: 'Grand Total' },
  purchaseHistory: { sw: 'Historia ya Ununuzi', en: 'Purchase History' },
  items: { sw: 'Bidhaa', en: 'Items' },

  // Expenses
  newExpense: { sw: 'Matumizi Mpya', en: 'New Expense' },
  expenseName: { sw: 'Aina ya Matumizi', en: 'Expense Name' },
  recordedBy: { sw: 'Alierekodi', en: 'Recorded By' },
  expenseDate: { sw: 'Tarehe ya Matumizi', en: 'Expense Date' },
  today: { sw: 'Leo', en: 'Today' },
  thisWeek: { sw: 'Wiki Hii', en: 'This Week' },
  thisMonth: { sw: 'Mwezi Huu', en: 'This Month' },
  thisYear: { sw: 'Mwaka Huu', en: 'This Year' },

  // Sales
  newSale: { sw: 'Rekodi Huduma', en: 'Record Service' },
  service: { sw: 'Huduma', en: 'Service' },
  hairstyle: { sw: 'Mtindo wa Nywele', en: 'Hairstyle' },
  customerName: { sw: 'Jina la Mteja', en: 'Customer Name' },
  numCustomers: { sw: 'Idadi ya Wateja', en: 'Number of Customers' },
  pricePerCustomer: { sw: 'Bei kwa Mteja', en: 'Price per Customer' },
  discount: { sw: 'Punguzo', en: 'Discount' },
  amountPaid: { sw: 'Kiasi Kilicholipwa', en: 'Amount Paid' },
  balance: { sw: 'Deni / Salio', en: 'Balance / Debt' },
  paymentMethod: { sw: 'Njia ya Malipo', en: 'Payment Method' },
  staff: { sw: 'Mfanyakazi', en: 'Staff' },
  totalRevenue: { sw: 'Mapato Yote', en: 'Total Revenue' },

  // Reports
  selectPeriod: { sw: 'Chagua Kipindi', en: 'Select Period' },
  from: { sw: 'Kutoka', en: 'From' },
  to: { sw: 'Hadi', en: 'To' },
  dailySalesReport: { sw: 'Ripoti ya Mauzo ya Siku', en: 'Daily Sales Report' },
  monthlySalesReport: { sw: 'Ripoti ya Mauzo ya Mwezi', en: 'Monthly Sales Report' },
  servicePerformance: { sw: 'Utendaji wa Huduma', en: 'Service Performance' },
  stockReport: { sw: 'Ripoti ya Stock', en: 'Stock Report' },
  purchasesReport: { sw: 'Ripoti ya Ununuzi', en: 'Purchases Report' },
  expensesReport: { sw: 'Ripoti ya Matumizi', en: 'Expenses Report' },
  profitLoss: { sw: 'Ripoti ya Faida na Hasara', en: 'Profit & Loss Report' },
  exportPdf: { sw: 'Pakua PDF', en: 'Download PDF' },
  exportExcel: { sw: 'Pakua Excel', en: 'Download Excel' },
  revenue: { sw: 'Mapato', en: 'Revenue' },
  costOfProducts: { sw: 'Gharama ya Bidhaa Zilizotumika', en: 'Cost of Products Used' },
  operatingExpenses: { sw: 'Matumizi ya Uendeshaji', en: 'Operating Expenses' },
  netProfit: { sw: 'Faida Halisi', en: 'Net Profit' },

  // Settings
  manageServices: { sw: 'Aina za Huduma', en: 'Service Types' },
  manageStaff: { sw: 'Wafanyakazi', en: 'Staff Members' },
  manageCategories: { sw: 'Makundi', en: 'Categories' },
  manageSuppliers: { sw: 'Wauzaji', en: 'Suppliers' },
  defaultPrice: { sw: 'Bei Chaguomsingi', en: 'Default Price' },
  phone: { sw: 'Simu', en: 'Phone' },
  role: { sw: 'Nafasi', en: 'Role' },
  active: { sw: 'Amilifu', en: 'Active' },
  location: { sw: 'Mahali', en: 'Location' },

  // Misc
  welcome: { sw: 'Karibu kwenye mfumo wa Lucentia Beauty & Salon', en: 'Welcome to Lucentia Beauty & Salon' },
  noResults: { sw: 'Hakuna matokeo', en: 'No results found' },
  error: { sw: 'Kuna hitilafu', en: 'Something went wrong' },
  saved: { sw: 'Imehifadhiwa', en: 'Saved successfully' },
  deleted: { sw: 'Imefutwa', en: 'Deleted successfully' },
  allTime: { sw: 'Wakati Wote', en: 'All Time' },
  customers: { sw: 'Wateja', en: 'Customers' },
  viewAll: { sw: 'Tazama Zote', en: 'View All' },
  recent: { sw: 'Ya Karibuni', en: 'Recent' },
  summary: { sw: 'Muhtasari', en: 'Summary' },

  // Dashboard (v2 layout)
  welcomeOwner: { sw: 'Karibu tena, Mmiliki wa Saluni!', en: 'Welcome back, Salon Owner!' },
  productsInventory: { sw: 'Bidhaa & Stock', en: 'Products & Inventory' },
  totalPurchases: { sw: 'Jumla ya Ununuzi', en: 'Total Purchases' },
  totalSales: { sw: 'Jumla ya Mauzo', en: 'Total Sales' },
  totalExpenses: { sw: 'Jumla ya Matumizi', en: 'Total Expenses' },
  vsLastPeriod: { sw: 'ukilinganisha na kipindi kilichopita', en: 'vs last period' },
  salesOverview: { sw: 'Muhtasari wa Mauzo', en: 'Sales Overview' },
  inventoryStatus: { sw: 'Hali ya Stock', en: 'Inventory Status' },
  productsLowStock: { sw: 'bidhaa zinakaribia kuisha', en: 'products are low in stock' },
  allStockHealthy: { sw: 'Stock zote ziko salama', en: 'All stock levels are healthy' },
  viewDetails: { sw: 'Tazama', en: 'View Details' },
  recentActivities: { sw: 'Shughuli za Karibuni', en: 'Recent Activities' },
  profitSummary: { sw: 'Muhtasari wa Faida', en: 'Profit Summary' },
  businessGrowing: { sw: 'Biashara Yako Inakua!', en: 'Your Business is Growing!' },
  businessAttention: { sw: 'Fuatilia Matumizi Yako', en: 'Keep an Eye on Costs' },
  netProfitPeriod: { sw: 'Faida halisi ya kipindi hiki', en: 'Net profit this period' },
  viewReports: { sw: 'Tazama Ripoti', en: 'View Reports' },
  growBusiness: { sw: 'Kuza Biashara ya Saluni Yako', en: 'Grow Your Salon Business' },
  withLucentia: { sw: 'pamoja na Lucentia', en: 'with Lucentia' },
  activityPurchase: { sw: 'Ununuzi mpya', en: 'New purchase' },
  activityService: { sw: 'Huduma imerekodiwa', en: 'Service recorded' },
  activityExpense: { sw: 'Matumizi yameongezwa', en: 'Expense added' },
  activityUsage: { sw: 'Bidhaa imetumika', en: 'Product used' },
  expensesLabel: { sw: 'Matumizi', en: 'Expenses' },
  salesLabel: { sw: 'Mauzo', en: 'Sales' },
  owner: { sw: 'Mmiliki', en: 'Owner' },
};

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  const t = (key: string): string => {
    const entry = dict[key];
    if (!entry) return key;
    return entry[lang];
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

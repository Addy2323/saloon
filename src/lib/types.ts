export interface Category {
  id: string;
  name: string;
  type: 'product' | 'expense';
  created_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  location?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface Staff {
  id: string;
  name: string;
  phone?: string | null;
  role?: string | null;
  active?: boolean;
  created_at?: string;
}

export interface Service {
  id: string;
  name: string;
  default_price: number;
  active?: boolean;
  created_at?: string;
}

export interface Hairstyle {
  id: string;
  service_id?: string | null;
  name: string;
  default_price: number;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  category_id?: string | null;
  unit: string;
  unit_cost: number;
  current_stock: number;
  low_stock_threshold: number;
  created_at?: string;
}

export interface Purchase {
  id: string;
  supplier_id?: string | null;
  purchase_date: string;
  total_amount: number;
  notes?: string | null;
  created_at?: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_at?: string;
}

export interface Expense {
  id: string;
  name: string;
  category_id?: string | null;
  amount: number;
  expense_date: string;
  notes?: string | null;
  recorded_by?: string | null;
  created_at?: string;
}

export interface Sale {
  id: string;
  service_id?: string | null;
  hairstyle_id?: string | null;
  hairstyle_name?: string | null;
  customer_name?: string | null;
  num_customers: number;
  price_per_customer: number;
  discount: number;
  amount_paid: number;
  payment_method: string;
  staff_id?: string | null;
  sale_date: string;
  notes?: string | null;
  created_at?: string;
}

export interface ProductUsage {
  id: string;
  product_id: string;
  quantity: number;
  usage_type: 'used' | 'spoiled' | 'finished';
  usage_date: string;
  notes?: string | null;
  created_at?: string;
}

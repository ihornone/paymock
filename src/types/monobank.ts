export type InvoiceStatus =
  | 'created'
  | 'processing'
  | 'hold'
  | 'success'
  | 'failure'
  | 'reversed'
  | 'expired';

export type PaymentType = 'debit' | 'hold' | 'verification';

export type CancelStatus = 'processing' | 'success' | 'failure';

export interface BasketDiscount {
  type: string | null;
  mode: string | null;
  value: number | null;
  tax: number | null;
}

export interface BasketItem {
  name: string;
  qty: number;
  sum: number; // in cents
  total?: number; // in cents
  icon?: string | null;
  img?: string | null;
  image?: string | null;
  picture?: string | null;
  unit?: string | null;
  code?: string | null;
  barcode?: string | null;
  header?: string | null;
  footer?: string | null;
  tax?: number[] | null;
  uktzed?: string | null;
  splitReceiverId?: string | null;
  discounts?: BasketDiscount[] | null;
}

export interface MerchantPaymInfo {
  reference?: string;
  destination?: string;
  comment?: string;
  logoUrl?: string | null;
  avatarUrl?: string | null;
  icon?: string | null;
  customerEmails?: string[];
  discounts?: BasketDiscount[];
  metadata?: Record<string, string>;
  basketOrder?: BasketItem[];
}

export interface SaveCardData {
  saveCard?: boolean | null;
  walletId?: string | null;
}

export interface CreateInvoiceRequest {
  amount: number;
  ccy?: number;
  merchantPaymInfo?: MerchantPaymInfo;
  redirectUrl?: string;
  successUrl?: string;
  failUrl?: string;
  webHookUrl?: string;
  validity?: number;
  paymentType?: PaymentType | null;
  qrId?: string;
  code?: string;
  saveCardData?: SaveCardData;
  agentFeePercent?: number;
  displayType?: 'iframe' | null;
  withAppUrl?: boolean;
}

export interface CreateInvoiceResponse {
  invoiceId: string;
  pageUrl: string;
  appUrl?: string;
}

export interface WalletData {
  cardToken?: string;
  walletId?: string;
  status?: string;
}

export interface PaymentInfo {
  maskedPan?: string;
  approvalCode?: string;
  rrn?: string;
  paymentMethod?: string;
  paymentSystem?: string;
  country?: string;
  fee?: number;
  paymentScheme?: string;
  walletData?: WalletData;
}

export interface CancelItem {
  status: CancelStatus;
  amount: number;
  ccy?: number;
  createdDate: string;
  modifiedDate: string;
  extRef?: string;
}

export interface InvoiceStatusResponse {
  invoiceId: string;
  status: InvoiceStatus;
  failureReason?: string;
  errCode?: string;
  amount: number;
  ccy: number;
  finalAmount?: number;
  createdDate: string;
  modifiedDate: string;
  reference?: string;
  destination?: string;
  cancelList?: CancelItem[];
  paymentInfo?: PaymentInfo;
}

export interface CancelInvoiceRequest {
  invoiceId: string;
  extRef?: string;
  amount?: number;
  items?: BasketItem[];
}

export interface CancelInvoiceResponse {
  status: CancelStatus;
  createdDate: string;
  modifiedDate: string;
}

export interface RemoveInvoiceRequest {
  invoiceId: string;
}

export interface RemoveInvoiceResponse {
  status: string;
  createdDate: string;
  modifiedDate: string;
}

export interface MerchantDetailsResponse {
  merchantId: string;
  merchantName: string;
  edrpou: string;
}

export interface ErrorResponse {
  errCode: string;
  errText: string;
}

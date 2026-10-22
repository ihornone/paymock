import type { InvoiceRecord } from '@/shared/types/models';
import type { InvoiceStatusResponse } from '@/shared/types/acquiring';

/**
 * Transforms an internal database InvoiceRecord into the public Acquiring API InvoiceStatusResponse.
 */
export function toInvoiceStatusResponse(invoice: InvoiceRecord): InvoiceStatusResponse {
  return {
    invoiceId: invoice.id,
    status: invoice.status,
    failureReason: invoice.failure_reason || undefined,
    errCode: invoice.err_code || undefined,
    amount: invoice.amount,
    ccy: invoice.ccy,
    finalAmount: invoice.final_amount ?? invoice.amount,
    createdDate: invoice.created_date,
    modifiedDate: invoice.modified_date,
    reference: invoice.reference || undefined,
    destination: invoice.destination || undefined,
    cancelList: invoice.cancel_list_json ? JSON.parse(invoice.cancel_list_json) : undefined,
    paymentInfo: invoice.payment_info_json ? JSON.parse(invoice.payment_info_json) : undefined,
  };
}

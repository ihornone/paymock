import { notFound } from 'next/navigation';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import { CheckoutClient } from '@/components/checkout/checkout-client';

interface PayPageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function PayPage({ params }: PayPageProps) {
  const { invoiceId } = await params;

  const invoicesRepo = new InvoicesRepository();
  const projectsRepo = new ProjectsRepository();

  const invoice = await invoicesRepo.findById(invoiceId);
  if (!invoice) {
    notFound();
  }

  const project = await projectsRepo.findById(invoice.project_id);

  return <CheckoutClient invoice={invoice} project={project} />;
}

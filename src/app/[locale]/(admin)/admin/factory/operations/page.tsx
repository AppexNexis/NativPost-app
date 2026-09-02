import { Metadata } from 'next';
import { FactoryOperations } from '@/components/admin/factory/FactoryOperations';

export const metadata: Metadata = {
  title: 'Factory Operations | NativPost Admin',
  description: 'Generation pipeline visibility and provenance tracking',
};

export default function FactoryOperationsPage() {
  return (
    <div className="container mx-auto py-6">
      <FactoryOperations />
    </div>
  );
}

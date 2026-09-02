import { Metadata } from 'next';
import { FactoryOverview } from '@/components/admin/factory/FactoryOverview';

export const metadata: Metadata = {
  title: 'Content Factory | NativPost Admin',
  description: 'Content Intelligence Engine command center',
};

export default function FactoryPage() {
  return (
    <div className="container mx-auto py-6">
      <FactoryOverview />
    </div>
  );
}

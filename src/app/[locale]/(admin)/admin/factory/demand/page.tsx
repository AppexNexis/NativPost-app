import { Metadata } from 'next';
import { FactoryDemand } from '@/components/admin/factory/FactoryDemand';

export const metadata: Metadata = {
  title: 'Content Demand | NativPost Admin',
  description: 'Content generation demand and inventory gaps',
};

export default function FactoryDemandPage() {
  return (
    <div className="container mx-auto py-6">
      <FactoryDemand />
    </div>
  );
}

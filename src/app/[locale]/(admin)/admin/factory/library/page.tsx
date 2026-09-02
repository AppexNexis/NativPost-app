import { Metadata } from 'next';
import { FactoryLibrary } from '@/components/admin/factory/FactoryLibrary';

export const metadata: Metadata = {
  title: 'Content Library | NativPost Admin',
  description: 'Searchable content inventory',
};

export default function FactoryLibraryPage() {
  return (
    <div className="container mx-auto py-6">
      <FactoryLibrary />
    </div>
  );
}

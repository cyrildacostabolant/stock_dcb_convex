export interface Category {
  _id?: string;
  id?: string; // Keep for backward compatibility during import
  name: string;
  color: string;
}

export interface StockItem {
  _id?: string;
  id?: string; // Keep for backward compatibility during import
  produit: string;
  quantite: number;
  categorie: string | null;
  _creationTime?: number;
}

export type ViewMode = 'list' | 'settings';

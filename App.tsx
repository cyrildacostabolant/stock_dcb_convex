import React, { useState, useMemo, useRef } from 'react';
import { HashRouter } from 'react-router-dom';
import { useQuery, useMutation } from "convex/react";
// @ts-ignore
import { api } from "./convex/_generated/api";
import { Category, StockItem } from './types';
import { CategoryManager } from './components/CategoryManager';
import { StockItemModal } from './components/StockItemModal';
import { Modal } from './components/Modal';
import { 
  Settings, 
  Plus, 
  Minus,
  Search, 
  X,
  PackageOpen, 
  Filter,
  RefreshCw,
  Download,
  Upload,
  Barcode,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { DEFAULT_CATEGORY_COLOR } from './constants';
// @ts-ignore
import { Id } from "./convex/_generated/dataModel";
import { BarcodeScannerModal } from './components/BarcodeScannerModal';

function App() {
  // Convex Hooks
  const categories = useQuery(api.categories.get) || [];
  const stocks = useQuery(api.stocks.get) || [];
  
  const updateStockQuantity = useMutation(api.stocks.updateQuantity);
  const clearCategories = useMutation(api.categories.clear);
  const clearStocks = useMutation(api.stocks.clear);
  const insertManyCategories = useMutation(api.categories.insertMany);
  const insertManyStocks = useMutation(api.stocks.insertMany);

  const [loading, setLoading] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null); 
  
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [isStockModalOpen, setStockModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Barcode scanning & search states
  const [isBarcodeSearchOpen, setIsBarcodeSearchOpen] = useState(false);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState<string | null>(null);
  const [prefilledBarcode, setPrefilledBarcode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = () => {
    const data = {
      categories: categories.map((c: Category) => ({ name: c.name, color: c.color })),
      stocks: stocks.map((s: StockItem) => ({ 
        produit: s.produit, 
        quantite: s.quantite, 
        categorie: s.categorie,
        code_barre: s.code_barre || undefined
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sauvegarde_stocks_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.categories || !data.stocks) {
         throw new Error("Fichier invalide : categories ou stocks manquants.");
      }

      if (window.confirm("Attention, la restauration écrasera toutes vos données actuelles dans CONVEX. Voulez-vous continuer ?")) {
        setLoading(true);
        
        // Nettoyage Convex
        await clearStocks();
        await clearCategories();
        
        // Insertion Convex
        if (data.categories.length > 0) {
           await insertManyCategories({ 
             categories: data.categories.map((c: any) => ({ name: c.name, color: c.color })) 
           });
        }
        
        if (data.stocks.length > 0) {
           await insertManyStocks({ 
             stocks: data.stocks.map((s: any) => ({ 
               produit: s.produit, 
               quantite: Number(s.quantite) || 0, 
               categorie: s.categorie || '',
               code_barre: s.code_barre || undefined
             })) 
           });
        }
        
        alert("Restauration réussie dans Convex !");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Erreur lors de la restauration: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateQuantity = async (e: React.MouseEvent, item: StockItem, delta: number) => {
    e.stopPropagation();
    const newQuantity = Math.max(0, item.quantite + delta);
    if (newQuantity === item.quantite || !item._id) return;

    try {
      await updateStockQuantity({ id: item._id as Id<"stocks">, quantite: newQuantity });
    } catch (err) {
      console.error("Error updating quantity:", err);
    }
  };

  const filteredStocks = useMemo(() => {
    let result = stocks;
    
    // Filter by category name
    if (selectedCategoryName !== null) {
      result = result.filter((s: StockItem) => s.categorie === selectedCategoryName);
    }

    // Filter by search (name or barcode)
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s: StockItem) => 
        (s.produit && s.produit.toLowerCase().includes(q)) ||
        (s.code_barre && s.code_barre.toLowerCase().includes(q))
      );
    }

    // Tri par ordre alphabétique (insensible à la casse et aux accents)
    return [...result].sort((a: StockItem, b: StockItem) => 
      (a.produit || "").localeCompare(b.produit || "", "fr", { sensitivity: "base" })
    );
  }, [stocks, selectedCategoryName, searchQuery]);

  // Find category object for color display
  const currentCategory = categories.find((c: Category) => c.name === selectedCategoryName);
  const currentColor = currentCategory?.color || DEFAULT_CATEGORY_COLOR;

  const handleOpenCreateStock = () => {
    setEditingStock(null);
    setPrefilledBarcode(null);
    setStockModalOpen(true);
  };

  const handleCreateWithBarcode = (barcode: string) => {
    setUnregisteredBarcode(null);
    setEditingStock(null);
    setPrefilledBarcode(barcode);
    setStockModalOpen(true);
  };

  const handleEditStock = (item: StockItem) => {
    setEditingStock(item);
    setPrefilledBarcode(null);
    setStockModalOpen(true);
  };

  // Traitement du scan direct pour la recherche
  const handleBarcodeSearch = (scannedCode: string) => {
    const code = scannedCode.trim();
    if (!code) return;

    // Recherche de l'article ayant ce code-barres exact
    const found = stocks.find((s: StockItem) => s.code_barre && s.code_barre.trim() === code);

    if (found) {
      setSearchQuery('');
      handleEditStock(found);
      setToastMessage({
        text: `Article trouvé : "${found.produit}"`,
        type: 'success'
      });
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      // Message exact demandé : "Article non enregistré"
      setUnregisteredBarcode(code);
    }
  };

  // --- Components for Layout ---

  const CategoryList = () => (
    <nav className="space-y-1">
      <button
        onClick={() => setSelectedCategoryName(null)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
          selectedCategoryName === null 
            ? 'bg-blue-50 text-blue-700 shadow-sm font-semibold' 
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="flex-1 text-left">Tout le stock</span>
        <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
          {stocks.length}
        </span>
      </button>

      {categories.map((cat: Category) => {
        // Count stocks that match this category NAME
        const count = stocks.filter((s: StockItem) => s.categorie === cat.name).length;
        const isActive = selectedCategoryName === cat.name;
        const catId = cat._id || (cat as any).id;
        return (
          <button
            key={catId}
            onClick={() => setSelectedCategoryName(cat.name)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              isActive 
                ? 'bg-white shadow-sm ring-1 ring-black/5' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div 
              className={`w-3 h-3 rounded-full shadow-sm ${isActive ? 'scale-125' : ''}`}
              style={{ backgroundColor: cat.color }}
            />
            <span className={`flex-1 text-left truncate ${isActive ? 'font-semibold text-gray-900' : ''}`}>
              {cat.name}
            </span>
             <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="h-full flex flex-col md:flex-row bg-gray-50">
      {/* ... (aside unchanged) */}
      <aside className="hidden md:flex w-72 flex-col bg-white border-r border-gray-200 h-full">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PackageOpen className="text-blue-600" />
            Stock DCB
          </h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">Catégories</div>
          <CategoryList />
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
          <button
            onClick={() => setCategoryModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm"
          >
            <Settings size={16} />
            Gérer les catégories
          </button>
          <button
            onClick={handleBackup}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-green-600 transition-colors shadow-sm"
          >
            <Download size={16} />
            Sauvegarde BDD
          </button>
          <button
            onClick={handleRestoreClick}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-red-600 transition-colors shadow-sm"
          >
            <Upload size={16} />
            Restauration BDD
          </button>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </aside>

      {/* ... (header unchanged) */}
      <header className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 relative">
             <div className="relative">
                <select
                  value={selectedCategoryName ?? 'all'}
                  onChange={(e) => setSelectedCategoryName(e.target.value === 'all' ? null : e.target.value)}
                  className="appearance-none w-full pl-10 pr-8 py-2.5 bg-gray-100 border-transparent rounded-xl text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                >
                  <option value="all">Tout le stock</option>
                  {categories.map((cat: Category) => {
                     const catId = cat._id || (cat as any).id;
                     return <option key={catId} value={cat.name}>{cat.name}</option>
                  })}
                </select>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                   {selectedCategoryName === null ? (
                      <PackageOpen size={18} className="text-gray-500" />
                   ) : (
                      <div 
                        className="w-4 h-4 rounded-full shadow-sm" 
                        style={{ backgroundColor: currentColor }} 
                      />
                   )}
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                  <Filter size={16} />
                </div>
             </div>
          </div>
          
          <button
            onClick={handleBackup}
            className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
            title="Sauvegarde BDD"
          >
            <Download size={20} />
          </button>
          <button
            onClick={handleRestoreClick}
            className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
            title="Restauration BDD"
          >
            <Upload size={20} />
          </button>
          <button
            onClick={() => setCategoryModalOpen(true)}
            className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
            title="Gérer les catégories"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 h-full overflow-hidden flex flex-col relative">
        <div className="p-4 md:p-8 pb-0 md:pb-4">

           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 hidden md:block">
                  {selectedCategoryName === null ? 'Tout le stock' : selectedCategoryName}
                </h2>
                <div className="flex items-center gap-2 text-gray-500 text-sm hidden md:flex">
                  <span>{filteredStocks.length} article{filteredStocks.length !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-green-600">
                    <RefreshCw size={12} /> Temps réel
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Rechercher un produit ou code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm transition-all text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-all"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                {/* Bouton de recherche par scan de code-barres */}
                <button
                  type="button"
                  onClick={() => setIsBarcodeSearchOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm hover:shadow transition-all text-sm font-semibold active:scale-95 shrink-0"
                  title="Scanner un code-barres pour rechercher un article"
                >
                  <Barcode size={18} />
                  <span className="hidden sm:inline">Scanner</span>
                </button>

                {selectedCategoryName && (
                  <button
                    onClick={() => setSelectedCategoryName(null)}
                    className="shrink-0 flex items-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 active:scale-95 transition-all border border-blue-100 shadow-sm animate-in fade-in zoom-in duration-200"
                  >
                    <PackageOpen size={18} />
                    <span className="text-sm font-bold whitespace-nowrap">Tout</span>
                  </button>
                )}
              </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8">
          {loading ? (
             <div className="flex justify-center items-center h-40">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
             </div>
          ) : filteredStocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-h-[60vh] text-gray-400 p-8 text-center">
              <PackageOpen size={64} className="mb-4 opacity-30" />
              <p className="text-xl font-bold text-gray-600 mb-2">Aucun article trouvé</p>
              
              {!searchQuery && (
                <div className="max-w-md bg-blue-50 border border-blue-100 rounded-lg p-4 mt-4 text-sm text-blue-800">
                  <p className="font-semibold mb-1">C'est vide ici !</p>
                  <p>Utilisez le bouton <strong>Restauration BDD</strong> pour importer vos données JSON ou cliquez sur le bouton <strong>+</strong> pour ajouter un article.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {filteredStocks.map((stock: StockItem) => {
                const cat = categories.find((c: Category) => c.name === stock.categorie);
                const color = cat?.color || DEFAULT_CATEGORY_COLOR;
                const stockId = stock._id || (stock as any).id;
                
                return (
                  <div
                    key={stockId}
                    onClick={() => handleEditStock(stock)}
                    className="group bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
                  >
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-1.5" 
                      style={{ backgroundColor: color }}
                    />
                    <div className="pl-3 mb-4">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 truncate max-w-[70%]">
                           {stock.categorie || 'Sans catégorie'}
                        </span>
                        {stock.code_barre && (
                          <span 
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200/60"
                            title={`Code-barres: ${stock.code_barre}`}
                          >
                            <Barcode size={12} className="text-gray-400" />
                            <span className="truncate max-w-[120px]">{stock.code_barre}</span>
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 text-lg line-clamp-2 leading-tight">
                        {stock.produit}
                      </h3>
                    </div>

                    <div className="pl-3 flex items-center justify-between mt-auto">
                        <div className="text-sm font-medium text-gray-400">En stock</div>
                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-100 shadow-sm" onClick={(e) => e.stopPropagation()}>
                           <button 
                              onClick={(e) => updateQuantity(e, stock, -1)}
                              className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300 active:scale-95 transition-all"
                           >
                              <Minus size={16} strokeWidth={2.5} />
                           </button>
                           <span className="w-8 text-center font-bold text-gray-800 text-lg">
                              {stock.quantite}
                           </span>
                           <button 
                              onClick={(e) => updateQuantity(e, stock, 1)}
                              className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200 active:scale-95 transition-all"
                           >
                              <Plus size={16} strokeWidth={2.5} />
                           </button>
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="text-center text-xs text-gray-300 mt-8 pb-4">
            Stock DCB v2.0 (Convex)
          </div>
        </div>

        <button
          onClick={handleOpenCreateStock}
          className="absolute bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all z-20"
        >
          <Plus size={28} strokeWidth={2.5} />
        </button>
      </main>

      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-gray-900/95 backdrop-blur text-white text-sm font-semibold rounded-2xl shadow-xl border border-gray-800 animate-in slide-in-from-top-3 duration-200">
          <CheckCircle2 size={18} className="text-green-400 shrink-0" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Modal Paramètres Catégories */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Paramètres"
      >
        <CategoryManager
          categories={categories}
        />
      </Modal>

      {/* Modal Article (Création / Modification) */}
      <StockItemModal
        isOpen={isStockModalOpen}
        onClose={() => {
          setStockModalOpen(false);
          setPrefilledBarcode(null);
        }}
        item={editingStock}
        categories={categories}
        currentCategoryName={selectedCategoryName}
        initialBarcode={prefilledBarcode}
      />

      {/* Scanner caméra pour la Recherche d'article */}
      <BarcodeScannerModal
        isOpen={isBarcodeSearchOpen}
        onClose={() => setIsBarcodeSearchOpen(false)}
        onScan={handleBarcodeSearch}
        title="Recherche par code-barres"
        description="Pointez la caméra vers le code-barres pour trouver l'article"
      />

      {/* Alerte si "Article non enregistré" */}
      {unregisteredBarcode && (
        <Modal
          isOpen={true}
          onClose={() => setUnregisteredBarcode(null)}
          title="Article non enregistré"
        >
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3.5">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h4 className="font-bold text-amber-950 text-base">Article non enregistré</h4>
                <p className="text-sm text-amber-900 mt-1">
                  Le code-barres <span className="font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-amber-300 text-gray-900">{unregisteredBarcode}</span> n'est associé à aucun article de votre base.
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Souhaitez-vous créer immédiatement un nouvel article avec ce code-barres ?
            </p>

            <div className="flex gap-2.5 pt-2 justify-end">
              <button
                type="button"
                onClick={() => setUnregisteredBarcode(null)}
                className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl font-medium transition-colors text-sm"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => handleCreateWithBarcode(unregisteredBarcode)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md transition-all flex items-center gap-2 text-sm active:scale-95"
              >
                <Plus size={18} />
                <span>Créer cet article</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function WrappedApp() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  );
}
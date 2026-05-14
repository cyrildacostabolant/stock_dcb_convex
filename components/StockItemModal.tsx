import React, { useState, useEffect } from 'react';
import { StockItem, Category } from '../types';
import { useMutation } from "convex/react";
// @ts-ignore
import { api } from "../convex/_generated/api";
import { Modal } from './Modal';
import { Minus, Plus } from 'lucide-react';
// @ts-ignore
import { Id } from "../convex/_generated/dataModel";

interface StockItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: StockItem | null; 
  categories: Category[];
  currentCategoryName: string | null;
}

export const StockItemModal: React.FC<StockItemModalProps> = ({ 
  isOpen, 
  onClose, 
  item, 
  categories,
  currentCategoryName,
}) => {
  const createStock = useMutation(api.stocks.create);
  const updateStock = useMutation(api.stocks.update);
  const deleteStock = useMutation(api.stocks.remove);

  const [produit, setProduit] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [categorieName, setCategorieName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setProduit(item.produit);
        setQuantite(item.quantite);
        setCategorieName(item.categorie);
      } else {
        setProduit('');
        setQuantite(1);
        setCategorieName(currentCategoryName);
      }
    }
  }, [isOpen, item, currentCategoryName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produit.trim()) return;

    setLoading(true);
    try {
      const payload = {
        produit: produit.trim(),
        quantite: Math.max(0, Math.floor(quantite)),
        categorie: !categorieName ? "" : categorieName // Convex v.string doesn't like null unless specified
      };

      if (item && item._id) {
        await updateStock({ 
          id: item._id as Id<"stocks">, 
          ...payload 
        });
      } else {
        await createStock(payload);
      }

      onClose();
    } catch (err: any) {
      console.error('Erreur sauvegarde:', err);
      alert(`Erreur lors de l'enregistrement : ${err.message || 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!item || !item._id) return;
    if (!window.confirm('Supprimer cet article ?')) return;
    
    setLoading(true);
    try {
      await deleteStock({ id: item._id as Id<"stocks"> });
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Erreur lors de la suppression : ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={item ? "Modifier l'article" : "Nouvel article"}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit</label>
          <input
            type="text"
            required
            autoFocus
            value={produit}
            onChange={(e) => setProduit(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            placeholder="Ex: Lait demi-écrémé"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setQuantite(Math.max(0, quantite - 1))}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              <Minus size={20} />
            </button>
            <input
              type="number"
              min="0"
              value={quantite}
              onChange={(e) => setQuantite(parseInt(e.target.value) || 0)}
              className="w-20 text-center p-2 text-lg font-semibold border-b-2 border-gray-200 focus:border-blue-500 outline-none"
            />
             <button
              type="button"
              onClick={() => setQuantite(quantite + 1)}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
          <select
            value={categorieName ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setCategorieName(val === '' ? null : val);
            }}
            className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Aucune catégorie</option>
            {categories.map(cat => (
              <option key={cat._id || cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          {item && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium"
            >
              Supprimer
            </button>
          )}
          <div className="flex-1"></div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition-all font-medium disabled:opacity-50"
          >
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
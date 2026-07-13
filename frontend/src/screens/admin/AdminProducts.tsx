import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView } from 'react-native';
import { Search, Plus, Edit, DollarSign, History, Trash2, AlertTriangle, Tag, Check, X, RotateCcw } from 'lucide-react-native';
import { ERPData, resolveActor } from '../../storage';
import { Product, AppNotification } from '../../types';
import ConfirmModal from '../../components/common/ConfirmModal';
import { pickImageAsDataUri } from '../../utils/imagePicker';
import { useAppContext } from '../../context/AppContext';
import { categoriesApi, productsApi } from '../../api/endpoints';

const UNIT_OPTIONS: Product['unit_type'][] = ['ml', 'L', 'g', 'kg', 'pcs'];

interface AdminProductsProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
  activeScreen?: string;
}

const STOCK_PRODUCT_IMAGES = [
  'https://images.unsplash.com/photo-1570145820259-b5b80c5c8bd6?w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&auto=format&fit=crop'
];

export default function AdminProducts({ data, setData, addNotification, currentUser, showAlert, activeScreen }: AdminProductsProps) {
  const { refreshData } = useAppContext();
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeForm, setActiveForm] = useState<'list' | 'add_product' | 'edit_product' | 'price_history' | 'manage_categories'>('list');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteProductConfirmId, setDeleteProductConfirmId] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [deleteCategoryConfirmId, setDeleteCategoryConfirmId] = useState<string | null>(null);

  useEffect(() => {
    setActiveForm('list');
  }, [activeScreen]);

  const [productForm, setProductForm] = useState({
    name: '', code: '', category: 'Cups', brand: 'Gelato Peaks', description: '',
    purchase_price: 1.0, wholesale_price: 1.25, selling_price: 2.0, tax_pct: 12, status: 'Active' as 'Active' | 'Inactive',
    unit_value: 1, unit_type: 'pcs' as Product['unit_type'],
    image_url: STOCK_PRODUCT_IMAGES[0]
  });

  const [priceUpdateForm, setPriceUpdateForm] = useState({ purchase_price: 0, wholesale_price: 0, selling_price: 0 });

  const categories = ['All', ...data.categories.map(c => c.name)];

  const filteredProducts = data.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code.toLowerCase().includes(productSearch.toLowerCase());
    const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleOpenAddProduct = () => {
    setProductForm({
      name: '', code: 'IC-NEW-' + Math.floor(Math.random() * 900 + 100), category: data.categories[0]?.name || '', brand: 'Gelato Peaks', description: '',
      purchase_price: 1.00, wholesale_price: 1.25, selling_price: 2.00, tax_pct: 12, status: 'Active',
      unit_value: 1, unit_type: 'pcs',
      image_url: STOCK_PRODUCT_IMAGES[0]
    });
    setActiveForm('add_product');
  };

  const handleOpenEditProduct = (p: Product) => {
    setSelectedProduct(p);
    setProductForm({
      name: p.name, code: p.code, category: p.category, brand: p.brand, description: p.description,
      purchase_price: p.purchase_price, wholesale_price: p.wholesale_price, selling_price: p.selling_price, tax_pct: p.tax_pct, status: p.status,
      unit_value: p.unit_value, unit_type: p.unit_type,
      image_url: p.image_url
    });
    setActiveForm('edit_product');
  };

  const handleOpenManageCategories = () => {
    setNewCategoryName('');
    setEditingCategoryId(null);
    setActiveForm('manage_categories');
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      showAlert('Please enter a category name.');
      return;
    }
    if (data.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      showAlert(`A category named "${name}" already exists.`);
      return;
    }
    try {
      await categoriesApi.create(name);
      await refreshData();
      addNotification('product_update', `New product category added: ${name}.`);
      setNewCategoryName('');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to create category.');
    }
  };

  const handleStartEditCategory = (categoryId: string, currentName: string) => {
    setEditingCategoryId(categoryId);
    setEditingCategoryName(currentName);
  };

  const handleSaveEditCategory = async () => {
    const newName = editingCategoryName.trim();
    const category = data.categories.find(c => c.id === editingCategoryId);
    if (!category) { setEditingCategoryId(null); return; }
    if (!newName) {
      showAlert('Category name cannot be empty.');
      return;
    }
    if (data.categories.some(c => c.id !== category.id && c.name.toLowerCase() === newName.toLowerCase())) {
      showAlert(`A category named "${newName}" already exists.`);
      return;
    }
    const oldName = category.name;
    try {
      await categoriesApi.rename(category.id, newName);
      await refreshData();
      addNotification('product_update', `Category "${oldName}" renamed to "${newName}".`);
      setEditingCategoryId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to rename category.');
    }
  };

  // Note: no UI entry point currently triggers this (the delete-category button
  // is disabled below) and there is no backend delete endpoint for categories;
  // kept as a local-only no-op guard for when/if that UI is re-enabled.
  const handleConfirmDeleteCategory = () => {
    const categoryId = deleteCategoryConfirmId;
    const category = data.categories.find(c => c.id === categoryId);
    if (!category) { setDeleteCategoryConfirmId(null); return; }

    const productsInCategory = data.products.filter(p => p.category === category.name).length;
    if (productsInCategory > 0) {
      setDeleteCategoryConfirmId(null);
      showAlert(`Cannot delete "${category.name}": ${productsInCategory} product(s) still use this category. Move or delete those products first.`);
      return;
    }

    setDeleteCategoryConfirmId(null);
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.code) {
      showAlert('Please fill out all mandatory fields.');
      return;
    }

    const isNew = activeForm === 'add_product';

    try {
      if (isNew) {
        await productsApi.create(productForm);
        await refreshData();
        addNotification('product_update', `New product added to catalog: ${productForm.name}.`);
      } else {
        await productsApi.update(selectedProduct!.id, productForm);
        await refreshData();
        addNotification('product_update', `Catalog details updated for ${productForm.name}.`);
      }
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save product.');
    }
  };

  const handleConfirmDeleteProduct = async () => {
    const productId = deleteProductConfirmId;
    const product = data.products.find(p => p.id === productId);
    if (!product || !productId) { setDeleteProductConfirmId(null); return; }

    try {
      await productsApi.setStatus(productId, 'Inactive');
      await refreshData();
      addNotification('product_update', `Product "${product.name}" was removed from the catalog.`);
      showAlert(`${product.name} has been removed from the catalog. It's hidden from new orders/pre-bookings but can be reactivated anytime.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to remove product.');
    } finally {
      setDeleteProductConfirmId(null);
    }
  };

  const handleReactivateProduct = async (productId: string) => {
    const product = data.products.find(p => p.id === productId);
    if (!product) return;
    try {
      await productsApi.setStatus(productId, 'Active');
      await refreshData();
      addNotification('product_update', `Product "${product.name}" has been reactivated.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reactivate product.');
    }
  };

  const handlePickProductImage = async () => {
    const uri = await pickImageAsDataUri(showAlert);
    if (uri) {
      setProductForm(prev => ({ ...prev, image_url: uri }));
      showAlert('Photo selected successfully.');
    }
  };

  const handleOpenPriceUpdate = (p: Product) => {
    setSelectedProduct(p);
    setPriceUpdateForm({ purchase_price: p.purchase_price, wholesale_price: p.wholesale_price, selling_price: p.selling_price });
    setActiveForm('price_history');
  };

  const handleSavePriceUpdate = async () => {
    if (!selectedProduct) return;
    const oldPurchase = selectedProduct.purchase_price;
    const oldWholesale = selectedProduct.wholesale_price;
    const oldSelling = selectedProduct.selling_price;

    try {
      await productsApi.updatePrice(selectedProduct.id, {
        purchase_price: Number(priceUpdateForm.purchase_price),
        wholesale_price: Number(priceUpdateForm.wholesale_price),
        selling_price: Number(priceUpdateForm.selling_price),
      });
      await refreshData();
      addNotification('product_update', `${selectedProduct.name} price changed: purchase Rs${oldPurchase.toFixed(2)} to Rs${Number(priceUpdateForm.purchase_price).toFixed(2)}, wholesale Rs${oldWholesale.toFixed(2)} to Rs${Number(priceUpdateForm.wholesale_price).toFixed(2)}, selling Rs${oldSelling.toFixed(2)} to Rs${Number(priceUpdateForm.selling_price).toFixed(2)}.`);
      showAlert('Active prices updated successfully and logged in audit history.');
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update price.');
    }
  };

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800";

  return (
    <View className="gap-4">
      {activeForm === 'list' && (
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <View className="flex-1 lg:max-w-sm relative justify-center">
              <View className="absolute left-3 z-10">
                <Search size={16} color="#94a3b8" />
              </View>
              <TextInput
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Search code or flavor..."
                placeholderTextColor="#94a3b8"
                className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl"
              />
            </View>
            {activeScreen !== 'Pricing' && (
              <>
                <Pressable onPress={handleOpenManageCategories} className="bg-slate-800 p-2.5 rounded-xl active:bg-slate-900">
                  <Tag size={20} color="#fff" />
                </Pressable>
                <Pressable onPress={handleOpenAddProduct} className="bg-rose-500 p-2.5 rounded-xl active:bg-rose-600">
                  <Plus size={20} color="#fff" />
                </Pressable>
              </>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5">
            <View className="flex-row gap-1.5">
              {categories.map(cat => (
                <Pressable
                  key={cat}
                  onPress={() => setCategoryFilter(cat)}
                  className={`py-1.5 px-3 rounded-lg ${categoryFilter === cat ? 'bg-rose-500' : 'bg-white border border-slate-200'}`}
                >
                  <Text className={`text-[10px] font-extrabold ${categoryFilter === cat ? 'text-white' : 'text-slate-600'}`}>{cat}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {activeForm === 'add_product' || activeForm === 'edit_product' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">
              {activeForm === 'add_product' ? 'Add New Product' : 'Edit Product Specs'}
            </Text>
            <Pressable onPress={() => setActiveForm('list')}>
              <Text className="text-xs text-slate-400">Cancel</Text>
            </Pressable>
          </View>

          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Image source={{ uri: productForm.image_url }} className="w-16 h-16 rounded-xl bg-slate-100" />
              <View>
                <Pressable onPress={handlePickProductImage} className="py-1.5 px-2.5 bg-slate-100 rounded-lg active:bg-slate-200">
                  <Text className="text-slate-700 font-bold text-xs">Choose Photo from Gallery</Text>
                </Pressable>
                <Text className="text-[9px] text-slate-400 mt-1">JPG/PNG, cropped to a square</Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Product Name</Text>
                <TextInput value={productForm.name} onChangeText={v => setProductForm({ ...productForm, name: v })} placeholder="e.g. Vanilla Delight Cup" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Product SKU Code</Text>
                <TextInput value={productForm.code} onChangeText={v => setProductForm({ ...productForm, code: v })} placeholder="e.g. IC-VAN-100" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>
            </View>

            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Category</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {data.categories.length === 0 && (
                  <Text className="text-[10px] text-slate-400 italic">No categories yet — manage categories from the catalog page.</Text>
                )}
                {data.categories.map(cat => (
                  <Pressable key={cat.id} onPress={() => setProductForm({ ...productForm, category: cat.name })} className={`py-1.5 px-3 rounded-lg ${productForm.category === cat.name ? 'bg-slate-800' : 'bg-slate-50 border border-slate-200'}`}>
                    <Text className={`text-[10px] font-bold ${productForm.category === cat.name ? 'text-white' : 'text-slate-600'}`}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Brand</Text>
                <TextInput value={productForm.brand} onChangeText={v => setProductForm({ ...productForm, brand: v })} className={inputClass} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Status</Text>
                <View className="flex-row gap-1.5">
                  {(['Active', 'Inactive'] as const).map(st => (
                    <Pressable key={st} onPress={() => setProductForm({ ...productForm, status: st })} className={`flex-1 py-2 rounded-lg items-center ${productForm.status === st ? 'bg-slate-800' : 'bg-slate-50 border border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${productForm.status === st ? 'text-white' : 'text-slate-600'}`}>{st}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Unit Size</Text>
              <View className="flex-row gap-2">
                <TextInput
                  keyboardType="decimal-pad"
                  value={String(productForm.unit_value)}
                  onChangeText={v => setProductForm({ ...productForm, unit_value: Number(v) || 0 })}
                  className={inputClass + ' flex-1'}
                  placeholder="e.g. 100"
                  placeholderTextColor="#94a3b8"
                />
                <View className="flex-row gap-1 flex-[2]">
                  {UNIT_OPTIONS.map(u => (
                    <Pressable key={u} onPress={() => setProductForm({ ...productForm, unit_type: u })} className={`flex-1 py-2 rounded-lg items-center ${productForm.unit_type === u ? 'bg-slate-800' : 'bg-slate-50 border border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${productForm.unit_type === u ? 'text-white' : 'text-slate-600'}`}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Purchase (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(productForm.purchase_price)} onChangeText={v => setProductForm({ ...productForm, purchase_price: Number(v) || 0 })} className={inputClass} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Wholesale (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(productForm.wholesale_price)} onChangeText={v => setProductForm({ ...productForm, wholesale_price: Number(v) || 0 })} className={inputClass} />
              </View>
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Selling (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(productForm.selling_price)} onChangeText={v => setProductForm({ ...productForm, selling_price: Number(v) || 0 })} className={inputClass} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">GST/Tax %</Text>
                <TextInput keyboardType="decimal-pad" value={String(productForm.tax_pct)} onChangeText={v => setProductForm({ ...productForm, tax_pct: Number(v) || 0 })} className={inputClass} />
              </View>
            </View>

            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Description</Text>
              <TextInput
                value={productForm.description}
                onChangeText={v => setProductForm({ ...productForm, description: v })}
                multiline
                numberOfLines={2}
                placeholder="Details, ingredients or storage requirements..."
                placeholderTextColor="#94a3b8"
                className={inputClass}
                style={{ minHeight: 60, textAlignVertical: 'top' }}
              />
            </View>
          </View>

          <Pressable onPress={handleSaveProduct} className="w-full py-2.5 bg-rose-500 rounded-xl items-center active:bg-rose-600">
            <Text className="text-white font-bold text-xs">Save Product Spec changes</Text>
          </Pressable>
        </View>
      ) : activeForm === 'price_history' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Product Price & Rate Manager</Text>
              <Text className="text-[10px] text-slate-400 mt-0.5">{selectedProduct?.name}</Text>
            </View>
            <Pressable onPress={() => setActiveForm('list')} className="bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200">
              <Text className="text-slate-500 font-bold text-xs">Back to Catalog</Text>
            </Pressable>
          </View>

          <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 gap-3">
            <Text className="font-bold text-slate-800 text-xs">Active Current Price Parameters (Instant Update)</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Purchase Cost (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(priceUpdateForm.purchase_price)} onChangeText={v => setPriceUpdateForm({ ...priceUpdateForm, purchase_price: Number(v) || 0 })} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Wholesale Price (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(priceUpdateForm.wholesale_price)} onChangeText={v => setPriceUpdateForm({ ...priceUpdateForm, wholesale_price: Number(v) || 0 })} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-emerald-600 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Selling Price (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(priceUpdateForm.selling_price)} onChangeText={v => setPriceUpdateForm({ ...priceUpdateForm, selling_price: Number(v) || 0 })} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-indigo-600 text-xs" />
              </View>
            </View>
            <Pressable onPress={handleSavePriceUpdate} className="w-full py-2 bg-emerald-600 rounded-xl items-center active:bg-emerald-700">
              <Text className="text-white font-bold text-[11px]">Update Instantly</Text>
            </Pressable>
          </View>

          <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 gap-2">
            <View className="flex-row items-center gap-1">
              <History size={14} color="#94a3b8" />
              <Text className="font-extrabold text-slate-600 uppercase tracking-wider text-[9px]">Audit Price Logs History</Text>
            </View>
            <View className="gap-2 md:flex-row md:flex-wrap">
            {data.auditLogs.filter(l => l.action === 'PRICE_UPDATE' && l.entity_id === selectedProduct?.id).map(l => {
              const actor = l.user_name && l.user_role ? { name: l.user_name, role: l.user_role } : resolveActor(data.users, l.user_id);
              return (
                <View key={l.id} className="w-full md:w-[48%] xl:w-[32%] p-2 bg-white rounded-lg border border-slate-100">
                  <Text className="font-bold text-slate-700 text-[10px]">{l.details}</Text>
                  <Text className="text-[8px] text-slate-400 mt-0.5">{new Date(l.timestamp).toLocaleString()} - By: {actor.role} - {actor.name}</Text>
                </View>
              );
            })}
            </View>
            {data.auditLogs.filter(l => l.action === 'PRICE_UPDATE' && l.entity_id === selectedProduct?.id).length === 0 && (
              <Text className="text-[10px] text-slate-400 py-2 italic text-center">No price adjustment logs found for this item.</Text>
            )}
          </View>
        </View>
      ) : activeForm === 'manage_categories' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Manage Categories</Text>
            <Pressable onPress={() => setActiveForm('list')} className="bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200">
              <Text className="text-slate-500 font-bold text-xs">Back to Catalog</Text>
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <TextInput
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="New category name..."
              placeholderTextColor="#94a3b8"
              className={inputClass + ' flex-1'}
            />
            <Pressable onPress={handleAddCategory} className="bg-rose-500 px-4 rounded-lg items-center justify-center active:bg-rose-600">
              <Text className="text-white font-bold text-xs">Add</Text>
            </Pressable>
          </View>

          <View className="gap-2 md:flex-row md:flex-wrap">
            {data.categories.map(cat => {
              const productCount = data.products.filter(p => p.category === cat.name).length;
              const isEditing = editingCategoryId === cat.id;
              return (
                <View key={cat.id} className="w-full md:w-[48%] xl:w-[32%] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  {isEditing ? (
                    <>
                      <TextInput
                        value={editingCategoryName}
                        onChangeText={setEditingCategoryName}
                        autoFocus
                        className="flex-1 bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800"
                      />
                      <Pressable onPress={handleSaveEditCategory} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100">
                        <Check size={16} color="#059669" />
                      </Pressable>
                      <Pressable onPress={() => setEditingCategoryId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                        <X size={16} color="#64748b" />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View className="flex-1">
                        <Text className="font-bold text-slate-800 text-xs">{cat.name}</Text>
                        <Text className="text-[9px] text-slate-400">{productCount} product{productCount === 1 ? '' : 's'}</Text>
                      </View>
                      <Pressable onPress={() => handleStartEditCategory(cat.id, cat.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                        <Edit size={14} color="#475569" />
                      </Pressable>
                      {/* <Pressable onPress={() => setDeleteCategoryConfirmId(cat.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                        <Trash2 size={14} color="#e11d48" />
                      </Pressable> */}
                    </>
                  )}
                </View>
              );
            })}
            {data.categories.length === 0 && (
              <Text className="text-[10px] text-slate-400 italic py-2 text-center">No categories yet. Add one above.</Text>
            )}
          </View>
        </View>
      ) : (
        <View className="gap-3 md:flex-row md:flex-wrap">
          {filteredProducts.map(p => {
            const wh = data.warehouse_inventory.find(i => i.product_id === p.id);
            const qty = wh ? wh.available_qty : 0;
            const isLow = qty > 0 && qty <= 100;
            const isOut = qty === 0;
            const isInactive = p.status === 'Inactive';

            return (
              <View key={p.id} className={`w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row gap-3 ${isInactive ? 'opacity-60' : ''}`}>
                <Image source={{ uri: p.image_url }} className="w-16 h-16 rounded-xl bg-slate-50" />
                <View className="flex-1">
                  <View className="flex-row items-start justify-between gap-1">
                    <Text className="font-bold text-slate-800 text-xs flex-1" numberOfLines={1}>{p.name}</Text>
                    <View className="flex-row items-center gap-1">
                      {isInactive && <Text className="text-[9px] bg-red-50 font-black px-1.5 py-0.5 rounded text-red-600 uppercase">Inactive</Text>}
                      <Text className="text-[9px] bg-slate-100 font-bold px-1.5 py-0.5 rounded text-slate-400 uppercase">{p.code}</Text>
                    </View>
                  </View>
                  <Text className="text-[10px] text-slate-400 mt-0.5">{p.brand} - {p.category} - {p.unit_value}{p.unit_type}</Text>
                  <View className="flex-row items-center justify-between mt-2 pt-1.5 border-t border-slate-50">
                    <View className="flex-row gap-3">
                      <View>
                        <Text className="text-slate-400 text-[9px]">Purchase Cost</Text>
                        <Text className="font-semibold text-slate-600 text-[10px]">Rs {p.purchase_price.toFixed(2)}</Text>
                      </View>
                      <View>
                        <Text className="text-slate-400 text-[9px]">Wholesale Price</Text>
                        <Text className="font-semibold text-emerald-600 text-[10px]">Rs {p.wholesale_price.toFixed(2)}</Text>
                      </View>
                      <View>
                        <Text className="text-slate-400 text-[9px]">Selling Price</Text>
                        <Text className="font-extrabold text-rose-500 text-[10px]">Rs {p.selling_price.toFixed(2)}</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      {isOut ? (
                        <Text className="text-[9px] bg-red-100 text-red-600 font-extrabold px-1.5 py-0.5 rounded-md">OOS</Text>
                      ) : isLow ? (
                        <Text className="text-[9px] bg-amber-100 text-amber-600 font-extrabold px-1.5 py-0.5 rounded-md">LOW</Text>
                      ) : (
                        <Text className="text-[9px] bg-emerald-50 text-emerald-600 font-extrabold px-1.5 py-0.5 rounded-md">OK</Text>
                      )}
                      {activeScreen === 'Pricing' && (
                        <Pressable onPress={() => handleOpenPriceUpdate(p)} className="p-1.5 bg-indigo-50 rounded-lg active:bg-indigo-100">
                          <DollarSign size={14} color="#4f46e5" />
                        </Pressable>
                      )}
                      {activeScreen !== 'Pricing' && (
                        <>
                          <Pressable onPress={() => handleOpenEditProduct(p)} className="p-1.5 bg-slate-50 rounded-lg active:bg-slate-100">
                            <Edit size={14} color="#475569" />
                          </Pressable>
                          {isInactive ? (
                            <Pressable onPress={() => handleReactivateProduct(p.id)} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100">
                              <RotateCcw size={14} color="#059669" />
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => setDeleteProductConfirmId(p.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                              <Trash2 size={14} color="#e11d48" />
                            </Pressable>
                          )}
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}

          {filteredProducts.length === 0 && (
            <View className="py-8 items-center bg-white rounded-2xl border border-slate-100">
              <Text className="text-xs text-slate-400">No ice cream products found matching the filters.</Text>
            </View>
          )}
        </View>
      )}

      <ConfirmModal
        visible={!!deleteProductConfirmId}
        onClose={() => setDeleteProductConfirmId(null)}
        icon={AlertTriangle}
        title="Remove Product?"
        message={`Are you sure you want to remove "${data.products.find(p => p.id === deleteProductConfirmId)?.name || 'this product'}" from the catalog? It will be hidden from new orders/pre-bookings, but historical records and reports are preserved. You can reactivate it later.`}
        confirmLabel="Yes, Remove"
        cancelLabel="No, Keep"
        onConfirm={handleConfirmDeleteProduct}
      />

      <ConfirmModal
        visible={!!deleteCategoryConfirmId}
        onClose={() => setDeleteCategoryConfirmId(null)}
        icon={AlertTriangle}
        title="Confirm Category Deletion"
        message={`Are you sure you want to delete "${data.categories.find(c => c.id === deleteCategoryConfirmId)?.name || 'this category'}"? This cannot be undone.`}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        onConfirm={handleConfirmDeleteCategory}
      />
    </View>
  );
}

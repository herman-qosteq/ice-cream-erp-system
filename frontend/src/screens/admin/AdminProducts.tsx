import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Settings } from 'react-native';
import { Search, Plus, Edit, DollarSign, History, Trash2, AlertTriangle, Tag, Check, X, RotateCcw, Settings2 } from 'lucide-react-native';
import { ERPData, resolveActor } from '../../storage';
import { Product, AppNotification, NotificationEntityType, Category } from '../../types';
import ConfirmModal from '../../components/common/ConfirmModal';
import ProductImage from '../../components/common/ProductImage';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import FilterBar from '../../components/common/FilterBar';
import ViewToggle from '../../components/common/ViewToggle';
import EmptyState from '../../components/common/EmptyState';
import AutocompleteInput from '../../components/common/AutocompleteInput';
import { pickImageAsDataUri } from '../../utils/imagePicker';
import { useAppContext } from '../../context/AppContext';
import { useViewMode } from '../../context/ViewModeContext';
import { useResetScrollOnChange } from '../../context/ScrollResetContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { categoriesApi, productsApi } from '../../api/endpoints';
import { discountFromPrice, boxMrpFromMrp, mrpFromBoxMrp } from '../../utils/pricing';
import { isRetailPricingEnabled } from '../../utils/permissions';

const UNIT_OPTIONS: Product['unit_type'][] = ['ml', 'L', 'g', 'kg', 'pcs'];

interface AdminProductsProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
  activeScreen?: string;
  pendingNotificationTarget?: { entityType: NotificationEntityType; entityId: string } | null;
  onConsumePendingNotificationTarget?: () => void;
}

export default function AdminProducts({ data, setData, addNotification, currentUser, showAlert, activeScreen, pendingNotificationTarget, onConsumePendingNotificationTarget }: AdminProductsProps) {
  const { refreshData } = useAppContext();
  const { viewMode } = useViewMode();
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [activeForm, setActiveForm] = useState<'list' | 'add_product' | 'edit_product' | 'price_history' | 'manage_categories'>('list');
  const [catalogTab, setCatalogTab] = useState<'active' | 'deleted'>('active');
  useResetScrollOnChange(activeForm, catalogTab);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteProductConfirmId, setDeleteProductConfirmId] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryListTab, setCategoryListTab] = useState<'active' | 'inactive'>('active');

  useEffect(() => {
    setActiveForm('list');
  }, [activeScreen]);

  useEffect(() => {
    if (!pendingNotificationTarget || pendingNotificationTarget.entityType !== 'product') return;
    const product = data.products.find(p => p.id === pendingNotificationTarget.entityId);
    if (product) handleOpenEditProduct(product);
    onConsumePendingNotificationTarget?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotificationTarget]);

  const priceFromDiscount = (mrp: number, discountPct: number) => Math.max(0, mrp * (1 - discountPct / 100));

  const [productForm, setProductForm] = useState({
    name: '', code: '', category: 'Cups', brand: 'Gelato Peaks', description: '',
    mrp: 2.0, purchase_discount_pct: 50, wholesale_discount_pct: 37.5, retail_discount_pct: 0, tax_pct: 12, status: 'Active' as 'Active' | 'Inactive',
    purchase_price: priceFromDiscount(2.0, 50), wholesale_price: priceFromDiscount(2.0, 37.5), retail_price: priceFromDiscount(2.0, 0),
    unit_value: 1, unit_type: 'pcs' as Product['unit_type'],
    pieces_per_box: 1,
    box_mrp: boxMrpFromMrp(2.0, 1),
    image_url: ''
  });

  const [priceUpdateForm, setPriceUpdateForm] = useState({ mrp: 0, box_mrp: 0, purchase_discount_pct: 0, wholesale_discount_pct: 0, retail_discount_pct: 0, purchase_price: 0, wholesale_price: 0, retail_price: 0 });

  // Discount percentages above 100 would make priceFromDiscount go negative,
  // so typed input is clamped to 100 and the admin is told why.
  const parseDiscountPct = (v: string): number => {
    const num = Number(v) || 0;
    if (num > 100) {
      showAlert({ type: 'warning', message: 'Discount percentage cannot be greater than 100%.' });
      return 100;
    }
    return num;
  };

  // Two-way % <-> price sync for the Add/Edit Product form: editing MRP
  // keeps the discount %'s fixed and recomputes all three prices; editing a
  // % recomputes just that price; editing a price recomputes just that %
  // (via discountFromPrice). Price fields hold the raw typed number (no
  // forced rounding) so typing isn't fought by the round-trip through %.
  //
  // Box MRP is kept two-way synced with MRP (Piece Price) the same way,
  // using pieces_per_box as the conversion factor: editing MRP recomputes
  // Box MRP (mrp * pieces_per_box), editing Box MRP recomputes MRP
  // (box_mrp / pieces_per_box) plus the three discount-derived prices, and
  // editing Pieces per Box recomputes Box MRP from the unchanged MRP.
  const updateProductFormMrp = (mrp: number) => {
    setProductForm(prev => ({
      ...prev, mrp,
      box_mrp: boxMrpFromMrp(mrp, prev.pieces_per_box),
      purchase_price: parseFloat(priceFromDiscount(mrp, prev.purchase_discount_pct).toFixed(2)),
      wholesale_price: parseFloat(priceFromDiscount(mrp, prev.wholesale_discount_pct).toFixed(2)),
      retail_price: parseFloat(priceFromDiscount(mrp, prev.retail_discount_pct).toFixed(2)),
    }));
  };
  const updateProductFormBoxMrp = (boxMrp: number) => {
    setProductForm(prev => {
      const mrp = mrpFromBoxMrp(boxMrp, prev.pieces_per_box);
      return {
        ...prev, mrp, box_mrp: boxMrp,
        purchase_price: parseFloat(priceFromDiscount(mrp, prev.purchase_discount_pct).toFixed(2)),
        wholesale_price: parseFloat(priceFromDiscount(mrp, prev.wholesale_discount_pct).toFixed(2)),
        retail_price: parseFloat(priceFromDiscount(mrp, prev.retail_discount_pct).toFixed(2)),
      };
    });
  };
  const updateProductFormPiecesPerBox = (piecesPerBox: number) => {
    setProductForm(prev => ({
      ...prev, pieces_per_box: piecesPerBox,
      box_mrp: boxMrpFromMrp(prev.mrp, piecesPerBox || 1),
    }));
  };
  const updateProductFormPct = (field: 'purchase' | 'wholesale' | 'retail', pct: number) => {
    setProductForm(prev => ({
      ...prev,
      [`${field}_discount_pct`]: pct,
      [`${field}_price`]: parseFloat(priceFromDiscount(prev.mrp, pct).toFixed(2)),
    }));
  };
  const updateProductFormPrice = (field: 'purchase' | 'wholesale' | 'retail', price: number) => {
    setProductForm(prev => ({
      ...prev,
      [`${field}_price`]: price,
      [`${field}_discount_pct`]: discountFromPrice(prev.mrp, price),
    }));
  };

  // Price Update / "Pricing" screen mirrors the same MRP <-> Box MRP sync,
  // using the selected product's (fixed, non-editable here) pieces_per_box
  // as the conversion factor.
  const updatePriceUpdateFormMrp = (mrp: number) => {
    const piecesPerBox = selectedProduct?.pieces_per_box || 1;
    setPriceUpdateForm(prev => ({
      ...prev, mrp,
      box_mrp: boxMrpFromMrp(mrp, piecesPerBox),
      purchase_price: parseFloat(priceFromDiscount(mrp, prev.purchase_discount_pct).toFixed(2)),
      wholesale_price: parseFloat(priceFromDiscount(mrp, prev.wholesale_discount_pct).toFixed(2)),
      retail_price: parseFloat(priceFromDiscount(mrp, prev.retail_discount_pct).toFixed(2)),
    }));
  };
  const updatePriceUpdateFormBoxMrp = (boxMrp: number) => {
    const piecesPerBox = selectedProduct?.pieces_per_box || 1;
    const mrp = mrpFromBoxMrp(boxMrp, piecesPerBox);
    setPriceUpdateForm(prev => ({
      ...prev, mrp, box_mrp: boxMrp,
      purchase_price: parseFloat(priceFromDiscount(mrp, prev.purchase_discount_pct).toFixed(2)),
      wholesale_price: parseFloat(priceFromDiscount(mrp, prev.wholesale_discount_pct).toFixed(2)),
      retail_price: parseFloat(priceFromDiscount(mrp, prev.retail_discount_pct).toFixed(2)),
    }));
  };
  const updatePriceUpdateFormPct = (field: 'purchase' | 'wholesale' | 'retail', pct: number) => {
    setPriceUpdateForm(prev => ({
      ...prev,
      [`${field}_discount_pct`]: pct,
      [`${field}_price`]: parseFloat(priceFromDiscount(prev.mrp, pct).toFixed(2)),
    }));
  };
  const updatePriceUpdateFormPrice = (field: 'purchase' | 'wholesale' | 'retail', price: number) => {
    setPriceUpdateForm(prev => ({
      ...prev,
      [`${field}_price`]: price,
      [`${field}_discount_pct`]: discountFromPrice(prev.mrp, price),
    }));
  };

  const categories = ['All', ...data.categories.filter(c => c.status === 'Active').map(c => c.name)];
  const deletedProductsCount = data.products.filter(p => p.status === 'Inactive').length;
  const inactiveCategoriesCount = data.categories.filter(c => c.status === 'Inactive').length;
  const retailEnabled = isRetailPricingEnabled(currentUser, data.rolePermissions, data.userPermissions);

  // Debounced so a fast typist (or someone holding backspace) doesn't
  // re-filter and re-render the whole catalog list on every keystroke - the
  // search box itself (productSearch) still updates instantly, only the
  // list below lags a beat behind.
  const debouncedProductSearch = useDebouncedValue(productSearch, 150);
  const filteredProducts = useMemo(() => data.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.code.toLowerCase().includes(debouncedProductSearch.toLowerCase());
    const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;
    const matchesTab = catalogTab === 'deleted' ? p.status === 'Inactive' : p.status === 'Active';
    return matchesSearch && matchesCat && matchesTab;
  }), [data.products, debouncedProductSearch, categoryFilter, catalogTab]);
  // Suggestion pool for the search box's autocomplete panel - active
  // products only (matches what's actually findable in the current tab),
  // deduped by AutocompleteInput/filterSuggestions itself.
  const productSearchSuggestions = useMemo(() => data.products.filter(p => p.status === 'Active').map(p => p.name), [data.products]);

  const handleOpenAddProduct = () => {
    setProductForm({
      name: '', code: 'IC-NEW-' + Math.floor(Math.random() * 900 + 100), category: data.categories.find(c => c.status === 'Active')?.name || '', brand: 'Gelato Peaks', description: '',
      mrp: 2.00, purchase_discount_pct: 50, wholesale_discount_pct: 37.5, retail_discount_pct: 0, tax_pct: 12, status: 'Active',
      purchase_price: priceFromDiscount(2.00, 50), wholesale_price: priceFromDiscount(2.00, 37.5), retail_price: priceFromDiscount(2.00, 0),
      unit_value: 1, unit_type: 'pcs',
      pieces_per_box: 1,
      box_mrp: boxMrpFromMrp(2.00, 1),
      image_url: ''
    });
    setActiveForm('add_product');
  };

  const handleOpenEditProduct = (p: Product) => {
    setSelectedProduct(p);
    setProductForm({
      name: p.name, code: p.code, category: p.category, brand: p.brand, description: p.description,
      mrp: p.mrp, purchase_discount_pct: p.purchase_discount_pct, wholesale_discount_pct: p.wholesale_discount_pct, retail_discount_pct: p.retail_discount_pct, tax_pct: p.tax_pct, status: p.status,
      purchase_price: p.purchase_price, wholesale_price: p.wholesale_price, retail_price: p.selling_price,
      unit_value: p.unit_value, unit_type: p.unit_type,
      pieces_per_box: p.pieces_per_box || 1,
      box_mrp: boxMrpFromMrp(p.mrp, p.pieces_per_box || 1),
      image_url: p.image_url
    });
    setActiveForm('edit_product');
  };

  const handleOpenManageCategories = () => {
    setNewCategoryName('');
    setEditingCategoryId(null);
    setCategoryListTab('active');
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

  const handleToggleCategoryStatus = async (category: { id: string; name: string; status: 'Active' | 'Inactive' }) => {
    try {
      await categoriesApi.toggleStatus(category.id);
      await refreshData();
      const nextStatus = category.status === 'Active' ? 'Inactive' : 'Active';
      addNotification('product_update', `Category "${category.name}" marked ${nextStatus}.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update category status.');
    }
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.code) {
      showAlert('Please fill out all mandatory fields.');
      return;
    }

    const isNew = activeForm === 'add_product';
    // purchase_price/wholesale_price/retail_price/box_mrp are local
    // display/editing convenience only - the API stores mrp (piece price)
    // and discount %'s; box_mrp is always re-derived server-side from
    // mrp * pieces_per_box (see serializeProduct()).
    const { purchase_price, wholesale_price, retail_price, box_mrp, ...payload } = productForm;
    // Pieces per Box only ever displays blank mid-edit (see the field above) -
    // clamp back to the minimum of 1 here rather than on every keystroke, so
    // clearing the field to retype a new value isn't fought by the input.
    payload.pieces_per_box = Math.max(1, Math.floor(payload.pieces_per_box) || 1);

    try {
      if (isNew) {
        const created = await productsApi.create(payload);
        await refreshData();
        addNotification('product_update', `New product added to catalog: ${productForm.name}.`, 'product', created.id);
      } else {
        await productsApi.update(selectedProduct!.id, payload);
        await refreshData();
        addNotification('product_update', `Catalog details updated for ${productForm.name}.`, 'product', selectedProduct!.id);
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
      addNotification('product_update', `Product "${product.name}" was removed from the catalog.`, 'product', product.id);
      showAlert(`${product.name} has been removed from the catalog. It's hidden from new orders/pre-bookings but can be reactivated anytime.`);
    } catch (e: any) {
      showAlert({ type: 'warning', message: e.message ?? 'Unable to remove product.' });
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
      addNotification('product_update', `Product "${product.name}" has been reactivated.`, 'product', product.id);
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
    setPriceUpdateForm({
      mrp: p.mrp, box_mrp: boxMrpFromMrp(p.mrp, p.pieces_per_box || 1), purchase_discount_pct: p.purchase_discount_pct, wholesale_discount_pct: p.wholesale_discount_pct, retail_discount_pct: p.retail_discount_pct,
      purchase_price: p.purchase_price, wholesale_price: p.wholesale_price, retail_price: p.selling_price,
    });
    setActiveForm('price_history');
  };

  const handleSavePriceUpdate = async () => {
    if (!selectedProduct) return;
    const oldMrp = selectedProduct.mrp;
    const oldPurchase = selectedProduct.purchase_price;
    const oldWholesale = selectedProduct.wholesale_price;
    const oldSelling = selectedProduct.selling_price;
    const newMrp = Number(priceUpdateForm.mrp);
    const newPurchase = priceFromDiscount(newMrp, Number(priceUpdateForm.purchase_discount_pct));
    const newWholesale = priceFromDiscount(newMrp, Number(priceUpdateForm.wholesale_discount_pct));
    const newSelling = priceFromDiscount(newMrp, Number(priceUpdateForm.retail_discount_pct));

    try {
      await productsApi.updatePrice(selectedProduct.id, {
        mrp: newMrp,
        purchase_discount_pct: Number(priceUpdateForm.purchase_discount_pct),
        wholesale_discount_pct: Number(priceUpdateForm.wholesale_discount_pct),
        retail_discount_pct: Number(priceUpdateForm.retail_discount_pct),
      });
      await refreshData();
      addNotification('product_update', `${selectedProduct.name} price changed: MRP Rs. ${oldMrp.toFixed(2)} to Rs. ${newMrp.toFixed(2)} (purchase Rs. ${oldPurchase.toFixed(2)} to Rs. ${newPurchase.toFixed(2)}, wholesale Rs. ${oldWholesale.toFixed(2)} to Rs. ${newWholesale.toFixed(2)}, selling Rs. ${oldSelling.toFixed(2)} to Rs. ${newSelling.toFixed(2)}).`, 'product', selectedProduct.id);
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
          <View className="flex-row items-center gap-2 z-20">
            <View className="flex-1 lg:max-w-sm relative justify-center">
              <View className="absolute left-3 z-10">
                <Search size={16} color="#94a3b8" />
              </View>
              <AutocompleteInput
                value={productSearch}
                onChangeText={setProductSearch}
                suggestions={productSearchSuggestions}
                placeholder="Search code or flavor..."
                placeholderTextColor="#94a3b8"
                className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl"
              />
            </View>
            {activeScreen !== 'Pricing' && (
              <>
                <Pressable onPress={handleOpenManageCategories} className="bg-slate-800 px-3 py-2.5 rounded-xl flex-row items-center gap-1.5 active:bg-slate-900">
                  <Settings2 size={16} color="#fff" />
                  <Text className="text-white font-bold text-xs">Categories</Text>
                </Pressable>
                <Pressable onPress={handleOpenAddProduct} className="bg-rose-500 p-2.5 rounded-xl active:bg-rose-600">
                  <Plus size={20} color="#fff" />
                </Pressable>
              </>
            )}
          </View>

          <FilterBar hideSearch>
            {activeScreen !== 'Pricing' && (
              <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
                <Pressable onPress={() => setCatalogTab('active')} className={`py-1.5 px-3 rounded-lg items-center justify-center ${catalogTab === 'active' ? 'bg-indigo-600' : ''}`}>
                  <Text className={`text-[10px] font-extrabold ${catalogTab === 'active' ? 'text-white' : 'text-slate-500'}`}>Catalog</Text>
                </Pressable>
                <Pressable onPress={() => setCatalogTab('deleted')} className={`py-1.5 px-3 rounded-lg items-center justify-center flex-row gap-1.5 ${catalogTab === 'deleted' ? 'bg-indigo-600' : ''}`}>
                  <RotateCcw size={13} color={catalogTab === 'deleted' ? '#ffffff' : '#64748b'} />
                  <Text className={`text-[10px] font-extrabold ${catalogTab === 'deleted' ? 'text-white' : 'text-slate-500'}`}>Deleted Products</Text>
                  {deletedProductsCount > 0 && (
                    <View className="bg-red-500 rounded-full px-1.5 py-0.5">
                      <Text className="text-white font-extrabold text-[8px]">{deletedProductsCount}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
          </FilterBar>

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
              <ProductImage uri={productForm.image_url} className="w-16 h-16 rounded-xl bg-slate-100" iconSize={28} />
              <View className="gap-1.5">
                <View className="flex-row gap-1.5">
                  <Pressable onPress={handlePickProductImage} className="py-1.5 px-2.5 bg-slate-100 rounded-lg active:bg-slate-200">
                    <Text className="text-slate-700 font-bold text-xs">Choose Photo from Gallery</Text>
                  </Pressable>
                  {!!productForm.image_url && (
                    <Pressable onPress={() => setProductForm({ ...productForm, image_url: '' })} className="py-1.5 px-2.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                      <Text className="text-rose-600 font-bold text-xs">Remove Photo</Text>
                    </Pressable>
                  )}
                </View>
                <Text className="text-[9px] text-slate-400">JPG/PNG, cropped to a square</Text>
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
                {data.categories.filter(cat => cat.status === 'Active' || cat.name === productForm.category).map(cat => (
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
                  value={productForm.unit_value === 0 ? '' : String(productForm.unit_value)}
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

            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Pieces per Box</Text>
              <TextInput
                keyboardType="number-pad"
                value={productForm.pieces_per_box === 0 ? '' : String(productForm.pieces_per_box)}
                onChangeText={v => updateProductFormPiecesPerBox(Number(v.replace(/[^0-9]/g, '')) || 0)}
                className={inputClass}
                placeholder="e.g. 12"
                placeholderTextColor="#94a3b8"
              />
              <Text className="text-[9px] text-slate-400 mt-1">How many individual pieces are in one box/case of this product (e.g. 12). Minimum 1.</Text>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Piece MRP</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.mrp === 0 ? '' : String(productForm.mrp)} onChangeText={v => updateProductFormMrp(Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Box MRP</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.box_mrp === 0 ? '' : String(productForm.box_mrp)} onChangeText={v => updateProductFormBoxMrp(Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} />
                <Text className="text-[9px] text-slate-400 mt-1">= Piece MRP x Pieces per Box</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">GST/Tax %</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.tax_pct === 0 ? '' : String(productForm.tax_pct)} onChangeText={v => setProductForm({ ...productForm, tax_pct: Number(v) || 0 })} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>
              <View className="flex-1" />
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Purchase Discount (%)</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.purchase_discount_pct === 0 ? '' : String(productForm.purchase_discount_pct)} onChangeText={v => updateProductFormPct('purchase', parseDiscountPct(v))} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Wholesale Discount (%)</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.wholesale_discount_pct === 0 ? '' : String(productForm.wholesale_discount_pct)} onChangeText={v => updateProductFormPct('wholesale', parseDiscountPct(v))} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>
              {retailEnabled && (
                <View className="flex-1">
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Retail/Selling Discount (%)</Text>
                  <TextInput keyboardType="decimal-pad" value={productForm.retail_discount_pct === 0 ? '' : String(productForm.retail_discount_pct)} onChangeText={v => updateProductFormPct('retail', parseDiscountPct(v))} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} />
                </View>
              )}
            </View>
            <View className="flex-row gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <View className="flex-1">
                <Text className="text-slate-400 text-[9px] font-bold uppercase">Purchase Price (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.purchase_price === 0 ? '' : String(productForm.purchase_price)} onChangeText={v => updateProductFormPrice('purchase', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-extrabold text-slate-700 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-400 text-[9px] font-bold uppercase">Wholesale Price (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={productForm.wholesale_price === 0 ? '' : String(productForm.wholesale_price)} onChangeText={v => updateProductFormPrice('wholesale', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-extrabold text-emerald-600 text-xs" />
              </View>
              {retailEnabled && (
                <View className="flex-1">
                  <Text className="text-slate-400 text-[9px] font-bold uppercase">Selling Price (Rs)</Text>
                  <TextInput keyboardType="decimal-pad" value={productForm.retail_price === 0 ? '' : String(productForm.retail_price)} onChangeText={v => updateProductFormPrice('retail', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-extrabold text-rose-500 text-xs" />
                </View>
              )}
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
                <Text className="font-bold text-slate-500 mb-1 text-xs">Piece MRP</Text>
                <TextInput keyboardType="decimal-pad" value={priceUpdateForm.mrp === 0 ? '' : String(priceUpdateForm.mrp)} onChangeText={v => updatePriceUpdateFormMrp(Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Box MRP</Text>
                <TextInput keyboardType="decimal-pad" value={priceUpdateForm.box_mrp === 0 ? '' : String(priceUpdateForm.box_mrp)} onChangeText={v => updatePriceUpdateFormBoxMrp(Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 text-xs" />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Purchase Discount (%)</Text>
                <TextInput keyboardType="decimal-pad" value={priceUpdateForm.purchase_discount_pct === 0 ? '' : String(priceUpdateForm.purchase_discount_pct)} onChangeText={v => updatePriceUpdateFormPct('purchase', parseDiscountPct(v))} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Wholesale Discount (%)</Text>
                <TextInput keyboardType="decimal-pad" value={priceUpdateForm.wholesale_discount_pct === 0 ? '' : String(priceUpdateForm.wholesale_discount_pct)} onChangeText={v => updatePriceUpdateFormPct('wholesale', parseDiscountPct(v))} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-emerald-600 text-xs" />
              </View>
              {retailEnabled && (
                <View className="flex-1">
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Retail/Selling Discount (%)</Text>
                  <TextInput keyboardType="decimal-pad" value={priceUpdateForm.retail_discount_pct === 0 ? '' : String(priceUpdateForm.retail_discount_pct)} onChangeText={v => updatePriceUpdateFormPct('retail', parseDiscountPct(v))} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-indigo-600 text-xs" />
                </View>
              )}
            </View>
            <View className="flex-row gap-3 bg-white border border-slate-200 rounded-xl p-2.5">
              <View className="flex-1">
                <Text className="text-slate-400 text-[9px] font-bold uppercase">Purchase Price (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={priceUpdateForm.purchase_price === 0 ? '' : String(priceUpdateForm.purchase_price)} onChangeText={v => updatePriceUpdateFormPrice('purchase', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-extrabold text-slate-700 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-400 text-[9px] font-bold uppercase">Wholesale Price (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={priceUpdateForm.wholesale_price === 0 ? '' : String(priceUpdateForm.wholesale_price)} onChangeText={v => updatePriceUpdateFormPrice('wholesale', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-extrabold text-emerald-600 text-xs" />
              </View>
              {retailEnabled && (
                <View className="flex-1">
                  <Text className="text-slate-400 text-[9px] font-bold uppercase">Selling Price (Rs)</Text>
                  <TextInput keyboardType="decimal-pad" value={priceUpdateForm.retail_price === 0 ? '' : String(priceUpdateForm.retail_price)} onChangeText={v => updatePriceUpdateFormPrice('retail', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-extrabold text-indigo-600 text-xs" />
                </View>
              )}
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
      ) : activeForm === 'manage_categories' ? (() => {
        const visibleCategories = data.categories.filter(c => (categoryListTab === 'inactive' ? c.status === 'Inactive' : c.status === 'Active'));
        return (
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

          <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
            <Pressable onPress={() => setCategoryListTab('active')} className={`py-1.5 px-3 rounded-lg items-center justify-center ${categoryListTab === 'active' ? 'bg-indigo-600' : ''}`}>
              <Text className={`text-[10px] font-extrabold ${categoryListTab === 'active' ? 'text-white' : 'text-slate-500'}`}>Active</Text>
            </Pressable>
            <Pressable onPress={() => setCategoryListTab('inactive')} className={`py-1.5 px-3 rounded-lg items-center justify-center flex-row gap-1.5 ${categoryListTab === 'inactive' ? 'bg-indigo-600' : ''}`}>
              <RotateCcw size={13} color={categoryListTab === 'inactive' ? '#ffffff' : '#64748b'} />
              <Text className={`text-[10px] font-extrabold ${categoryListTab === 'inactive' ? 'text-white' : 'text-slate-500'}`}>Inactive</Text>
              {inactiveCategoriesCount > 0 && (
                <View className="bg-red-500 rounded-full px-1.5 py-0.5">
                  <Text className="text-white font-extrabold text-[8px]">{inactiveCategoriesCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold text-slate-400 uppercase">{visibleCategories.length} Categor{visibleCategories.length === 1 ? 'y' : 'ies'}</Text>
            <ViewToggle />
          </View>

          {viewMode === 'table' ? (
            <DataTable
              data={visibleCategories}
              keyExtractor={cat => cat.id}
              emptyText={categoryListTab === 'inactive' ? 'No inactive categories.' : 'No categories yet. Add one above.'}
              columns={[
                {
                  key: 'name', label: 'Category', width: 200,
                  render: (cat: Category) => editingCategoryId === cat.id ? (
                    <TextInput value={editingCategoryName} onChangeText={setEditingCategoryName} autoFocus className="bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800" />
                  ) : (
                    <Text className="font-bold text-slate-800 text-xs" numberOfLines={1}>{cat.name}</Text>
                  ),
                },
                {
                  key: 'products', label: 'Products', width: 90, align: 'center' as const, grow: false,
                  render: (cat: Category) => <Text className="text-[10px] text-slate-500 text-center">{data.products.filter(p => p.category === cat.name).length}</Text>,
                },
                {
                  key: 'actions', label: 'Actions', width: 100, grow: false,
                  render: (cat: Category) => {
                    if (editingCategoryId === cat.id) {
                      return (
                        <View className="flex-row gap-1.5">
                          <Pressable onPress={handleSaveEditCategory} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100"><Check size={14} color="#059669" /></Pressable>
                          <Pressable onPress={() => setEditingCategoryId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><X size={14} color="#64748b" /></Pressable>
                        </View>
                      );
                    }
                    return (
                      <View className="flex-row gap-1.5">
                        {cat.status === 'Active' && (
                          <Pressable onPress={() => handleStartEditCategory(cat.id, cat.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><Edit size={14} color="#475569" /></Pressable>
                        )}
                        <Pressable onPress={() => handleToggleCategoryStatus(cat)} className={`p-1.5 rounded-lg ${cat.status === 'Active' ? 'bg-rose-50 active:bg-rose-100' : 'bg-emerald-50 active:bg-emerald-100'}`}>
                          {cat.status === 'Active' ? <Trash2 size={14} color="#e11d48" /> : <RotateCcw size={14} color="#059669" />}
                        </Pressable>
                      </View>
                    );
                  },
                },
              ] as DataTableColumn<Category>[]}
            />
          ) : (
            <View className={`gap-2 md:flex-row md:flex-wrap ${visibleCategories.length === 0 ? 'flex-1' : ''}`}>
              {visibleCategories.map(cat => {
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
                        {cat.status === 'Active' && (
                          <Pressable onPress={() => handleStartEditCategory(cat.id, cat.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                            <Edit size={14} color="#475569" />
                          </Pressable>
                        )}
                        <Pressable onPress={() => handleToggleCategoryStatus(cat)} className={`p-1.5 rounded-lg ${cat.status === 'Active' ? 'bg-rose-50 active:bg-rose-100' : 'bg-emerald-50 active:bg-emerald-100'}`}>
                          {cat.status === 'Active' ? <Trash2 size={14} color="#e11d48" /> : <RotateCcw size={14} color="#059669" />}
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
              {visibleCategories.length === 0 && (
                <EmptyState message={categoryListTab === 'inactive' ? 'No inactive categories.' : 'No categories yet. Add one above.'} />
              )}
            </View>
          )}
        </View>
        );
      })() : viewMode === 'table' ? (
        <DataTable
          data={filteredProducts}
          keyExtractor={p => p.id}
          emptyText={catalogTab === 'deleted' ? 'No deleted products. Anything you remove from the catalog will show up here for restoring.' : 'No ice cream products found matching the filters.'}
          columns={([
            {
              key: 'name', label: 'Product', width: 220,
              render: (p: Product) => (
                <View className="flex-row items-center gap-2">
                  <ProductImage uri={p.image_url} className="w-8 h-8 rounded-lg bg-slate-50 flex-shrink-0" iconSize={16} />
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1">
                      <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{p.name}</Text>
                      {p.status === 'Inactive' && <Text className="text-[8px] bg-red-50 font-black px-1 rounded text-red-600 uppercase">Inactive</Text>}
                    </View>
                    <Text className="text-[9px] text-slate-400" numberOfLines={1}>{p.code}</Text>
                  </View>
                </View>
              ),
            },
            { key: 'category', label: 'Category', width: 110, render: (p: Product) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{p.category}</Text> },
            { key: 'brand', label: 'Brand', width: 110, render: (p: Product) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{p.brand}</Text> },
            { key: 'unit', label: 'Unit', width: 70, render: (p: Product) => <Text className="text-[10px] text-slate-600">{p.unit_value}{p.unit_type}</Text> },
            { key: 'pieces_per_box', label: 'Box/Pcs', width: 100, align: 'center' as const, render: (p: Product) => <Text className="text-[10px] text-slate-600 text-center">1 box ({p.pieces_per_box}pcs)</Text> },
            {
              key: 'mrp', label: 'Box/Pc MRP', width: 100, align: 'right' as const,
              render: (p: Product) => (
                <View className="items-end">
                  <Text className="text-[10px] font-bold text-slate-700">Box Rs. {p.box_mrp.toFixed(2)}</Text>
                  <Text className="text-[9px] text-slate-400">Pc Rs. {p.mrp.toFixed(2)}</Text>
                </View>
              ),
            },
            { key: 'purchase', label: 'Purchase', width: 90, align: 'right' as const, render: (p: Product) => <Text className="text-[10px] font-semibold text-slate-600 text-right">Rs. {p.purchase_price.toFixed(2)}</Text> },
            { key: 'wholesale', label: 'Wholesale', width: 90, align: 'right' as const, render: (p: Product) => <Text className="text-[10px] font-semibold text-emerald-600 text-right">Rs. {p.wholesale_price.toFixed(2)}</Text> },
            ...(retailEnabled ? [{ key: 'selling', label: 'Selling', width: 90, align: 'right' as const, render: (p: Product) => <Text className="text-[10px] font-extrabold text-rose-500 text-right">Rs. {p.selling_price.toFixed(2)}</Text> }] : []),
            {
              key: 'stock', label: 'Stock', width: 100,
              render: (p: Product) => {
                const wh = data.warehouse_inventory.find(i => i.product_id === p.id);
                const qty = wh ? wh.available_qty : 0;
                const isOut = qty === 0;
                const isLow = qty > 0 && qty <= 100;
                return (
                  <Text className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md uppercase self-start ${isOut ? 'bg-red-100 text-red-600' : isLow ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                  </Text>
                );
              },
            },
            {
              key: 'actions', label: 'Actions', width: 100, grow: false,
              render: (p: Product) => (
                <View className="flex-row items-center gap-1.5">
                  {activeScreen === 'Pricing' ? (
                    <Pressable onPress={() => handleOpenPriceUpdate(p)} className="p-1.5 bg-indigo-50 rounded-lg active:bg-indigo-100">
                      <DollarSign size={14} color="#4f46e5" />
                    </Pressable>
                  ) : (
                    <>
                      <Pressable onPress={() => handleOpenEditProduct(p)} className="p-1.5 bg-slate-50 rounded-lg active:bg-slate-100">
                        <Edit size={14} color="#475569" />
                      </Pressable>
                      {p.status === 'Inactive' ? (
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
              ),
            },
          ]) as DataTableColumn<Product>[]}
        />
      ) : (
        <View className={`gap-3 md:flex-row md:flex-wrap ${filteredProducts.length === 0 ? 'flex-1' : ''}`}>
          {filteredProducts.map(p => {
            const wh = data.warehouse_inventory.find(i => i.product_id === p.id);
            const qty = wh ? wh.available_qty : 0;
            const isLow = qty > 0 && qty <= 100;
            const isOut = qty === 0;
            const isInactive = p.status === 'Inactive';

            return (
              <View key={p.id} className={`w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-start gap-3 ${isInactive ? 'opacity-60' : ''}`}>
                <ProductImage uri={p.image_url} className="w-16 h-16 rounded-xl bg-slate-50 flex-shrink-0" iconSize={28} />
                <View className="flex-1 gap-1.5 min-w-0">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="font-bold text-slate-800 text-xs flex-1 min-w-0" numberOfLines={1}>{p.name}</Text>
                    <View className="flex-row items-center gap-1 flex-shrink-0">
                      {isInactive && <Text className="text-[9px] bg-red-50 font-black px-1.5 py-0.5 rounded text-red-600 uppercase">Inactive</Text>}
                      <Text className="text-[9px] bg-slate-100 font-bold px-1.5 py-0.5 rounded text-slate-400 uppercase">{p.code}</Text>
                    </View>
                  </View>

                  <Text className="text-[10px] text-slate-400" numberOfLines={1}>{p.brand} - {p.category} - {p.unit_value}{p.unit_type} - {p.pieces_per_box} pcs/box</Text>

                  <View className="pt-1.5 border-t border-slate-50 gap-1.5">
                 
                    <View className="flex-row justify-between">
                      <View className="flex-1 items-start">
                        <Text className="text-slate-400 text-[9px]" numberOfLines={1}>Purchase</Text>
                        <Text className="font-semibold text-slate-600 text-[10px]" numberOfLines={1}>Rs. {p.purchase_price.toFixed(2)}</Text>
                      </View>
                      <View className={`flex-1 ${retailEnabled ? 'items-center' : 'items-end'}`}>
                        <Text className="text-slate-400 text-[9px]" numberOfLines={1}>Wholesale</Text>
                        <Text className="font-semibold text-emerald-600 text-[10px]" numberOfLines={1}>Rs. {p.wholesale_price.toFixed(2)}</Text>
                      </View>
                      {retailEnabled && (
                        <View className="flex-1 items-end">
                          <Text className="text-slate-400 text-[9px]" numberOfLines={1}>Selling</Text>
                          <Text className="font-extrabold text-rose-500 text-[10px]" numberOfLines={1}>Rs. {p.selling_price.toFixed(2)}</Text>
                        </View>
                      )}
                    </View>

                    <View className="flex-row items-center justify-between gap-1.5">
                         <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-[9px] font-bold text-slate-500 flex-shrink-0">Pc MRP Rs. {p.mrp.toFixed(2)} (Box Rs. {p.box_mrp.toFixed(2)})</Text>
                      {isOut ? (
                        <Text className="text-[8px] bg-red-100 text-red-600 font-extrabold px-1.5 py-0.5 rounded-md uppercase flex-shrink-0">Out of Stock (OOS)</Text>
                      ) : isLow ? (
                        <Text className="text-[8px] bg-amber-100 text-amber-600 font-extrabold px-1.5 py-0.5 rounded-md uppercase flex-shrink-0">Low Stock</Text>
                      ) : (
                        <Text className="text-[8px] bg-emerald-50 text-emerald-600 font-extrabold px-1.5 py-0.5 rounded-md uppercase flex-shrink-0">In Stock</Text>
                      )}
                    </View>
                     <View className="flex-row items-center justify-between gap-2 mt-1">
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
              </View>
            );
          })}

          {filteredProducts.length === 0 && (
            <EmptyState message={catalogTab === 'deleted' ? 'No deleted products. Anything you remove from the catalog will show up here for restoring.' : 'No ice cream products found matching the filters.'} />
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
    </View>
  );
}

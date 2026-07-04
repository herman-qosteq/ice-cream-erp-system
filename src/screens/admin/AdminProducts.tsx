import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView } from 'react-native';
import { Search, Plus, Edit, DollarSign, History, CheckCircle, Calendar, Trash2, Clock, AlertTriangle, Tag, Check, X } from 'lucide-react-native';
import { ERPData, logAudit, resolveActor } from '../../storage';
import { Product, AppNotification } from '../../types';
import ConfirmModal from '../../components/common/ConfirmModal';
import { pickImageAsDataUri } from '../../utils/imagePicker';

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
    purchase_price: 1.0, selling_price: 2.0, tax_pct: 12, status: 'Active' as 'Active' | 'Inactive',
    unit_value: 1, unit_type: 'pcs' as Product['unit_type'],
    image_url: STOCK_PRODUCT_IMAGES[0]
  });

  const [priceUpdateForm, setPriceUpdateForm] = useState({ purchase_price: 0, selling_price: 0 });
  const [scheduleForm, setScheduleForm] = useState({ purchase_price: 0, selling_price: 0, effective_date: '2026-07-15' });

  const categories = ['All', ...data.categories.map(c => c.name)];

  const filteredProducts = data.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code.toLowerCase().includes(productSearch.toLowerCase());
    const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleOpenAddProduct = () => {
    setProductForm({
      name: '', code: 'IC-NEW-' + Math.floor(Math.random() * 900 + 100), category: data.categories[0]?.name || '', brand: 'Gelato Peaks', description: '',
      purchase_price: 1.00, selling_price: 2.00, tax_pct: 12, status: 'Active',
      unit_value: 1, unit_type: 'pcs',
      image_url: STOCK_PRODUCT_IMAGES[0]
    });
    setActiveForm('add_product');
  };

  const handleOpenEditProduct = (p: Product) => {
    setSelectedProduct(p);
    setProductForm({
      name: p.name, code: p.code, category: p.category, brand: p.brand, description: p.description,
      purchase_price: p.purchase_price, selling_price: p.selling_price, tax_pct: p.tax_pct, status: p.status,
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

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      showAlert('Please enter a category name.');
      return;
    }
    if (data.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      showAlert(`A category named "${name}" already exists.`);
      return;
    }
    const newCategory = { id: 'cat_' + Date.now(), name };
    let tempState = { ...data, categories: [...data.categories, newCategory] };
    tempState = logAudit(tempState, 'CATEGORY_CREATE', 'Category', newCategory.id, currentUser?.id || 'admin', `Created product category ${name}`);
    setData(tempState);
    addNotification('product_update', `New product category added: ${name}.`);
    setNewCategoryName('');
  };

  const handleStartEditCategory = (categoryId: string, currentName: string) => {
    setEditingCategoryId(categoryId);
    setEditingCategoryName(currentName);
  };

  const handleSaveEditCategory = () => {
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
    const updatedCategories = data.categories.map(c => (c.id === category.id ? { ...c, name: newName } : c));
    const updatedProducts = data.products.map(p => (p.category === oldName ? { ...p, category: newName } : p));
    let tempState = { ...data, categories: updatedCategories, products: updatedProducts };
    tempState = logAudit(tempState, 'CATEGORY_UPDATE', 'Category', category.id, currentUser?.id || 'admin', `Renamed product category "${oldName}" to "${newName}"`);
    setData(tempState);
    addNotification('product_update', `Category "${oldName}" renamed to "${newName}".`);
    setEditingCategoryId(null);
  };

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

    const updatedCategories = data.categories.filter(c => c.id !== category.id);
    let tempState = { ...data, categories: updatedCategories };
    tempState = logAudit(tempState, 'CATEGORY_DELETE', 'Category', category.id, currentUser?.id || 'admin', `Deleted product category ${category.name}`);
    setData(tempState);
    addNotification('product_update', `Category "${category.name}" was deleted.`);
    setDeleteCategoryConfirmId(null);
  };

  const handleSaveProduct = () => {
    if (!productForm.name || !productForm.code) {
      showAlert('Please fill out all mandatory fields.');
      return;
    }

    let updatedProducts = [...data.products];
    const isNew = activeForm === 'add_product';

    if (isNew) {
      const newProduct: Product = { id: 'p_' + Date.now(), ...productForm };
      updatedProducts = [newProduct, ...updatedProducts];
      const updatedWarehouse = [
        ...data.warehouse_inventory,
        { product_id: newProduct.id, available_qty: 0, reserved_qty: 0, damaged_qty: 0, expired_qty: 0 }
      ];
      let tempState = { ...data, products: updatedProducts, warehouse_inventory: updatedWarehouse };
      tempState = logAudit(tempState, 'PRODUCT_CREATE', 'Product', newProduct.id, currentUser?.id || 'admin', `Created product ${newProduct.name}`);
      setData(tempState);
      addNotification('product_update', `New product added to catalog: ${newProduct.name}.`);
    } else {
      updatedProducts = data.products.map(p => (p.id === selectedProduct?.id ? { ...p, ...productForm } : p));
      let tempState = { ...data, products: updatedProducts };
      tempState = logAudit(tempState, 'PRODUCT_EDIT', 'Product', selectedProduct!.id, currentUser?.id || 'admin', `Modified product details for ${productForm.name}`);
      setData(tempState);
      addNotification('product_update', `Catalog details updated for ${productForm.name}.`);
    }

    setActiveForm('list');
  };

  const handleConfirmDeleteProduct = () => {
    const productId = deleteProductConfirmId;
    const product = data.products.find(p => p.id === productId);
    if (!product) { setDeleteProductConfirmId(null); return; }

    const wh = data.warehouse_inventory.find(inv => inv.product_id === productId);
    const warehouseUnits = wh ? wh.available_qty + wh.reserved_qty + wh.damaged_qty + wh.expired_qty : 0;
    const truckUnits = data.truck_inventory.filter(ti => ti.product_id === productId).reduce((sum, ti) => sum + ti.quantity, 0);
    if (warehouseUnits + truckUnits > 0) {
      setDeleteProductConfirmId(null);
      showAlert(`Cannot delete ${product.name}: it still has ${warehouseUnits} unit(s) in the warehouse and ${truckUnits} unit(s) on trucks. Clear or transfer that stock first so it isn't lost from your inventory reports.`);
      return;
    }

    const updatedProducts = data.products.filter(p => p.id !== productId);
    const updatedWarehouse = data.warehouse_inventory.filter(inv => inv.product_id !== productId);
    let tempState = { ...data, products: updatedProducts, warehouse_inventory: updatedWarehouse };
    tempState = logAudit(tempState, 'PRODUCT_DELETE', 'Product', product.id, currentUser?.id || 'admin', `Deleted product ${product.name} from the catalog.`);
    setData(tempState);
    addNotification('product_update', `Product "${product.name}" was deleted from the catalog.`);
    showAlert(`${product.name} has been deleted.`);
    setDeleteProductConfirmId(null);
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
    setPriceUpdateForm({ purchase_price: p.purchase_price, selling_price: p.selling_price });
    setScheduleForm({ purchase_price: p.purchase_price, selling_price: p.selling_price, effective_date: new Date().toISOString().split('T')[0] });
    setActiveForm('price_history');
  };

  const handleSavePriceUpdate = () => {
    if (!selectedProduct) return;
    const oldPurchase = selectedProduct.purchase_price;
    const oldSelling = selectedProduct.selling_price;

    const updatedProducts = data.products.map(p =>
      p.id === selectedProduct.id
        ? { ...p, purchase_price: Number(priceUpdateForm.purchase_price), selling_price: Number(priceUpdateForm.selling_price) }
        : p
    );

    let tempState = { ...data, products: updatedProducts };
    const details = `Immediate Price Update: Purchase Price changed from Rs${oldPurchase} to Rs${priceUpdateForm.purchase_price}, Selling Price from Rs${oldSelling} to Rs${priceUpdateForm.selling_price}`;
    tempState = logAudit(tempState, 'PRICE_UPDATE', 'Product', selectedProduct.id, currentUser?.id || 'admin', details);

    setData(tempState);
    addNotification('product_update', `${selectedProduct.name} price changed: purchase Rs${oldPurchase.toFixed(2)} to Rs${Number(priceUpdateForm.purchase_price).toFixed(2)}, selling Rs${oldSelling.toFixed(2)} to Rs${Number(priceUpdateForm.selling_price).toFixed(2)}.`);
    showAlert('Active prices updated successfully and logged in audit history.');
    setActiveForm('list');
  };

  const handleSchedulePriceUpdate = () => {
    if (!selectedProduct) return;
    const newSchedule = {
      id: 'sp_' + Date.now(),
      purchase_price: Number(scheduleForm.purchase_price),
      selling_price: Number(scheduleForm.selling_price),
      effective_date: scheduleForm.effective_date,
      applied: false
    };

    const updatedProducts = data.products.map(p => {
      if (p.id === selectedProduct.id) {
        const scheduledList = p.scheduled_prices || [];
        return { ...p, scheduled_prices: [...scheduledList, newSchedule].sort((a, b) => a.effective_date.localeCompare(b.effective_date)) };
      }
      return p;
    });

    let tempState = { ...data, products: updatedProducts };
    const details = `Future Price Scheduled: New rates (Purchase Rs${scheduleForm.purchase_price}, Selling Rs${scheduleForm.selling_price}) scheduled for effective date ${scheduleForm.effective_date}`;
    tempState = logAudit(tempState, 'PRICE_UPDATE', 'Product', selectedProduct.id, currentUser?.id || 'admin', details);

    setData(tempState);
    setSelectedProduct(prev => prev ? { ...prev, scheduled_prices: [...(prev.scheduled_prices || []), newSchedule].sort((a, b) => a.effective_date.localeCompare(b.effective_date)) } : null);
    addNotification('product_update', `${selectedProduct.name} has a new price scheduled to take effect ${scheduleForm.effective_date}.`);
    showAlert(`Price rate scheduled successfully for ${scheduleForm.effective_date}.`);
  };

  const handleCancelSchedule = (spId: string) => {
    if (!selectedProduct) return;
    const updatedProducts = data.products.map(p => {
      if (p.id === selectedProduct.id) {
        const scheduledList = p.scheduled_prices || [];
        return { ...p, scheduled_prices: scheduledList.filter(sp => sp.id !== spId) };
      }
      return p;
    });

    let tempState = { ...data, products: updatedProducts };
    tempState = logAudit(tempState, 'PRICE_UPDATE', 'Product', selectedProduct.id, currentUser?.id || 'admin', `Cancelled future price schedule (ID: ${spId})`);
    setData(tempState);
    setSelectedProduct(prev => prev ? { ...prev, scheduled_prices: (prev.scheduled_prices || []).filter(sp => sp.id !== spId) } : null);
    addNotification('product_update', `Scheduled price change for ${selectedProduct.name} was cancelled.`);
    showAlert('Future scheduled price has been cancelled successfully.');
  };

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800";

  return (
    <View className="gap-4">
      {activeForm === 'list' && (
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <View className="flex-1 relative justify-center">
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
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-4">
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
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-bold text-slate-500 text-xs">Category</Text>
                <Pressable onPress={handleOpenManageCategories}>
                  <Text className="text-[10px] font-bold text-indigo-600">Manage Categories</Text>
                </Pressable>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {data.categories.length === 0 && (
                  <Text className="text-[10px] text-slate-400 italic">No categories yet — tap "Manage Categories" to add one.</Text>
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
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-4">
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
                <Text className="font-bold text-slate-500 mb-1 text-xs">Wholesale Cost (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(priceUpdateForm.purchase_price)} onChangeText={v => setPriceUpdateForm({ ...priceUpdateForm, purchase_price: Number(v) || 0 })} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
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

          <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 gap-3">
            <Text className="font-bold text-slate-800 text-xs">Schedule Future Price Rate Change</Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Future Cost (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(scheduleForm.purchase_price)} onChangeText={v => setScheduleForm({ ...scheduleForm, purchase_price: Number(v) || 0 })} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Future Selling (Rs)</Text>
                <TextInput keyboardType="decimal-pad" value={String(scheduleForm.selling_price)} onChangeText={v => setScheduleForm({ ...scheduleForm, selling_price: Number(v) || 0 })} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-indigo-600 text-xs" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Eff. Date</Text>
                <TextInput value={scheduleForm.effective_date} onChangeText={v => setScheduleForm({ ...scheduleForm, effective_date: v })} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-600 text-xs" />
              </View>
            </View>
            <Pressable onPress={handleSchedulePriceUpdate} className="w-full py-2 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
              <Text className="text-white font-bold text-[11px]">Schedule Future Rate Change</Text>
            </Pressable>
          </View>

          <View className="bg-white p-3 rounded-xl border border-slate-150 gap-2">
            <View className="flex-row items-center gap-1">
              <Calendar size={14} color="#94a3b8" />
              <Text className="font-extrabold text-slate-600 uppercase tracking-wider text-[9px]">Future Scheduled Rates Timeline</Text>
            </View>
            {selectedProduct?.scheduled_prices && selectedProduct.scheduled_prices.length > 0 ? (
              selectedProduct.scheduled_prices.map(sp => (
                <View key={sp.id} className={`p-2.5 rounded-xl border flex-row items-center justify-between ${sp.applied ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                  <View>
                    <View className="flex-row items-center gap-1.5">
                      {sp.applied ? (
                        <View className="flex-row items-center gap-1">
                          <CheckCircle size={12} color="#059669" />
                          <Text className="font-bold text-emerald-600 text-[10px]">Active (Applied)</Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-1">
                          <Clock size={12} color="#d97706" />
                          <Text className="font-bold text-amber-600 text-[10px]">Scheduled Pending</Text>
                        </View>
                      )}
                      <Text className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1 rounded font-bold">Eff: {sp.effective_date}</Text>
                    </View>
                    <View className="flex-row gap-3 mt-1">
                      <Text className="text-[10px] font-bold text-slate-700">Cost: Rs{sp.purchase_price.toFixed(2)}</Text>
                      <Text className="text-[10px] font-bold text-slate-700">Selling: Rs{sp.selling_price.toFixed(2)}</Text>
                    </View>
                  </View>
                  {!sp.applied && (
                    <Pressable onPress={() => handleCancelSchedule(sp.id)} className="p-1.5 active:bg-rose-50 rounded-lg">
                      <Trash2 size={16} color="#f43f5e" />
                    </Pressable>
                  )}
                </View>
              ))
            ) : (
              <Text className="text-[10px] text-slate-400 italic py-1 text-center">No future price schedules created yet.</Text>
            )}
          </View>

          <View className="bg-slate-50 p-3 rounded-xl border border-slate-100 gap-2">
            <View className="flex-row items-center gap-1">
              <History size={14} color="#94a3b8" />
              <Text className="font-extrabold text-slate-600 uppercase tracking-wider text-[9px]">Audit Price Logs History</Text>
            </View>
            {data.auditLogs.filter(l => l.action === 'PRICE_UPDATE' && l.entity_id === selectedProduct?.id).map(l => {
              const actor = l.user_name && l.user_role ? { name: l.user_name, role: l.user_role } : resolveActor(data.users, l.user_id);
              return (
                <View key={l.id} className="p-2 bg-white rounded-lg border border-slate-100">
                  <Text className="font-bold text-slate-700 text-[10px]">{l.details}</Text>
                  <Text className="text-[8px] text-slate-400 mt-0.5">{new Date(l.timestamp).toLocaleString()} - By: {actor.role} - {actor.name}</Text>
                </View>
              );
            })}
            {data.auditLogs.filter(l => l.action === 'PRICE_UPDATE' && l.entity_id === selectedProduct?.id).length === 0 && (
              <Text className="text-[10px] text-slate-400 py-2 italic text-center">No price adjustment logs found for this item.</Text>
            )}
          </View>
        </View>
      ) : activeForm === 'manage_categories' ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-4">
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

          <View className="gap-2">
            {data.categories.map(cat => {
              const productCount = data.products.filter(p => p.category === cat.name).length;
              const isEditing = editingCategoryId === cat.id;
              return (
                <View key={cat.id} className="flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
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
        <View className="gap-3">
          {filteredProducts.map(p => {
            const wh = data.warehouse_inventory.find(i => i.product_id === p.id);
            const qty = wh ? wh.available_qty : 0;
            const isLow = qty > 0 && qty <= 100;
            const isOut = qty === 0;

            return (
              <View key={p.id} className="bg-white rounded-2xl p-3 border border-slate-200 flex-row gap-3">
                <Image source={{ uri: p.image_url }} className="w-16 h-16 rounded-xl bg-slate-50" />
                <View className="flex-1">
                  <View className="flex-row items-start justify-between gap-1">
                    <Text className="font-bold text-slate-800 text-xs flex-1" numberOfLines={1}>{p.name}</Text>
                    <Text className="text-[9px] bg-slate-100 font-bold px-1.5 py-0.5 rounded text-slate-400 uppercase">{p.code}</Text>
                  </View>
                  <Text className="text-[10px] text-slate-400 mt-0.5">{p.brand} - {p.category} - {p.unit_value}{p.unit_type}</Text>
                  <View className="flex-row items-center justify-between mt-2 pt-1.5 border-t border-slate-50">
                    <View className="flex-row gap-3">
                      <View>
                        <Text className="text-slate-400 text-[9px]">Wholesale Cost</Text>
                        <Text className="font-semibold text-slate-600 text-[10px]">Rs {p.purchase_price.toFixed(2)}</Text>
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
                      <Pressable onPress={() => handleOpenPriceUpdate(p)} className="p-1.5 bg-indigo-50 rounded-lg active:bg-indigo-100">
                        <DollarSign size={14} color="#4f46e5" />
                      </Pressable>
                      {activeScreen !== 'Pricing' && (
                        <>
                          <Pressable onPress={() => handleOpenEditProduct(p)} className="p-1.5 bg-slate-50 rounded-lg active:bg-slate-100">
                            <Edit size={14} color="#475569" />
                          </Pressable>
                          <Pressable onPress={() => setDeleteProductConfirmId(p.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                            <Trash2 size={14} color="#e11d48" />
                          </Pressable>
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
        title="Confirm Product Deletion"
        message={`Are you sure you want to delete "${data.products.find(p => p.id === deleteProductConfirmId)?.name || 'this product'}" from the catalog? This cannot be undone.`}
        confirmLabel="Yes, Delete"
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

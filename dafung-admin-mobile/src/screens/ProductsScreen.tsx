import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';
import { AddProductModal } from '../components/AddProductModal';
import { EditProductModal } from '../components/EditProductModal';
import { api, EnrichedProductItem } from '../api/client';

export const ProductsScreen: React.FC = () => {
  const [products, setProducts] = useState<EnrichedProductItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'manual' | 'supplier'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<EnrichedProductItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.getProducts();
      setProducts(res.products || []);
    } catch (err) {
      console.warn('Error loading products:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadProducts();
  };

  const handleToggleProduct = async (product: EnrichedProductItem) => {
    try {
      await api.toggleProduct(product.id);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      loadProducts();
    } catch (err) {
      Alert.alert('Gagal Mengubah Status', (err as Error).message);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (filterType === 'manual' && !p.is_manual) return false;
    if (filterType === 'supplier' && p.is_manual) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return p.name.toLowerCase().includes(s) || p.platformName?.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={typography.screenTitle}>Katalog Produk</Text>
          <Text style={styles.headerSub}>Produk supplier API dan produk manual</Text>
        </View>

        <Pressable
          style={styles.addBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.addBtnText}>Tambah</Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={17} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama produk atau kategori..."
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextActive]}>
            Semua ({products.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, filterType === 'manual' && styles.filterChipActive]}
          onPress={() => setFilterType('manual')}
        >
          <Text style={[styles.filterChipText, filterType === 'manual' && styles.filterChipTextActive]}>
            Produk Manual ({products.filter((p) => p.is_manual).length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, filterType === 'supplier' && styles.filterChipActive]}
          onPress={() => setFilterType('supplier')}
        >
          <Text style={[styles.filterChipText, filterType === 'supplier' && styles.filterChipTextActive]}>
            Supplier ({products.filter((p) => !p.is_manual).length})
          </Text>
        </Pressable>
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.productRow, pressed && { backgroundColor: colors.surfaceMuted }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setSelectedProduct(item);
                setShowEditModal(true);
              }}
            >
              <View style={styles.prodLeft}>
                <View style={styles.titleRow}>
                  <Text style={typography.feedName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.is_manual ? (
                    <View style={styles.manualBadge}>
                      <Text style={styles.manualText}>Manual</Text>
                    </View>
                  ) : (
                    <View style={styles.supplierBadge}>
                      <Text style={styles.supplierText}>API</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.descText} numberOfLines={2}>
                  {item.description || item.warrantyText || 'Produk digital aktif'}
                </Text>

                <Text style={typography.timestamp}>
                  Stok: {item.availability === 'in_stock' ? item.stock || 'Tersedia' : 'Habis'} · Sentuh untuk kelola
                </Text>
              </View>

              <View style={styles.prodRight}>
                <Text style={[typography.amount, styles.priceText]}>
                  {formatIDR(item.sellingPrice || item.price_idr)}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                  <Pressable
                    style={styles.toggleBtn}
                    onPress={() => handleToggleProduct(item)}
                  >
                    <Text style={styles.toggleText}>
                      {item.availability === 'in_stock' ? 'Aktif' : 'Off'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.toggleBtn, { backgroundColor: colors.blueTint, borderColor: 'rgba(0, 140, 255, 0.25)' }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedProduct(item);
                      setShowEditModal(true);
                    }}
                  >
                    <Ionicons name="pencil" size={13} color={colors.blue} />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Tidak ada produk</Text>
              <Text style={styles.emptySub}>
                {search ? 'Tidak ada produk sesuai pencarian.' : 'Katalog masih kosong.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Add Product Modal */}
      <AddProductModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadProducts}
      />

      {/* Edit / Manage Product Modal */}
      <EditProductModal
        visible={showEditModal}
        product={selectedProduct}
        onClose={() => setShowEditModal(false)}
        onSuccess={loadProducts}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 10,
    backgroundColor: colors.canvas,
  },
  headerSub: {
    ...typography.timestamp,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: colors.blue,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
    alignItems: 'center',
  },
  prodLeft: {
    flex: 1,
    marginRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  manualBadge: {
    backgroundColor: colors.blueTint,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  manualText: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '700',
  },
  supplierBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  supplierText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  descText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginVertical: 2,
  },
  prodRight: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontVariant: ['tabular-nums'],
    marginBottom: 6,
  },
  toggleBtn: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});

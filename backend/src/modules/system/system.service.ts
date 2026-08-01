import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';

// Mirrors handleClearWarehouseStock(): zeroes every pool for every product
// without deleting the WarehouseInventory rows themselves.
export async function clearWarehouseStock(actorId: string) {
  await prisma.warehouseInventory.updateMany({
    data: { available_qty: 0, available_pieces: 0, reserved_qty: 0, reserved_pieces: 0, damaged_qty: 0, damaged_pieces: 0, expired_qty: 0, expired_pieces: 0 },
  });
  await logAudit({
    action: 'STOCK_RESET_ZERO', entity_type: 'Warehouse', entity_id: 'all', user_id: actorId,
    details: 'Manually cleared all warehouse inventory levels to zero',
  });
}

// Mirrors handleFactoryResetAllData(): wipes all transactional/business data
// (orders, invoices, payments, purchases, pre-bookings, visits, stores,
// suppliers, notifications, truck cargo) and resets warehouse pools to zero,
// while leaving Users, Products, Categories, Trucks and QR settings intact.
export async function factoryReset(actorId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  const actorName = actor ? actor.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : actorId;
  const actorRole = actor ? actor.role : 'Unknown';

  await prisma.$transaction(async tx => {
    await tx.payment.deleteMany();
    await tx.invoice.deleteMany();
    await tx.order.deleteMany();
    await tx.preBookingOrder.deleteMany();
    // Must go before purchase/supplier deletion below - PurchaseOrderRequest
    // has RESTRICT foreign keys to both (fulfilled_purchase_id, supplier_id),
    // so deleting either first throws a foreign-key constraint error.
    await tx.purchaseOrderRequest.deleteMany();
    await tx.purchase.deleteMany();
    await tx.creditLedger.deleteMany();
    await tx.storeVisit.deleteMany();
    // Asset/partner inventory + movement history + assignment history all
    // reference Store (assigned_partner_id/partner_id) and/or Asset - must be
    // cleared before store/asset deletion below. PartnerType/AssetType are
    // preserved (lookup/catalog data, same tier as Area/Product/Category).
    await tx.assetAssignmentHistory.deleteMany();
    await tx.assetInventory.deleteMany();
    await tx.partnerInventory.deleteMany();
    await tx.inventoryMovement.deleteMany();
    await tx.asset.deleteMany();
    await tx.store.deleteMany();
    await tx.supplier.deleteMany();
    await tx.appNotification.deleteMany();
    await tx.truckInventory.deleteMany();
    await tx.warehouseInventory.updateMany({ data: { available_qty: 0, available_pieces: 0, reserved_qty: 0, reserved_pieces: 0, damaged_qty: 0, damaged_pieces: 0, expired_qty: 0, expired_pieces: 0 } });
    await tx.auditLog.deleteMany();
    await tx.auditLog.create({
      data: {
        action: 'FACTORY_RESET', entity_type: 'System', entity_id: 'all', user_id: actorId,
        user_name: actorName, user_role: actorRole,
        details: 'Performed factory reset. All databases cleared for a completely new, empty setup.',
      },
    });
  });
}

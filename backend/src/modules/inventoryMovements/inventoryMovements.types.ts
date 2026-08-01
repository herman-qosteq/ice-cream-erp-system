import { StockLocationType } from '@prisma/client';
import { BoxPieceQty } from '../../utils/pieceQty';

export interface MoveStockInput {
  from_type: StockLocationType;
  from_id?: string | null;
  to_type: StockLocationType;
  to_id?: string | null;
  product_id: string;
  qty: BoxPieceQty;
  reason?: string;
}

import { Request, Response } from 'express';
import * as systemService from './system.service';

export async function clearWarehouseStock(req: Request, res: Response) {
  await systemService.clearWarehouseStock(req.auth!.sub);
  res.json({ ok: true });
}

export async function factoryReset(req: Request, res: Response) {
  await systemService.factoryReset(req.auth!.sub);
  res.json({ ok: true });
}

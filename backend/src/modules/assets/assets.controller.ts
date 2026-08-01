import { Request, Response } from 'express';
import { z } from 'zod';
import * as assetsService from './assets.service';
import { isPaginationRequested } from '../../utils/pagination';
import { ApiError } from '../../utils/ApiError';

const assetSchema = z.object({
  name: z.string().min(1, 'Asset name is required.'),
  code: z.string().min(1, 'Asset code is required.'),
  asset_type: z.string().min(1, 'Asset type is required.'),
  serial_number: z.string().optional(),
  capacity: z.string().optional(),
  notes: z.string().optional(),
});

const updateAssetSchema = assetSchema.partial().extend({ last_service_date: z.string().optional() });

const assignSchema = z.object({ partner_id: z.string().min(1), notes: z.string().optional() });
const noteOnlySchema = z.object({ notes: z.string().optional() });

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  if (isPaginationRequested(req.query as Record<string, unknown>)) {
    res.json(await assetsService.listAssetsPaged(req.query as Record<string, unknown>));
  } else {
    res.json(await assetsService.listAssets());
  }
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(assetSchema, req.body);
  res.status(201).json(await assetsService.createAsset(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(updateAssetSchema, req.body);
  res.json(await assetsService.updateAsset(req.params.id, input, req.auth!.sub));
}

export async function assign(req: Request, res: Response) {
  const input = parseOr400(assignSchema, req.body);
  res.json(await assetsService.assignAsset({ asset_id: req.params.id, ...input }, req.auth!.sub));
}

export async function returnAsset(req: Request, res: Response) {
  const input = parseOr400(noteOnlySchema, req.body);
  res.json(await assetsService.returnAsset({ asset_id: req.params.id, ...input }, req.auth!.sub));
}

export async function maintenanceStart(req: Request, res: Response) {
  const input = parseOr400(noteOnlySchema, req.body);
  res.json(await assetsService.setMaintenance(req.params.id, req.auth!.sub, input.notes));
}

export async function maintenanceEnd(req: Request, res: Response) {
  const input = parseOr400(noteOnlySchema, req.body);
  res.json(await assetsService.endMaintenance(req.params.id, req.auth!.sub, input.notes));
}

export async function markLost(req: Request, res: Response) {
  const input = parseOr400(noteOnlySchema, req.body);
  res.json(await assetsService.markLost(req.params.id, req.auth!.sub, input.notes));
}

export async function reactivate(req: Request, res: Response) {
  const input = parseOr400(noteOnlySchema, req.body);
  res.json(await assetsService.reactivateAsset(req.params.id, req.auth!.sub, input.notes));
}

export async function deactivate(req: Request, res: Response) {
  const input = parseOr400(noteOnlySchema, req.body);
  res.json(await assetsService.deactivateAsset(req.params.id, req.auth!.sub, input.notes));
}

export async function history(req: Request, res: Response) {
  res.json(await assetsService.listAssetHistory(req.params.id));
}

export async function inventory(req: Request, res: Response) {
  res.json(await assetsService.listAssetInventory(req.params.id));
}

export async function inventorySummary(req: Request, res: Response) {
  res.json(await assetsService.getInventorySummary());
}

export async function allInventory(req: Request, res: Response) {
  res.json(await assetsService.listAllAssetInventory());
}

export async function allHistory(req: Request, res: Response) {
  res.json(await assetsService.listAllAssetHistory());
}

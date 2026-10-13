import type { Request, Response } from 'express';
import { EquipmentCodeParam } from '../models/schemas.js';
import { getEquipmentByCode, listEquipment } from '../services/equipment.service.js';
import { equipmentUrl, generateEquipmentQrSvg } from '../services/qr.service.js';

export async function list(_req: Request, res: Response) {
  res.json(await listEquipment());
}

export async function detail(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  res.json({ ...(await getEquipmentByCode(code)), qrUrl: await equipmentUrl(code) });
}

export async function qrCode(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  res.type('image/svg+xml').send(await generateEquipmentQrSvg(code));
}

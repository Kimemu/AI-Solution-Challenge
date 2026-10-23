import { handleApi } from '../../../lib/strategy-server';
export const dynamic='force-dynamic';
async function dispatch(request:Request,context:any){const params=await context.params;return handleApi(request,(params.path||[]).join('/'))}
export const GET=dispatch;export const POST=dispatch;export const PATCH=dispatch;

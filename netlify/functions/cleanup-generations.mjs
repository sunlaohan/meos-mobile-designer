import { createGenerationJobs } from '../../server/generation-jobs.mjs';
export default async () => { await createGenerationJobs(process.env).cleanup(); return new Response(null, { status: 204 }); };
export const config = { schedule: '*/15 * * * *' };

import postgres from 'postgres';
import { createService } from '../../../server/service.ts';
// Each request closes its one connection. This protects the existing shared project
// from idle connections across many Edge isolates. Credentials remain server-only.
Deno.serve(async (request: Request) => {
 const connection = Deno.env.get('SUPABASE_DB_URL');
 if (!connection) return Response.json({error:'Database is not configured.'},{status:503});
 const sql = postgres(connection,{prepare:false,max:1,idle_timeout:1,connect_timeout:15,max_lifetime:30});
 try {return await createService(sql as any)(request)} finally {await sql.end({timeout:2})}
});

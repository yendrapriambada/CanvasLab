export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function api<T=any>(action:string,data:Record<string,unknown>={}):Promise<T>{
  const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action,...data})});
  if(response.status===413)throw new ApiError('This request is too large for the hosting service. Try a smaller image or board export.',413);
  const result=await response.json().catch(()=>({error:'The server returned an invalid response. Please try again.'}));
  if(!response.ok)throw new ApiError(result.error||result.message||'Request failed',response.status);
  return result as T;
}

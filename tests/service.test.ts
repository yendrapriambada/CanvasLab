import { describe, expect, it, vi } from 'vitest';
import { createService, detectImage, fromBase64, toBase64 } from '../server/service';

describe('private API request boundary', () => {
  const database = () => ({ unsafe: vi.fn(), begin: vi.fn() });
  it('rejects unauthenticated requests before any database access', async () => {
    const db=database(); const service=createService(db);
    const response=await service(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'scene.load',board_id:crypto.randomUUID()})}));
    expect(response.status).toBe(401);expect(db.unsafe).not.toHaveBeenCalled();expect(db.begin).not.toHaveBeenCalled();
  });
  it('rejects cross-site simple form requests', async () => {
    const db=database(); const response=await createService(db)(new Request('http://localhost/api',{method:'POST',body:'action=auth.logout'}));
    expect(response.status).toBe(415);expect(db.unsafe).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized JSON before authorization', async () => {
    const service=createService(database());
    const malformed=await service(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":'}));
    expect(malformed.status).toBe(400);
    const oversized=await service(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json','content-length':'18000001'},body:'{}'}));
    expect(oversized.status).toBe(413);
  });
  it('does not return database error details', async () => {
    const db=database();db.unsafe.mockRejectedValue(new Error('SECRET_DATABASE_CONNECTION'));
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    const response=await createService(db)(new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json','x-board-session':'invalid'},body:'{"action":"auth.me"}'}));
    expect(response.status).toBe(500);expect(await response.text()).not.toContain('SECRET_DATABASE_CONNECTION');log.mockRestore();
  });
});

describe('asset validation', () => {
  it('rejects SVG, HTML, malformed base64, and excessive data', () => {
    expect(detectImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectImage(new TextEncoder().encode('<html><script>bad</script>'))).toBeNull();
    expect(()=>fromBase64('@@@@')).toThrow();expect(()=>fromBase64('YWJjZA==',2)).toThrow();
  });
  it('recognizes raster signatures independently of the claimed MIME', () => {
    expect(detectImage(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]))).toBe('image/png');
    expect(detectImage(new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0]))).toBe('image/jpeg');
    expect(detectImage(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp');
  });
  it('round-trips large binary updates without truncation', () => {
    const bytes=new Uint8Array(500000);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

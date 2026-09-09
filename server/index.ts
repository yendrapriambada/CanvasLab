import 'dotenv/config';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {app,server,closeGateway} from './gateway.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.NODE_ENV==='production'){
 app.use(express.static(path.join(root,'dist')));
 app.get('/{*path}',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
}else{
 const {createServer:createVite}=await import('vite');
 const vite=await createVite({server:{middlewareMode:true,hmr:{server}},appType:'spa'});
 app.use(vite.middlewares);
}
const port=Number(process.env.PORT||3000);
server.listen(port,'0.0.0.0',()=>console.log(`CanvasLab listening on http://localhost:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await closeGateway();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref()});

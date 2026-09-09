import * as Y from 'yjs';
import {bytesToBase64,makeTemplate} from '../src/lib/model';
const base=process.env.BASE_URL||'http://localhost:3000';
const email=process.env.CANVASLAB_SEED_EMAIL,password=process.env.CANVASLAB_SEED_PASSWORD;
if(!email||!password||password.length<8)throw Error('Set CANVASLAB_SEED_EMAIL and CANVASLAB_SEED_PASSWORD (at least 8 characters). No fixed seed password is supplied.');
let cookie='';
async function api(action:string,data:Record<string,unknown>={}){const r=await fetch(`${base}/api`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action,...data})});const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error||'Request failed'),{status:r.status});cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;return body;}
try{await api('auth.register',{email,password,name:'Workshop facilitator'})}catch(e){if((e as {status:number}).status!==409)throw e;await api('auth.login',{email,password})}
const dashboard=await api('dashboard');const project=dashboard.projects.find((p:{name:string})=>p.name==='Example workshops')||(await api('project.create',{workspace_id:dashboard.workspaces[0].id,name:'Example workshops',description:'Editable examples for learning the canvas',color:'#8a6dcc',is_private:true})).project;
for(const [template,name]of [['brainstorming','Workshop Digital Product'],['team','Team canvas'],['flowchart','Business process'],['journey','Customer journey']]){if(dashboard.boards.some((b:{name:string;project_id:string})=>b.name===name&&b.project_id===project.id))continue;await api('board.create',{project_id:project.id,name,initial_update:bytesToBase64(Y.encodeStateAsUpdate(makeTemplate(template)))});}
console.log('Example workshops are ready in your private project. Sign in with the credentials you supplied.');

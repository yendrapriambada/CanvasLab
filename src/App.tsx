import {Component,useEffect,useState,type ReactNode} from 'react';
import {LoaderCircle,RotateCcw} from 'lucide-react';
import {api} from './lib/api';
import type {User} from './lib/types';
import Auth from './auth/Auth';
import Dashboard from './dashboard/Dashboard';
import BoardEditor from './editor/BoardEditor';
class ErrorBoundary extends Component<{children:ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return{error:e.message}}render(){return this.state.error?<main className="app-error"><h1>Let’s get you back to your board.</h1><p>{this.state.error}</p><button className="primary" onClick={()=>location.reload()}><RotateCcw size={18}/>Reload CanvasLab</button></main>:this.props.children}}
function Router(){const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[path,setPath]=useState(location.pathname),[error,setError]=useState('');
 useEffect(()=>{void api('auth.me').then(r=>setUser(r.user)).catch(e=>{if(e.status!==401)setError(e.message)}).finally(()=>setLoading(false));const pop=()=>setPath(location.pathname);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 const navigate=(url:string)=>{history.pushState({},'',url);setPath(url)};
 useEffect(()=>{if(user&&path.startsWith('/share/')){const token=path.split('/')[2];void api('board.link_accept',{token}).then(r=>navigate(`/board/${r.board?.id||r.board_id}`)).catch(e=>setError(e.message))}},[user,path]);
 const logout=async()=>{await api('auth.logout');const dbs=await indexedDB.databases?.();for(const db of dbs||[])if(db.name?.startsWith(`canvaslab:${user?.id}:`))indexedDB.deleteDatabase(db.name);setUser(null);navigate('/')};
 if(loading)return <main className="app-loading"><div className="brand-mark">c</div><LoaderCircle className="spin"/><p>Opening your workspace…</p></main>;
 if(!user)return <><Auth onLogin={setUser}/>{error&&<div className="global-error" role="alert" onClick={()=>setError('')}>{error}</div>}</>;
 const boardId=path.match(/^\/board\/([\w-]+)/)?.[1];
 return <>{boardId?<BoardEditor key={boardId} boardId={boardId} user={user} onBack={()=>navigate('/')}/>:<Dashboard user={user} onOpenBoard={id=>navigate(`/board/${id}`)} onLogout={()=>void logout()}/ >}{error&&<div className="global-error" role="alert" onClick={()=>setError('')}>{error}</div>}</>;
}
export default function App(){return <ErrorBoundary><Router/></ErrorBoundary>}

import { useEffect, useState } from "react";
import { Prelude } from "./components/Prelude";
import { MirrorAxis } from "./components/MirrorAxis";
import { Glyphs } from "./components/Glyphs";
import { Score } from "./components/Score";
import { useAppData } from "./useData";
import type { Route } from "./types";

const nav:Array<{route:Route;label:string;en:string}>=[
  {route:"home",label:"戏脉长卷",en:"PRELUDE"},
  {route:"lineage",label:"镜轴关系",en:"LINEAGE"},
  {route:"fingerprint",label:"纹章指纹",en:"GLYPH"},
  {route:"heartbeat",label:"场次乐谱",en:"SCORE"}
];

function App(){
  const {data,error}=useAppData();
  const initialRoute=nav.some(item=>item.route===location.hash.replace("#",""))?location.hash.replace("#","") as Route:"home";
  const [route,setRoute]=useState<Route>(initialRoute);
  const [selectedTitle,setSelectedTitle]=useState("宇宙锋");

  const go=(next:Route,behavior:ScrollBehavior="auto")=>{
    setRoute(next);
    history.replaceState(null,"",`#${next}`);
    window.scrollTo({top:0,behavior});
  };

  useEffect(()=>{
    const onHash=()=>{
      const hash=location.hash.replace("#","");
      if(nav.some(item=>item.route===hash)){
        setRoute(hash as Route);
        window.scrollTo({top:0,behavior:"auto"});
      }
    };
    addEventListener("hashchange",onHash);
    return()=>removeEventListener("hashchange",onHash);
  },[]);

  if(error)return <main className="load-state error"><span>数据加载失败</span><strong>{error}</strong><p>请通过 Vite 或本地 HTTP 服务打开。</p></main>;
  if(!data)return <main className="load-state"><div className="ink-loader"><i/><i/><i/></div><span>正在展开戏脉长卷</span></main>;

  return <div className="app-shell">
    <div className="paper-grain" aria-hidden="true"/>
    <header className="work-header">
      <button className="work-mark" onClick={()=>go("home")}><span>戏</span><b>戏脉</b><small>THE LINEAGE OF PEKING OPERA</small></button>
      <nav>{nav.map((item)=><button key={item.route} className={route===item.route?"is-active":""} onClick={()=>go(item.route)}><span>{item.label}</span><small>{item.en}</small></button>)}</nav>
    </header>
    <main className="route-viewport" key={route}>
      {route==="home"&&<Prelude data={data} onEnter={go}/>}
      {route==="lineage"&&<MirrorAxis data={data} selectedTitle={selectedTitle} onTitleChange={setSelectedTitle}/>}
      {route==="fingerprint"&&<Glyphs data={data}/>}
      {route==="heartbeat"&&<Score data={data}/>}
    </main>
  </div>
}

export default App;

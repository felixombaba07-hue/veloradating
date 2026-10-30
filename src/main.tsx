import React, { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { Heart, MessageCircle, Compass, Gift, Crown, LogOut, ShieldCheck, Search, Send, UserCircle, Wallet, RefreshCw } from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase';
import './style.css';

type Profile = { id:string; display_name:string; age?:number; gender?:string; country:string; city:string|null; bio:string; interests:string[]; avatar_url:string|null };
type Match = { id:string; user_one:string; user_two:string; created_at:string };
const interests=['Travel','Music','Art','Books','Food','Beach','Photography','Nature','Fitness','Movies','Coffee','Technology'];

function App(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [mode,setMode]=useState<'login'|'signup'>('signup'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[dob,setDob]=useState(''),[name,setName]=useState(''),[gender,setGender]=useState('prefer_not_to_say'),[country,setCountry]=useState('Kenya');
 const [profile,setProfile]=useState<Profile|null>(null),[page,setPage]=useState('Discover'),[people,setPeople]=useState<Profile[]>([]),[matches,setMatches]=useState<Match[]>([]),[wallet,setWallet]=useState(0),[gifts,setGifts]=useState<any[]>([]);
 const [selectedMatch,setSelectedMatch]=useState<Match|null>(null),[messages,setMessages]=useState<any[]>([]),[draft,setDraft]=useState(''),[search,setSearch]=useState('');
 const tell=(s:string)=>setNotice(s);
 useEffect(()=>{ if(!supabase){setLoading(false);return;} supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false);}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(session) loadAccount(); else {setProfile(null);setPeople([]);}},[session]);
 async function loadAccount(){
  if(!supabase||!session)return;
  const {data,error}=await supabase.from('profiles').select('id,display_name,gender,country,city,bio,interests,avatar_url').eq('id',session.user.id).maybeSingle();
  if(error){tell(error.message);return;} setProfile(data);
  const [{data:w},{data:m},{data:g}]=await Promise.all([
   supabase.from('wallets').select('balance').eq('user_id',session.user.id).maybeSingle(),
   supabase.from('matches').select('*').or('user_one.eq.'+session.user.id+',user_two.eq.'+session.user.id).order('created_at',{ascending:false}),
   supabase.from('gifts').select('*').eq('is_active',true).order('coin_cost')
  ]);
  setWallet(w?.balance||0);setMatches(m||[]);setGifts(g||[]);
  await loadPeople();
 }
 async function loadPeople(){
  if(!supabase||!session)return;
  const {data,error}=await supabase.from('discover_profiles').select('id,display_name,age,country,city,bio,interests,avatar_url,is_verified,created_at').neq('id',session.user.id).order('created_at',{ascending:false}).limit(60);
  if(error){tell(error.message);return;} setPeople(data||[]);
 }
 async function authSubmit(e:FormEvent){
  e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');
  try{
   if(mode==='signup'){
    const years=(Date.now()-new Date(dob).getTime())/31557600000;
    if(!dob||!Number.isFinite(years)||years<18){tell('VELORA is strictly for adults aged 18 and over.');return;}
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{date_of_birth:dob,display_name:name,gender,country}}});
    if(error)throw error;
    if(data.session)tell('Account created. Complete your profile to get started.');
    else tell('Check your email to confirm your account. Your account will not be created unless you meet the 18+ requirement.');
   }else{
    const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
   }
  }catch(err:any){tell(err.message||'Unable to authenticate.');}finally{setBusy(false);}
 }
 async function saveProfile(e:FormEvent){
  e.preventDefault();if(!supabase||!profile)return;setBusy(true);
  const {error}=await supabase.from('profiles').update({display_name:profile.display_name,country:profile.country,city:profile.city,bio:profile.bio,interests:profile.interests,updated_at:new Date().toISOString()}).eq('id',profile.id);
  setBusy(false);tell(error?error.message:'Profile saved.');if(!error)loadAccount();
 }
 async function like(p:Profile){
  if(!supabase||!session)return;
  const {error}=await supabase.from('likes').insert({from_user:session.user.id,to_user:p.id});
  if(error&&error.code!=='23505'){tell(error.message);return;}
  const {data}=await supabase.from('matches').select('*').or('user_one.eq.'+session.user.id+',user_two.eq.'+session.user.id);
  setMatches(data||[]);tell('Interest sent. If they like you back, you will match.');
  setPeople(prev=>prev.filter(x=>x.id!==p.id));
 }
 async function pass(p:Profile){setPeople(prev=>prev.filter(x=>x.id!==p.id));}
 async function openChat(m:Match){
  if(!supabase||!session)return;setSelectedMatch(m);setPage('Messages');
  const {data,error}=await supabase.from('messages').select('*').eq('match_id',m.id).order('created_at');
  if(error){tell(error.message);return;}setMessages(data||[]);
 }
 useEffect(()=>{
  const client=supabase;
  if(!client||!selectedMatch)return;
  const channel=client.channel('chat-'+selectedMatch.id).on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'match_id=eq.'+selectedMatch.id},payload=>{
   if(payload.eventType==='INSERT')setMessages(prev=>prev.some(x=>x.id===payload.new.id)?prev:[...prev,payload.new]);
  }).subscribe();
  return()=>{void client.removeChannel(channel);};
 },[selectedMatch?.id]);
 async function sendMessage(e:FormEvent){
  e.preventDefault();if(!supabase||!session||!selectedMatch||!draft.trim())return;
  const {error}=await supabase.from('messages').insert({match_id:selectedMatch.id,sender_id:session.user.id,body:draft.trim()});
  if(error)tell(error.message);else setDraft('');
 }
 async function signOut(){await supabase?.auth.signOut();setSession(null);setPage('Discover');}
 if(loading)return <div className="gate"><div className="gate-card">Loading VELORA…</div></div>;
 if(!supabaseConfigured)return <div className="gate"><div className="gate-card"><div className="mark">V</div><p className="eyebrow">VELORA SETUP REQUIRED</p><h1>Connect the real services.</h1><p className="muted">This app now uses Supabase for real accounts and data. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your deployment environment, then apply the SQL migration in supabase/migrations.</p><p className="gate-foot"><ShieldCheck/> No preview accounts or fake profiles are enabled.</p></div></div>;
 if(!session)return <div className="gate"><div className="gate-card"><div className="mark">V</div><p className="eyebrow">VELORA · ADULT COMMUNITY</p><h1>{mode==='signup'?'A space for real connections.':'Welcome back.'}</h1><p className="muted">VELORA is restricted to verified-eligible adults aged 18 and over.</p><form onSubmit={authSubmit}>
 {mode==='signup'&&<><label>Display name</label><input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={40}/><label>Date of birth</label><input type="date" value={dob} max={new Date().toISOString().slice(0,10)} onChange={e=>setDob(e.target.value)} required/><label>Gender</label><select value={gender} onChange={e=>setGender(e.target.value)}><option value="prefer_not_to_say">Prefer not to say</option><option value="woman">Woman</option><option value="man">Man</option><option value="non_binary">Non-binary</option></select><label>Country</label><input value={country} onChange={e=>setCountry(e.target.value)} required/></>}
 <label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/><button className="primary" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create adult account':'Sign in'}</button></form><button className="switch" onClick={()=>setMode(mode==='signup'?'login':'signup')}>{mode==='signup'?'Already registered? Sign in':'New to VELORA? Create an account'}</button>{notice&&<p className="error">{notice}</p>}<div className="gate-foot"><ShieldCheck/> Server-side age enforcement is required for account creation.</div></div></div>;
 const filtered=people.filter(p=>(p.display_name+' '+(p.city||'')+' '+p.interests.join(' ')).toLowerCase().includes(search.toLowerCase()));
 return <div className="shell"><aside className="sidebar"><div className="brand"><div className="mark mini">V</div> VELORA</div><p className="side-label">YOUR SPACE</p><nav>{[['Discover',Compass],['Matches',Heart],['Messages',MessageCircle],['Gifts',Gift],['VIP Club',Crown],['My Profile',UserCircle],['Wallet',Wallet]].map(([label,Icon]:any)=><button key={label} className={page===label?'nav active':'nav'} onClick={()=>setPage(label)}><Icon size={19}/>{label}</button>)}</nav><div className="vip"><Crown/><b>Your VELORA wallet</b><p>{wallet.toLocaleString()} coins available</p><button onClick={()=>setPage('Wallet')}>View wallet →</button></div><button className="nav" onClick={signOut}><LogOut size={18}/> Sign out</button></aside>
 <main><header><div className="crumb">Your world <span>/</span> {page}</div><div className="tools"><div className="search"><Search size={16}/><input placeholder="Search profiles" value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="user">{profile?.display_name?.[0]?.toUpperCase()||'V'}</span></div></header>
 {page==='Discover'&&<div className="content"><div className="welcome"><div><p className="eyebrow">REAL PEOPLE · REAL ACCOUNTS</p><h1>Discover <em>VELORA.</em></h1><p className="muted">Profiles are loaded from the connected database. No demo accounts.</p></div><button className="filter" onClick={loadPeople}><RefreshCw size={16}/> Refresh</button></div><div className="layout"><section className="feature">{filtered.length?filtered.slice(0,1).map(p=><React.Fragment key={p.id}><div className="photo">{p.avatar_url?<img src={p.avatar_url} alt="Member profile"/>:<div className="avatar-empty"><UserCircle size={80}/></div>}<div className="shade"/><div className="caption"><div><h2>{p.display_name}, {(p.age||18)}</h2><p>{p.city? p.city+', ':''}{p.country}</p></div></div></div><div className="details"><p>{p.bio||'This member has not added a bio yet.'}</p><div className="tags">{p.interests.map(t=><span key={t}>{t}</span>)}</div><div className="actions"><button onClick={()=>pass(p)} aria-label="Pass">×</button><button className="heart" onClick={()=>like(p)} aria-label="Like"><Heart fill="currentColor"/></button></div><small>Only mutual likes create a match.</small></div></React.Fragment>):<div className="empty"><h2>No profiles to show</h2><p className="muted">Try refreshing later or changing your search.</p><button className="primary" onClick={loadPeople}>Refresh profiles</button></div>}</section><section className="people"><div className="people-head"><div><p className="eyebrow">YOUR ACCOUNT</p><h3>{profile?.display_name||'Your profile'}</h3></div><ShieldCheck/></div><p className="muted">Your account is connected. Finish your profile so other members can learn about you.</p><button className="primary" onClick={()=>setPage('My Profile')}>Edit profile</button><div className="quote">Your information is protected by account-level access policies.<small>VELORA PRIVACY</small></div></section></div></div>}
 {page==='My Profile'&&<div className="content"><h1>My <em>profile</em></h1><form className="profile-form" onSubmit={saveProfile}><label>Display name</label><input value={profile?.display_name||''} onChange={e=>setProfile(profile?{...profile,display_name:e.target.value}:null)}/><label>Country</label><input value={profile?.country||''} onChange={e=>setProfile(profile?{...profile,country:e.target.value}:null)}/><label>City</label><input value={profile?.city||''} onChange={e=>setProfile(profile?{...profile,city:e.target.value}:null)}/><label>About you</label><textarea maxLength={500} value={profile?.bio||''} onChange={e=>setProfile(profile?{...profile,bio:e.target.value}:null)}/><label>Interests</label><div className="filters">{interests.map(t=><button type="button" className={profile?.interests.includes(t)?'chosen':''} key={t} onClick={()=>setProfile(profile?{...profile,interests:profile.interests.includes(t)?profile.interests.filter(x=>x!==t):[...profile.interests,t]}:null)}>{t}</button>)}</div><button className="primary" disabled={busy}>Save profile</button></form></div>}
 {page==='Matches'&&<div className="content"><h1>Your <em>matches</em></h1>{matches.length?matches.map(m=><button className="person" key={m.id} onClick={()=>openChat(m)}><Heart/><span><b>Mutual match</b><small>Matched {new Date(m.created_at).toLocaleDateString()}</small></span><MessageCircle/></button>):<p className="muted">No mutual matches yet. When two adults like each other, the match appears here.</p>}</div>}
 {page==='Messages'&&<div className="content"><h1>Your <em>messages</em></h1>{selectedMatch?<><div className="chat-list">{messages.map(m=><div className={m.sender_id===session.user.id?'bubble mine':'bubble'} key={m.id}>{m.body}<small>{new Date(m.created_at).toLocaleString()}</small></div>)}</div><form className="chat-send" onSubmit={sendMessage}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000}/><button className="primary"><Send size={16}/></button></form></>:<><p className="muted">Choose a mutual match to open its conversation.</p>{matches.map(m=><button className="person" key={m.id} onClick={()=>openChat(m)}><MessageCircle/><span><b>Open conversation</b><small>Mutual match</small></span></button>)}</>}</div>}
 {page==='Gifts'&&<div className="content"><h1>Send a <em>gift</em></h1><p className="muted">Gift catalogue is read from the database. Gift checkout and coin transfers are not enabled until the secure server function is configured.</p><div className="filters">{gifts.map(g=><span className="gift-item" key={g.id}>{g.name} · {g.coin_cost} coins</span>)}</div></div>}
 {page==='Wallet'&&<div className="content"><h1>Your <em>wallet</em></h1><div className="wallet-card"><Wallet/><h2>{wallet.toLocaleString()} coins</h2><p>Current wallet balance · {profile?.country||'Kenya'}</p></div><p className="muted">Top-ups and redemptions stay disabled until Paystack server verification and ledger functions are deployed.</p></div>}
 {page==='VIP Club'&&<div className="content"><h1>VELORA <em>VIP</em></h1><p className="muted">VIP membership is not purchasable until server-side subscription and payment verification are configured.</p></div>}
 {notice&&<div className="toast">{notice}<button onClick={()=>setNotice('')}>×</button></div>}</main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

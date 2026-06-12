import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { gsap } from 'gsap';
import Globe from 'react-globe.gl';
import axios from 'axios';

const ARCS = [
  { startLat:51.5,startLng:-0.1,endLat:40.7,endLng:-74.0 },
  { startLat:51.5,startLng:-0.1,endLat:48.9,endLng:2.3 },
  { startLat:51.5,startLng:-0.1,endLat:35.7,endLng:139.7 },
  { startLat:40.7,startLng:-74.0,endLat:34.0,endLng:-118.2 },
  { startLat:40.7,startLng:-74.0,endLat:-23.5,endLng:-46.6 },
  { startLat:35.7,startLng:139.7,endLat:1.3,endLng:103.8 },
  { startLat:35.7,startLng:139.7,endLat:39.9,endLng:116.4 },
  { startLat:19.1,startLng:72.9,endLat:25.2,endLng:55.3 },
  { startLat:48.9,startLng:2.3,endLat:55.8,endLng:37.6 },
  { startLat:6.5,startLng:3.4,endLat:-26.2,endLng:28.0 },
  { startLat:-33.9,startLng:151.2,endLat:1.3,endLng:103.8 },
  { startLat:39.9,startLng:116.4,endLat:28.6,endLng:77.2 },
  { startLat:55.8,startLng:37.6,endLat:39.9,endLng:116.4 },
  { startLat:1.3,startLng:103.8,endLat:-33.9,endLng:151.2 },
  { startLat:28.6,startLng:77.2,endLat:19.1,endLng:72.9 },
  { startLat:34.0,startLng:-118.2,endLat:40.7,endLng:-74.0 },
];

const POINTS = [
  {lat:51.5,lng:-0.1},{lat:40.7,lng:-74.0},{lat:35.7,lng:139.7},
  {lat:48.9,lng:2.3},{lat:34.0,lng:-118.2},{lat:19.1,lng:72.9},
  {lat:-33.9,lng:151.2},{lat:1.3,lng:103.8},{lat:25.2,lng:55.3},
  {lat:55.8,lng:37.6},{lat:39.9,lng:116.4},{lat:6.5,lng:3.4},
  {lat:-23.5,lng:-46.6},{lat:28.6,lng:77.2},{lat:-26.2,lng:28.0},
];

// ── ACCESS ANIMATION OVERLAY ──
const AccessOverlay = ({ status, onDone }) => {
  const overlayRef = useRef();
  const circleRef = useRef();
  const textRef = useRef();
  const iconRef = useRef();
  const isGranted = status === 'granted';
  const color = isGranted ? '#22c55e' : '#ef4444';
  const glowColor = isGranted ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
  const label = isGranted ? 'Access Granted' : 'Access Denied';
  const icon = isGranted ? '✓' : '✕';

  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(overlayRef.current, { opacity:0 }, { opacity:1, duration:0.4 })
      .fromTo(circleRef.current, { scale:0, opacity:0 }, { scale:1, opacity:1, duration:0.5, ease:'back.out(1.8)' })
      .to(circleRef.current, { boxShadow:`0 0 0 20px ${glowColor.replace('0.6','0.1')}, 0 0 60px ${glowColor}`, duration:0.3 })
      .fromTo(iconRef.current, { scale:0, opacity:0 }, { scale:1, opacity:1, duration:0.4, ease:'back.out(2)' }, '-=0.1')
      .fromTo(textRef.current, { opacity:0, y:15 }, { opacity:1, y:0, duration:0.4, ease:'power2.out' }, '-=0.1')
      .call(() => { if (onDone) setTimeout(onDone, 1500); });
  }, []);

  return (
    <div ref={overlayRef} style={{ position:'fixed',inset:0,zIndex:9998,background:'rgba(0,5,20,0.85)',backdropFilter:'blur(12px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24 }}>
      <div style={{ position:'relative',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <div style={{ position:'absolute',width:180,height:180,borderRadius:'50%',border:`2px solid ${color}`,opacity:0.15,animation:'pulseRing 1.5s ease-out infinite' }} />
        <div style={{ position:'absolute',width:150,height:150,borderRadius:'50%',border:`2px solid ${color}`,opacity:0.25,animation:'pulseRing 1.5s ease-out infinite 0.3s' }} />
        <div ref={circleRef} style={{ width:120,height:120,borderRadius:'50%',background:`radial-gradient(circle at 35% 35%, ${color}dd, ${color}88)`,border:`3px solid ${color}`,boxShadow:`0 0 40px ${glowColor}`,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1 }}>
          <span ref={iconRef} style={{ fontSize:52,fontWeight:900,color:'white',lineHeight:1 }}>{icon}</span>
        </div>
      </div>
      <div ref={textRef} style={{ textAlign:'center' }}>
        <p style={{ fontSize:28,fontWeight:800,color:'white',margin:'0 0 8px',textShadow:`0 0 30px ${glowColor}`,letterSpacing:1 }}>{label}</p>
        <p style={{ fontSize:13,color:'rgba(200,220,255,0.6)',margin:0 }}>{isGranted?'Redirecting to your dashboard...':'Please check your credentials and try again.'}</p>
      </div>
      <style>{`@keyframes pulseRing { 0%{transform:scale(0.8);opacity:0.4} 100%{transform:scale(1.4);opacity:0} }`}</style>
    </div>
  );
};

// ── FORGOT PASSWORD MODAL ──
const ForgotModal = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef();
  const cardRef = useRef();

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity:0 }, { opacity:1, duration:0.3 });
    gsap.fromTo(cardRef.current, { opacity:0, y:30, scale:0.95 }, { opacity:1, y:0, scale:1, duration:0.4, ease:'back.out(1.5)' });
  }, []);

  const handleClose = () => {
    gsap.to(cardRef.current, { opacity:0, y:20, scale:0.95, duration:0.3, ease:'power2.in' });
    gsap.to(overlayRef.current, { opacity:0, duration:0.3, onComplete:onClose });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email'); return; }
    setLoading(true); setError('');
    await new Promise(r => setTimeout(r, 1500));
    setSent(true); setLoading(false);
  };

  return (
    <div ref={overlayRef} style={{ position:'fixed',inset:0,zIndex:999,background:'rgba(0,5,20,0.75)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center' }} onClick={handleClose}>
      <div ref={cardRef} onClick={e=>e.stopPropagation()} style={{ width:380,padding:'40px 36px',borderRadius:20,background:'rgba(5,12,35,0.95)',border:'1px solid rgba(74,144,226,0.35)',boxShadow:'0 0 100px rgba(20,50,200,0.25),0 30px 60px rgba(0,0,0,0.8)' }}>
        {!sent ? (
          <>
            <div style={{ textAlign:'center',marginBottom:28 }}>
              <div style={{ width:56,height:56,borderRadius:'50%',margin:'0 auto 16px',background:'rgba(74,144,226,0.2)',border:'1.5px solid rgba(74,144,226,0.5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24 }}>🔑</div>
              <h2 style={{ color:'white',fontSize:22,fontWeight:700,margin:0 }}>Forgot Password?</h2>
              <p style={{ color:'rgba(150,180,255,0.65)',fontSize:13,marginTop:8 }}>Enter your email and we'll send you a reset link.</p>
            </div>
            <form onSubmit={handleSend} style={{ display:'flex',flexDirection:'column',gap:14 }}>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('');}} placeholder="Enter your email"
                style={{ width:'100%',padding:'13px 16px',borderRadius:10,fontSize:14,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(74,144,226,0.3)',color:'white',outline:'none',boxSizing:'border-box',fontFamily:'inherit',transition:'all 0.2s' }}
                onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.8)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.15)';}}
                onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.3)';e.target.style.boxShadow='none';}}
              />
              {error && <p style={{ color:'#f87171',fontSize:12,margin:0 }}>{error}</p>}
              <button type="submit" disabled={loading} style={{ width:'100%',padding:'13px 0',borderRadius:10,fontWeight:700,fontSize:15,background:loading?'rgba(74,144,226,0.5)':'#4A90E2',border:'none',color:'white',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 20px rgba(74,144,226,0.4)' }}>
                {loading?<span style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}><span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite' }}/>Sending...</span>:'Send Reset Link'}
              </button>
              <button type="button" onClick={handleClose} style={{ background:'none',border:'none',color:'rgba(150,180,255,0.6)',fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
            </form>
          </>
        ) : (
          <div style={{ textAlign:'center',padding:'10px 0' }}>
            <div style={{ fontSize:48,marginBottom:16 }}>📧</div>
            <h2 style={{ color:'white',fontSize:22,fontWeight:700,margin:'0 0 12px' }}>Check your inbox!</h2>
            <p style={{ color:'rgba(150,180,255,0.65)',fontSize:14,lineHeight:1.6,margin:'0 0 24px' }}>We sent a reset link to<br/><strong style={{ color:'rgba(74,144,226,0.9)' }}>{email}</strong></p>
            <button onClick={handleClose} style={{ padding:'12px 32px',borderRadius:10,fontWeight:700,fontSize:14,background:'#4A90E2',border:'none',color:'white',cursor:'pointer',boxShadow:'0 4px 20px rgba(74,144,226,0.4)',fontFamily:'inherit' }}>Back to Login</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const globeRef = useRef();
  const canvasRef = useRef();
  const earthRef = useRef();
  const introRef = useRef();
  const panelRef = useRef();
  const welcomeRef = useRef();
  const starsRef = useRef([]);
  const mouseRef = useRef({ x: window.innerWidth/2, y: window.innerHeight/2 });
  const animIdRef = useRef();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [showForgot, setShowForgot] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [accessStatus, setAccessStatus] = useState(null);

  // ── STARS + CURSOR ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    starsRef.current = Array.from({ length:250 }, () => {
      const x = Math.random()*W, y = Math.random()*H;
      return { x,y,ox:x,oy:y,size:Math.random()*2+0.5,opacity:Math.random()*0.7+0.2,twinkleSpeed:0.5+Math.random()*2,twinkleOffset:Math.random()*Math.PI*2,vx:0,vy:0 };
    });
    const trail = [];
    const onMove = (e) => { mouseRef.current = { x:e.clientX, y:e.clientY }; };
    const onResize = () => { W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; setSize({w:W,h:H}); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', onResize);
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0,0,W,H); frame++;
      const mx=mouseRef.current.x, my=mouseRef.current.y;
      starsRef.current.forEach(star => {
        const dx=mx-star.x, dy=my-star.y, dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<180) { star.vx+=dx*0.04*(1-dist/180); star.vy+=dy*0.04*(1-dist/180); }
        star.vx+=(star.ox-star.x)*0.03; star.vy+=(star.oy-star.y)*0.03;
        star.vx*=0.88; star.vy*=0.88; star.x+=star.vx; star.y+=star.vy;
        const twinkle=0.5+0.5*Math.sin(frame*0.02*star.twinkleSpeed+star.twinkleOffset);
        const opacity=star.opacity*(0.5+0.5*twinkle); const near=dist<180;
        if (near) { ctx.beginPath(); ctx.arc(star.x,star.y,star.size*2.5,0,Math.PI*2); ctx.fillStyle=`rgba(100,180,255,${opacity*0.2*(1-dist/180)})`; ctx.fill(); }
        ctx.beginPath(); ctx.arc(star.x,star.y,star.size,0,Math.PI*2);
        ctx.fillStyle=near?`rgba(180,220,255,${opacity})`:`rgba(255,255,255,${opacity})`;
        if (near) { ctx.shadowBlur=6; ctx.shadowColor='rgba(100,180,255,0.8)'; }
        ctx.fill(); ctx.shadowBlur=0;
      });
      trail.push({x:mx,y:my}); if (trail.length>28) trail.shift();
      for (let i=1;i<trail.length;i++) {
        ctx.beginPath(); ctx.moveTo(trail[i-1].x,trail[i-1].y); ctx.lineTo(trail[i].x,trail[i].y);
        ctx.strokeStyle=`rgba(74,144,226,${(i/trail.length)*0.55})`; ctx.lineWidth=(i/trail.length)*2.5; ctx.lineCap='round'; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(mx,my,18,0,Math.PI*2); ctx.strokeStyle='rgba(100,170,255,0.6)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.fillStyle='rgba(150,215,255,0.98)'; ctx.shadowBlur=15; ctx.shadowColor='rgba(100,180,255,0.9)'; ctx.fill(); ctx.shadowBlur=0;
      animIdRef.current=requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animIdRef.current); window.removeEventListener('mousemove',onMove); window.removeEventListener('resize',onResize); };
  }, []);

  // ── GLOBE SETUP ──
  useEffect(() => {
    if (!globeRef.current||!globeReady) return;
    const controls=globeRef.current.controls();
    controls.autoRotate=true; controls.autoRotateSpeed=0.7;
    controls.enableZoom=false; controls.enablePan=false; controls.enableRotate=false;
    globeRef.current.pointOfView({altitude:1.9},0);
    try {
      const scene=globeRef.current.scene();
      const THREE=require('three');
      const l1=new THREE.DirectionalLight(0x4488ff,1.2); l1.position.set(-2,1,1); scene.add(l1);
      const l2=new THREE.DirectionalLight(0xffffff,0.6); l2.position.set(2,-1,0.5); scene.add(l2);
      scene.add(new THREE.AmbientLight(0x334466,0.8));
    } catch(e) {}
  }, [globeReady]);

  // ── GSAP SCENE ──
  useEffect(() => {
    if (!globeReady) return;
    gsap.set(introRef.current, {opacity:0,y:30,visibility:'hidden'});
    gsap.set(panelRef.current, {opacity:0,x:70,visibility:'hidden'});
    gsap.set(welcomeRef.current, {opacity:0,scale:0.85,visibility:'hidden'});
    const tl=gsap.timeline();
    tl.delay(0.5)
      .to(earthRef.current, {x:'-22vw',scale:0.9,duration:2.2,ease:'power3.inOut'})
      .set(introRef.current, {visibility:'visible'})
      .to(introRef.current, {opacity:1,y:0,duration:1.5,ease:'power2.out'}, '-=1.2')
      .to(introRef.current, {opacity:0,y:-30,duration:0.9,delay:2.5})
      .set(panelRef.current, {visibility:'visible'})
      .to(panelRef.current, {opacity:1,x:0,duration:1.3,ease:'back.out(1.3)'}, '+=0.2');
  }, [globeReady]);

  // ── AUTO DETECT COMPANY ──
  useEffect(() => {
    const match = userId?.match(/^CSP-([A-Z0-9]+)-/i);
    if (match) {
      axios.get(`http://localhost:5000/api/auth/company/${match[1]}`)
        .then(r => setCompanyName(r.data.name))
        .catch(() => setCompanyName(''));
    } else {
      setCompanyName('');
    }
  }, [userId]);

  // ── SIGN IN ──
  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!userId || !password) { setError('All fields required'); return; }
    setError(''); setLoading(true);
    try {
      await axios.post('http://localhost:5000/api/auth/login', { userId, password });
      setAccessStatus('granted');
    } catch (err) {
      setAccessStatus('denied');
      setTimeout(() => {
        setAccessStatus(null);
        setError(err.response?.data?.message || 'Invalid credentials');
        setLoading(false);
      }, 2800);
    }
  };

  const inputStyle = {
    width:'100%', padding:'14px 16px', borderRadius:10, fontSize:14,
    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(74,144,226,0.25)',
    color:'white', outline:'none', boxSizing:'border-box', transition:'all 0.2s'
  };

  return (
    <div style={{ width:'100vw',height:'100vh',overflow:'hidden',position:'relative',background:'radial-gradient(ellipse at 30% 60%, #0a1628 0%, #050d1f 45%, #020810 100%)',fontFamily:"'Segoe UI',Tahoma,Geneva,Verdana,sans-serif" }}>
      <canvas ref={canvasRef} style={{ position:'absolute',top:0,left:0,zIndex:9999,pointerEvents:'none' }} />

      {/* Globe */}
      <div ref={earthRef} style={{ position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
        <Globe ref={globeRef} width={size.w} height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          atmosphereColor="rgba(60,140,255,1)" atmosphereAltitude={0.25}
          arcsData={ARCS} arcColor={()=>['rgba(74,144,226,0.95)','rgba(200,235,255,0.95)']}
          arcAltitude={0.32} arcStroke={0.65} arcDashLength={0.6} arcDashGap={0.15} arcDashAnimateTime={2000}
          pointsData={POINTS} pointColor={()=>'rgba(160,225,255,1)'} pointAltitude={0.015} pointRadius={0.5}
          pointsMerge={false} enablePointerInteraction={false}
          onGlobeReady={() => setGlobeReady(true)}
        />
      </div>

      <div style={{ position:'absolute',inset:0,zIndex:2,pointerEvents:'none',background:'radial-gradient(ellipse at center, rgba(0,5,18,0.05) 0%, rgba(2,6,18,0.5) 100%)' }} />

      <div style={{ position:'absolute',inset:0,zIndex:10,display:'flex',alignItems:'center',justifyContent:'center' }}>

        {/* Intro */}
        <div ref={introRef} style={{ position:'absolute',textAlign:'center',pointerEvents:'none',userSelect:'none',visibility:'hidden',opacity:0 }}>
          <h1 style={{ fontSize:58,fontWeight:800,color:'white',margin:0,lineHeight:1.15,textShadow:'0 0 60px rgba(74,144,226,0.7)' }}>
            Connecting<br/>
            <span style={{ color:'#4A90E2',textShadow:'0 0 40px rgba(74,144,226,1)' }}>Continents</span>
          </h1>
          <p style={{ color:'rgba(150,190,255,0.7)',fontSize:16,marginTop:14 }}>Bridging the world, one connection at a time.</p>
        </div>

        {/* Login Panel */}
        <div ref={panelRef} style={{ position:'absolute',right:'8%',visibility:'hidden',opacity:0,width:370,padding:'42px 38px',background:'rgba(5,12,35,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(74,144,226,0.28)',borderRadius:20,boxShadow:'0 8px 60px rgba(0,0,0,0.7),0 0 100px rgba(74,144,226,0.12),inset 0 1px 0 rgba(255,255,255,0.08)' }}>

          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:8 }}>
            <h2 style={{ fontSize:26,fontWeight:700,color:'white',margin:0 }}>Connect Globally</h2>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4A90E2" strokeWidth="1.8" style={{ filter:'drop-shadow(0 0 8px rgba(74,144,226,0.8))',flexShrink:0 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <p style={{ color:'rgba(150,180,255,0.6)',fontSize:13,textAlign:'center',margin:'0 0 28px' }}>Enter your User ID to sign in</p>

          <form onSubmit={handleSignIn} style={{ display:'flex',flexDirection:'column',gap:14 }}>

            {/* USER ID INPUT */}
            <div>
              <input
                type="text"
                value={userId}
                onChange={e => { setUserId(e.target.value.toUpperCase()); setError(''); }}
                placeholder="CSP-COMPANY-000001"
                autoComplete="off"
                style={{ ...inputStyle, fontFamily:'monospace', letterSpacing:1 }}
                onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.75)';e.target.style.background='rgba(255,255,255,0.09)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.15)';}}
                onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';e.target.style.background='rgba(255,255,255,0.06)';e.target.style.boxShadow='none';}}
              />
              {companyName && (
                <p style={{ color:'#22c55e',fontSize:12,marginTop:5,paddingLeft:2 }}>✓ {companyName} workspace detected</p>
              )}
            </div>

            {/* PASSWORD INPUT */}
            <div style={{ position:'relative' }}>
              <input
                type={showPw?'text':'password'}
                value={password}
                onChange={e=>{setPassword(e.target.value);setError('');}}
                placeholder="Password"
                style={inputStyle}
                onFocus={e=>{e.target.style.borderColor='rgba(74,144,226,0.75)';e.target.style.background='rgba(255,255,255,0.09)';e.target.style.boxShadow='0 0 0 3px rgba(74,144,226,0.15)';}}
                onBlur={e=>{e.target.style.borderColor='rgba(74,144,226,0.25)';e.target.style.background='rgba(255,255,255,0.06)';e.target.style.boxShadow='none';}}
              />
              <button type="button" onClick={()=>setShowPw(!showPw)}
                style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'rgba(150,180,255,0.7)',padding:0,fontSize:16 }}>
                {showPw?'🙈':'👁️'}
              </button>
            </div>

            {error && <p style={{ color:'#f87171',fontSize:12,margin:0,textAlign:'center' }}>{error}</p>}

            <button type="submit" disabled={loading}
              style={{ width:'100%',padding:'14px 0',borderRadius:10,fontWeight:700,fontSize:15,background:loading?'rgba(74,144,226,0.5)':'linear-gradient(135deg,#4A90E2,#2563eb)',border:'none',color:'white',cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',boxShadow:'0 4px 25px rgba(74,144,226,0.45)',transition:'all 0.2s',marginTop:4 }}>
              {loading
                ? <span style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
                    <span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite' }}/>
                    Verifying...
                  </span>
                : 'Sign In →'}
            </button>

            <button type="button" onClick={()=>setShowForgot(true)}
              style={{ background:'none',border:'none',color:'rgba(74,144,226,0.8)',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'center',textDecoration:'underline',padding:'2px 0' }}>
              Forgot Password?
            </button>
          </form>

          <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)',marginTop:22,paddingTop:18,textAlign:'center' }}>
            <p style={{ fontSize:13,color:'rgba(150,180,255,0.55)',margin:0 }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color:'rgba(74,144,226,0.9)',fontWeight:700,textDecoration:'none' }}>Register</Link>
            </p>
          </div>
        </div>

        {/* Welcome */}
        <div ref={welcomeRef} style={{ position:'absolute',textAlign:'center',pointerEvents:'none',userSelect:'none',visibility:'hidden' }}>
          <h1 style={{ fontSize:58,fontWeight:800,color:'white',margin:'0 0 14px',textShadow:'0 0 60px rgba(74,144,226,0.7)' }}>Welcome to Nexus</h1>
          <p style={{ fontSize:20,color:'rgba(150,200,255,0.8)',margin:0 }}>The universe is online...</p>
        </div>
      </div>

      {/* Access overlay */}
      {(accessStatus==='granted'||accessStatus==='denied') && (
        <AccessOverlay status={accessStatus} onDone={async () => {
          if (accessStatus==='granted') {
            setAccessStatus(null);
            try { await login(userId, password); } catch(e) {}
            gsap.to(panelRef.current, { opacity:0, x:70, duration:0.9, ease:'power2.in',
              onComplete: () => {
                gsap.to(earthRef.current, { x:'0vw', scale:0.65, opacity:0.2, duration:2.8, ease:'power3.inOut' });
                gsap.set(welcomeRef.current, { visibility:'visible' });
                gsap.to(welcomeRef.current, { opacity:1, scale:1, duration:1.8, ease:'power2.out', delay:1,
                  onComplete: () => navigate('/chat')
                });
              }
            });
          }
        }}/>
      )}

      {showForgot && <ForgotModal onClose={()=>setShowForgot(false)} />}

      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulseRing { 0%{transform:scale(0.8);opacity:0.4} 100%{transform:scale(1.4);opacity:0} }
        input::placeholder { color:rgba(150,180,255,0.4)!important; }
        * { cursor:none!important; box-sizing:border-box; }
      `}</style>
    </div>
  );
}
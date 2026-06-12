import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { gsap } from 'gsap';
import Globe from 'react-globe.gl';
import axios from 'axios';

const API = 'http://localhost:5000/api';

const ARCS = [
  { startLat:51.5,startLng:-0.1,endLat:40.7,endLng:-74.0 },
  { startLat:51.5,startLng:-0.1,endLat:48.9,endLng:2.3 },
  { startLat:51.5,startLng:-0.1,endLat:35.7,endLng:139.7 },
  { startLat:40.7,startLng:-74.0,endLat:34.0,endLng:-118.2 },
  { startLat:35.7,startLng:139.7,endLat:1.3,endLng:103.8 },
  { startLat:19.1,startLng:72.9,endLat:25.2,endLng:55.3 },
  { startLat:48.9,startLng:2.3,endLat:55.8,endLng:37.6 },
  { startLat:6.5,startLng:3.4,endLat:-26.2,endLng:28.0 },
  { startLat:39.9,startLng:116.4,endLat:28.6,endLng:77.2 },
  { startLat:55.8,startLng:37.6,endLat:39.9,endLng:116.4 },
];

const POINTS = [
  {lat:51.5,lng:-0.1},{lat:40.7,lng:-74.0},{lat:35.7,lng:139.7},
  {lat:48.9,lng:2.3},{lat:34.0,lng:-118.2},{lat:19.1,lng:72.9},
  {lat:-33.9,lng:151.2},{lat:1.3,lng:103.8},{lat:25.2,lng:55.3},
  {lat:55.8,lng:37.6},{lat:39.9,lng:116.4},{lat:6.5,lng:3.4},
];

// ── VERIFICATION CODE INPUT ──
const CodeInput = ({ value, onChange }) => {
  const inputs = useRef([]);
  const digits = value.split('');

  const handleKey = (e, idx) => {
    const val = e.target.value.replace(/\D/g, '');
    if (!val) {
      const newDigits = [...digits];
      newDigits[idx] = '';
      onChange(newDigits.join(''));
      if (idx > 0) inputs.current[idx - 1]?.focus();
      return;
    }
    const newDigits = [...digits];
    newDigits[idx] = val[0];
    onChange(newDigits.join(''));
    if (idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {[0,1,2,3,4,5].map(i => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          type="text"
          maxLength={1}
          value={digits[i] || ''}
          onChange={e => handleKey(e, i)}
          onPaste={handlePaste}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) {
              inputs.current[i - 1]?.focus();
            }
          }}
          style={{
            width: 44, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
            borderRadius: 10, color: 'white', outline: 'none', fontFamily: 'inherit',
            background: digits[i] ? 'rgba(74,144,226,0.2)' : 'rgba(255,255,255,0.06)',
            border: digits[i] ? '1.5px solid rgba(74,144,226,0.8)' : '1px solid rgba(74,144,226,0.25)',
            boxShadow: digits[i] ? '0 0 10px rgba(74,144,226,0.3)' : 'none',
            transition: 'all 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(74,144,226,0.9)'; e.target.style.boxShadow = '0 0 0 3px rgba(74,144,226,0.2)'; }}
          onBlur={e => { e.target.style.boxShadow = digits[i] ? '0 0 10px rgba(74,144,226,0.3)' : 'none'; }}
        />
      ))}
    </div>
  );
};

export default function Register() {
  const { register, suggestUsername } = useAuth();
  const navigate = useNavigate();
  const globeRef = useRef();
  const canvasRef = useRef();
  const earthRef = useRef();
  const introRef = useRef();
  const panelRef = useRef();
  const starsRef = useRef([]);
  const mouseRef = useRef({ x: window.innerWidth/2, y: window.innerHeight/2 });
  const animIdRef = useRef();

  const [step, setStep] = useState(1);
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyError, setCompanyError] = useState(''); // 1=email, 2=verify, 3=password
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCp, setShowCp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [resendTimer, setResendTimer] = useState(0);
  const [accessStatus, setAccessStatus] = useState(null);
  const [createdUserId, setCreatedUserId] = useState('');

  // ── STARS + CURSOR ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    starsRef.current = Array.from({ length: 220 }, () => {
      const x = Math.random() * W, y = Math.random() * H;
      return { x, y, ox:x, oy:y, size:Math.random()*2+0.5, opacity:Math.random()*0.7+0.2, twinkleSpeed:0.5+Math.random()*2, twinkleOffset:Math.random()*Math.PI*2, vx:0, vy:0 };
    });

    const trail = [];
    const onMove = (e) => { mouseRef.current = { x:e.clientX, y:e.clientY }; };
    const onResize = () => { W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; setSize({w:W,h:H}); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', onResize);

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      starsRef.current.forEach(star => {
        const dx = mx-star.x, dy = my-star.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 180) { star.vx += dx*0.04*(1-dist/180); star.vy += dy*0.04*(1-dist/180); }
        star.vx += (star.ox-star.x)*0.03; star.vy += (star.oy-star.y)*0.03;
        star.vx *= 0.88; star.vy *= 0.88;
        star.x += star.vx; star.y += star.vy;
        const twinkle = 0.5+0.5*Math.sin(frame*0.02*star.twinkleSpeed+star.twinkleOffset);
        const opacity = star.opacity*(0.5+0.5*twinkle);
        const near = dist < 180;
        if (near) { ctx.beginPath(); ctx.arc(star.x,star.y,star.size*2.5,0,Math.PI*2); ctx.fillStyle=`rgba(100,180,255,${opacity*0.2*(1-dist/180)})`; ctx.fill(); }
        ctx.beginPath(); ctx.arc(star.x,star.y,star.size,0,Math.PI*2);
        ctx.fillStyle = near?`rgba(180,220,255,${opacity})`:`rgba(255,255,255,${opacity})`;
        if (near) { ctx.shadowBlur=6; ctx.shadowColor='rgba(100,180,255,0.8)'; }
        ctx.fill(); ctx.shadowBlur=0;
      });

      trail.push({x:mx,y:my});
      if (trail.length>28) trail.shift();
      for (let i=1;i<trail.length;i++) {
        ctx.beginPath(); ctx.moveTo(trail[i-1].x,trail[i-1].y); ctx.lineTo(trail[i].x,trail[i].y);
        ctx.strokeStyle=`rgba(74,144,226,${(i/trail.length)*0.55})`; ctx.lineWidth=(i/trail.length)*2.5; ctx.lineCap='round'; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(mx,my,18,0,Math.PI*2); ctx.strokeStyle='rgba(100,170,255,0.6)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.fillStyle='rgba(150,215,255,0.98)'; ctx.shadowBlur=15; ctx.shadowColor='rgba(100,180,255,0.9)'; ctx.fill(); ctx.shadowBlur=0;

      animIdRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animIdRef.current); window.removeEventListener('mousemove',onMove); window.removeEventListener('resize',onResize); };
  }, []);

  // ── GLOBE SETUP ──
  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = true; controls.autoRotateSpeed = 0.7;
    controls.enableZoom = false; controls.enablePan = false; controls.enableRotate = false;
    globeRef.current.pointOfView({ altitude:1.9 }, 0);
  }, [globeReady]);

  // ── GSAP INTRO ──
  useEffect(() => {
    if (!globeReady) return;
    gsap.set(introRef.current, { opacity:0, y:30, visibility:"hidden" });
    gsap.set(panelRef.current, { opacity:0, x:70, visibility:"hidden" });
    const tl = gsap.timeline();
    tl.delay(0.5)
      .to(earthRef.current, { x:'-22vw', scale:0.9, duration:2.2, ease:'power3.inOut' })
      .set(introRef.current, { visibility:"visible" })
      .to(introRef.current, { opacity:1, y:0, duration:1.5, ease:'power2.out' }, '-=1.2')
      .to(introRef.current, { opacity:0, y:-30, duration:0.9, delay:2.5 })
      .set(panelRef.current, { visibility:"visible" })
      .to(panelRef.current, { opacity:1, x:0, duration:1.3, ease:'back.out(1.3)' }, '+=0.2');
  }, [globeReady]);

  // ── RESEND TIMER ──
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // ── STEP TRANSITION ──
  const animateStep = (cb) => {
    gsap.to(panelRef.current, { opacity:0, x:30, duration:0.25, ease:'power2.in', onComplete: () => {
      cb();
      gsap.fromTo(panelRef.current, { opacity:0, x:-30 }, { opacity:1, x:0, duration:0.35, ease:'back.out(1.2)' });
    }});
  };

  // ── SEND VERIFICATION CODE ──
  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!companyCode) { setError('Please enter your company code'); return; }
    if (!companyName) { setError('Please enter a valid company code'); return; }
    if (!email) { setError('Please enter your email'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Please enter a valid email'); return; }
    setError(''); setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/send-code`, { email, companyCode });
      setSentCode(res.data.code); // Store code from server
      setResendTimer(60);
      animateStep(() => setStep(2));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send code. Try again.');
    }
    setLoading(false);
  };

  // ── VERIFY CODE ──
  const handleVerifyCode = (e) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    if (code !== sentCode) { setError('Invalid code. Please try again.'); setCode(''); return; }
    setError('');
    animateStep(() => setStep(3));
  };

  // ── CREATE ACCOUNT ──
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!username.trim()) { setError('Username required'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (!password) { setError('Password required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      const regRes = await axios.post(`${API}/auth/register`, { email, password, username, companyCode, avatar_color: '#4A90E2' });
      setCreatedUserId(regRes.data.user?.userId || '');
      setAccessStatus('granted');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      const res = await axios.post(`${API}/auth/send-code`, { email, companyCode });
      setSentCode(res.data.code);
      setResendTimer(60);
      setError('');
      setCode('');
    } catch (err) {
      setError('Failed to resend code. Try again.');
    }
  };

  const inputStyle = {
    width:'100%', padding:'12px 14px', borderRadius:10, fontSize:14,
    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(74,144,226,0.25)',
    color:'white', outline:'none', boxSizing:'border-box', fontFamily:'inherit', transition:'all 0.2s'
  };
  const focusStyle = { borderColor:'rgba(74,144,226,0.75)', background:'rgba(255,255,255,0.09)', boxShadow:'0 0 0 3px rgba(74,144,226,0.15)' };
  const blurStyle = { borderColor:'rgba(74,144,226,0.25)', background:'rgba(255,255,255,0.06)', boxShadow:'none' };

  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden', position:'relative', background:'radial-gradient(ellipse at 30% 60%, #0a1628 0%, #050d1f 45%, #020810 100%)', fontFamily:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>

      <canvas ref={canvasRef} style={{ position:'absolute', top:0, left:0, zIndex:9999, pointerEvents:'none' }} />

      {/* Globe */}
      <div ref={earthRef} style={{ position:'absolute', inset:0, zIndex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Globe ref={globeRef} width={size.w} height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          atmosphereColor="rgba(60,140,255,1)" atmosphereAltitude={0.25}
          arcsData={ARCS}
          arcColor={()=>['rgba(74,144,226,0.95)','rgba(200,235,255,0.95)']}
          arcAltitude={0.32} arcStroke={0.65} arcDashLength={0.6} arcDashGap={0.15} arcDashAnimateTime={2000}
          pointsData={POINTS} pointColor={()=>'rgba(160,225,255,1)'} pointAltitude={0.015} pointRadius={0.5}
          pointsMerge={false} enablePointerInteraction={false}
          onGlobeReady={() => setGlobeReady(true)}
        />
      </div>

      <div style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none', background:'radial-gradient(ellipse at center, rgba(0,5,18,0.05) 0%, rgba(2,6,18,0.5) 100%)' }} />

      <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', alignItems:'center', justifyContent:'center' }}>

        {/* Intro text */}
        <div ref={introRef} style={{ position:'absolute', textAlign:'center', pointerEvents:'none', userSelect:'none', visibility:'hidden', opacity:0 }}>
          <h1 style={{ fontSize:52, fontWeight:800, color:'white', margin:0, lineHeight:1.2, textShadow:'0 0 60px rgba(74,144,226,0.7)' }}>
            Join the<br/>
            <span style={{ color:'#4A90E2', textShadow:'0 0 40px rgba(74,144,226,1)' }}>Global Network</span>
          </h1>
          <p style={{ color:'rgba(150,190,255,0.7)', fontSize:15, marginTop:12 }}>Create your account and connect worldwide.</p>
        </div>

        {/* Register Panel */}
        <div ref={panelRef} style={{
          position:'absolute', right:'8%', visibility:'hidden', opacity:0,
          width:340, padding:'32px 30px',
          background:'rgba(5,12,35,0.72)',
          backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
          border:'1px solid rgba(74,144,226,0.28)', borderRadius:20,
          boxShadow:'0 8px 60px rgba(0,0,0,0.7),0 0 100px rgba(74,144,226,0.1),inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:6 }}>
            <h2 style={{ fontSize:22, fontWeight:700, color:'white', margin:0 }}>
              {step === 1 ? 'Create Account' : step === 2 ? 'Verify Email' : 'Set Password'}
            </h2>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4A90E2" strokeWidth="1.8" style={{ filter:'drop-shadow(0 0 6px rgba(74,144,226,0.8))', flexShrink:0 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>

          {/* Progress bar */}
          <div style={{ display:'flex', gap:6, marginBottom:20 }}>
            {[1,2,3].map(s => (
              <div key={s} style={{ flex:1, height:3, borderRadius:4, overflow:'hidden', background:'rgba(255,255,255,0.1)' }}>
                <div style={{ height:'100%', borderRadius:4, background:'linear-gradient(90deg,#4A90E2,#60a5fa)', width:step>=s?'100%':'0%', transition:'width 0.5s ease' }} />
              </div>
            ))}
          </div>

          {/* ── STEP 1: EMAIL ── */}
          {step === 1 && (
            <form onSubmit={handleSendCode} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ color:'rgba(150,180,255,0.65)', fontSize:12, margin:'0 0 4px', textAlign:'center' }}>
                Step 1 of 2 — Enter your company code & email
              </p>
              <div>
                <input type="text" value={companyCode}
                  onChange={e => { setCompanyCode(e.target.value.toUpperCase()); setCompanyError(''); setCompanyName(''); }}
                  placeholder="Company Code (e.g. VITS)"
                  style={{ ...inputStyle, fontFamily:'monospace', letterSpacing:1 }}
                  onFocus={e=>Object.assign(e.target.style,focusStyle)}
                  onBlur={async e => {
                    Object.assign(e.target.style, blurStyle);
                    if (companyCode) {
                      try {
                        const r = await axios.get(`http://localhost:5000/api/auth/company/${companyCode}`);
                        setCompanyName(r.data.name);
                        setCompanyError('');
                      } catch { setCompanyError('Company not found'); setCompanyName(''); }
                    }
                  }}
                />
                {companyName && <p style={{ color:'#22c55e', fontSize:11, marginTop:4 }}>✓ {companyName}</p>}
                {companyError && <p style={{ color:'#f87171', fontSize:11, marginTop:4 }}>✗ {companyError}</p>}
              </div>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('');}}
                placeholder="Email address" style={inputStyle}
                onFocus={e=>Object.assign(e.target.style,focusStyle)}
                onBlur={e=>Object.assign(e.target.style,blurStyle)}
              />
              {error && <p style={{ color:'#f87171', fontSize:12, margin:0, textAlign:'center' }}>{error}</p>}
              <button type="submit" disabled={loading} style={{
                width:'100%', padding:'13px 0', borderRadius:10, fontWeight:700, fontSize:14,
                background:loading?'rgba(74,144,226,0.5)':'linear-gradient(135deg,#4A90E2,#2563eb)',
                border:'none', color:'white', cursor:loading?'not-allowed':'pointer', fontFamily:'inherit',
                boxShadow:'0 4px 20px rgba(74,144,226,0.4)', transition:'all 0.2s',
              }}>
                {loading
                  ? <span style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
                      <span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite' }}/>
                      Sending Code...
                    </span>
                  : 'Send Verification Code →'}
              </button>
              <p style={{ textAlign:'center', fontSize:12, color:'rgba(150,180,255,0.5)', margin:0 }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color:'rgba(74,144,226,0.85)', fontWeight:700, textDecoration:'none' }}>Sign In</Link>
              </p>
            </form>
          )}

          {/* ── STEP 2: VERIFY CODE ── */}
          {step === 2 && (
            <form onSubmit={handleVerifyCode} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:6 }}>📧</div>
                <p style={{ color:'rgba(150,180,255,0.65)', fontSize:12, margin:0 }}>
                  Step 1 of 2 — We sent a 6-digit code to
                </p>
                <p style={{ color:'rgba(74,144,226,0.9)', fontSize:13, fontWeight:600, margin:'4px 0 0' }}>{email}</p>
              </div>

              <CodeInput value={code} onChange={setCode} />

              {error && <p style={{ color:'#f87171', fontSize:12, margin:0, textAlign:'center' }}>{error}</p>}

              <button type="submit" disabled={code.length !== 6} style={{
                width:'100%', padding:'13px 0', borderRadius:10, fontWeight:700, fontSize:14,
                background:code.length===6?'linear-gradient(135deg,#4A90E2,#2563eb)':'rgba(74,144,226,0.3)',
                border:'none', color:'white', cursor:code.length===6?'pointer':'not-allowed',
                fontFamily:'inherit', boxShadow:code.length===6?'0 4px 20px rgba(74,144,226,0.4)':'none', transition:'all 0.2s',
              }}>
                Verify Code →
              </button>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <button type="button" onClick={()=>animateStep(()=>setStep(1))}
                  style={{ background:'none',border:'none',color:'rgba(150,180,255,0.6)',fontSize:12,cursor:'pointer',fontFamily:'inherit' }}>
                  ← Change email
                </button>
                <button type="button" onClick={handleResend} disabled={resendTimer>0}
                  style={{ background:'none',border:'none',color:resendTimer>0?'rgba(150,180,255,0.4)':'rgba(74,144,226,0.8)',fontSize:12,cursor:resendTimer>0?'not-allowed':'pointer',fontFamily:'inherit' }}>
                  {resendTimer>0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>


            </form>
          )}

          {/* ── STEP 3: PASSWORD ── */}
          {step === 3 && (
            <form onSubmit={handleCreateAccount} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ color:'rgba(150,180,255,0.65)', fontSize:12, margin:'0 0 4px', textAlign:'center' }}>
                Step 2 of 2 — Choose your username & password
              </p>

              {/* Username */}
              <div>
                <label style={{ fontSize:11, color:'rgba(150,180,255,0.6)', display:'block', marginBottom:5, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase' }}>Username</label>
                <input type="text" value={username} onChange={e=>{setUsername(e.target.value);setError('');}}
                  placeholder="Choose a username" style={inputStyle} maxLength={20}
                  onFocus={e=>Object.assign(e.target.style,focusStyle)}
                  onBlur={e=>Object.assign(e.target.style,blurStyle)}
                  autoFocus
                />
              </div>

              {/* Password */}
              <div>
                <label style={{ fontSize:11, color:'rgba(150,180,255,0.6)', display:'block', marginBottom:5, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase' }}>Password</label>
                <div style={{ position:'relative' }}>
                  <input type={showPw?'text':'password'} value={password} onChange={e=>{setPassword(e.target.value);setError('');}}
                    placeholder="Min 6 characters" style={{...inputStyle, paddingRight:42}}
                    onFocus={e=>Object.assign(e.target.style,focusStyle)}
                    onBlur={e=>Object.assign(e.target.style,blurStyle)}
                  />
                  <button type="button" onClick={()=>setShowPw(!showPw)}
                    style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'rgba(150,180,255,0.7)',padding:0,fontSize:15 }}>
                    {showPw?'🙈':'👁️'}
                  </button>
                </div>
                {/* Password strength */}
                {password && (
                  <div style={{ display:'flex', gap:4, marginTop:6 }}>
                    {[1,2,3,4].map(i => {
                      const strength = password.length >= 12 ? 4 : password.length >= 8 ? 3 : password.length >= 6 ? 2 : 1;
                      const colors = ['#ef4444','#f97316','#eab308','#22c55e'];
                      return <div key={i} style={{ flex:1, height:3, borderRadius:2, background: i<=strength ? colors[strength-1] : 'rgba(255,255,255,0.1)', transition:'all 0.3s' }} />;
                    })}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label style={{ fontSize:11, color:'rgba(150,180,255,0.6)', display:'block', marginBottom:5, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase' }}>Confirm Password</label>
                <div style={{ position:'relative' }}>
                  <input type={showCp?'text':'password'} value={confirm} onChange={e=>{setConfirm(e.target.value);setError('');}}
                    placeholder="Repeat password" style={{...inputStyle, paddingRight:42,
                      borderColor: confirm && confirm===password ? 'rgba(34,197,94,0.6)' : confirm && confirm!==password ? 'rgba(239,68,68,0.5)' : 'rgba(74,144,226,0.25)'
                    }}
                    onFocus={e=>Object.assign(e.target.style,focusStyle)}
                    onBlur={e=>{ e.target.style.background='rgba(255,255,255,0.06)'; e.target.style.boxShadow='none'; }}
                  />
                  <button type="button" onClick={()=>setShowCp(!showCp)}
                    style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'rgba(150,180,255,0.7)',padding:0,fontSize:15 }}>
                    {showCp?'🙈':'👁️'}
                  </button>
                  {confirm && (
                    <span style={{ position:'absolute',right:36,top:'50%',transform:'translateY(-50%)',fontSize:14 }}>
                      {confirm===password ? '✅' : '❌'}
                    </span>
                  )}
                </div>
              </div>

              {error && <p style={{ color:'#f87171', fontSize:12, margin:0, textAlign:'center' }}>{error}</p>}

              <button type="submit" disabled={loading} style={{
                width:'100%', padding:'13px 0', borderRadius:10, fontWeight:700, fontSize:14,
                background:loading?'rgba(74,144,226,0.5)':'linear-gradient(135deg,#4A90E2,#2563eb)',
                border:'none', color:'white', cursor:loading?'not-allowed':'pointer',
                fontFamily:'inherit', boxShadow:'0 4px 20px rgba(74,144,226,0.4)', transition:'all 0.2s', marginTop:2
              }}>
                {loading
                  ? <span style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
                      <span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite' }}/>
                      Creating Account...
                    </span>
                  : 'Create Account 🚀'}
              </button>

              <button type="button" onClick={()=>animateStep(()=>setStep(2))}
                style={{ background:'none',border:'none',color:'rgba(150,180,255,0.6)',fontSize:12,cursor:'pointer',fontFamily:'inherit',textAlign:'center' }}>
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ACCESS GRANTED OVERLAY */}
      {accessStatus === 'granted' && (
        <div style={{
          position:'fixed', inset:0, zIndex:9998,
          background:'rgba(0,5,20,0.85)', backdropFilter:'blur(12px)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24
        }}>
          <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%', border:'2px solid #22c55e', opacity:0.15, animation:'pulseRing 1.5s ease-out infinite' }} />
            <div style={{ position:'absolute', width:150, height:150, borderRadius:'50%', border:'2px solid #22c55e', opacity:0.25, animation:'pulseRing 1.5s ease-out infinite 0.3s' }} />
            <div style={{ width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%, #22c55edd, #22c55e88)', border:'3px solid #22c55e', boxShadow:'0 0 40px rgba(34,197,94,0.6), 0 0 80px rgba(34,197,94,0.3)', display:'flex', alignItems:'center', justifyContent:'center', animation:'bounceIn 0.5s ease-out' }}>
              <span style={{ fontSize:52, fontWeight:900, color:'white' }}>✓</span>
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:28, fontWeight:800, color:'white', margin:'0 0 8px', textShadow:'0 0 30px rgba(34,197,94,0.6)', letterSpacing:1 }}>Account Created!</p>
            <p style={{ fontSize:13, color:'rgba(200,220,255,0.6)', margin:0 }}>Redirecting to login...</p>
          </div>
          {/* Auto navigate after 2.5s */}
          {setTimeout(() => navigate('/login'), 2500) && null}
        </div>
      )}

      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulseRing { 0%{transform:scale(0.8);opacity:0.4} 100%{transform:scale(1.4);opacity:0} }
        @keyframes bounceIn { 0%{transform:scale(0)} 60%{transform:scale(1.1)} 100%{transform:scale(1)} }
        input::placeholder { color:rgba(150,180,255,0.4)!important; }
        * { cursor:none!important; box-sizing:border-box; }
      `}</style>
    </div>
  );
}
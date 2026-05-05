'use strict';
'require view';
'require poll';
'require rpc';
'require fs';

var callSystemBoard = rpc.declare({object:'system',method:'board'});
var callSystemInfo = rpc.declare({object:'system',method:'info'});
var callNetIfDump = rpc.declare({object:'network.interface',method:'dump'});
var callDHCPLeases = rpc.declare({object:'luci-rpc',method:'getDHCPLeases',expect:{}});
var callHostHints = rpc.declare({object:'luci-rpc',method:'getHostHints',expect:{}});
var callIwinfoAssoc = rpc.declare({object:'iwinfo',method:'assoclist',params:['device'],expect:{}});

var IC = {
	clock:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
	globe:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>',
	down:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
	up:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
	cpu:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
	mem:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 6V4M12 6V4M17 6V4M7 18v2M12 18v2M17 18v2"/></svg>',
	temp:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
	net:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
	wifi:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>',
	ota:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
	power:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/></svg>',
	phone:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
	pc:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
	watch:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="5" width="10" height="14" rx="3"/><path d="M9 5V3h6v2M9 19v2h6v-2"/></svg>',
	pad:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
	block:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
	eye:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
	eyeOff:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
};

function maskIp(str) {
	return (str||'').replace(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}/g, '$1.***.***').replace(/([0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}:)[0-9a-fA-F:]+/g, '$1:***:***');
}

function fmtSpeed(b){
	if(b>=1073741824)return(b/1073741824).toFixed(1)+' GB/s';
	if(b>=1048576)return(b/1048576).toFixed(1)+' MB/s';
	if(b>=1024)return(b/1024).toFixed(1)+' KB/s';
	return b.toFixed(0)+' B/s';
}

function fmtUptime(s){
	var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
	if(d>0)return d+'天'+h+'时'+m+'分';
	if(h>0)return h+'时'+m+'分';
	return m+'分';
}

function parseNetDev(text){
	var r={};
	(text||'').split('\n').forEach(function(l){
		var m=l.trim().match(/^(\S+):\s*(.*)/);
		if(!m)return;
		var cols=m[2].trim().split(/\s+/).map(Number);
		r[m[1]]={rx:cols[0]||0,tx:cols[8]||0};
	});
	return r;
}

/* ── Enhanced area chart with axes, grid, tooltip ── */
function fmtAxisSpeed(b){
	if(b>=1073741824)return(b/1073741824).toFixed(0)+'G';
	if(b>=1048576)return(b/1048576).toFixed(0)+'M';
	if(b>=1024)return(b/1024).toFixed(0)+'K';
	return b.toFixed(0)+'B';
}

function SpeedChart(canvas,tooltip){
	this.canvas=canvas;
	this.ctx=canvas.getContext('2d');
	this.tooltip=tooltip;
	this.MAX=60;
	this.padL=48;this.padR=12;this.padT=12;this.padB=28;
	this.down=[];this.up=[];
	this.hoverIdx=-1;
	for(var i=0;i<this.MAX;i++){this.down.push(0);this.up.push(0);}
	var self=this;
	canvas.addEventListener('mousemove',function(e){
		var rect=canvas.getBoundingClientRect();
		var x=e.clientX-rect.left;
		var plotW=rect.width-self.padL-self.padR;
		var step=plotW/(self.MAX-1);
		var idx=Math.round((x-self.padL)/step);
		if(idx<0||idx>=self.MAX){self.hoverIdx=-1;self.draw();if(self.tooltip)self.tooltip.style.display='none';return;}
		self.hoverIdx=idx;self.draw();
		if(self.tooltip){
			self.tooltip.style.display='block';
			var ago=(self.MAX-1-idx)*3;
			self.tooltip.innerHTML='<b>'+ago+'秒前</b><br><span style="color:#007aff">↓ '+fmtSpeed(self.down[idx])+'</span><br><span style="color:#5856d6">↑ '+fmtSpeed(self.up[idx])+'</span>';
			var tx=e.clientX+14,ty=e.clientY-60;
			if(tx+140>window.innerWidth)tx=e.clientX-154;
			self.tooltip.style.left=tx+'px';self.tooltip.style.top=ty+'px';
		}
	});
	canvas.addEventListener('mouseleave',function(){
		self.hoverIdx=-1;self.draw();if(self.tooltip)self.tooltip.style.display='none';
	});
}
SpeedChart.prototype.push=function(d,u){
	this.down.push(d);this.up.push(u);
	if(this.down.length>this.MAX)this.down.shift();
	if(this.up.length>this.MAX)this.up.shift();
	this.draw();
};
SpeedChart.prototype.draw=function(){
	var c=this.canvas,ctx=this.ctx;
	var dpr=window.devicePixelRatio||1;
	var w=c.parentNode.clientWidth,h=c.parentNode.clientHeight||200;
	c.width=w*dpr;c.height=h*dpr;
	c.style.width=w+'px';c.style.height=h+'px';
	ctx.scale(dpr,dpr);
	var pL=this.padL,pR=this.padR,pT=this.padT,pB=this.padB;
	var plotW=w-pL-pR,plotH=h-pT-pB;

	var fg=getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()||'#333';
	ctx.clearRect(0,0,w,h);

	var max=Math.max.apply(null,this.down.concat(this.up));
	if(max<1024)max=1024;
	max*=1.2;

	/* Y-axis grid + labels */
	ctx.textAlign='right';ctx.textBaseline='middle';
	ctx.font='11px -apple-system,sans-serif';
	for(var i=0;i<=4;i++){
		var gy=pT+plotH*i/4;
		var val=max*(1-i/4);
		ctx.strokeStyle=fg;ctx.globalAlpha=0.07;ctx.lineWidth=1;
		ctx.beginPath();ctx.moveTo(pL,gy);ctx.lineTo(w-pR,gy);ctx.stroke();
		ctx.globalAlpha=0.35;ctx.fillStyle=fg;
		ctx.fillText(fmtAxisSpeed(val),pL-6,gy);
	}
	/* X-axis time labels */
	ctx.textAlign='center';ctx.textBaseline='top';ctx.globalAlpha=0.35;
	var xTicks=[0,15,30,45,59];
	var step=plotW/(this.MAX-1);
	for(var t=0;t<xTicks.length;t++){
		var xi=xTicks[t],xx=pL+xi*step;
		var ago=(this.MAX-1-xi)*3;
		ctx.fillText(ago===0?'现在':ago+'s',xx,pT+plotH+6);
	}
	ctx.globalAlpha=1;

	/* Draw areas */
	var self=this;
	function drawArea(data,color,alpha){
		var pts=data.map(function(v,i){return{x:pL+i*step,y:pT+plotH-v/max*plotH};});
		ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
		for(var i=0;i<pts.length-1;i++){
			var xm=(pts[i].x+pts[i+1].x)/2,ym=(pts[i].y+pts[i+1].y)/2;
			ctx.quadraticCurveTo(pts[i].x,pts[i].y,xm,ym);
		}
		ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
		ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
		ctx.lineTo(pL+plotW,pT+plotH);ctx.lineTo(pL,pT+plotH);ctx.closePath();
		var grad=ctx.createLinearGradient(0,pT,0,pT+plotH);
		grad.addColorStop(0,color.replace(')',','+alpha+')').replace('rgb','rgba'));
		grad.addColorStop(1,color.replace(')',',0.02)').replace('rgb','rgba'));
		ctx.fillStyle=grad;ctx.fill();
	}
	drawArea(this.down,'rgb(0,122,255)',0.25);
	drawArea(this.up,'rgb(88,86,214)',0.18);

	/* Hover crosshair */
	if(this.hoverIdx>=0&&this.hoverIdx<this.MAX){
		var hi=this.hoverIdx;
		var hx=pL+hi*step;
		ctx.strokeStyle=fg;ctx.globalAlpha=0.18;ctx.lineWidth=1;
		ctx.setLineDash([4,3]);
		ctx.beginPath();ctx.moveTo(hx,pT);ctx.lineTo(hx,pT+plotH);ctx.stroke();
		ctx.setLineDash([]);ctx.globalAlpha=1;
		/* Bezier-corrected dot positions: curve passes through (prev+6*cur+next)/8 */
		var self=this;
		function curveY(data,idx){
			var raw=data[idx]/max;
			if(idx>0&&idx<data.length-1){
				var p=data[idx-1]/max,c=data[idx]/max,n=data[idx+1]/max;
				raw=(p+6*c+n)/8;
			}
			return pT+plotH-raw*plotH;
		}
		var dy=curveY(this.down,hi);
		var uy=curveY(this.up,hi);
		ctx.fillStyle='rgb(0,122,255)';ctx.beginPath();ctx.arc(hx,dy,5,0,6.28);ctx.fill();
		ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(hx,dy,5,0,6.28);ctx.stroke();
		ctx.fillStyle='rgb(88,86,214)';ctx.beginPath();ctx.arc(hx,uy,5,0,6.28);ctx.fill();
		ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(hx,uy,5,0,6.28);ctx.stroke();
	}
};

return view.extend({
	load:function(){
		return Promise.all([
			callSystemBoard(),
			callSystemInfo(),
			callNetIfDump(),
			fs.trimmed('/sys/class/thermal/thermal_zone0/temp').catch(function(){return'';}),
			fs.read('/proc/net/dev').catch(function(){return'';}),
			fs.exec('/usr/bin/shawnwrt-ota',['status']).catch(function(){return{stdout:''};}),
			callDHCPLeases().catch(function(){return{};}),
			callHostHints().catch(function(){return{};})
		]);
	},

	render:function(data){
		var board=data[0]||{},sysinfo=data[1]||{},netdump=data[2]||{},
		    tempRaw=data[3]||'',netdevText=data[4]||'',otaRes=data[5]||{},
		    dhcpLeases=data[6]||{},hostHints=data[7]||{};

		var hostname=board.hostname||'ShawnWrt';
		var mem=sysinfo.memory||{};
		var memPct=mem.total?Math.round((mem.total-mem.available)/(mem.total)*100):0;
		var loads=sysinfo.load||[0,0,0];
		var cpuPct=Math.min(100,Math.round(loads[0]/65536*100));
		var tempC=tempRaw?Math.round(parseInt(tempRaw)/1000):null;
		var uptime=sysinfo.uptime||0;

		/* Detect WAN status */
		var ifaces=(netdump.interface||[]);
		var wanIf=null,wanUp=false,wanDev='';
		ifaces.forEach(function(f){
			if(f.interface==='wan'||f.interface==='wan6'){
				if(f.up)wanUp=true;
				if(f.interface==='wan'){wanIf=f;wanDev=f.l3_device||f.device||'';}
			}
		});

		/* OTA check */
		var otaInfo={};
		(otaRes.stdout||'').split('\n').forEach(function(l){
			var p=l.indexOf('=');if(p>0)otaInfo[l.slice(0,p)]=l.slice(p+1);
		});
		var hasUpdate=otaInfo.STATE==='update';

		/* Previous net stats for delta calc */
		var prevStats=parseNetDev(netdevText);
		var prevTime=Date.now();

		/* ── Build DOM ── */
		var css=E('style',{},[''+
'#sw-home{color:var(--foreground,#1d1d1f);padding:0 0 2rem;max-width:1200px;margin:0 auto}'+
'.sw-hdr{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem}'+
'.sw-hname{font-size:1.8rem;font-weight:800;margin:0;color:var(--foreground,#1d1d1f);border:none!important}'+
'.sw-hdr-right{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}'+
'.sw-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:100px;font-size:.82rem;font-weight:600;background:rgba(127,127,127,.08);color:var(--foreground,#1d1d1f)}'+
'.sw-pill svg{flex-shrink:0;vertical-align:middle}'+
'.sw-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}'+
'.sw-dot-ok{background:#34c759;box-shadow:0 0 5px rgba(52,199,89,.5)}'+
'.sw-dot-err{background:#ff3b30;box-shadow:0 0 5px rgba(255,59,48,.4)}'+
'.sw-ota-pill{background:linear-gradient(135deg,#007aff,#5856d6);color:#fff!important;cursor:pointer;text-decoration:none;font-weight:700}'+
'.sw-ota-pill:hover{opacity:.88}'+
'.sw-card{background:var(--panel-bg,#fff);border:1px solid var(--border,rgba(0,0,0,.06));border-radius:14px;padding:1.2rem 1.4rem;margin-bottom:1rem;box-shadow:0 1px 8px rgba(0,0,0,.03)}'+
'.sw-card-t{font-size:.8rem;font-weight:700;margin-bottom:.8rem;padding-bottom:.6rem;border-bottom:1px solid var(--border,rgba(0,0,0,.05));display:flex;align-items:center;gap:.5rem;color:var(--foreground,#1d1d1f);text-transform:uppercase;letter-spacing:.03em;opacity:.65}'+
'.sw-ic-wrap{display:inline-flex;align-items:center;justify-content:center;opacity:.7}'+
'.sw-ic-wrap svg{width:16px;height:16px;stroke-width:2.5}'+
'.sw-spd-legend{display:flex;gap:1.2rem;font-size:.82rem;font-weight:600;margin-left:auto;opacity:1;text-transform:none;letter-spacing:0}'+
'.sw-spd-dl{color:#007aff}.sw-spd-ul{color:#5856d6}'+
'.sw-chart-wrap{width:100%;height:210px;position:relative;margin-top:.5rem}'+
'.sw-chart-wrap canvas{position:absolute;top:0;left:0}'+
'.sw-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}'+
'@media(max-width:768px){.sw-row{grid-template-columns:1fr}}'+
'.sw-res-item{display:flex;align-items:center;gap:.5rem;margin-bottom:.7rem}'+
'.sw-res-label{font-size:.82rem;font-weight:700;min-width:34px}'+
'.sw-res-label-cpu{color:#007aff}.sw-res-label-mem{color:#5856d6}.sw-res-label-temp{color:#ff9500}.sw-res-label-uptime{color:#34c759}'+
'.sw-res-info{flex:1;display:flex;align-items:center;gap:.5rem}'+
'.sw-res-val{font-size:.82rem;font-weight:700;min-width:40px;text-align:right}'+
'.sw-bar{height:5px;background:rgba(127,127,127,.12);border-radius:10px;overflow:hidden;flex:1}'+
'.sw-bar-fill{height:100%;border-radius:10px;transition:width .6s ease}'+
'.sw-if-item{display:flex;align-items:center;gap:.6rem;padding:.5rem 0;border-bottom:1px solid var(--border,rgba(0,0,0,.04))}'+
'.sw-if-item:last-child{border:none}'+
'.sw-if-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}'+
'.sw-if-name{font-weight:700;font-size:.88rem}'+
'.sw-if-meta{font-size:.78rem;opacity:.35;margin-left:3px}'+
'.sw-if-ip{font-family:ui-monospace,monospace;font-size:.82rem;margin-left:auto;opacity:.55}'+
'.sw-footer{display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap}'+
'.sw-btn{background:rgba(127,127,127,.07);border:1px solid var(--border,rgba(0,0,0,.06));color:var(--foreground,#1d1d1f);padding:9px 20px;border-radius:10px;font-size:.85rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease;line-height:1.3}'+
'.sw-btn svg{flex-shrink:0;width:15px;height:15px;vertical-align:middle}'+
'.sw-btn:hover{background:#007aff;color:#fff;border-color:#007aff;transform:translateY(-1px);box-shadow:0 3px 10px rgba(0,122,255,.2)}'+
'.sw-btn:active{transform:translateY(0)}'+
'.sw-tooltip{position:fixed;display:none;background:var(--panel-bg,#fff);border:1px solid var(--border,rgba(0,0,0,.1));border-radius:8px;padding:6px 10px;font-size:.78rem;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.1);z-index:9999;pointer-events:none}'+
'.sw-dev-header{display:flex;justify-content:space-between;align-items:center}'+
'.sw-dev-count{font-size:.8rem;font-weight:600;opacity:.4;text-transform:none;letter-spacing:0}'+
'.sw-dev-list{margin-top:1rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}'+
'.sw-dev-row{display:flex;align-items:center;gap:.5rem;padding:.7rem .8rem;border:1px solid var(--border,rgba(0,0,0,.06));border-radius:10px;background:rgba(127,127,127,.02)}'+
'.sw-dev-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;background:#34c759}'+
'.sw-dev-info{flex:1;min-width:0}'+
'.sw-dev-name{font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.sw-dev-brand{font-size:.72rem;opacity:.4;margin-left:4px;font-weight:500}'+
'.sw-dev-meta{font-size:.73rem;opacity:.35;font-family:ui-monospace,monospace}'+
'.sw-dev-right{display:flex;align-items:center;gap:5px;flex-shrink:0}'+
'.sw-dev-ip{font-family:ui-monospace,monospace;font-size:.8rem;opacity:.55}'+
'.sw-dev-act{border:none;background:none;cursor:pointer;padding:3px;border-radius:5px;opacity:.2;transition:all .15s;display:flex;align-items:center;color:var(--foreground,#333)}'+
'.sw-dev-act:hover{opacity:.8;background:rgba(255,59,48,.08);color:#ff3b30}'+
'']);


		var elUptime=E('span',{},['--']);
		var elDot=E('span',{class:'sw-dot '+(wanUp?'sw-dot-ok':'sw-dot-err')});
		var elNetText=E('span',{},[wanUp?'网络正常':'未联网']);
		var elDlSpd=E('strong',{},['0 B/s']);
		var elUlSpd=E('strong',{},['0 B/s']);
		var elCpuPct=E('span',{},['0%']);
		var elCpuBar=E('div',{class:'sw-bar-fill',style:'width:0%;background:#007aff'});
		var elMemPct=E('span',{},['0%']);
		var elMemBar=E('div',{class:'sw-bar-fill',style:'width:0%;background:#5856d6'});
		var elTemp=E('span',{},['--']);
		var elTempBar=E('div',{class:'sw-bar-fill',style:'width:0%;background:#ff9500'});
		var elIfBox=E('div',{});

		/* Header */
		var hdrRight=E('div',{class:'sw-hdr-right'},[
			hasUpdate?E('a',{class:'sw-pill sw-ota-pill',href:L.url('admin/system/shawnwrt-ota')},[E('span',{innerHTML:IC.ota}),' 有新版本']):null,
			E('div',{class:'sw-pill'},[E('span',{innerHTML:IC.clock}),' ',elUptime,' · ',elDot,' ',elNetText])
		].filter(Boolean));

		var chartCanvas=E('canvas',{style:'cursor:crosshair'});
		var chartTooltip=E('div',{class:'sw-tooltip'});
		var chart=null;

		function SVG(html){
			var e=E('span',{class:'sw-ic-wrap'});
			e.innerHTML=html;
			return e;
		}

		var wanEyeVisible = false;
		var elWanEye = E('span', {
			style: 'margin-left:auto; cursor:pointer; opacity:0.6',
			title: '\u5207\u6361\u516c\u7f51IP\u663e\u793a',
			click: function() {
				wanEyeVisible = !wanEyeVisible;
				this.innerHTML = wanEyeVisible ? IC.eye : IC.eyeOff;
				if(typeof renderIfaces === 'function' && typeof lastIfaces !== 'undefined') renderIfaces(lastIfaces);
			}
		});
		elWanEye.innerHTML = IC.eyeOff;

		var container=E('div',{id:'sw-home'},[
			css,
			E('div',{class:'sw-hdr'},[
				E('div',{},[E('h1',{class:'sw-hname'},[hostname])]),
				hdrRight
			]),
			/* Speed card */
			E('div',{class:'sw-card'},[
				E('div',{class:'sw-card-t'},[
					SVG(IC.net),
					'\u5b9e\u65f6\u6d41\u91cf',
					E('div',{class:'sw-spd-legend'},[
						E('span',{class:'sw-spd-dl'},['\u2193 ',elDlSpd]),
						E('span',{class:'sw-spd-ul'},['\u2191 ',elUlSpd])
					])
				]),
				E('div',{class:'sw-chart-wrap'},[chartCanvas,chartTooltip])
			]),
			/* Two-column row */
			E('div',{class:'sw-row'},[
				/* Interfaces */
				E('div',{class:'sw-card'},[
					E('div',{class:'sw-card-t'},[SVG(IC.globe),'\u7f51\u7edc\u63a5\u53e3', elWanEye]),
					elIfBox
				]),
				/* Resources */
				E('div',{class:'sw-card'},[
					E('div',{class:'sw-card-t'},[SVG(IC.cpu),'\u7cfb\u7edf\u8d44\u6e90']),
					E('div',{class:'sw-res-item'},[
						E('div',{class:'sw-res-label sw-res-label-cpu'},['CPU']),
						E('div',{class:'sw-res-info'},[
							E('div',{class:'sw-bar'},[elCpuBar])
						]),
						E('div',{class:'sw-res-val'},[elCpuPct])
					]),
					E('div',{class:'sw-res-item'},[
						E('div',{class:'sw-res-label sw-res-label-mem'},['\u5185\u5b58']),
						E('div',{class:'sw-res-info'},[
							E('div',{class:'sw-bar'},[elMemBar])
						]),
						E('div',{class:'sw-res-val'},[elMemPct])
					]),
					E('div',{class:'sw-res-item'},[
						E('div',{class:'sw-res-label sw-res-label-temp'},['\u6e29\u5ea6']),
						E('div',{class:'sw-res-info'},[
							E('div',{class:'sw-bar'},[elTempBar])
						]),
						E('div',{class:'sw-res-val'},[elTemp])
					])
				])
			]),
			/* Connected devices card */
			E('div',{class:'sw-card'},[
				E('div',{class:'sw-card-t sw-dev-header'},[
					E('div',{style:'display:flex;align-items:center;gap:8px'},[SVG(IC.wifi),'\u5df2\u8fde\u63a5\u8bbe\u5907']),
					E('span',{class:'sw-dev-count',id:'sw-dev-count'},['--'])
				]),
				E('div',{class:'sw-dev-list',id:'sw-dev-list'})
			]),
			/* Footer buttons */
			E('div',{class:'sw-footer'},[
				E('button',{class:'sw-btn',click:function(){location.href=L.url('admin/network/wireless');}},[E('span',{innerHTML:IC.wifi}),'\u65e0\u7ebf\u8bbe\u7f6e']),
				E('button',{class:'sw-btn',click:function(){location.href=L.url('admin/system/shawnwrt-ota');}},[E('span',{innerHTML:IC.ota}),'\u7cfb\u7edf\u5347\u7ea7']),
				E('button',{class:'sw-btn',click:function(){if(confirm('\u786e\u5b9a\u91cd\u542f\u8def\u7531\u5668\uff1f'))location.href=L.url('admin/system/reboot');}},[E('span',{innerHTML:IC.power}),'\u91cd\u542f'])
			])
		]);

		/* Render interfaces */
		var lastIfaces = [];
		var wanIpCache = {};
		function renderIfaces(ifList){
			lastIfaces = ifList;
			while(elIfBox.firstChild)elIfBox.removeChild(elIfBox.firstChild);
			ifList.forEach(function(f){
				if(f.interface==='loopback')return;
				var addrs=(f['ipv4-address']||[]).map(function(a){return a.address;}).join(', ')||'--';
				var dev=f.l3_device||f.device||'';
				var up=!!f.up;
				var isWan = (f.interface==='wan'||f.interface==='wan6');
				var txtNode = E('span', {}, [addrs]);
				
				if(isWan) {
				    var displayIp = addrs;
				    if (wanIpCache[f.interface]) {
				        displayIp = wanIpCache[f.interface];
				    } else if (up && addrs !== '--') {
				        fetch('https://myip.ipip.net').then(function(r){return r.text();}).then(function(t){
						    var m=t.match(/IP：(\S+)\s+来自于：(.*)/);
						    if(m) {
						        var fullIp = m[1]+' ('+m[2].trim()+')';
						        wanIpCache[f.interface] = fullIp;
						        txtNode.textContent = wanEyeVisible ? fullIp : maskIp(fullIp);
						    }
					    }).catch(function(){});
				    }
				    txtNode.textContent = wanEyeVisible ? displayIp : maskIp(displayIp);
				}
				
				var ipSpan=E('div',{class:'sw-if-ip', style:'display:flex;align-items:center;justify-content:flex-end'},[txtNode]);
				
				elIfBox.appendChild(E('div',{class:'sw-if-item',style:up?'':'opacity:0.4;filter:grayscale(1)'},[
					E('div',{class:'sw-if-dot '+(up?'sw-if-dot-up':'sw-if-dot-down')}),
					E('span',{class:'sw-if-name'},[f.interface.toUpperCase()]),
					E('span',{class:'sw-if-meta'},[dev]),
					ipSpan
				]));
			});
		}
		renderIfaces(ifaces);

		/* Render connected devices */
		var OUI_MAP={
			'00:50:F2':'Microsoft','3C:22:FB':'Apple','A4:83:E7':'Apple','F0:18:98':'Apple',
			'DC:A6:32':'Raspberry Pi','B8:27:EB':'Raspberry Pi','78:02:F8':'Xiaomi','64:CC:2E':'Xiaomi',
			'A8:51:AB':'Samsung','48:A4:72':'Huawei','AC:E2:15':'OPPO','2C:8D:B1':'vivo'
		};
		function ouiBrand(mac){
			var prefix=(mac||'').toUpperCase().slice(0,8);
			return OUI_MAP[prefix]||'';
		}
		function devIcon(name, brand) {
			name = (name||'').toLowerCase();
			brand = (brand||'').toLowerCase();
			if(name.includes('watch')||name.includes('wear')) return IC.watch;
			if(name.includes('ipad')||name.includes('pad')||name.includes('tab')) return IC.pad;
			if(name.includes('mac')||name.includes('pc')||name.includes('desktop')||name.includes('laptop')||name.includes('windows')||name.includes('thinkpad')) return IC.pc;
			if(name.includes('iphone')||name.includes('phone')||brand.includes('huawei')||brand.includes('xiaomi')||brand.includes('oppo')||brand.includes('vivo')||brand.includes('samsung')||brand.includes('apple')) return IC.phone;
			return IC.globe;
		}
		function renderDevices(leases,hints,wirelessMacs){
			var devList=container.querySelector('#sw-dev-list');
			var devCount=container.querySelector('#sw-dev-count');
			if(!devList)return;
			var items=[];
			var seen={};
			var allLeases=[].concat(leases.dhcp_leases||[],leases.dhcp6_leases||[]);
			allLeases.forEach(function(l){
				var mac=(l.macaddr||'').toUpperCase();
				if(!mac||seen[mac])return;
				seen[mac]=true;
				var name=l.hostname||'';
				if(!name&&hints&&hints[mac]&&hints[mac].name)name=hints[mac].name;
				items.push({name:name||mac.slice(-8),mac:mac,ip:l.ipaddr||l.ip6addr||'--',brand:ouiBrand(mac)});
			});
			devCount.textContent=items.length+' \u53f0\u8bbe\u5907';
			while(devList.firstChild)devList.removeChild(devList.firstChild);
			if(!items.length){
				devList.appendChild(E('div',{style:'text-align:center;padding:1.5rem;opacity:.3;font-size:.8rem'},['\u6682\u65e0\u8bbe\u5907']));
				return;
			}
			items.forEach(function(d){
				var isWifi=wirelessMacs&&(wirelessMacs[d.mac]===true);
				var tagStyle=isWifi?'background:rgba(0,122,255,0.08);color:#007aff;':'background:rgba(88,86,214,0.08);color:#5856d6;';
				var tagText=isWifi?'\u65e0\u7ebf':'\u6709\u7ebf';
				var tag=E('span',{style:'font-size:0.68rem;padding:2px 5px;border-radius:4px;margin-left:6px;font-weight:600;vertical-align:middle;'+tagStyle},[tagText]);
				var nameRow=[E('span',{style:'vertical-align:middle;'},[d.name]),tag];
				if(d.brand)nameRow.push(E('span',{class:'sw-dev-brand'},[d.brand]));
				devList.appendChild(E('div',{class:'sw-dev-row'},[
					E('div',{class:'sw-dev-dot',style:'background:transparent;width:auto;height:auto;opacity:0.6;margin-right:2px;'},[SVG(devIcon(d.name,d.brand))]),
					E('div',{class:'sw-dev-info'},[
						E('div',{class:'sw-dev-name'},nameRow),
						E('div',{class:'sw-dev-meta'},[d.mac])
					]),
					E('div',{class:'sw-dev-right'},[
						E('span',{class:'sw-dev-ip'},[d.ip]),
						E('button',{class:'sw-dev-act',title:'\u65ad\u5f00/\u62c9\u9ed1',innerHTML:IC.block,click:function(){
							if(confirm('\u662f\u5426\u5c06 '+d.name+' \u52a0\u5165\u9ed1\u540d\u5355\u5e76\u65ad\u5f00\u8fde\u63a5\uff1f\n\n(\u5f53\u524d\u4e3a\u6f14\u793a\u6a21\u5f0f\uff0c\u8bf7\u524d\u5f80[\u65e0\u7ebf\u8bbe\u7f6e]\u4fee\u6539MAC\u8fc7\u6ee4\u89c4\u5219)'))
								location.href=L.url('admin/network/wireless');
						}})
					])
				]));
			});
		}
		renderDevices(dhcpLeases,hostHints,{});

		/* Initial values */
		elUptime.textContent=fmtUptime(uptime);
		elCpuPct.textContent=cpuPct+'%';
		elCpuBar.style.width=cpuPct+'%';
		elMemPct.textContent=memPct+'%';
		elMemBar.style.width=memPct+'%';
		elTemp.textContent=tempC!==null?tempC+' °C':'N/A';

		/* Init chart after DOM attached */
		requestAnimationFrame(function(){
			chart=new SpeedChart(chartCanvas,chartTooltip);
			chart.draw();
		});

		/* Polling - 3s interval, minimal CPU */
		poll.add(function(){
			return Promise.all([
				callSystemInfo(),
				fs.read('/proc/net/dev').catch(function(){return'';}),
				fs.trimmed('/sys/class/thermal/thermal_zone0/temp').catch(function(){return'';})
			]).then(function(r){
				var si=r[0]||{},ndText=r[1]||'',tRaw=r[2]||'';
				var now=Date.now();
				var dt=(now-prevTime)/1000;
				prevTime=now;

				/* Uptime */
				var upTxt=fmtUptime(si.uptime||0);
				elUptime.textContent=upTxt;

				/* CPU & Memory */
				var ld=si.load||[0];
				var cp=Math.min(100,Math.round(ld[0]/65536*100));
				elCpuPct.textContent=cp+'%';
				elCpuBar.style.width=cp+'%';
				if(cp>80)elCpuBar.style.background='#ff3b30';
				else if(cp>50)elCpuBar.style.background='#ff9500';
				else elCpuBar.style.background='#007aff';

				var mi=si.memory||{};
				var mp=mi.total?Math.round((mi.total-mi.available)/mi.total*100):0;
				elMemPct.textContent=mp+'%';
				elMemBar.style.width=mp+'%';

				/* Temperature */
				var tc=tRaw?Math.round(parseInt(tRaw)/1000):null;
				elTemp.textContent=tc!==null?tc+' °C':'N/A';
				if(tc!==null){
					var tp=Math.min(100,Math.max(0,Math.round((tc/100)*100)));
					elTempBar.style.width=tp+'%';
					if(tc>85)elTempBar.style.background='#ff3b30';
					else if(tc>75)elTempBar.style.background='#ff9500';
					else elTempBar.style.background='#34c759';
				}

				/* Network speed */
				var curStats=parseNetDev(ndText);
				var totalDl=0,totalUl=0;
				var trackDev=wanDev||'';
				if(trackDev&&curStats[trackDev]&&prevStats[trackDev]&&dt>0){
					totalDl=Math.max(0,(curStats[trackDev].rx-prevStats[trackDev].rx)/dt);
					totalUl=Math.max(0,(curStats[trackDev].tx-prevStats[trackDev].tx)/dt);
				}else{
					/* fallback: sum all non-lo */
					for(var k in curStats){
						if(k==='lo'||!prevStats[k])continue;
						totalDl+=Math.max(0,(curStats[k].rx-prevStats[k].rx)/dt);
						totalUl+=Math.max(0,(curStats[k].tx-prevStats[k].tx)/dt);
					}
					totalDl=totalDl/2;totalUl=totalUl/2;
				}
				prevStats=curStats;

				elDlSpd.textContent=fmtSpeed(totalDl);
				elUlSpd.textContent=fmtSpeed(totalUl);
				if(chart)chart.push(totalDl,totalUl);
			});
		},3);

		/* Refresh interfaces + devices + connectivity every 30s */
		poll.add(function(){
			return Promise.all([
				callNetIfDump(),
				callDHCPLeases().catch(function(){return{};}),
				callHostHints().catch(function(){return{};}),
				fs.read('/proc/net/dev').catch(function(){return'';})
			]).then(function(res){
				var d=res[0]||{},leases=res[1]||{},hints=res[2]||{},ndText=res[3]||'';
				var il=(d).interface||[];
				renderIfaces(il);
				var curStats=parseNetDev(ndText);
				var wlanIfaces=Object.keys(curStats).filter(function(k){return /^(phy|wlan|ra|rax|wl)/.test(k);});
				Promise.all(wlanIfaces.map(function(dev){return callIwinfoAssoc(dev).catch(function(){return{};});}))
				.then(function(assocRes){
					var wirelessMacs={};
					assocRes.forEach(function(assoc){
						if(assoc&&assoc.results) assoc.results.forEach(function(c){wirelessMacs[c.mac.toUpperCase()]=true;});
					});
					renderDevices(leases,hints,wirelessMacs);
				});
				/* Update WAN status */
				var wUp=false;
				il.forEach(function(f){if((f.interface==='wan'||f.interface==='wan6')&&f.up)wUp=true;});
				elDot.className='sw-dot '+(wUp?'sw-dot-ok':'sw-dot-err');
				elNetText.textContent=wUp?'网络正常':'未联网';
			});
		},30);

		/* Fetch initial wireless MACs */
		var initWlanIfaces=Object.keys(prevStats).filter(function(k){return /^(phy|wlan|ra|rax|wl)/.test(k);});
		Promise.all(initWlanIfaces.map(function(dev){return callIwinfoAssoc(dev).catch(function(){return{};});}))
		.then(function(assocRes){
			var wirelessMacs={};
			assocRes.forEach(function(assoc){
				if(assoc&&assoc.results) assoc.results.forEach(function(c){wirelessMacs[c.mac.toUpperCase()]=true;});
			});
			renderDevices(dhcpLeases,hostHints,wirelessMacs);
		});

		return container;
	},

	handleSaveApply:null,
	handleSave:null,
	handleReset:null
});

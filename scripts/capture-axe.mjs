// 只渲染源码模型并截图，不运行测试或游戏模拟。
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';

const server = await createServer({ server: { host: '127.0.0.1', port: 5176, strictPort: true, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
  await page.route('**/axe-capture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#101b22;color:#e5edef;font-family:Arial,"Microsoft YaHei",sans-serif;padding:36px}
    h1{font-size:30px;margin:0 0 10px}p{color:#9cabb1;margin:0 0 24px}.grid{display:flex;gap:18px}.panel{position:relative;flex:1;background:#1b2932;border:1px solid #374850;border-radius:8px;overflow:hidden}
    .label{position:absolute;top:18px;left:20px;font-size:19px}.foot{position:absolute;bottom:16px;left:20px;color:#a0b2b8;font-size:15px}canvas{display:block;width:100%;height:100%}
    </style><h1 id="title"></h1><p id="subtitle"></p><div class="grid" id="grid"></div><script type="module">
    import * as THREE from '/node_modules/three/build/three.module.js';
    import {prepareProceduralWeapon} from '/src/game/weapon.ts';
    import {WEAPONS} from '/src/game/weapons.ts';
    const definition=WEAPONS.find(w=>w.id==='axe');
    const cleanups=[];
    window.drawAxe=(mode)=>{
      cleanups.splice(0).forEach(fn=>fn());
      document.getElementById('grid').innerHTML='';
      document.getElementById('title').textContent=mode==='model'?'消防斧 · 模型实拍':'消防斧 · 斜劈动作分解';
      document.getElementById('subtitle').textContent=mode==='model'?'实际 Three.js 源码模型｜宽刃、尖背、贯穿斧眼的长柄与防滑握把':'实际攻击动画采样｜右上蓄力 → 刃口向左下切入 → 顺势收斧';
      const views=mode==='model'?[['斧头与长柄',0],['斜侧面',0]]:[['01 / 蓄力',.22],['02 / 劈砍',.40],['03 / 收势',.60]];
      for(let index=0;index<views.length;index++){
        const [label,progress]=views[index];
        const panel=document.createElement('div');panel.className='panel';panel.style.height=mode==='model'?'780px':'540px';
        panel.style.flex='none';panel.style.width=((document.getElementById('grid').clientWidth-18*(views.length-1))/views.length)+'px';
        panel.innerHTML='<div class="label">'+label+'</div><div class="foot">'+(mode==='model'?'消防斧 / 原创低多边形模型':'第一人称持握比例 · 动作进度 '+Math.round(progress*100)+'%')+'</div>';
        document.getElementById('grid').append(panel);
        const scene=new THREE.Scene();scene.background=new THREE.Color(0x1b2932);
        scene.add(new THREE.HemisphereLight(0xe9f3ff,0x475245,3));
        const key=new THREE.DirectionalLight(0xffe1b0,3.5);key.position.set(-3,5,4);scene.add(key);
        const rim=new THREE.DirectionalLight(0x93caff,2);rim.position.set(3,1,-2);scene.add(rim);
        const rig=prepareProceduralWeapon(definition);scene.add(rig.holder);
        rig.sample(mode==='model'?'idle':'fire',progress);
        const width=panel.clientWidth,height=panel.clientHeight;
        let camera;
        if(mode==='model'){
          camera=new THREE.PerspectiveCamera(36,width/height,.01,30);
          const center=new THREE.Box3().setFromObject(rig.holder).getCenter(new THREE.Vector3());
          camera.position.copy(center).add(new THREE.Vector3(index===0?0:1.05,.10,index===0?2.25:2.05));camera.lookAt(center);
        }else{
          camera=new THREE.PerspectiveCamera(61,width/height,.01,30);
          // 相同镜头与持握变换；画板额外留白以显示完整轨迹。
          rig.holder.scale.setScalar(.5);rig.holder.position.set(.19,-.20,-.38);
          camera.position.set(.10,-.13,.80);
        }
        const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(width,height);renderer.setPixelRatio(1);
        renderer.toneMapping=THREE.ACESFilmicToneMapping;panel.append(renderer.domElement);renderer.render(scene,camera);
        cleanups.push(()=>{rig.dispose();renderer.dispose()});
      }
    };
    window.drawAxe('model');
    </script></html>` }));
  await page.goto('http://127.0.0.1:5176/axe-capture');
  await page.waitForFunction(() => typeof window.drawAxe === 'function');
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/fire-axe-model.png' });
  await page.setViewportSize({ width: 1500, height: 710 });
  await page.evaluate(() => window.drawAxe('action'));
  await page.screenshot({ path: 'docs/screenshots/fire-axe-swing.png' });
  console.log('已保存消防斧模型和斜劈动作截图');
} finally {
  await browser?.close();
  await server.close();
}

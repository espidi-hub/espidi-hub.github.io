// Each manufacturing film is painted on white paper: black adds material (or a
// mask opening). Normal can erase ink with white; multiply leaves it intact.
const pcbLayers = ['copper', 'mask', 'silk'];
const filmLabels = {auto:'По цветам дизайна', copper:'Медь', mask:'Окна маски', silk:'Шелкография'};
let previewFilm='';
const filmRect = '<rect width="748" height="458"';
const fixedSigns = Array.from({length:6}, (_,i) => '<use href="#@@legend'+i+'" fill="black"/>').join('');

function filmColors(svg, key, target) {
  return svg.replace(/(fill|stroke)="(#[\da-f]{6})"/gi, (_, attr, color) => {
    const c = color.toLowerCase();
    const gold = c === '#c2a269', silk = c === '#d3d5c8';
    const match = target === 'auto' ? (key === 'silk' ? silk : key === 'mask' ? gold : !silk) : key === target;
    return attr+'="'+(match ? 'black' : 'none')+'"';
  });
}

function filmObject(o, i, key, join) {
  const target = o.pcb || (o.imported ? 'silk' : 'auto');
  if (target !== 'auto' && key !== target) return '';
  const shapes = o.imported ? o.svg : filmColors(o.svg, key, target);
  const obj = '<g data-transform="'+i+'" transform="'+tx(o)+'" style="mix-blend-mode:'+o.blend+'">'+shapes+'</g>';
  return join && o.role !== undefined ? '<g mask="url(#@@zone'+o.role+')">'+obj+'</g>' : obj;
}

function studioBoard(p, hit=false, proof=null) {
  const prefix='film'+(++serial)+'_';
  const join=p.join ? joinFields(p) : null;
  let defs=BASE.slice(BASE.indexOf('<defs>')+6,BASE.indexOf('</defs>'));
  if(join) defs+=join.fields.map((s,i)=>'<mask id="@@zone'+i+'" maskUnits="userSpaceOnUse" x="-10" y="-10" width="768" height="478">'+s+'</mask>').join('');
  const art=[], legends=[];
  p.items.forEach((o,i)=>(o.kind==='legend'?legends:art).push([o,i]));
  defs+='<mask id="@@movableGaps">'+filmRect+' fill="white"/>'+legends.map(([o,i])=>'<g data-transform="'+i+'" transform="'+tx(o)+'" stroke="black" stroke-width="2.2">'+o.svg.replace(/fill="[^"]*"/g,'fill="black"')+'</g>').join('')+'</mask>';
  // Luminance of the final composite, not a per-object threshold.
  defs+='<filter id="@@invert" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-.2126 -.7152 -.0722 0 1  -.2126 -.7152 -.0722 0 1  -.2126 -.7152 -.0722 0 1  0 0 0 1 0"/></filter>';
  for(const key of proof?[proof]:pcbLayers){
    const decorations=s=>filmColors(s,key,'auto');
    const ink=(join?decorations(join.backdrop):'')+art.map(([o,i])=>filmObject(o,i,key,join)).join('')+(join?decorations(join.detail):'');
    const letters=legends.map(([o,i])=>filmObject(o,i,key,join)).join('');
    defs+='<mask id="@@'+key+'" maskUnits="userSpaceOnUse" x="0" y="0" width="748" height="458"><g filter="url(#@@invert)">'+filmRect+' fill="white"/><g mask="url(#m99999)"><g mask="url(#@@movableGaps)">'+ink+'</g>'+letters+'</g>'+(key==='silk'?fixedSigns:'')+'</g></mask>';
  }
  const color=(key,c)=>filmRect+' fill="'+c+'" mask="url(#@@'+key+')"/>';
  if(!proof) defs+='<mask id="@@covered">'+filmRect+' fill="white"/>'+filmRect+' fill="black" mask="url(#@@mask)"/></mask>';
  let view;
  if(proof) view=filmRect+' fill="white"/>'+color(proof,'black');
  else {
    view=filmRect+' fill="#191d1c"/>'+color('copper',colors[2])+
      '<g mask="url(#@@mask)">'+filmRect+' fill="#745c3b"/>'+color('copper',colors[0])+'</g>'+'<g mask="url(#@@covered)">'+color('silk',colors[1])+'</g>';
  }
  if(hit) {
    view+='<g opacity="0">'+p.items.map((o,i)=>'<g data-item="'+i+'" transform="'+tx(o)+'">'+o.svg+'</g>').join('')+'</g>';
    const selected=p.items[chosen];
    if(selected?.imported){
      const box=selected.box;
      view+='<rect data-selection="" data-transform="'+chosen+'" transform="'+tx(selected)+'" x="'+box.x+'" y="'+box.y+'" width="'+box.w+'" height="'+box.h+'" fill="none" stroke="#aad4eb" stroke-width="1.4" stroke-dasharray="6 5" pointer-events="none"/>';
    }
  }
  return ('<svg xmlns="http://www.w3.org/2000/svg" class="board" viewBox="-2 -2 752 462"><defs>'+defs+'</defs><g mask="url(#m12)">'+view+'</g></svg>').replace(/(id="|url\(#)(m12|m99999|d12)(?=[")])/g,'$1'+prefix+'$2').replaceAll('@@',prefix);
}

function saveBlob(blob, filename) {
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:filename});
  a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}

async function sampleFilm(p,key,plate) {
  // Studio origin = (208.28, 19.05) mm, 10 units/mm. Sample at the
  // existing template's raster origin (208.48, 18.93), 0.2 mm/cell.
  const svg=studioBoard(p,false,key).replace('viewBox="-2 -2 752 462"','viewBox="2 1.2 744 456" width="'+plate.W+'" height="'+plate.H+'"');
  const img=new Image(), url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try {
    img.src=url;await img.decode();
    const canvas=document.createElement('canvas');
    canvas.width=plate.W;canvas.height=plate.H;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    return Uint8Array.from({length:plate.W*plate.H},(_,i)=>Number(pixels[4*i]<128));
  } finally {URL.revokeObjectURL(url)}
}

async function downloadGerber(btn) {
  const p=structuredClone(project);btn.disabled=true;
  try {
    const [plate,zip,response]=await Promise.all([import('./faceplate/plate.js'),import('./vendor/fflate/browser.js'),fetch('./faceplate/ESPIDI-BLANK.zip')]);
    if(!response.ok)throw Error('Template');
    const files=zip.unzipSync(new Uint8Array(await response.arrayBuffer()));
    const bits={};
    for(const key of pcbLayers)bits[key]=await sampleFilm(p,key,plate);
    const result=plate.artwork(bits);
    for(const [key,name] of Object.entries(plate.layers))
      files[name]=zip.strToU8(plate.gerber(zip.strFromU8(files[name]),result[key]));
    saveBlob(new Blob([zip.zipSync(files,{level:6})],{type:'application/zip'}),'ESPidi-v1-faceplate.zip');
  } catch(error) {console.error(error);alert(translate('Не удалось собрать Gerber ZIP.'))}
  finally {btn.disabled=false}
}

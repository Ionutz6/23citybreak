(() => {
  const controls = [
    {id:'f-adults', label:'Călători', min:'1', max:'4'},
    {id:'quick-duration', label:'Durata zborului / sens', min:'2 ore', max:'6 ore'},
    {id:'f-max-price', label:'Buget max. / persoană', min:'minim', max:'fără limită'},
    {id:'f-fri-dep', label:'Plecare la dus', min:'06:00', max:'20:00'},
    {id:'f-out-arr', label:'Sosire la destinație', min:'23:00', max:'02:00'},
    {id:'f-sun-dep', label:'Plecare la retur', min:'12:00', max:'20:00'},
    {id:'f-in-arr', label:'Sosire acasă', min:'23:00', max:'02:00'}
  ];
  const sliders = controls.map(({id,label,min,max}) => {
    const select = document.getElementById(id), parent = select.parentElement;
    const originalLabel = parent.querySelector('label');
    const slider = document.createElement('input'); slider.type='range'; slider.id=`${id}-slider`; slider.className='option-slider'; slider.min='0'; slider.max=String(select.options.length-1); slider.step='1';
    const value = document.createElement('div'); value.className='slider-value';
    const ends = document.createElement('div'); ends.className='slider-ends'; ends.innerHTML=`<span>${min}</span><span>${max}</span>`;
    originalLabel.htmlFor=slider.id; originalLabel.textContent=label;
    select.hidden=true; select.setAttribute('tabindex','-1');
    select.insertAdjacentElement('afterend',value); value.insertAdjacentElement('afterend',slider); slider.insertAdjacentElement('afterend',ends);
    const sync=()=>{slider.value=String(select.selectedIndex); value.textContent=select.selectedOptions[0]?.textContent || ''; slider.setAttribute('aria-valuetext',value.textContent);};
    slider.addEventListener('input',()=>{select.selectedIndex=Number(slider.value); sync(); select.dispatchEvent(new Event('change',{bubbles:true}));});
    select.addEventListener('change',sync); sync(); return sync;
  });
  const syncAll=()=>sliders.forEach(sync=>sync());
  const previousRender=renderMatrix; renderMatrix=function(...args){const result=previousRender.apply(this,args); syncAll(); return result;};
  const previousExpand=expandSearchFilters; expandSearchFilters=function(...args){const result=previousExpand.apply(this,args); syncAll(); return result;};
  document.getElementById('f-max-dur').addEventListener('change',syncAll);
  document.getElementById('currency-select').addEventListener('change',()=>setTimeout(syncAll,0));
  new MutationObserver(syncAll).observe(document.getElementById('f-max-price'),{subtree:true,childList:true,characterData:true});
})();

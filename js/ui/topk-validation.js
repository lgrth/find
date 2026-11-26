// Inline validation for topK (3-20)
(function(){
  const inp = document.getElementById('topK');
  const help = document.getElementById('topKHelp');
  if(!inp || !help) return;
  const validate = ()=>{
    const v = Number(inp.value);
    if(!inp.value){
      inp.classList.remove('is-valid','is-invalid');
      return;
    }
    if(v>=3 && v<=50){
      inp.classList.add('is-valid');
      inp.classList.remove('is-invalid');
      help.textContent = 'อยู่ในช่วง 3–50 พร้อมคำนวณ';
    }else{
      inp.classList.add('is-invalid');
      inp.classList.remove('is-valid');
      help.textContent = 'ใส่ค่าระหว่าง 3–50 เท่านั้น';
    }
  };
  inp.addEventListener('input', validate);
  validate();
})();

(() => {
  // Ordered against the original, unlabelled map assets saved for the quiz.
  const slugs = 'edinburgh,budapesta,bruxelles,chisinau,viena,lyon,porto,bologna,paris,milano,venetia,copenhaga,madrid,barcelona,atena,roma,pisa-florenta,napoli,amsterdam,nisa,londra,istanbul,lisabona,varsovia,berlin,dublin,valencia,sevilla,cracovia,malaga,munchen,bari,split,stockholm,dubrovnik,palermo,salonic,zurich,catania,bratislava,tallinn,oslo,marsilia,bordeaux,riga,sofia,helsinki,bruges,belgrad,vilnius,ljubljana,glasgow,koln-bonn'.split(',');
  const questions = slugs.map((slug, i) => {
    const entry = Object.entries(illustratedGuides).find(([, guide]) => guide.image === slug);
    if (!entry) return null;
    const [id, guide] = entry;
    const city = ALL_EUROPE_CITIES.find(c => c.id === id);
    if (!city) return null;
    return {id, guide, name: slug === 'pisa-florenta' ? 'Pisa și Florența' : slug === 'koln-bonn' ? 'Köln' : city.name, image: `ilustratii-quiz/ilustratie-${String(i+1).padStart(3,'0')}.webp`};
  }).filter(Boolean);
  const section = document.getElementById('city-quiz');
  if (questions.length < 4) return;
  section.hidden = false;
  const image = document.getElementById('quiz-image'), options = document.getElementById('quiz-options'), feedback = document.getElementById('quiz-feedback'), actions = document.getElementById('quiz-actions'), search = document.getElementById('quiz-search');
  const shuffle = array => { const result = [...array]; for (let i=result.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];} return result; };
  let deck = shuffle(questions), current;
  function showQuestion() {
    if (!deck.length) { deck = shuffle(questions); if (deck.at(-1) === current) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]]; }
    current = deck.pop();
    image.src = current.image;
    options.replaceChildren(); feedback.replaceChildren(); feedback.hidden = true; actions.hidden = true;
    const choices = shuffle([current, ...shuffle(questions.filter(q => q !== current && q.name !== current.name)).slice(0,3)]);
    choices.forEach(choice => {
      const button = document.createElement('button'); button.type='button'; button.className='quiz-option'; button.textContent=choice.name;
      button.addEventListener('click', () => {
        options.querySelectorAll('button').forEach(item => {item.disabled=true; if(item.textContent===current.name) item.classList.add('correct');});
        if (choice !== current) button.classList.add('wrong');
        const heading=document.createElement('strong'); heading.textContent=choice===current ? `Corect! ${current.name}.` : `Aproape! Răspunsul este ${current.name}.`;
        const detail=document.createElement('span'); const landmarks=current.guide.legend.slice(0,2).map(place => place[1]); detail.textContent = `De descoperit: ${landmarks.join(' și ')}.`;
        feedback.replaceChildren(heading,detail); feedback.hidden=false; search.textContent=`Caută zboruri spre ${current.name} ↗`; actions.hidden=false;
      });
      options.append(button);
    });
  }
  search.addEventListener('click', () => { selectDestination(current.id); document.getElementById('configurator').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); document.getElementById('dest-search-input').focus({preventScroll:true}); });
  document.getElementById('quiz-next').addEventListener('click', () => {showQuestion(); options.querySelector('button').focus({preventScroll:true});});
  showQuestion();
})();

// Cardul „Ce te aduce într-un oraș?” din profil (cont.html): genuri muzicale, sporturi, competiții, echipe și artiști favoriți.
// Tabela: event_preferences (supabase/SCHEMA.md). Rândul poate lipsi; atunci totul e gol.
//   window.ProfileInterests.card(sb) → Promise<HTMLElement>
(() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const MUSIC = [['rock', 'Rock'], ['pop', 'Pop'], ['electronic', 'Electronică'], ['hiphop', 'Hip-hop'], ['metal', 'Metal'], ['indie', 'Indie / alternativ'], ['jazz', 'Jazz / blues'], ['classical', 'Clasică / operă'], ['latin', 'Latino'], ['folk', 'Folk / world']];
  const SPORTS = [['football', 'Fotbal'], ['basketball', 'Baschet'], ['tennis', 'Tenis'], ['f1', 'Formula 1'], ['motogp', 'MotoGP'], ['rugby', 'Rugby'], ['running', 'Maratoane']];
  const COMPETITIONS = [['CL', 'Champions League'], ['PL', 'Premier League'], ['PD', 'La Liga'], ['SA', 'Serie A'], ['BL1', 'Bundesliga'], ['FL1', 'Ligue 1'], ['DED', 'Eredivisie'], ['PPL', 'Primeira Liga'], ['6N', 'Six Nations (rugby)']];
  const OTHER = [['festival', 'Festivaluri de muzică'], ['xmas_market', 'Târguri de Crăciun'], ['city_festival', 'Sărbători de oraș'], ['theatre', 'Teatru / operă / balet'], ['comedy', 'Stand-up']];
  const EMPTY = { music_genres: [], sports: [], competitions: [], other_interests: [], favorite_teams: [], favorite_artists: [], event_alerts: false };
  const clean = s => String(s).replace(/\s+/g, ' ').trim().slice(0, 60);

  function chipGroup(legend, hint, options, selected) {
    const g = el('fieldset', 'acct-group'); g.append(el('legend', null, legend)); if (hint) g.append(el('p', 'acct-hint', hint));
    const wrap = el('div', 'acct-chips'); const set = new Set(selected);
    for (const [key, label] of options) {
      const b = el('button', 'acct-chip'); b.type = 'button'; b.append(el('span', null, label)); b.setAttribute('aria-pressed', String(set.has(key)));
      b.addEventListener('click', () => { set.has(key) ? set.delete(key) : set.add(key); b.setAttribute('aria-pressed', String(set.has(key))); });
      wrap.append(b);
    }
    g.append(wrap);
    return { node: g, read: () => options.map(([k]) => k).filter(k => set.has(k)) };
  }

  // Listă de nume introduse liber (echipe, artiști): câmp + Enter sau virgulă, fiecare nume se poate șterge.
  function tagGroup(legend, hint, placeholder, values, max) {
    const g = el('fieldset', 'acct-group'); g.append(el('legend', null, legend), el('p', 'acct-hint', hint));
    const list = el('div', 'acct-chips acct-tags'); const items = [...values];
    const row = el('div', 'acct-row');
    const input = el('input', 'acct-input'); input.type = 'text'; input.placeholder = placeholder; input.maxLength = 60; input.setAttribute('aria-label', legend); input.autocomplete = 'off';
    const add = el('button', 'acct-secondary', 'Adaugă'); add.type = 'button';
    const draw = () => {
      list.replaceChildren(...items.map((name, i) => {
        const b = el('button', 'acct-chip acct-tag'); b.type = 'button'; b.setAttribute('aria-label', `Șterge ${name}`);
        b.append(el('span', null, `${name} ✕`));
        b.addEventListener('click', () => { items.splice(i, 1); draw(); input.focus(); });
        return b;
      }));
      list.hidden = !items.length;
    };
    const commit = () => {
      for (const raw of input.value.split(',')) {
        const name = clean(raw);
        if (name && items.length < max && !items.some(x => x.toLowerCase() === name.toLowerCase())) items.push(name);
      }
      input.value = ''; draw();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } });
    add.addEventListener('click', () => { commit(); input.focus(); });
    row.append(input, add); g.append(list, row); draw();
    return { node: g, read: () => { commit(); return [...items]; } };
  }

  async function card(sb) {
    const c = el('section', 'acct-card');
    c.append(el('span', 'acct-kicker', 'EVENIMENTE'), el('h2', null, 'Ce te aduce într-un oraș?'),
      el('p', 'acct-intro', 'Îți arătăm întâi weekendurile cu concerte, meciuri și festivaluri pe gustul tău. Totul e opțional.'));
    let prefs = EMPTY;
    try { const {data} = await sb.from('event_preferences').select('*').maybeSingle(); if (data) prefs = {...EMPTY, ...data}; } catch {}
    const music = chipGroup('Muzică', 'Genurile la care ai merge la un concert.', MUSIC, prefs.music_genres);
    const artists = tagGroup('Artiști sau trupe preferate', 'Scrie un nume și apasă Enter.', 'ex. Coldplay', prefs.favorite_artists, 30);
    const sports = chipGroup('Sport', 'Ce ai vedea pe viu.', SPORTS, prefs.sports);
    const comps = chipGroup('Competiții', null, COMPETITIONS, prefs.competitions);
    const teams = tagGroup('Echipe preferate', 'Scrie un nume și apasă Enter.', 'ex. Real Madrid', prefs.favorite_teams, 20);
    const other = chipGroup('Alte motive de drum', null, OTHER, prefs.other_interests);
    const alertRow = el('label', 'acct-check');
    const alert = el('input'); alert.type = 'checkbox'; alert.checked = !!prefs.event_alerts;
    alertRow.append(alert, el('span', null, 'Anunță-mă pe email când un artist sau o echipă preferată are un eveniment într-un oraș cu zbor de weekend.'));
    const save = el('button', 'acct-primary', 'Salvează'); save.type = 'button';
    const status = el('span', 'acct-status'); status.setAttribute('role', 'status');
    save.addEventListener('click', async () => {
      save.disabled = true; status.textContent = 'Se salvează...';
      const row = { music_genres: music.read(), favorite_artists: artists.read(), sports: sports.read(), competitions: comps.read(), favorite_teams: teams.read(), other_interests: other.read(), event_alerts: alert.checked };
      try {
        const {error} = await sb.from('event_preferences').upsert(row); if (error) throw error;
        try { localStorage.setItem('23cb-event-prefs', JSON.stringify(row)); } catch {}
        status.textContent = 'Salvat ✓';
      } catch { status.textContent = 'Nu am putut salva acum.'; }
      save.disabled = false;
    });
    const actions = el('div', 'acct-actions'); actions.append(save, status);
    c.append(music.node, artists.node, sports.node, comps.node, teams.node, other.node, alertRow, actions);
    return c;
  }

  window.ProfileInterests = { card, MUSIC, SPORTS, COMPETITIONS, OTHER };
})();

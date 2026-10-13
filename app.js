// Control d'hores: tot el càlcul es fa al navegador i les dades es guarden a localStorage.
const CLAU = 'control-hores-v1';
const DIES = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
const DIES_LLARG = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const MESOS = ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny', 'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'];
const ETIQUETA = { vacances: 'VAC', baixa: 'BAIXA', permis: 'PERM', absencia: 'ABS' };
const ORDRE_SETMANA = [1, 2, 3, 4, 5, 6, 0]; // comencem en dilluns

// Valors de sortida: mínims legals de l'Estatut dels Treballadors (40 h/setmana,
// 30 dies naturals de vacances, 80 h extres/any, nit de 22 a 6). El conveni els pot millorar.
const PER_DEFECTE = {
  mode: 'mensual',
  souBase: 0,
  pagues: '12',           // '12' sense pagues extres, '14p' prorratejades cada mes, '14' dobles en uns mesos concrets
  mesosPaga: [5, 11],     // mesos de paga extra (0 = gener): juny i desembre
  pagaImport: '',         // import de cada paga extra; en blanc = igual que el sou base
  diaCobrament: 0,        // 0 = no indicat
  cobramentMes: 'mateix', // 'mateix' mes de la nòmina o el 'seguent'
  tallDia: 0,             // últim dia que entra a la nòmina del mes; 0 = mes natural sencer
  preuHora: 0,
  preuExtra: 0,
  preuFestiu: 0,
  preuFestiuOficial: '', // en blanc = igual que el cap de setmana
  plusNocturn: 0,
  nitInici: '22:00',
  nitFi: '06:00',
  jornada: [0, 8, 8, 8, 8, 8, 0],
  diesFestius: [0, 6],
  recarrecDia: [0, 0, 0, 0, 0, 0, 0], // % de més sobre el preu de l'hora, per dia de la setmana
  tarifes: [],                         // canvis de preu per temporada: { des, fins, preuHora, preuExtra, preuFestiu }
  compensa: 'mes',                     // les hores que falten un dia es resten de les extres del 'mes', la 'setmana' o no ('dia')
  habInici: '08:00',
  habFi: '17:00',
  habPausa: 60,
  entrada: 'total', // com s'apunta un dia nou: 'total' d'hores o 'horari' d'entrada i sortida
  plusosFixos: [],
  plusosDia: [],
  irpf: 12,
  ss: 6.5,
  dataInici: '',
  vacDies: 30,
  vacTipus: 'naturals',
  maxExtres: 80,
  transKm: 0,
  transConsum: 6,
  transPreu: 1.6,
  transDia: 0,
  transAbonament: 0,
};

let estat = carrega();
let avui = new Date(); // es refresca a cada repintat, per si l'app queda oberta d'un dia per l'altre
let vist = { any: avui.getFullYear(), mes: avui.getMonth() };
let vista = 'mes';
let escala = 'mesos';
let persistenciaDemanada = false;
const cau = new Map(); // dies ja calculats; es buida cada cop que es desa o es repinta
let diaEditat = null;
let esborrany = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ---------- Utilitats ----------

// Còpia independent d'un objecte de dades (funciona també en navegadors de mòbil antics).
function copia(o) { return JSON.parse(JSON.stringify(o)); }

function carrega() {
  let desat = {};
  try { desat = JSON.parse(localStorage.getItem(CLAU)) || {}; } catch { /* dades il·legibles: comencem de zero */ }
  return {
    config: { ...copia(PER_DEFECTE), ...desat.config },
    dies: desat.dies || {},
    nomines: desat.nomines || {},
    fitxatge: desat.fitxatge || null,
    benvinguda: !!desat.benvinguda, // el qüestionari s'ha omplert o descartat
    popupVist: !!desat.popupVist,   // el qüestionari ja ha sortit sol una vegada
  };
}

function desa() {
  cau.clear();
  try {
    localStorage.setItem(CLAU, JSON.stringify(estat));
    $('#avis-desat').hidden = true;
  } catch {
    $('#avis-desat').hidden = false; // finestra privada o sense espai: s'avisa en lloc de perdre-ho en silenci
  }
  // Es demana al navegador que no esborri les dades per fer lloc.
  if (!persistenciaDemanada && navigator.storage?.persist) { persistenciaDemanada = true; navigator.storage.persist().catch(() => {}); }
}

// «de gener», però «d'abril», «d'agost» i «d'octubre».
const deMes = m => (/^[aeiou]/i.test(MESOS[m]) ? "d'" : 'de ') + MESOS[m].toLowerCase();
const dosDigits = n => String(n).padStart(2, '0');
const clauDia = (any, mes, dia) => `${any}-${dosDigits(mes + 1)}-${dosDigits(dia)}`;
const clauMes = (any, mes) => `${any}-${dosDigits(mes + 1)}`;
const diesDelMes = (any, mes) => new Date(any, mes + 1, 0).getDate();
const dataDeClau = clau => { const [a, m, d] = clau.split('-').map(Number); return new Date(a, m - 1, d); };
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = n => n.toLocaleString('ca-ES', { style: 'currency', currency: 'EUR' });
const hores = h => `${h.toLocaleString('ca-ES', { maximumFractionDigits: 2 })} h`;
const aMinuts = hhmm => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
const solapament = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

// ---------- Càlcul ----------

function minutsNocturns(ini, fi) {
  const c = estat.config;
  const n1 = aMinuts(c.nitInici);
  let n2 = aMinuts(c.nitFi);
  if (n2 <= n1) n2 += 1440;
  // La finestra de nit es repeteix cada 24 h: matinada del mateix dia, nit, i matinada següent.
  return [-1440, 0, 1440].reduce((s, d) => s + solapament(ini, fi, n1 + d, n2 + d), 0);
}

function calculaDia(clau, dia) {
  const c = estat.config;
  const ds = dataDeClau(clau).getDay();
  const r = { total: 0, normals: 0, extres: 0, festives: 0, festPrev: 0, nocturnes: 0, prevista: c.jornada[ds] || 0, esFestiu: false };
  if (dia && dia.festiu) r.prevista = 0;
  r.esFestiu = !!(dia && dia.festiu) || c.diesFestius.includes(ds);
  if (!dia || dia.tipus !== 'feina') return r;

  let minuts = 0, nit = 0;
  if (dia.mode === 'total') {
    minuts = (dia.hores || 0) * 60;
    nit = (dia.nit || 0) * 60;
  } else {
    for (const t of dia.trams || []) {
      if (!t.ini || !t.fi) continue;
      const ini = aMinuts(t.ini);
      let fi = aMinuts(t.fi);
      if (fi <= ini) fi += 1440; // el torn acaba l'endemà
      minuts += fi - ini;
      nit += minutsNocturns(ini, fi);
    }
    minuts = Math.max(0, minuts - (dia.pausa || 0));
  }
  r.total = minuts / 60;
  r.nocturnes = Math.min(nit, minuts) / 60;
  if (r.esFestiu) {
    r.festives = r.total;
    r.festPrev = Math.min(r.total, r.prevista);
  } else {
    r.normals = Math.min(r.total, r.prevista);
    r.extres = Math.max(0, r.total - r.prevista);
  }
  return r;
}

// Dies que entren a la nòmina d'un mes. Amb dia de tall 20, la d'octubre va del 21 de setembre al 20 d'octubre.
function diesPeriode(any, mes) {
  const tall = estat.config.tallDia;
  let d = new Date(any, mes, 1), fi = new Date(any, mes, diesDelMes(any, mes));
  if (tall >= 1 && tall < 31) {
    d = new Date(any, mes - 1, Math.min(tall, diesDelMes(any, mes - 1)) + 1);
    fi = new Date(any, mes, Math.min(tall, diesDelMes(any, mes)));
  }
  const claus = [];
  for (; d <= fi; d.setDate(d.getDate() + 1)) claus.push(clauDia(d.getFullYear(), d.getMonth(), d.getDate()));
  return claus;
}

const diaCurt = clau => { const d = dataDeClau(clau); return `${d.getDate()} ${MESOS[d.getMonth()].slice(0, 3).toLowerCase()}`; };
const textPeriode = (any, mes) => { const p = diesPeriode(any, mes); return `${diaCurt(p[0])} – ${diaCurt(p[p.length - 1])}`; };

// Brut generat fins avui: la part fixa segons els dies de mes que han passat, més les extres i plusos ja fets.
function generatFinsAvui(any, mes) {
  const clauAvui = clauDia(avui.getFullYear(), avui.getMonth(), avui.getDate());
  let variable = 0, fet = 0;
  for (const clau of diesPeriode(any, mes)) {
    const v = variableDia(clau);
    variable += v;
    if (clau <= clauAvui) fet += v;
  }
  const actual = any === avui.getFullYear() && mes === avui.getMonth();
  const passat = any < avui.getFullYear() || (any === avui.getFullYear() && mes < avui.getMonth());
  const part = actual ? avui.getDate() / diesDelMes(any, mes) : passat ? 1 : 0;
  return (calculaMes(any, mes).brut - variable) * part + fet;
}

function dataCobrament(any, mes) {
  const c = estat.config;
  if (!c.diaCobrament) return null;
  const m = mes + (c.cobramentMes === 'seguent' ? 1 : 0);
  return new Date(any, m, Math.min(c.diaCobrament, diesDelMes(any, m)));
}

// Preus que valen un dia concret: els d'Ajustos, canviats per la temporada que toqui
// i, al final, pel recàrrec del dia de la setmana.
function preusDia(clau) {
  const c = estat.config;
  const p = { hora: c.preuHora, extra: c.preuExtra, festiu: c.preuFestiu, oficial: c.preuFestiuOficial, nocturn: c.plusNocturn };
  const posat = v => v !== '' && v != null;
  for (const t of [...c.tarifes].sort((a, b) => (a.des || '').localeCompare(b.des || ''))) {
    if ((t.des && clau < t.des) || (t.fins && clau > t.fins)) continue;
    if (posat(t.preuHora)) p.hora = num(t.preuHora);
    if (posat(t.preuExtra)) p.extra = num(t.preuExtra);
    if (posat(t.preuFestiu)) p.festiu = num(t.preuFestiu);
    if (posat(t.preuFestiuOficial)) p.oficial = num(t.preuFestiuOficial);
    if (posat(t.plusNocturn)) p.nocturn = num(t.plusNocturn);
  }
  // Un festiu oficial pot tenir un preu diferent del cap de setmana.
  if (estat.dies[clau]?.festiu && posat(p.oficial)) p.festiu = num(p.oficial);
  p.horaBase = p.hora;
  const k = 1 + (c.recarrecDia[dataDeClau(clau).getDay()] || 0) / 100;
  p.hora *= k;
  p.extra *= k;
  p.festiu *= k;
  return p;
}

// Dies que es compensen entre ells: la setmana de dilluns a diumenge, o el període de nòmina.
function grupDe(clau) {
  const d = dataDeClau(clau);
  if (estat.config.compensa === 'setmana') {
    const dilluns = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ORDRE_SETMANA.indexOf(d.getDay()));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(dilluns.getFullYear(), dilluns.getMonth(), dilluns.getDate() + i);
      return clauDia(x.getFullYear(), x.getMonth(), x.getDate());
    });
  }
  const p = diesPeriode(d.getFullYear(), d.getMonth());
  return p.includes(clau) ? p : diesPeriode(d.getFullYear(), d.getMonth() + 1);
}

// Hores d'un dia un cop compensades: les que falten per arribar a la jornada en un dia
// es treuen de les extres dels altres dies del grup, que passen a comptar com a normals.
function diaAjustat(clau) {
  if (cau.has(clau)) return cau.get(clau);
  const compensa = estat.config.compensa !== 'dia';
  const dies = (compensa ? grupDe(clau) : [clau]).map(k => ({ k, cd: { ...calculaDia(k, estat.dies[k]), falten: 0, compensades: 0 } }));
  let deficit = 0;
  if (compensa) {
    for (const { k, cd } of dies) {
      const dia = estat.dies[k];
      if (dia && dia.tipus === 'feina' && !cd.esFestiu && cd.total < cd.prevista) {
        cd.falten = cd.prevista - cd.total;
        deficit += cd.falten;
      }
    }
    for (const { cd } of dies) {
      const q = Math.min(deficit, cd.extres);
      cd.extres -= q;
      cd.normals += q;
      cd.compensades = q;
      deficit -= q;
    }
  }
  for (const x of dies) cau.set(x.k, x.cd);
  return cau.get(clau);
}

// El que un dia concret suma a la nòmina per sobre de la part fixa del mes, concepte per concepte.
function importsDia(clau) {
  const c = estat.config, dia = estat.dies[clau];
  const z = { normals: 0, extres: 0, festives: 0, festSupl: 0, recarrec: 0, nocturn: 0, plusos: 0 };
  if (!dia || dia.tipus !== 'feina') return z;
  const cd = diaAjustat(clau), p = preusDia(clau);
  z.extres = cd.extres * p.extra;
  z.nocturn = cd.nocturnes * p.nocturn;
  if (c.mode === 'mensual') {
    z.festives = (cd.festives - cd.festPrev) * p.festiu;
    z.festSupl = cd.festPrev * Math.max(0, p.festiu - p.horaBase);
    z.recarrec = cd.normals * (p.hora - p.horaBase);
  } else {
    z.normals = cd.normals * p.hora;
    z.festives = cd.festives * p.festiu;
  }
  for (const id of dia.plusos || []) {
    const plus = c.plusosDia.find(x => x.id === id);
    if (plus) z.plusos += num(plus.importe);
  }
  for (const a of dia.altres || []) z.plusos += num(a.importe);
  return z;
}

const variableDia = clau => Object.values(importsDia(clau)).reduce((s, v) => s + v, 0);

// Import d'una paga extra: el que s'ha posat a Ajustos o, si no, el sou base.
function importPaga() {
  const c = estat.config;
  return c.pagaImport !== '' && c.pagaImport != null ? num(c.pagaImport) : c.souBase;
}

function calculaMes(any, mes) {
  const c = estat.config;
  const r = {
    diesTreballats: 0, treballades: 0, previstes: 0, normals: 0, extres: 0, festives: 0, festPrev: 0, nocturnes: 0,
    retribuides: 0, falten: 0, compensades: 0,
    comptador: { vacances: 0, baixa: 0, permis: 0, absencia: 0 }, plusosDia: {}, altres: new Map(), linies: [],
  };
  const imp = { normals: 0, extres: 0, festives: 0, festSupl: 0, recarrec: 0, nocturn: 0, plusos: 0, retribuides: 0 };
  for (const clau of diesPeriode(any, mes)) {
    const dia = estat.dies[clau];
    const cd = diaAjustat(clau);
    const jornada = c.jornada[dataDeClau(clau).getDay()] || 0;
    const pagatSenseTreballar = dia && (dia.tipus !== 'feina' ? dia.tipus !== 'absencia' : dia.festiu && cd.total === 0);
    if (pagatSenseTreballar) {
      r.retribuides += jornada;
      imp.retribuides += jornada * preusDia(clau).horaBase;
    }
    if (dia && dia.tipus !== 'feina') {
      r.comptador[dia.tipus]++;
      continue;
    }
    r.previstes += cd.prevista;
    r.treballades += cd.total;
    if (cd.total > 0) r.diesTreballats++;
    for (const k of ['normals', 'extres', 'festives', 'festPrev', 'nocturnes', 'falten', 'compensades']) r[k] += cd[k];
    const z = importsDia(clau);
    for (const k in z) imp[k] += z[k];
    if (dia) for (const id of dia.plusos || []) r.plusosDia[id] = (r.plusosDia[id] || 0) + 1;
    // Imports solts del dia (dietes, quilometratge…): s'agrupen pel nom per fer una sola línia.
    for (const a of dia?.altres || []) {
      const nom = a.nom || 'Altres imports', k = `${nom}|${!!a.exempt}`;
      const g = r.altres.get(k) || { nom, exempt: !!a.exempt, n: 0, importe: 0 };
      g.n++;
      g.importe += num(a.importe);
      r.altres.set(k, g);
    }
  }

  // Cada línia porta el grup on se suma al resum de la pantalla d'inici.
  let grup = 'base';
  const linia = (concepte, quantitat, preu, importe, exempt = false) => { if (importe) r.linies.push({ concepte, quantitat, preu, importe, exempt, grup }); };
  // El preu que es mostra és la mitjana, perquè pot canviar d'un dia a l'altre.
  const perHores = (concepte, h, importe) => linia(concepte, hores(h), h ? euros(importe / h) : '', importe);
  const paga = importPaga(), nPagues = c.mesosPaga.length;
  const pagaAquestMes = c.mode === 'mensual' && c.pagues === '14' && c.mesosPaga.includes(mes);
  if (c.mode === 'mensual') {
    linia('Sou base', '', '', c.souBase);
    const abs = r.comptador.absencia;
    linia('Absències no retribuïdes', `${abs} d`, euros(c.souBase / 30), -abs * c.souBase / 30);
    grup = 'pagues';
    if (c.pagues === '14p') linia('Prorrata de pagues extres', '', '', paga * nPagues / 12);
    if (pagaAquestMes) linia('Paga extra', '', '', paga);
    grup = 'festius';
    perHores('Hores en festiu / cap de setmana', r.festives - r.festPrev, imp.festives);
    perHores('Suplement de festiu dins la jornada', r.festPrev, imp.festSupl);
    linia('Recàrrec per dia de la setmana', '', '', imp.recarrec);
  } else {
    perHores('Hores normals', r.normals, imp.normals);
    perHores('Hores pagades sense treballar (vacances, permisos, festius)', r.retribuides, imp.retribuides);
    grup = 'festius';
    perHores('Hores en festiu / cap de setmana', r.festives, imp.festives);
  }
  grup = 'extres';
  perHores('Hores extres', r.extres, imp.extres);
  grup = 'nocturn';
  perHores('Plus de nocturnitat', r.nocturnes, imp.nocturn);
  grup = 'plusos';
  for (const p of c.plusosFixos) linia(p.nom || 'Plus mensual', '', '', num(p.importe), !!p.exempt);
  for (const p of c.plusosDia) {
    const n = r.plusosDia[p.id] || 0;
    linia(p.nom || 'Plus per dia', `${n} d`, euros(num(p.importe)), n * num(p.importe), !!p.exempt);
  }
  for (const a of r.altres.values()) linia(a.nom, `${a.n} d`, '', a.importe, a.exempt);

  r.parts = { base: 0, pagues: 0, extres: 0, festius: 0, nocturn: 0, plusos: 0 };
  for (const l of r.linies) r.parts[l.grup] += l.importe;
  // Els conceptes sense descomptes (dietes, quilometratge) es cobren sencers: ni cotitzen ni porten IRPF.
  r.brut = r.linies.reduce((s, l) => s + l.importe, 0);
  r.exempt = r.linies.reduce((s, l) => s + (l.exempt ? l.importe : 0), 0);
  // Les pagues dobles cotitzen repartides: cada mes es paga la Seguretat Social d'una dotzena part,
  // i el mes que es cobra la paga només se li treu l'IRPF.
  r.pagaExtra = pagaAquestMes ? paga : 0;
  const prorrataCotitzacio = c.mode === 'mensual' && c.pagues === '14' ? paga * nPagues / 12 : 0;
  r.ss = Math.max(0, r.brut - r.exempt - r.pagaExtra + prorrataCotitzacio) * c.ss / 100;
  r.irpf = (r.brut - r.exempt) * c.irpf / 100;
  r.net = r.brut - r.ss - r.irpf;
  r.horesExtraLegals = r.extres + (r.festives - r.festPrev);
  r.transportDia = 2 * c.transKm * c.transConsum / 100 * c.transPreu + c.transDia;
  r.transport = r.diesTreballats * r.transportDia + c.transAbonament;
  r.partNeta = r.brut ? r.net / r.brut : 1 - (c.ss + c.irpf) / 100; // quina part del brut arriba neta
  return r;
}

// Setmanes (de dilluns a diumenge) del mes; la part fixa del mes es reparteix per dies.
function resumSetmanes(any, mes) {
  const n = diesDelMes(any, mes);
  const dies = [];
  const variable = diesPeriode(any, mes).reduce((s, clau) => s + variableDia(clau), 0);
  for (let d = 1; d <= n; d++) {
    const clau = clauDia(any, mes, d);
    const v = variableDia(clau);
    dies.push({ d, v, h: calculaDia(clau, estat.dies[clau]).total, dilluns: dataDeClau(clau).getDay() === 1 });
  }
  const r = calculaMes(any, mes);
  const fixDia = (r.brut - variable) / n;
  const setmanes = [];
  for (const x of dies) {
    if (x.dilluns || !setmanes.length) setmanes.push({ de: x.d, a: x.d, hores: 0, brut: 0, net: 0 });
    const s = setmanes[setmanes.length - 1];
    s.a = x.d;
    s.hores += x.h;
    s.brut += x.v + fixDia;
    s.net += (x.v + fixDia) * r.partNeta;
  }
  return setmanes;
}

const mesAmbDades = (any, mes) => diesPeriode(any, mes).some(clau => estat.dies[clau]);

function resumMesos(any) {
  return MESOS.map((nom, mes) => {
    const r = calculaMes(any, mes);
    return { mes, nom, ambDades: mesAmbDades(any, mes), hores: r.treballades, extres: r.horesExtraLegals, brut: r.brut, net: r.net };
  });
}

function resumAnys() {
  const anys = [...new Set(Object.keys(estat.dies).map(k => +k.slice(0, 4)))].sort((a, b) => b - a);
  return anys.map(any => {
    const mesos = resumMesos(any).filter(m => m.ambDades);
    const suma = camp => mesos.reduce((s, m) => s + m[camp], 0);
    return { any, mesos: mesos.length, hores: suma('hores'), extres: suma('extres'), brut: suma('brut'), net: suma('net') };
  });
}

function extresDeLAny(any) {
  let total = 0;
  for (let m = 0; m < 12; m++) total += calculaMes(any, m).horesExtraLegals;
  return total;
}

function calculaVacances(any) {
  const c = estat.config;
  const dia = 86400000;
  const cap = new Date(any, 0, 1), fi = new Date(any, 11, 31);
  const diesAny = Math.round((fi - cap) / dia) + 1;
  const inici = c.dataInici && dataDeClau(c.dataInici) > cap ? dataDeClau(c.dataInici) : cap;
  const finsAvui = any < avui.getFullYear() ? fi : any > avui.getFullYear() ? null : new Date(avui.getFullYear(), avui.getMonth(), avui.getDate());
  const tram = (a, b) => (b && b >= a ? Math.round((b - a) / dia) + 1 : 0);
  const totalAny = inici > fi ? 0 : c.vacDies * tram(inici, fi) / diesAny;
  const generades = c.vacDies * tram(inici, finsAvui) / diesAny;
  const llista = Object.keys(estat.dies).filter(k => k.startsWith(`${any}-`) && estat.dies[k].tipus === 'vacances').sort();
  return { totalAny, generades, gaudides: llista.length, llista };
}

// ---------- Vista: mes ----------

function pintaMes() {
  const { any, mes } = vist;
  const c = estat.config;
  const r = calculaMes(any, mes);
  pintaFitxar();
  // Sense sou posat no es mostra cap xifra: es convida a configurar-lo.
  if (!(c.mode === 'mensual' ? c.souBase > 0 : c.preuHora > 0)) {
    $('#heroi').innerHTML = `
      <span class="etiqueta">Encara no has posat el teu sou</span>
      <b class="xifra petita">Configura'l per veure què cobraràs</b>
      <span class="sota">Mentrestant ja pots anar apuntant les hores al calendari.</span>
      <div class="peu"><span>${hores(r.treballades)} treballades ${deMes(mes)}</span><button data-questionari>Posa el meu sou ›</button></div>`;
    $('#desglos').innerHTML = '';
    pintaCalendari();
    return;
  }
  const generat = generatFinsAvui(any, mes);
  const cobra = dataCobrament(any, mes);
  const falten = cobra && Math.round((cobra - new Date(avui.getFullYear(), avui.getMonth(), avui.getDate())) / 86400000);
  $('#heroi').innerHTML = `
    <span class="etiqueta">Net previst ${deMes(mes)}</span>
    <b class="xifra">${euros(r.net)}</b>
    <span class="sota">${euros(r.brut)} bruts${r.horesExtraLegals ? ` · ${hores(r.horesExtraLegals)} extres i festives` : ''}</span>
    ${any === avui.getFullYear() && mes === avui.getMonth() ? `
    <div class="generat">
      <span>Portes generat fins avui</span>
      <b>${euros(generat * r.partNeta)} nets</b>
      <small>${euros(generat)} bruts</small>
    </div>` : ''}
    <div class="peu"><span>${hores(r.treballades)} treballades</span><button data-va="resum">Veure el detall ›</button></div>
    ${c.tallDia || cobra ? `<div class="apunts">
      ${c.tallDia ? `<span>Compta del ${textPeriode(any, mes)}</span>` : ''}
      ${cobra ? `<span>${falten > 0 ? `Cobres el ${diaCurt(clauDia(cobra.getFullYear(), cobra.getMonth(), cobra.getDate()))} · ${falten === 1 ? 'falta 1 dia' : `falten ${falten} dies`}` : falten === 0 ? 'Avui cobres' : `Cobrat el ${diaCurt(clauDia(cobra.getFullYear(), cobra.getMonth(), cobra.getDate()))}`}</span>` : ''}
    </div>` : ''}`;
  pintaDesglos(r);
  pintaCalendari();
}

function pintaCalendari() {
  const { any, mes } = vist;
  const c = estat.config;
  const buits = ORDRE_SETMANA.indexOf(new Date(any, mes, 1).getDay());
  let html = '<span></span>'.repeat(buits);
  for (let d = 1; d <= diesDelMes(any, mes); d++) {
    const clau = clauDia(any, mes, d);
    const dia = estat.dies[clau];
    const cd = calculaDia(clau, dia);
    const classes = ['dia'];
    let peu = '';
    if (dia && dia.tipus !== 'feina') {
      classes.push(dia.tipus === 'permis' ? 'baixa' : dia.tipus);
      peu = ETIQUETA[dia.tipus];
    } else if (dia && cd.total > 0) {
      classes.push(cd.esFestiu ? 'festiu' : cd.extres > 0 ? 'extra' : 'feina');
      peu = hores(cd.total);
    } else if (dia && dia.festiu) {
      classes.push('festiu');
      peu = 'FEST';
    } else if (c.diesFestius.includes(dataDeClau(clau).getDay())) {
      classes.push('descans');
    }
    if (clau === clauDia(avui.getFullYear(), avui.getMonth(), avui.getDate())) classes.push('avui');
    html += `<button class="${classes.join(' ')}" data-clau="${clau}"><b>${d}</b><small>${peu}</small></button>`;
  }
  $('#graella').innerHTML = html;
}

// Sota la targeta principal: d'on surten els diners del mes i quatre dades de l'any.
function pintaDesglos(r) {
  const c = estat.config, mensual = c.mode === 'mensual';
  const files = [
    [mensual ? 'Sou base' : 'Hores normals', hores(r.normals + (mensual ? r.festPrev : 0)), r.parts.base, true],
    ['Pagues extres', c.pagues === '14p' ? 'prorratejades' : 'paga doble', r.parts.pagues],
    ['Hores extres', hores(r.extres), r.parts.extres],
    ['Festius i caps de setmana', hores(r.festives), r.parts.festius],
    ['Nocturnitat', hores(r.nocturnes), r.parts.nocturn],
    ['Plusos i dietes', '', r.parts.plusos],
  ].filter(f => f[3] || Math.abs(f[2]) > 0.004);
  const v = calculaVacances(avui.getFullYear());
  const extresAny = extresDeLAny(avui.getFullYear());
  const un = n => n.toLocaleString('ca-ES', { maximumFractionDigits: 1 });
  let properaPaga = '';
  if (mensual && c.pagues === '14' && c.mesosPaga.length) {
    const ordenats = [...c.mesosPaga].sort((a, b) => a - b);
    const m = ordenats.find(x => x >= avui.getMonth()) ?? ordenats[0];
    properaPaga = `<div data-va="resum"><b>${euros(importPaga())}</b><span>pròxima paga extra · ${MESOS[m].toLowerCase()}</span></div>`;
  }
  $('#desglos').innerHTML = `
    <div class="targeta desglos">
      <h2>D'on surt el sou ${deMes(vist.mes)}</h2>
      ${files.map(f => `<div class="dl"><span>${f[0]}<small>${f[1]}</small></span><b>${euros(f[2])}</b></div>`).join('')}
      <div class="dl total"><span>Total brut</span><b>${euros(r.brut)}</b></div>
      <div class="dl"><span>Descomptes<small>Seguretat Social ${euros(r.ss)} · IRPF ${euros(r.irpf)}</small></span><b>−${euros(r.ss + r.irpf)}</b></div>
      <div class="dl total net"><span>Net</span><b>${euros(r.net)}</b></div>
    </div>
    <div class="targetes">
      <div data-va="vacances"><b>${un(v.totalAny - v.gaudides)} dies</b><span>de vacances per fer aquest any</span></div>
      <div data-va="resums"><b>${hores(extresAny)}</b><span>extres aquest any${c.maxExtres ? ` (màxim ${hores(c.maxExtres)})` : ''}</span></div>
      ${properaPaga}
    </div>`;
}

function ompleMes() {
  const { any, mes } = vist;
  const c = estat.config;
  const pendents = [];
  for (let d = 1; d <= diesDelMes(any, mes); d++) {
    const clau = clauDia(any, mes, d);
    const data = dataDeClau(clau);
    if (!estat.dies[clau] && c.jornada[data.getDay()] > 0 && data <= avui) pendents.push(clau);
  }
  if (!pendents.length) { alert('No hi ha cap dia laborable buit fins avui.'); return; }
  if (!confirm(`S'ompliran ${pendents.length} dies amb la jornada habitual. Després pots retocar els que calgui.`)) return;
  for (const clau of pendents) estat.dies[clau] = diaNou(clau);
  desa();
  pinta();
}

// ---------- Fitxar ----------

const araHHMM = () => { const d = new Date(); return `${dosDigits(d.getHours())}:${dosDigits(d.getMinutes())}`; };

function pintaFitxar() {
  const f = estat.fitxatge;
  if (!f) {
    $('#fitxar').innerHTML = `
      <div class="fila">
        <button class="principal" data-fitxa="entra">Fitxa l'entrada</button>
        <button class="secundari" data-fitxa="avui">Apunta les hores d'avui</button>
      </div>`;
    return;
  }
  const min = Math.floor((Date.now() - f.quan) / 60000);
  $('#fitxar').innerHTML = `
    <p>Has entrat a les <b>${esc(f.ini)}</b> · portes ${Math.floor(min / 60)} h ${min % 60} min</p>
    <div class="fila">
      <button class="secundari" data-fitxa="anula">Anul·la</button>
      <button class="principal" data-fitxa="surt">Fitxa la sortida</button>
    </div>`;
}

function fitxa(accio) {
  const f = estat.fitxatge;
  const ara = new Date();
  if (accio === 'avui') {
    obreDia(clauDia(ara.getFullYear(), ara.getMonth(), ara.getDate()));
    return;
  }
  if (accio === 'entra') {
    estat.fitxatge = { clau: clauDia(ara.getFullYear(), ara.getMonth(), ara.getDate()), ini: araHHMM(), quan: Date.now() };
  } else if (accio === 'anula') {
    if (!confirm('Vols descartar aquesta entrada sense apuntar-la?')) return;
    estat.fitxatge = null;
  } else if (Date.now() - f.quan > 24 * 3600000) {
    alert('Fa més de 24 hores que vas fitxar l\'entrada. Apunta aquell dia a mà des del calendari.');
    estat.fitxatge = null;
  } else {
    const fi = araHHMM();
    if (fi !== f.ini) {
      let dia = estat.dies[f.clau];
      if (!dia || dia.tipus !== 'feina') dia = estat.dies[f.clau] = { tipus: 'feina', mode: 'horari', festiu: false, trams: [], pausa: 0, plusos: [], nota: '' };
      if (dia.mode === 'total') {
        // El dia ja tenia un total apuntat a mà: hi sumem el que s'acaba de fitxar.
        let min = aMinuts(fi) - aMinuts(f.ini);
        if (min < 0) min += 1440;
        dia.hores = Math.round(((dia.hores || 0) + min / 60) * 100) / 100;
      } else {
        dia.trams.push({ ini: f.ini, fi });
      }
    }
    estat.fitxatge = null;
  }
  desa();
  pinta();
}

// ---------- Qüestionari inicial ----------

function obreQuestionari() {
  const c = estat.config;
  nominaLlegida = null;
  $('#q-trobat').innerHTML = '';
  $('#q-estat').textContent = "L'app la llegeix en aquest mateix dispositiu i omple les dades per tu: la nòmina no s'envia enlloc. Si t'ho estimes més, omple-ho tot a mà aquí sota.";
  $('#q-mode').value = c.mode;
  $('#q-pagues').value = c.pagues;
  $('#q-inici').value = c.dataInici;
  if (estat.benvinguda) {
    $('#q-sou').value = c.souBase;
    $('#q-preuhora').value = c.preuHora;
    $('#q-hores').value = c.jornada.reduce((s, h) => s + h, 0);
    $('#q-extra').value = c.preuExtra;
    $('#q-festiu').value = c.preuFestiu;
    $('#q-irpf').value = c.irpf;
    $('#q-nit').value = c.plusNocturn;
    $('#q-km').value = c.transKm;
    $('#q-abonament').value = c.transAbonament;
  }
  ajustaQuestionari();
  $('#dlg-benvinguda').showModal();
}

// ---------- Lectura de la nòmina (PDF) ----------

// La nòmina es llegeix en aquest mateix dispositiu amb pdf.js; el fitxer no s'envia enlloc.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let nominaLlegida = null;

function carregaPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => ko(new Error('xarxa'));
    document.head.append(s);
  });
}

// Text del PDF, línia a línia: els trossos que estan a la mateixa alçada es llegeixen d'esquerra a dreta.
async function liniesDelPdf(fitxer) {
  const lib = await carregaPdfjs();
  const pdf = await lib.getDocument({ data: await fitxer.arrayBuffer() }).promise;
  const linies = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
    const text = await (await pdf.getPage(n)).getTextContent();
    const files = new Map();
    for (const it of text.items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      if (!files.has(y)) files.set(y, []);
      files.get(y).push({ x: it.transform[4], s: it.str });
    }
    for (const [, trossos] of [...files.entries()].sort((a, b) => b[0] - a[0])) {
      linies.push(trossos.sort((a, b) => a.x - b.x).map(t => t.s).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  return linies;
}

const RE_IMPORT = /-?\d{1,3}(?:\.\d{3})+,\d{2}|-?\d+,\d{1,2}/g;
const deText = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const arrodoneix = n => Math.round(n * 100) / 100;

// Busca en una nòmina espanyola (en castellà o català) les dades que l'app necessita.
// Els formats canvien molt d'una gestoria a l'altra, així que el resultat sempre es revisa abans de desar.
function interpretaNomina(linies) {
  const r = { plusos: [] };
  let dinsMeritacions = false, ss = 0, irpfImport;
  for (const l of linies) {
    const n = (l.match(RE_IMPORT) || []).map(deText);
    const ultim = n[n.length - 1];
    const pct = (l.match(/(\d+(?:,\d+)?)\s*%/) || [])[1];
    const abans = n.slice(0, -1); // tot menys l'import final: aquí hi sol haver la base i el percentatge

    if (/total\s+(devengado|devengos|meritat|meritacions)|t\.\s*devengado/i.test(l)) { r.brut ??= ultim; dinsMeritacions = false; continue; }
    if (/l[ií]quid\w*\s+(total\s+)?a\s+perc|total\s+a\s+percibir|neto\s+a\s+percibir/i.test(l)) { r.net ??= ultim; continue; }
    if (/i\.?\s?r\.?\s?p\.?\s?f/i.test(l) && n.length) {
      r.irpf ??= pct ? deText(pct) : abans.find(v => v > 0 && v <= 50);
      irpfImport ??= ultim;
      continue;
    }
    if (/conting\S+\s+comu|desempleo|\batur\b|formaci\S*\s+prof|\bm\.?e\.?i\b|equidad|equitat/i.test(l) && n.length) {
      const p = pct ? deText(pct) : abans.find(v => v > 0 && v <= 10);
      if (p) ss += p;
      continue;
    }
    const data = l.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (/antig[uü]e?dad|antiguitat/i.test(l) && data) { r.dataInici ??= `${data[3]}-${dosDigits(+data[2])}-${dosDigits(+data[1])}`; continue; }
    if (/(salari\w*|sou|sueldo)\s+base/i.test(l) && n.length) { r.souBase ??= ultim; dinsMeritacions = true; continue; }
    if (!dinsMeritacions || !n.length) continue;

    const nom = l.replace(RE_IMPORT, '').replace(/[%*]/g, '').replace(/^\s*\d+\s+/, '').replace(/\s+/g, ' ').trim();
    if (nom.length < 3) continue;
    if (/prorrat|pag\w+\s+extra|p\.\s*extra/i.test(l)) { r.pagues = '14p'; continue; }
    if (/hor[ae]s?\s+extra/i.test(l)) {
      if (n.length >= 3) r.preuExtra ??= n[n.length - 2];
      else if (n.length === 2 && n[0] > 0) r.preuExtra ??= arrodoneix(ultim / n[0]);
      continue;
    }
    // Conceptes que acostumen a canviar cada mes: es proposen, però sense marcar.
    const variable = /diet|kilom|quilom|noct|festiv|atras|endarrer|vacac|incentiv|comisi|comissi|hor[ae]s/i.test(l);
    r.plusos.push({ nom, importe: ultim, fix: !variable, exempt: /diet|kilom|quilom/i.test(l) });
  }
  if (ss >= 3 && ss <= 10) r.ss = arrodoneix(ss);
  if (r.irpf == null && irpfImport && r.brut) r.irpf = arrodoneix(irpfImport / r.brut * 100);

  const mesos = ['ene|gen', 'feb', 'mar', 'abr', 'may|mai', 'jun', 'jul', 'ago', 'sep|set', 'oct', 'nov', 'dic|des'];
  for (const l of linies) {
    if (!/per[ií]od|liquidaci|mensualidad|mensualitat/i.test(l)) continue;
    const dates = [...l.matchAll(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/g)];
    const ambNom = l.match(/\b(ene|gen|feb|mar|abr|may|mai|jun|jul|ago|sep|set|oct|nov|dic|des)[a-zç]*\.?\s*(?:de\s+|del\s+|\/)?(\d{4})/i);
    if (dates.length) { const d = dates[dates.length - 1]; r.mes = `${d[3]}-${dosDigits(+d[2])}`; break; }
    if (ambNom) { r.mes = `${ambNom[2]}-${dosDigits(mesos.findIndex(m => m.split('|').includes(ambNom[1].toLowerCase())) + 1)}`; break; }
  }
  return r;
}

async function pujaNomina(fitxer) {
  const estatLectura = $('#q-estat');
  estatLectura.textContent = 'Llegint la nòmina…';
  $('#q-trobat').innerHTML = '';
  nominaLlegida = null;
  let r;
  try {
    const linies = await liniesDelPdf(fitxer);
    if (linies.join('').length < 50) {
      estatLectura.textContent = 'Aquest PDF és una imatge (una foto o un escàner) i no se\'n pot llegir el text. Omple les dades a mà aquí sota.';
      return;
    }
    r = interpretaNomina(linies);
  } catch (e) {
    estatLectura.textContent = e.message === 'xarxa'
      ? 'Per llegir la nòmina cal connexió a internet la primera vegada. Torna-ho a provar o omple les dades a mà.'
      : 'No s\'ha pogut obrir aquest fitxer. Ha de ser la nòmina en PDF. També pots omplir les dades a mà aquí sota.';
    return;
  }
  if (r.souBase == null && r.irpf == null) {
    estatLectura.textContent = 'No hem sabut reconèixer les dades d\'aquesta nòmina. Omple-les a mà aquí sota.';
    return;
  }
  nominaLlegida = r;
  if (r.souBase != null) { $('#q-mode').value = 'mensual'; $('#q-sou').value = r.souBase; }
  if (r.pagues) $('#q-pagues').value = r.pagues;
  if (r.irpf != null) $('#q-irpf').value = r.irpf;
  if (r.preuExtra != null) $('#q-extra').value = r.preuExtra;
  if (r.dataInici) $('#q-inici').value = r.dataInici;
  ajustaQuestionari();

  const trobat = [];
  if (r.souBase != null) trobat.push(`sou base ${euros(r.souBase)}`);
  if (r.pagues) trobat.push('pagues extres prorratejades');
  if (r.irpf != null) trobat.push(`IRPF ${r.irpf.toLocaleString('ca-ES')} %`);
  if (r.ss != null) trobat.push(`Seguretat Social ${r.ss.toLocaleString('ca-ES')} %`);
  if (r.preuExtra != null) trobat.push(`hora extra ${euros(r.preuExtra)}`);
  if (r.dataInici) trobat.push('data d\'antiguitat');
  estatLectura.textContent = `Hem trobat: ${trobat.join(', ')}. Repassa-ho aquí sota, completa el que falti i prem "Comença".`;

  const [any, mes] = (r.mes || '').split('-').map(Number);
  $('#q-trobat').innerHTML = `
    ${r.plusos.length ? '<p class="nota">Plusos de la nòmina. Deixa marcats els que cobres cada mes:</p>' : ''}
    ${r.plusos.map((p, i) => `<label class="check"><input type="checkbox" data-q-plus="${i}" ${p.fix ? 'checked' : ''}> ${esc(p.nom)} · ${euros(p.importe)}</label>`).join('')}
    ${r.mes && (r.brut != null || r.net != null) ? `<label class="check"><input type="checkbox" id="q-apunta" checked> Apunta-la com a cobrada ${deMes(mes - 1)} de ${any}${r.net != null ? ` (${euros(r.net)} nets)` : ''}</label>` : ''}`;
}

// Aplica el que s'ha llegit de la nòmina i no té camp propi al qüestionari.
function aplicaNominaLlegida() {
  const r = nominaLlegida, c = estat.config;
  if (!r) return;
  if (r.ss != null) c.ss = r.ss;
  for (const el of $$('[data-q-plus]:checked')) {
    const p = r.plusos[+el.dataset.qPlus];
    c.plusosFixos = c.plusosFixos.filter(x => x.nom !== p.nom);
    c.plusosFixos.push({ id: Date.now().toString(36) + el.dataset.qPlus, nom: p.nom, importe: p.importe, exempt: p.exempt });
  }
  if ($('#q-apunta')?.checked) estat.nomines[r.mes] = { brut: r.brut, net: r.net };
  nominaLlegida = null;
}

function ajustaQuestionari() {
  const mensual = $('#q-mode').value === 'mensual';
  $('#q-bloc-mensual').hidden = !mensual;
  $('#q-bloc-hores').hidden = mensual;
}

function desaQuestionari() {
  const c = estat.config;
  const setmana = num($('#q-hores').value) || 40;
  c.mode = $('#q-mode').value;
  // En refer el qüestionari no es trepitja una jornada o un preu que ja s'havien retocat a mà a Ajustos.
  const abans = { setmana: c.jornada.reduce((s, h) => s + h, 0), sou: c.souBase, pagues: c.pagues };
  const primerCop = !estat.benvinguda;
  if (primerCop || setmana !== abans.setmana) c.jornada = [0, 1, 1, 1, 1, 1, 0].map(d => d * setmana / 5);
  if (c.mode === 'mensual') {
    c.souBase = num($('#q-sou').value);
    c.pagues = $('#q-pagues').value;
    // Preu de l'hora normal: sou de tot l'any (amb les pagues extres) repartit entre les hores de l'any.
    const pagaments = 12 + (c.pagues === '12' ? 0 : c.mesosPaga.length);
    if (primerCop || setmana !== abans.setmana || c.souBase !== abans.sou || c.pagues !== abans.pagues) {
      c.preuHora = Math.round(c.souBase * pagaments / (setmana * 52) * 100) / 100;
    }
  } else {
    c.preuHora = num($('#q-preuhora').value);
  }
  c.preuExtra = num($('#q-extra').value) || c.preuHora;
  c.preuFestiu = num($('#q-festiu').value) || c.preuExtra;
  c.irpf = num($('#q-irpf').value);
  c.plusNocturn = num($('#q-nit').value);
  c.dataInici = $('#q-inici').value;
  c.transKm = num($('#q-km').value);
  c.transAbonament = num($('#q-abonament').value);
  aplicaNominaLlegida();
  estat.benvinguda = true;
  desa();
  pinta();
}

// ---------- Diàleg d'un dia ----------

function diaNou(clau) {
  const c = estat.config;
  return {
    tipus: 'feina', mode: c.entrada, festiu: false,
    hores: c.jornada[dataDeClau(clau).getDay()] || 8, nit: 0,
    trams: [{ ini: c.habInici, fi: c.habFi }], pausa: c.habPausa, plusos: [], altres: [], nota: '',
  };
}

function obreDia(clau) {
  diaEditat = clau;
  esborrany = copia(estat.dies[clau] || diaNou(clau));
  esborrany.mode ||= 'horari'; // dies apuntats abans que existís el total d'hores
  esborrany.trams ||= [];
  esborrany.plusos ||= [];
  esborrany.altres ||= [];
  const data = dataDeClau(clau);
  $('#dlg-titol').textContent = `${DIES_LLARG[data.getDay()]}, ${data.getDate()} ${deMes(data.getMonth())}`;
  $('#dia-festiu').checked = !!esborrany.festiu;
  $('#dia-hores').value = esborrany.hores ?? 8;
  $('#dia-nit').value = esborrany.nit || '';
  $('#dia-pausa').value = esborrany.pausa || 0;
  $('#dia-nota').value = esborrany.nota || '';
  $('#dia-esborra').hidden = !estat.dies[clau];
  $('#dia-plusos').innerHTML = estat.config.plusosDia.map(p => `
    <label class="check"><input type="checkbox" data-plus="${esc(p.id)}" ${esborrany.plusos.includes(p.id) ? 'checked' : ''}>
      ${esc(p.nom || 'Plus')} (${euros(num(p.importe))})</label>`).join('');
  pintaTrams();
  pintaAltres();
  actualitzaDialeg();
  $('#dlg-dia').showModal();
}

function pintaTrams() {
  $('#dia-trams').innerHTML = esborrany.trams.map((t, i) => `
    <div class="fila tram">
      <label>Entrada<input type="time" data-tram="${i}" data-camp="ini" value="${esc(t.ini || '')}"></label>
      <label>Sortida<input type="time" data-tram="${i}" data-camp="fi" value="${esc(t.fi || '')}"></label>
      ${esborrany.trams.length > 1 ? `<button type="button" class="rodo" data-treu-tram="${i}" aria-label="Treu el tram">×</button>` : ''}
    </div>`).join('');
}

// Imports solts del dia: una dieta, un quilometratge, un plus que no és de cada dia…
function pintaAltres() {
  $('#dia-altres').innerHTML = esborrany.altres.map((a, i) => `
    <div class="altre">
      <div class="fila">
        <label>Concepte<input type="text" maxlength="40" placeholder="Dieta, quilometratge…" data-altre="${i}" data-camp="nom" value="${esc(a.nom || '')}"></label>
        <label>Import (€)<input type="number" step="0.01" inputmode="decimal" data-altre="${i}" data-camp="importe" value="${esc(a.importe ?? '')}"></label>
        <button type="button" class="rodo" data-treu-altre="${i}" aria-label="Treu l'import">×</button>
      </div>
      <label class="check"><input type="checkbox" data-altre="${i}" data-camp="exempt" ${a.exempt ? 'checked' : ''}> Es cobra sencer, sense descomptes</label>
    </div>`).join('');
}

function actualitzaDialeg() {
  $('#dia-feina').hidden = esborrany.tipus !== 'feina';
  for (const b of $$('#dia-tipus button')) b.classList.toggle('activa', b.dataset.tipus === esborrany.tipus);
  for (const b of $$('#dia-mode button')) b.classList.toggle('activa', b.dataset.mode === esborrany.mode);
  for (const b of $$('#dia-rapides button')) b.classList.toggle('activa', +b.dataset.hores === esborrany.hores);
  $('#dia-bloc-total').hidden = esborrany.mode !== 'total';
  $('#dia-bloc-horari').hidden = esborrany.mode !== 'horari';
  $('#dia-bloc-nit').hidden = !estat.config.plusNocturn && !estat.config.tarifes.some(t => num(t.plusNocturn));
  if (esborrany.mode === 'horari' && !esborrany.trams.length) {
    esborrany.trams.push({ ini: estat.config.habInici, fi: estat.config.habFi });
    pintaTrams();
  }
  const cd = calculaDia(diaEditat, esborrany);
  const parts = [];
  if (cd.normals) parts.push(`${hores(cd.normals)} normals`);
  if (cd.extres) parts.push(`${hores(cd.extres)} extres`);
  if (cd.festives) parts.push(`${hores(cd.festives)} a preu de festiu`);
  if (cd.nocturnes) parts.push(`${hores(cd.nocturnes)} de nit`);
  const falten = !cd.esFestiu && estat.config.compensa !== 'dia' ? Math.max(0, cd.prevista - cd.total) : 0;
  if (falten) parts.push(`${hores(falten)} menys que la jornada, que es resten de les extres ${estat.config.compensa === 'setmana' ? 'de la setmana' : 'del mes'}`);
  $('#dia-previsio').textContent = cd.total ? `Total ${hores(cd.total)}: ${parts.join(' · ')}` : 'Sense hores apuntades';
}

function llegeixDialeg(e) {
  const t = e.target;
  if (t.dataset.tram) esborrany.trams[+t.dataset.tram][t.dataset.camp] = t.value;
  if (t.dataset.altre) esborrany.altres[+t.dataset.altre][t.dataset.camp] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? num(t.value) : t.value;
  if (t.dataset.plus) esborrany.plusos = $$('#dia-plusos input:checked').map(i => i.dataset.plus);
  esborrany.hores = Math.min(24, Math.max(0, num($('#dia-hores').value)));
  esborrany.nit = Math.min(esborrany.hores, num($('#dia-nit').value));
  esborrany.festiu = $('#dia-festiu').checked;
  esborrany.pausa = num($('#dia-pausa').value);
  esborrany.nota = $('#dia-nota').value.trim();
  actualitzaDialeg();
}

// Botons del diàleg que no són camps de formulari: tipus de dia, manera d'apuntar i hores ràpides.
function tocaDialeg(e) {
  const d = e.target.dataset;
  if (d.treuAltre) { esborrany.altres.splice(+d.treuAltre, 1); pintaAltres(); return; }
  if (d.tipus) esborrany.tipus = d.tipus;
  else if (d.mode) esborrany.mode = d.mode;
  else if (d.hores) esborrany.hores = +d.hores;
  else if (d.pas) esborrany.hores = Math.min(24, Math.max(0, (esborrany.hores || 0) + +d.pas));
  else return;
  $('#dia-hores').value = esborrany.hores;
  actualitzaDialeg();
}

function desaDia() {
  if (esborrany.tipus !== 'feina') Object.assign(esborrany, { trams: [], pausa: 0, plusos: [], altres: [], festiu: false, hores: 0, nit: 0 });
  else estat.config.entrada = esborrany.mode; // el pròxim dia nou s'obrirà de la mateixa manera
  esborrany.altres = esborrany.altres.filter(a => num(a.importe));
  esborrany.trams = esborrany.trams.filter(t => t.ini && t.fi);
  estat.dies[diaEditat] = esborrany;
  desa();
  pinta();
}

// ---------- Vista: nòmina ----------

function pintaResum() {
  const { any, mes } = vist;
  const c = estat.config;
  const r = calculaMes(any, mes);
  const nomina = estat.nomines[clauMes(any, mes)] || {};
  const extresAny = extresDeLAny(any);

  const avisos = [];
  if (r.comptador.baixa) avisos.push(`Hi ha ${r.comptador.baixa} dies de baixa. Aquí es compten com a pagats sencers, però durant una baixa es cobra un percentatge que depèn del motiu i del conveni: aquest mes és normal que la xifra no quadri del tot.`);
  if (c.maxExtres && extresAny > c.maxExtres) avisos.push(`Portes ${hores(extresAny)} extres aquest any, per sobre del màxim de ${hores(c.maxExtres)}.`);

  $('#resum-cos').innerHTML = `
    <div class="targetes">
      <div><b>${hores(r.treballades)}</b><span>treballades</span></div>
      <div><b>${hores(r.extres)}</b><span>extres</span></div>
      <div><b>${hores(r.festives)}</b><span>en festiu</span></div>
      <div><b>${hores(r.nocturnes)}</b><span>de nit</span></div>
    </div>
    ${c.tallDia ? `<p class="nota">Aquesta nòmina compta les hores i els plusos del ${textPeriode(any, mes)}.</p>` : ''}
    ${r.pagaExtra ? '<p class="nota">Aquest mes inclou una paga extra. La Seguretat Social de les pagues extres es paga repartida entre tots els mesos, per això a la paga només se li treu l\'IRPF.</p>' : ''}
    ${r.falten ? `<p class="nota">Hi ha dies amb menys hores que la jornada: en total ${hores(r.falten)} de menys. ${r.compensades ? `S'han restat ${hores(r.compensades)} de les hores extres per compensar-ho.` : ''}${r.falten - r.compensades > 0.001 ? ` Queden ${hores(r.falten - r.compensades)} sense compensar.` : ''}</p>` : ''}
    ${avisos.map(a => `<p class="avis">${esc(a)}</p>`).join('')}
    <h2>Què hauries de cobrar</h2>
    <table class="nomina">
      <thead><tr><th>Concepte</th><th>Quantitat</th><th>Preu</th><th>Import</th></tr></thead>
      <tbody>
        ${r.linies.map(l => `<tr><td>${esc(l.concepte)}${l.exempt ? ' <small>sense descomptes</small>' : ''}</td><td>${l.quantitat}</td><td>${l.preu}</td><td>${euros(l.importe)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr class="total"><td colspan="3">Total brut</td><td>${euros(r.brut)}</td></tr>
        <tr><td colspan="3">Seguretat Social (${c.ss.toLocaleString('ca-ES')} %)</td><td>−${euros(r.ss)}</td></tr>
        <tr><td colspan="3">IRPF (${c.irpf.toLocaleString('ca-ES')} %)</td><td>−${euros(r.irpf)}</td></tr>
        <tr class="total"><td colspan="3">Net aproximat</td><td>${euros(r.net)}</td></tr>
      </tfoot>
    </table>
    <h2>Què diu la nòmina</h2>
    <div class="fila">
      <label>Brut cobrat (€)<input type="number" step="0.01" data-nomina="brut" value="${nomina.brut ?? ''}"></label>
      <label>Net cobrat (€)<input type="number" step="0.01" data-nomina="net" value="${nomina.net ?? ''}"></label>
    </div>
    <div id="comparacio"></div>
    <h2>Cost d'anar a treballar</h2>
    ${r.transport ? `
    <div class="targetes">
      <div><b>${euros(r.transport)}</b><span>transport del mes (${r.diesTreballats} dies)</span></div>
      <div><b>${euros(r.transportDia)}</b><span>per dia d'anar i tornar</span></div>
      <div><b>${euros(r.net - r.transport)}</b><span>net que et queda després del transport</span></div>
      <div><b>${r.treballades ? euros((r.net - r.transport) / r.treballades) : '—'}</b><span>net real per hora treballada</span></div>
    </div>` : '<p class="nota">Posa els quilòmetres o l\'abonament a Ajustos i aquí veuràs quant et costa anar a la feina.</p>'}
    <p class="nota">Hores extres de ${any}: ${hores(extresAny)}${c.maxExtres ? ` de ${hores(c.maxExtres)} permeses` : ''}.</p>
    <button class="secundari ample" id="csv">Descarrega el detall del mes (CSV)</button>
    <p class="nota">Càlcul orientatiu fet amb els preus que has posat a Ajustos. El net exacte depèn de com cotitza cada concepte; el que mana és el teu contracte i el conveni.</p>`;
  pintaComparacio();
}

function pintaComparacio() {
  const r = calculaMes(vist.any, vist.mes);
  const nomina = estat.nomines[clauMes(vist.any, vist.mes)] || {};
  const fila = (nom, cobrat, previst) => {
    if (cobrat == null) return '';
    const dif = cobrat - previst;
    if (Math.abs(dif) < 1) return `<p class="be">${nom}: quadra amb el previst.</p>`;
    return dif < 0
      ? `<p class="malament">${nom}: has cobrat ${euros(-dif)} menys del previst.</p>`
      : `<p class="be">${nom}: has cobrat ${euros(dif)} més del previst.</p>`;
  };
  $('#comparacio').innerHTML = fila('Brut', nomina.brut, r.brut) + fila('Net', nomina.net, r.net);
}

function descarrega(nom, text, tipus) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: tipus }));
  a.download = nom;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportaCSV() {
  const { any, mes } = vist;
  const dec = n => n.toFixed(2).replace('.', ',');
  const files = [['Data', 'Dia', 'Tipus', 'Horari', 'Pausa (min)', 'Total', 'Normals', 'Extres', 'Festives', 'Nocturnes', 'Nota']];
  for (const clau of diesPeriode(any, mes)) {
    const dia = estat.dies[clau];
    if (!dia) continue;
    const cd = calculaDia(clau, dia);
    files.push([clau, DIES[dataDeClau(clau).getDay()], dia.tipus + (dia.festiu ? ' (festiu)' : ''),
      dia.mode === 'total' ? 'total' : (dia.trams || []).map(t => `${t.ini}-${t.fi}`).join(' + '), dia.mode === 'total' ? 0 : dia.pausa || 0,
      dec(cd.total), dec(cd.normals), dec(cd.extres), dec(cd.festives), dec(cd.nocturnes), dia.nota || '']);
  }
  const csv = files.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  descarrega(`hores-${clauMes(any, mes)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

// ---------- Vista: resums ----------

function pintaResums() {
  const { any, mes } = vist;
  const c = estat.config;
  for (const b of $$('#resums-escala button')) b.classList.toggle('activa', b.dataset.escala === escala);

  let files, nota = '';
  if (escala === 'setmanes') {
    const nomMes = deMes(mes);
    files = resumSetmanes(any, mes).map(s => ({
      titol: s.de === s.a ? `${s.de} ${nomMes}` : `Del ${s.de} al ${s.a} ${nomMes}`,
      sub: `${s.a - s.de + 1} dies`, hores: s.hores, brut: s.brut, net: s.net, compta: true,
    }));
    nota = 'Les setmanes van de dilluns a diumenge i només compten els dies d\'aquest mes.'
      + (c.mode === 'mensual' ? ' El sou fix es reparteix a parts iguals entre tots els dies del mes.' : '');
  } else if (escala === 'mesos') {
    files = resumMesos(any).map(m => ({
      titol: m.nom, sub: m.ambDades ? `${hores(m.extres)} extres i festives` : 'Sense hores apuntades',
      hores: m.hores, brut: m.ambDades ? m.brut : 0, net: m.ambDades ? m.net : 0, compta: m.ambDades, attrs: `data-mes="${m.mes}"`,
    }));
    nota = 'Toca un mes per obrir-lo. Només se sumen els mesos on has apuntat algun dia.';
  } else {
    files = resumAnys().map(a => ({
      titol: `${a.any}`, sub: `${a.mesos} ${a.mesos === 1 ? 'mes' : 'mesos'} · ${hores(a.extres)} extres i festives`,
      hores: a.hores, brut: a.brut, net: a.net, compta: true, attrs: `data-any="${a.any}"`,
    }));
    nota = 'Toca un any per veure\'n els mesos.';
  }

  const comptades = files.filter(f => f.compta);
  const totalH = comptades.reduce((s, f) => s + f.hores, 0);
  const totalB = comptades.reduce((s, f) => s + f.brut, 0);
  const totalN = comptades.reduce((s, f) => s + f.net, 0);
  const max = Math.max(0, ...files.map(f => f.hores));
  $('#resums-cos').innerHTML = !files.length ? '<p class="nota">Encara no hi ha cap dia apuntat.</p>' : `
    <div class="targetes">
      <div><b>${hores(totalH)}</b><span>treballades</span></div>
      <div><b>${euros(totalB)}</b><span>guanyats en brut</span></div>
      <div><b>${euros(totalN)}</b><span>nets aproximats</span></div>
    </div>
    ${files.map(f => `
      <button class="fila-resum${f.compta ? '' : ' buida'}" ${f.attrs || ''}>
        <div class="fr-cap"><b>${esc(f.titol)}</b><span>${hores(f.hores)}</span></div>
        <div class="barra"><i style="width:${max ? f.hores / max * 100 : 0}%"></i></div>
        <div class="fr-peu"><span>${f.sub}</span><span>${f.compta ? `${euros(f.brut)} bruts · <b>${euros(f.net)} nets</b>` : ''}</span></div>
      </button>`).join('')}
    <p class="nota">${nota}</p>`;
}

function tocaResums(e) {
  const fila = e.target.closest('.fila-resum');
  const b = e.target.closest('[data-escala]');
  if (b) escala = b.dataset.escala;
  else if (fila && fila.dataset.mes) { vist.mes = +fila.dataset.mes; vista = 'mes'; }
  else if (fila && fila.dataset.any) { vist.any = +fila.dataset.any; escala = 'mesos'; }
  else return;
  pinta();
}

// ---------- Vista: vacances ----------

function pintaVacances() {
  const c = estat.config;
  const v = calculaVacances(vist.any);
  const un = n => n.toLocaleString('ca-ES', { maximumFractionDigits: 1 });
  const pendents = v.generades - v.gaudides;
  $('#vacances-cos').innerHTML = `
    <h2>Vacances de ${vist.any}</h2>
    <div class="targetes">
      <div><b>${un(v.generades)}</b><span>dies generats fins avui</span></div>
      <div><b>${v.gaudides}</b><span>dies fets</span></div>
      <div><b>${un(pendents)}</b><span>${pendents < 0 ? 'dies avançats' : 'dies que ja tens guanyats'}</span></div>
      <div><b>${un(v.totalAny - v.gaudides)}</b><span>et queden de tot l'any (${un(v.totalAny)})</span></div>
    </div>
    <p class="nota">Generes ${un(c.vacDies / 12)} dies ${esc(c.vacTipus)} per cada mes treballat (${c.vacDies} l'any).
      ${c.vacTipus === 'naturals' ? 'En dies naturals, marca també els caps de setmana i festius que quedin dins del període de vacances.' : 'En dies laborables, marca només els dies que t\'hauria tocat treballar.'}</p>
    <p class="nota">Si plegues de l'empresa, els dies generats i no fets te'ls han de pagar a la liquidació.</p>
    <h2>Dies marcats</h2>
    ${v.llista.length ? `<ul class="llista">${v.llista.map(k => { const d = dataDeClau(k); return `<li>${DIES_LLARG[d.getDay()]}, ${d.getDate()} ${deMes(d.getMonth())}</li>`; }).join('')}</ul>` : '<p class="nota">Encara no has marcat cap dia de vacances aquest any. Es marquen des del calendari.</p>'}`;
}

// ---------- Vista: ajustos ----------

function pintaAjustos() {
  const c = estat.config;
  for (const el of $$('[data-cfg]')) el.value = c[el.dataset.cfg];
  for (const el of $$('[data-nomes]')) el.hidden = el.dataset.nomes !== c.mode || ('ambPagues' in el.dataset && c.pagues === '12');
  $('#cfg-mesos-paga').innerHTML = MESOS.map((m, i) => `
    <label class="check">${m.slice(0, 3).toLowerCase()}<input type="checkbox" data-mes-paga="${i}" ${c.mesosPaga.includes(i) ? 'checked' : ''}></label>`).join('');
  $('#cfg-jornada').innerHTML = ORDRE_SETMANA.map(d => `
    <label>${DIES[d]}<input type="number" min="0" max="24" step="0.25" data-jornada="${d}" value="${c.jornada[d]}"></label>`).join('');
  $('#cfg-festius').innerHTML = ORDRE_SETMANA.map(d => `
    <label class="check">${DIES[d]}<input type="checkbox" data-festiu="${d}" ${c.diesFestius.includes(d) ? 'checked' : ''}></label>`).join('');
  const plusos = llista => c[llista].map((p, i) => `
    <div class="fila plus">
      <label>Nom<input type="text" data-llista="${llista}" data-i="${i}" data-camp="nom" value="${esc(p.nom)}"></label>
      <label>Import (€)<input type="number" step="0.01" data-llista="${llista}" data-i="${i}" data-camp="importe" value="${esc(p.importe)}"></label>
      <button type="button" class="rodo" data-treu="${llista}" data-i="${i}" aria-label="Treu el plus">×</button>
    </div>
    <label class="check sota-plus"><input type="checkbox" data-llista="${llista}" data-i="${i}" data-camp="exempt" ${p.exempt ? 'checked' : ''}> Es cobra sencer, sense descomptes</label>`).join('');
  $('#cfg-recarrec').innerHTML = ORDRE_SETMANA.map(d => `
    <label>${DIES[d]}<input type="number" min="0" max="300" step="1" data-recarrec="${d}" value="${c.recarrecDia[d] || 0}"></label>`).join('');
  const preu = (i, camp, text, buit) => `<label>${text}<input type="number" step="0.01" min="0" placeholder="${buit}" data-llista="tarifes" data-i="${i}" data-camp="${camp}" value="${esc(c.tarifes[i][camp] ?? '')}"></label>`;
  $('#cfg-tarifes').innerHTML = c.tarifes.map((t, i) => `
    <div class="temporada">
      <div class="fila">
        <label>Des del dia<input type="date" data-llista="tarifes" data-i="${i}" data-camp="des" value="${esc(t.des || '')}"></label>
        <label>Fins al dia<input type="date" data-llista="tarifes" data-i="${i}" data-camp="fins" value="${esc(t.fins || '')}"></label>
        <button type="button" class="rodo" data-treu="tarifes" data-i="${i}" aria-label="Treu la temporada">×</button>
      </div>
      <div class="fila">${preu(i, 'preuHora', 'Hora normal (€)', 'igual')}${preu(i, 'preuExtra', 'Hora extra (€)', 'igual')}${preu(i, 'preuFestiu', 'Cap de setmana (€)', 'igual')}</div>
      <div class="fila">${preu(i, 'preuFestiuOficial', 'Hora festiu oficial (€)', 'igual')}${preu(i, 'plusNocturn', 'Plus hora de nit (€)', 'igual')}</div>
    </div>`).join('');
  $('#cfg-plusos-fixos').innerHTML = plusos('plusosFixos');
  $('#cfg-plusos-dia').innerHTML = plusos('plusosDia');
}

function canviaAjust(e) {
  const t = e.target, c = estat.config;
  if (t.dataset.cfg) {
    // Els camps marcats amb data-buit es poden deixar en blanc, que vol dir "igual que l'altre preu".
    c[t.dataset.cfg] = t.type === 'number' && !(t.value === '' && 'buit' in t.dataset) ? num(t.value) : t.value;
    if (t.dataset.cfg === 'mode' || t.dataset.cfg === 'pagues') pintaAjustos();
  } else if (t.dataset.mesPaga) {
    c.mesosPaga = $$('[data-mes-paga]:checked').map(i => +i.dataset.mesPaga);
  } else if (t.dataset.jornada) {
    c.jornada[+t.dataset.jornada] = num(t.value);
  } else if (t.dataset.festiu) {
    c.diesFestius = $$('[data-festiu]:checked').map(i => +i.dataset.festiu);
  } else if (t.dataset.recarrec) {
    c.recarrecDia[+t.dataset.recarrec] = num(t.value);
  } else if (t.dataset.llista) {
    // Un preu en blanc vol dir "igual que sempre", per això no es converteix a 0.
    c[t.dataset.llista][+t.dataset.i][t.dataset.camp] = t.type === 'checkbox' ? t.checked : t.type === 'number' && t.value !== '' ? num(t.value) : t.value;
  } else return;
  desa();
}

function importa(fitxer) {
  fitxer.text().then(text => {
    const dades = JSON.parse(text);
    if (!dades || typeof dades.dies !== 'object' || typeof dades.config !== 'object') throw new Error('format');
    if (!confirm('Això substituirà totes les dades que hi ha ara en aquest dispositiu. Vols continuar?')) return;
    localStorage.setItem(CLAU, JSON.stringify(dades));
    estat = carrega();
    pinta();
  }).catch(() => alert('Aquest fitxer no és una còpia vàlida.'));
}

// ---------- General ----------

function pinta() {
  cau.clear();
  avui = new Date();
  const abast = abastVista();
  $('#titol-mes').textContent = abast === 'any' ? `Any ${vist.any}` : abast === 'mes' ? `${MESOS[vist.mes]} ${vist.any}` : 'Tots els anys';
  $('.periode').hidden = vista === 'ajustos';
  $('#mes-ant').style.visibility = $('#mes-seg').style.visibility = abast === 'tot' ? 'hidden' : '';
  for (const s of $$('[data-vista]')) s.hidden = s.dataset.vista !== vista;
  for (const b of $$('.pestanyes [data-va]')) b.classList.toggle('activa', b.dataset.va === vista);
  ({ mes: pintaMes, resums: pintaResums, resum: pintaResum, vacances: pintaVacances, ajustos: pintaAjustos })[vista]();
}

// Quin període mostra la vista actual: un mes, un any o tot.
function abastVista() {
  if (vista === 'vacances') return 'any';
  if (vista === 'resums') return { setmanes: 'mes', mesos: 'any', anys: 'tot' }[escala];
  return 'mes';
}

function mouMes(pas) {
  const d = new Date(vist.any, vist.mes + (abastVista() === 'any' ? pas * 12 : pas), 1);
  vist = { any: d.getFullYear(), mes: d.getMonth() };
  pinta();
}

$('#mes-ant').onclick = () => mouMes(-1);
$('#mes-seg').onclick = () => mouMes(1);
document.addEventListener('click', e => {
  if (e.target.closest('[data-questionari]')) { obreQuestionari(); return; }
  const b = e.target.closest('[data-va]');
  if (b) { vista = b.dataset.va; pinta(); scrollTo(0, 0); }
});
$('#resums-cos').onclick = $('#resums-escala').onclick = tocaResums;
$('#graella').onclick = e => { const b = e.target.closest('[data-clau]'); if (b) obreDia(b.dataset.clau); };
$('#omple-mes').onclick = ompleMes;
$('#fitxar').onclick = e => { if (e.target.dataset.fitxa) fitxa(e.target.dataset.fitxa); };
setInterval(() => { if (vista === 'mes' && estat.fitxatge) pintaFitxar(); }, 30000);

$('#q-mode').onchange = ajustaQuestionari;
$('#q-puja').onclick = () => $('#q-fitxer').click();
$('#q-fitxer').onchange = e => { if (e.target.files[0]) pujaNomina(e.target.files[0]); e.target.value = ''; };
$('#form-benvinguda').addEventListener('submit', desaQuestionari);
$('#q-salta').onclick = () => { estat.benvinguda = true; desa(); $('#dlg-benvinguda').close(); pinta(); };
// Es tanqui com es tanqui el qüestionari (botó, tecla enrere del mòbil…), no torna a sortir sol.
$('#dlg-benvinguda').addEventListener('close', () => {
  if (!estat.benvinguda) { estat.benvinguda = true; desa(); pinta(); }
});
$('#refes-questionari').onclick = obreQuestionari;

$('#form-dia').addEventListener('input', llegeixDialeg);
$('#form-dia').addEventListener('click', tocaDialeg);
$('#form-dia').addEventListener('submit', desaDia);
$('#dia-cancela').onclick = () => $('#dlg-dia').close();
$('#dia-afegeix-altre').onclick = () => { esborrany.altres.push({ nom: '', importe: '', exempt: false }); pintaAltres(); };
$('#dia-afegeix-tram').onclick = () => { esborrany.trams.push({ ini: '', fi: '' }); pintaTrams(); };
$('#dia-trams').onclick = e => {
  const i = e.target.dataset.treuTram;
  if (i !== undefined) { esborrany.trams.splice(+i, 1); pintaTrams(); actualitzaDialeg(); }
};
$('#dia-esborra').onclick = () => { delete estat.dies[diaEditat]; desa(); $('#dlg-dia').close(); pinta(); };

$('#ajustos').addEventListener('change', canviaAjust);
$('#ajustos').addEventListener('click', e => {
  const t = e.target, c = estat.config;
  if (t.dataset.afegeix === 'tarifes') c.tarifes.push({ des: '', fins: '', preuHora: '', preuExtra: '', preuFestiu: '' });
  else if (t.dataset.afegeix) c[t.dataset.afegeix].push({ id: Date.now().toString(36), nom: '', importe: 0 });
  else if (t.dataset.treu) c[t.dataset.treu].splice(+t.dataset.i, 1);
  else return;
  desa();
  pintaAjustos();
});
$('#exporta').onclick = () => descarrega(`control-hores-${clauDia(avui.getFullYear(), avui.getMonth(), avui.getDate())}.json`, JSON.stringify(estat, null, 2), 'application/json');
$('#importa').onclick = () => $('#fitxer').click();
$('#fitxer').onchange = e => { if (e.target.files[0]) importa(e.target.files[0]); e.target.value = ''; };

$('#resum-cos').addEventListener('input', e => {
  const camp = e.target.dataset.nomina;
  if (!camp) return;
  const k = clauMes(vist.any, vist.mes);
  estat.nomines[k] = { ...estat.nomines[k], [camp]: e.target.value === '' ? undefined : num(e.target.value) };
  desa();
  pintaComparacio();
});
$('#resum-cos').addEventListener('click', e => { if (e.target.id === 'csv') exportaCSV(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
pinta();
try { localStorage.setItem('jornal-prova', '1'); localStorage.removeItem('jornal-prova'); } catch { $('#avis-desat').hidden = false; }
// El qüestionari només surt sol la primera vegada. Es deixa apuntat abans d'obrir-lo, perquè no torni
// a aparèixer encara que es tanqui d'una manera que el navegador no avisi (tecla enrere, tancar l'app…).
if (!estat.benvinguda && !estat.popupVist) {
  estat.popupVist = true;
  desa();
  obreQuestionari();
}

"use strict";

const APP_VERSION = "1.6.0";
const DB_NAME = "workout-log-db";
const DB_VERSION = 1;
const WD_MAX = 12;
let db;
let exercises = [];
let workouts = [];
let deferredInstallPrompt = null;
let pendingConfirmAction = null;
let timerInterval = null;
let selectedDetailExerciseId = null;
let activeTimerExerciseId = null;
let wakeLock = null;
let keepScreenAwake = true;
let audioContext = null;

const $ = id => document.getElementById(id);
const localISODate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parseDate = value => new Date(`${value}T12:00:00`);
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" });
const num = value => { const n = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const round = (value, decimals = 2) => Number(Number(value).toFixed(decimals));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const formatKg = value => `${num(value).toLocaleString("it-IT", { maximumFractionDigits: 2 })} kg`;
const validWd = value => /^WD([1-9]|1[0-2])$/.test(value);

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains("exercises")) database.createObjectStore("exercises", { keyPath: "id" });
      if (!database.objectStoreNames.contains("workouts")) database.createObjectStore("workouts", { keyPath: "date" });
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function storeAction(storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
  });
}
function getAll(store) { return storeAction(store, "readonly", s => s.getAll()); }
function put(store, value) { return storeAction(store, "readwrite", s => s.put(value)); }
function del(store, key) { return storeAction(store, "readwrite", s => s.delete(key)); }
function clear(store) { return storeAction(store, "readwrite", s => s.clear()); }
function getSetting(key) { return new Promise((resolve, reject) => { const tx=db.transaction("settings","readonly"); const r=tx.objectStore("settings").get(key); r.onsuccess=()=>resolve(r.result?.value); r.onerror=()=>reject(r.error); }); }
function setSetting(key, value) { return put("settings", { key, value }); }
async function reloadData() {
  [exercises, workouts] = await Promise.all([getAll("exercises"), getAll("workouts")]);
  exercises.sort((a,b) => a.name.localeCompare(b.name, "it"));
  workouts.sort((a,b) => a.date.localeCompare(b.date));
}

function showMessage(id, text, error = false) {
  const el = $(id); el.textContent = text; el.classList.toggle("error", error);
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 6000);
}
function setMenuOpen(open) {
  const menu=$("mainMenu"),toggle=$("menuToggleBtn"),backdrop=$("menuBackdrop");
  menu.hidden=!open;backdrop.hidden=!open;toggle.setAttribute("aria-expanded",String(open));
  toggle.setAttribute("aria-label",open?"Chiudi menu":"Apri menu");
  document.body.classList.toggle("menu-open",open);
  if(open)menu.querySelector(".tab.active")?.focus();
}
function switchPanel(id) {
  document.querySelectorAll(".tab[data-panel]").forEach(t => t.classList.toggle("active", t.dataset.panel === id));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === id));
  setMenuOpen(false);
  if (id === "analysis") refreshAnalysis();
  if (id === "backup") refreshBackupStatus();
}
function getActiveWds() {
  const set = new Set();
  exercises.filter(e => !e.archived).forEach(e => (e.workDays || []).forEach(wd => set.add(wd)));
  return [...set].filter(validWd).sort((a,b) => Number(a.slice(2)) - Number(b.slice(2)));
}
function exerciseOrder(exercise, wd) { return num(exercise.orderByWd?.[wd]) || 999; }
function exercisesForWd(wd) {
  return exercises.filter(e => !e.archived && (e.workDays || []).includes(wd)).sort((a,b) => exerciseOrder(a,wd)-exerciseOrder(b,wd) || a.name.localeCompare(b.name,"it"));
}
function previousWorkoutForDate(date) {
  return workouts.filter(w => w.date < date).sort((a,b) => b.date.localeCompare(a.date))[0] || workouts.sort((a,b)=>b.date.localeCompare(a.date))[0];
}
function suggestedWd(date) {
  const wds = getActiveWds();
  if (!wds.length) return "";
  const previous = previousWorkoutForDate(date);
  if (!previous || !wds.includes(previous.workDay)) return wds[0];
  const currentNumber = Number(previous.workDay.slice(2));
  return wds.find(wd => Number(wd.slice(2)) > currentNumber) || wds[0];
}

function buildWdControls() {
  $("wdCheckboxes").innerHTML = Array.from({length:WD_MAX},(_,i)=>{
    const wd=`WD${i+1}`; return `<label class="wd-check"><input type="checkbox" name="workDays" value="${wd}"> ${wd}</label>`;
  }).join("");
  document.querySelectorAll('input[name="workDays"]').forEach(cb => cb.addEventListener("change", renderWdOrderInputs));
}
function renderWdOrderInputs(existing = null) {
  const selected = [...document.querySelectorAll('input[name="workDays"]:checked')].map(c=>c.value);
  const current = existing || Object.fromEntries([...$("wdOrders").querySelectorAll("input")].map(i=>[i.dataset.wd,i.value]));
  $("wdOrders").innerHTML = selected.map(wd => `<label class="wd-order"><strong>${wd}</strong><span>ordine</span><input type="number" min="1" max="99" data-wd="${wd}" value="${esc(current?.[wd] || nextOrderForWd(wd))}"></label>`).join("");
}
function nextOrderForWd(wd) {
  const max = Math.max(0, ...exercises.filter(e=>!e.archived&&(e.workDays||[]).includes(wd)).map(e=>exerciseOrder(e,wd)).filter(n=>n<999));
  return max + 1;
}
function resetExerciseForm() {
  $("exerciseForm").reset(); $("exerciseId").value=""; $("defaultSets").value=3; $("restSeconds").value=90;
  $("exerciseFormTitle").textContent="Nuovo esercizio"; renderWdOrderInputs({});
}
function openExerciseForm(exercise = null) {
  resetExerciseForm();
  if (exercise) {
    $("exerciseFormTitle").textContent="Modifica esercizio"; $("exerciseId").value=exercise.id; $("exerciseName").value=exercise.name;
    $("muscleGroup").value=exercise.muscleGroup||""; $("equipmentMeasure").value=exercise.equipmentMeasure||""; $("defaultSets").value=exercise.defaultSets||3;
    $("restSeconds").value=exercise.restSeconds??90; $("targetReps").value=exercise.targetReps||""; $("weightIncrement").value=exercise.weightIncrement||""; $("exerciseNotes").value=exercise.notes||"";
    document.querySelectorAll('input[name="workDays"]').forEach(cb=>cb.checked=(exercise.workDays||[]).includes(cb.value)); renderWdOrderInputs(exercise.orderByWd||{});
  }
  $("exerciseFormCard").classList.remove("hidden"); $("exerciseName").focus();
}
function closeExerciseForm() { $("exerciseFormCard").classList.add("hidden"); resetExerciseForm(); }
async function saveExercise(event) {
  event.preventDefault();
  const id=$("exerciseId").value||uuid();
  const old=exercises.find(e=>e.id===id);
  const workDays=[...document.querySelectorAll('input[name="workDays"]:checked')].map(c=>c.value);
  if (!workDays.length) return showMessage("configMessage","Seleziona almeno un Work Day.",true);
  const orderByWd={}; $("wdOrders").querySelectorAll("input").forEach(i=>orderByWd[i.dataset.wd]=Math.max(1,num(i.value)||1));
  const record={id,name:$("exerciseName").value.trim(),muscleGroup:$("muscleGroup").value.trim(),equipmentMeasure:$("equipmentMeasure").value.trim(),defaultSets:Math.min(20,Math.max(1,num($("defaultSets").value)||3)),restSeconds:Math.max(0,num($("restSeconds").value)),targetReps:$("targetReps").value.trim(),weightIncrement:num($("weightIncrement").value)||null,notes:$("exerciseNotes").value.trim(),workDays,orderByWd,archived:old?.archived||false,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await put("exercises",record); await reloadData(); closeExerciseForm(); renderConfiguration(); refreshWdSelect(); showMessage("configMessage","Esercizio salvato.");
}
async function toggleArchive(id) {
  const exercise=exercises.find(e=>e.id===id); if(!exercise)return; exercise.archived=!exercise.archived; exercise.updatedAt=new Date().toISOString(); await put("exercises",exercise); await reloadData(); renderConfiguration(); refreshWdSelect();
  showMessage("configMessage",exercise.archived?"Esercizio archiviato. Lo storico rimane disponibile.":"Esercizio riattivato.");
}
function dragHandleHtml() {
  return `<button class="drag-handle" type="button" aria-label="Trascina per riordinare" title="Trascina per riordinare"><span></span><span></span><span></span><span></span><span></span><span></span></button>`;
}
function exerciseCard(exercise, wd = null) {
  const order=wd?` · ordine ${exerciseOrder(exercise,wd)}`:"";
  const reorder=wd?`${dragHandleHtml()}<div class="move-buttons"><button type="button" data-move="up" aria-label="Sposta su">↑</button><button type="button" data-move="down" aria-label="Sposta giù">↓</button></div>`:"";
  return `<article class="exercise-card" data-exercise-id="${exercise.id}"${wd?` data-wd="${wd}"`:""}><div class="exercise-card-main">${reorder}<div class="exercise-card-content"><h4>${esc(exercise.name)}</h4><div class="exercise-subtitle">${esc(exercise.muscleGroup||"Nessun gruppo")}${order}</div><div class="meta">${(exercise.workDays||[]).map(w=>`<span class="chip">${w}</span>`).join("")}<span class="chip">${exercise.defaultSets||3} serie</span><span class="chip">rec. ${exercise.restSeconds||0}s</span></div>${exercise.equipmentMeasure?`<div class="exercise-subtitle"><strong>Misura attrezzo:</strong> ${esc(exercise.equipmentMeasure)}</div>`:""}<div class="card-actions"><button data-edit="${exercise.id}">Modifica</button><button data-archive="${exercise.id}">${exercise.archived?"Riattiva":"Archivia"}</button></div></div></div></article>`;
}
async function saveWdOrder(list, wd) {
  const cards=[...list.querySelectorAll('.exercise-card[data-exercise-id]')];
  for(let i=0;i<cards.length;i++) {
    const exercise=exercises.find(e=>e.id===cards[i].dataset.exerciseId);
    if(!exercise) continue;
    exercise.orderByWd={...(exercise.orderByWd||{}),[wd]:i+1};
    exercise.updatedAt=new Date().toISOString();
    await put('exercises',exercise);
  }
  await reloadData();
  renderConfiguration();
  refreshWdSelect($("workDaySelect").value || null);
  showMessage('configMessage',`Ordine di ${wd} aggiornato.`);
}
function moveCard(card, direction) {
  const list=card.parentElement, sibling=direction==='up'?card.previousElementSibling:card.nextElementSibling;
  if(!sibling) return;
  if(direction==='up') list.insertBefore(card,sibling); else list.insertBefore(sibling,card);
  saveWdOrder(list,card.dataset.wd);
}
function enableDragSorting(list, wd) {
  list.querySelectorAll('.exercise-card').forEach(card=>{
    const handle=card.querySelector('.drag-handle');
    if(!handle) return;
    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();
      handle.setPointerCapture?.(event.pointerId);
      const rect=card.getBoundingClientRect();
      card.classList.add('dragging');
      const ghost=card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.width=`${rect.width}px`;
      ghost.style.left=`${rect.left}px`;
      ghost.style.top=`${rect.top}px`;
      document.body.appendChild(ghost);
      const offsetY=event.clientY-rect.top;
      const move=ev=>{
        ghost.style.top=`${ev.clientY-offsetY}px`;
        ghost.style.left=`${rect.left}px`;
        ghost.style.pointerEvents='none';
        const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.exercise-card');
        if(!target||target===card||target.parentElement!==list)return;
        const targetRect=target.getBoundingClientRect();
        list.insertBefore(card,ev.clientY<targetRect.top+targetRect.height/2?target:target.nextElementSibling);
      };
      const finish=async()=>{
        handle.removeEventListener('pointermove',move);
        handle.removeEventListener('pointerup',finish);
        handle.removeEventListener('pointercancel',finish);
        ghost.remove(); card.classList.remove('dragging');
        await saveWdOrder(list,wd);
      };
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',finish,{once:true});
      handle.addEventListener('pointercancel',finish,{once:true});
    });
  });
}
function renderConfiguration() {
  const wds=getActiveWds();
  $("activeExercises").innerHTML=wds.length?wds.map(wd=>`<section class="config-group" data-config-wd="${wd}"><div class="config-group-heading"><h3>${wd} <span class="badge">${exercisesForWd(wd).length} esercizi</span></h3><span class="drag-help">Trascina dalla maniglia a 6 punti</span></div><div class="exercise-cards sortable-list" data-sort-wd="${wd}">${exercisesForWd(wd).map(e=>exerciseCard(e,wd)).join("")}</div></section>`).join(""):`<div class="empty-state">Nessun esercizio configurato. Crea il primo esercizio e assegnalo a un Work Day.</div>`;
  const archived=exercises.filter(e=>e.archived); $("archivedExercises").innerHTML=archived.length?archived.map(e=>exerciseCard(e)).join(""):`<div class="empty-state">Nessun esercizio archiviato.</div>`;
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openExerciseForm(exercises.find(e=>e.id===b.dataset.edit)));
  document.querySelectorAll("[data-archive]").forEach(b=>b.onclick=()=>toggleArchive(b.dataset.archive));
  document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>moveCard(b.closest('.exercise-card'),b.dataset.move));
  document.querySelectorAll('[data-sort-wd]').forEach(list=>enableDragSorting(list,list.dataset.sortWd));
}

function bestHistoricalSet(exerciseId, beforeDate = null) {
  const sets=workouts.filter(w=>!beforeDate||w.date<beforeDate).flatMap(w=>w.exercises||[]).filter(x=>x.exerciseId===exerciseId).flatMap(x=>x.sets||[]).filter(s=>num(s.weight)>0&&num(s.reps)>0);
  if(!sets.length)return null;
  const maxWeight=Math.max(...sets.map(s=>num(s.weight))); const maxReps=Math.max(...sets.filter(s=>num(s.weight)===maxWeight).map(s=>num(s.reps)));
  return {weight:maxWeight,reps:maxReps};
}
function refreshWdSelect(forceWd = null) {
  const date=$("workoutDate").value||localISODate(); const existing=workouts.find(w=>w.date===date); const wds=getActiveWds();
  const preferred=forceWd||existing?.workDay||suggestedWd(date);
  $("workDaySelect").innerHTML=wds.length?`<option value="">Seleziona il Work Day</option>${wds.map(w=>`<option value="${w}" ${w===preferred?"selected":""}>${w}</option>`).join("")}`:`<option value="">Configura prima gli esercizi</option>`;
  $("workDaySelect").disabled=!wds.length;
  if(preferred&&wds.includes(preferred)) loadWorkoutForm(date,preferred); else renderWorkoutExercises([]);
}
function newExerciseEntry(exercise,date) {
  const best=bestHistoricalSet(exercise.id,date); const count=exercise.defaultSets||3;
  return {exerciseId:exercise.id,nameSnapshot:exercise.name,sets:Array.from({length:count},(_,i)=>({id:uuid(),number:i+1,reps:best?.reps||"",weight:best?.weight||"",rir:""})),notes:""};
}
function loadWorkoutForm(date,wd) {
  const existing=workouts.find(w=>w.date===date);
  if(existing) {
    if(existing.workDay!==wd) {
      $("trackingStatus").textContent=`Salvato: ${existing.workDay}`; $("workDayHint").textContent=`In questa data è già salvato ${existing.workDay}. Se salvi ${wd}, sostituirai la sessione della giornata.`;
      renderWorkoutExercises(exercisesForWd(wd).map(e=>newExerciseEntry(e,date))); $("workoutNotes").value=""; $("deleteWorkoutBtn").classList.remove("hidden");
    } else {
      $("trackingStatus").textContent="Sessione salvata"; $("workDayHint").textContent="Stai modificando l’allenamento già registrato.";
      const entries=exercisesForWd(wd).map(ex=>existing.exercises?.find(x=>x.exerciseId===ex.id)||newExerciseEntry(ex,date));
      const historicOnly=(existing.exercises||[]).filter(x=>!entries.some(e=>e.exerciseId===x.exerciseId)); renderWorkoutExercises([...entries,...historicOnly]); $("workoutNotes").value=existing.notes||""; $("deleteWorkoutBtn").classList.remove("hidden");
    }
  } else {
    $("trackingStatus").textContent="Nuova sessione"; $("workDayHint").textContent=`${wd} preselezionato secondo la rotazione; puoi cambiarlo liberamente.`;
    renderWorkoutExercises(exercisesForWd(wd).map(e=>newExerciseEntry(e,date))); $("workoutNotes").value=""; $("deleteWorkoutBtn").classList.add("hidden");
  }
}
function updateStickyTimer(card = null) {
  const cards=[...$("workoutExercises").querySelectorAll(".workout-exercise")];
  const selected=card||cards.find(c=>c.dataset.exerciseId===activeTimerExerciseId)||cards[0]||null;
  cards.forEach(c=>c.classList.toggle("timer-active",c===selected));
  activeTimerExerciseId=selected?.dataset.exerciseId||null;
  const seconds=num(selected?.dataset.restSeconds);
  const button=$("stickyTimerBtn");
  button.disabled=!selected||seconds<=0;
  button.textContent=selected?`Timer ${seconds}s`:"Timer";
  button.setAttribute("aria-label",selected?`Avvia timer di ${seconds} secondi per ${selected.dataset.name}`:"Timer non disponibile");
  button.title=selected?`${selected.dataset.name} · recupero configurato ${seconds}s`:"Seleziona un esercizio";
}
function setActiveTimerExercise(card){if(!card)return;activeTimerExerciseId=card.dataset.exerciseId;updateStickyTimer(card)}
function renderWorkoutExercises(entries) {
  const container=$("workoutExercises");
  if(!entries.length){container.innerHTML='<div class="empty-state">Seleziona un Work Day per caricare gli esercizi.</div>';$('workoutSummary').classList.add('hidden');activeTimerExerciseId=null;updateStickyTimer();updateWorkoutTotal();return;}
  $('workoutSummary').classList.remove('hidden');
  container.innerHTML=entries.map(entry=>{
    const ex=exercises.find(e=>e.id===entry.exerciseId); const title=ex?.name||entry.nameSnapshot||"Esercizio archiviato"; const rest=num(ex?.restSeconds);
    return `<article class="workout-exercise" data-exercise-id="${entry.exerciseId}" data-name="${esc(title)}" data-rest-seconds="${rest}"><header class="exercise-header"><div><h3>${esc(title)}</h3><div class="exercise-subtitle">${ex?.equipmentMeasure?`Misura attrezzo: ${esc(ex.equipmentMeasure)} · `:""}Recupero: ${rest}s${ex?.targetReps?` · Obiettivo: ${esc(ex.targetReps)} rip.`:""}</div></div><span class="timer-chip" aria-label="Recupero configurato">${rest}s</span></header><div class="sets">${(entry.sets||[]).map((s,i)=>setRowHtml(s,i)).join("")}</div><footer class="exercise-footer"><button class="add-set" type="button">+ Serie</button><span class="volume-label">Volume: <strong class="exercise-volume">0 kg</strong></span></footer><label class="field exercise-note-field"><span>Note esercizio</span><input class="exercise-note" maxlength="300" placeholder="Aggiungi una nota…" value="${esc(entry.notes||"")}"></label></article>`;
  }).join("");
  container.querySelectorAll(".workout-exercise").forEach((card,index)=>{
    const entry=entries[index]; card.dataset.entry=JSON.stringify(entry);
    card.querySelector(".add-set").onclick=()=>{setActiveTimerExercise(card);addSet(card)};
    card.querySelectorAll(".remove-set").forEach(b=>b.onclick=()=>{setActiveTimerExercise(card);removeSet(b.closest(".set-row"))});
    card.querySelectorAll("input").forEach(i=>i.addEventListener("input",()=>updateCardVolume(card)));
    card.addEventListener("focusin",()=>setActiveTimerExercise(card));
    card.addEventListener("pointerdown",()=>setActiveTimerExercise(card));
    updateCardVolume(card);
  });
  updateStickyTimer();
  updateWorkoutTotal();
}
function setRowHtml(set,index) { return `<div class="set-row" data-set-id="${set.id||uuid()}"><div class="set-number">${index+1}</div><label><span class="small-label">Ripetizioni</span><input class="set-reps" type="number" min="0" max="1000" inputmode="numeric" value="${esc(set.reps)}"></label><label><span class="small-label">Peso kg</span><input class="set-weight" type="number" min="0" max="2000" step="0.25" inputmode="decimal" value="${esc(set.weight)}"></label><label class="set-rir"><span class="small-label">RIR</span><input class="set-rir-input" type="number" min="0" max="20" value="${esc(set.rir)}"></label><button class="remove-set" type="button" aria-label="Rimuovi serie">×</button></div>`; }
function renumberSets(card){card.querySelectorAll(".set-row").forEach((r,i)=>r.querySelector(".set-number").textContent=i+1)}
function addSet(card){const sets=card.querySelector(".sets");const last=sets.lastElementChild;const temp=document.createElement("div");temp.innerHTML=setRowHtml({id:uuid(),reps:last?.querySelector(".set-reps").value||"",weight:last?.querySelector(".set-weight").value||"",rir:last?.querySelector(".set-rir-input").value||""},sets.children.length);const row=temp.firstElementChild;sets.appendChild(row);row.querySelector(".remove-set").onclick=()=>removeSet(row);row.querySelectorAll("input").forEach(i=>i.addEventListener("input",()=>updateCardVolume(card)));renumberSets(card);updateCardVolume(card)}
function removeSet(row){const card=row.closest(".workout-exercise");if(card.querySelectorAll(".set-row").length<=1)return;row.remove();renumberSets(card);updateCardVolume(card)}
function updateCardVolume(card){const volume=[...card.querySelectorAll(".set-row")].reduce((sum,r)=>sum+num(r.querySelector(".set-reps").value)*num(r.querySelector(".set-weight").value),0);card.querySelector(".exercise-volume").textContent=formatKg(round(volume));updateWorkoutTotal()}
function updateWorkoutTotal(){
  const rows=[...$('workoutExercises').querySelectorAll('.set-row')];
  const total=rows.reduce((sum,row)=>sum+num(row.querySelector('.set-reps')?.value)*num(row.querySelector('.set-weight')?.value),0);
  const completed=rows.filter(row=>num(row.querySelector('.set-reps')?.value)>0||num(row.querySelector('.set-weight')?.value)>0).length;
  $('workoutTotalVolume').textContent=formatKg(round(total));
  $('workoutTotalSets').textContent=completed;
  return round(total);
}
function collectWorkout() {
  const date=$("workoutDate").value, workDay=$("workDaySelect").value; if(!date||!workDay)throw new Error("Seleziona data e Work Day.");
  const entries=[...$("workoutExercises").querySelectorAll(".workout-exercise")].map(card=>({exerciseId:card.dataset.exerciseId,nameSnapshot:card.dataset.name,notes:card.querySelector(".exercise-note").value.trim(),sets:[...card.querySelectorAll(".set-row")].map((row,i)=>({id:row.dataset.setId||uuid(),number:i+1,reps:num(row.querySelector(".set-reps").value),weight:num(row.querySelector(".set-weight").value),rir:row.querySelector(".set-rir-input").value===""?null:num(row.querySelector(".set-rir-input").value)})).filter(s=>s.reps>0||s.weight>0)})).filter(e=>e.sets.length);
  if(!entries.length)throw new Error("Inserisci almeno una serie.");
  const old=workouts.find(w=>w.date===date); return {date,workDay,exercises:entries,totalVolume:round(entries.flatMap(e=>e.sets).reduce((sum,set)=>sum+num(set.reps)*num(set.weight),0)),notes:$("workoutNotes").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}
async function saveWorkout(){try{const record=collectWorkout();const existing=workouts.find(w=>w.date===record.date);if(existing&&existing.workDay!==record.workDay&&!confirm(`In questa data è già presente ${existing.workDay}. Sostituirlo con ${record.workDay}?`))return;await put("workouts",record);await reloadData();refreshWdSelect(record.workDay);showMessage("trackingMessage",`Allenamento salvato · volume totale ${formatKg(record.totalVolume)}.`);refreshAnalysis()}catch(e){showMessage("trackingMessage",e.message||"Impossibile salvare.",true)}}
async function deleteCurrentWorkout(){const date=$("workoutDate").value;await del("workouts",date);await reloadData();refreshWdSelect();showMessage("trackingMessage","Allenamento eliminato.")}
function prepareAudio(){
  try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume()}catch(e){}
}
function playTimerSound(){
  try{
    prepareAudio(); if(!audioContext)return;
    const now=audioContext.currentTime;
    [0,.22,.44].forEach((delay,index)=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=index===2?1046:880;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(.35,now+delay+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.17);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(now+delay);oscillator.stop(now+delay+.19)});
  }catch(e){}
}
function startTimer(seconds,exerciseName=""){if(!seconds)return;prepareAudio();requestWakeLock();clearInterval(timerInterval);document.querySelector(".timer-overlay")?.remove();const overlay=document.createElement("div");overlay.className="timer-overlay";overlay.innerHTML=`<div class="timer-card"><p>Recupero${exerciseName?` · ${esc(exerciseName)}`:""}</p><div class="timer-value">${seconds}</div><div class="timer-progress"><span></span></div><button class="button secondary" type="button">Chiudi</button></div>`;document.body.appendChild(overlay);let left=seconds;const bar=overlay.querySelector('.timer-progress span');const close=()=>{clearInterval(timerInterval);overlay.remove()};overlay.querySelector("button").onclick=close;timerInterval=setInterval(()=>{left--;overlay.querySelector(".timer-value").textContent=Math.max(0,left);bar.style.width=`${Math.max(0,left/seconds*100)}%`;if(left<=0){clearInterval(timerInterval);overlay.querySelector(".timer-value").textContent="Via!";overlay.classList.add('timer-finished');playTimerSound();if(navigator.vibrate)navigator.vibrate([250,120,250,120,400])}},1000)}
async function requestWakeLock(){
  if(!keepScreenAwake||document.visibilityState!=='visible')return;
  if(!('wakeLock'in navigator)){$('wakeLockStatus').textContent='Schermo attivo: non supportato';return}
  try{if(!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;updateWakeLockStatus()})}updateWakeLockStatus()}catch(e){wakeLock=null;updateWakeLockStatus(true)}
}
function updateWakeLockStatus(failed=false){$('wakeLockStatus').textContent=wakeLock?'Schermo sempre attivo':failed?'Schermo attivo: autorizzazione non disponibile':'Schermo attivo: in attesa'}
async function handleVisibilityChange(){if(document.visibilityState==='visible')await requestWakeLock()}

function filteredWorkouts(){const p=$("analysisPeriod").value;if(p==="all")return workouts;const cutoff=new Date();cutoff.setDate(cutoff.getDate()-Number(p));return workouts.filter(w=>parseDate(w.date)>=cutoff)}
function exerciseSessions(exerciseId, source=filteredWorkouts()){
  return source.map(w=>{
    const entry=(w.exercises||[]).find(e=>e.exerciseId===exerciseId);if(!entry)return null;
    const sets=(entry.sets||[]).filter(s=>num(s.reps)>0||num(s.weight)>0);
    const bestWeight=[...sets].sort((a,b)=>num(b.weight)-num(a.weight)||num(b.reps)-num(a.reps))[0];
    const bestSetVolume=[...sets].map(set=>({set,volume:round(num(set.weight)*num(set.reps))})).sort((a,b)=>b.volume-a.volume||num(b.set.weight)-num(a.set.weight))[0]||null;
    return {date:w.date,workDay:w.workDay,nameSnapshot:entry.nameSnapshot||"",sets,bestWeight,bestSetVolume,volume:round(sets.reduce((sum,set)=>sum+num(set.weight)*num(set.reps),0))};
  }).filter(Boolean)
}
function latestRecord(items,valueOf){
  return items.reduce((best,item)=>!best||valueOf(item)>valueOf(best)||(valueOf(item)===valueOf(best)&&item.date>best.date)?item:best,null)
}
function statsForExercise(exerciseId){
  const sessions=exerciseSessions(exerciseId);if(!sessions.length)return null;
  const weightedSets=sessions.flatMap(session=>session.sets.map(set=>({date:session.date,set,volume:round(num(set.weight)*num(set.reps))})));
  if(!weightedSets.length)return null;
  const maxWeightRecord=latestRecord(weightedSets,item=>num(item.set.weight));
  const maxSetVolumeRecord=latestRecord(weightedSets,item=>item.volume);
  const bestEpley=Math.max(...weightedSets.map(item=>num(item.set.weight)*(1+num(item.set.reps)/30)));
  return {sessions,maxWeightRecord,maxSetVolumeRecord,totalVolume:round(sessions.reduce((sum,session)=>sum+session.volume,0)),estimated1RM:round(bestEpley,1),last:sessions.at(-1)?.date}
}
function refreshAnalysis(){
  const ids=new Set(filteredWorkouts().flatMap(w=>(w.exercises||[]).map(e=>e.exerciseId)));
  const rows=[...ids].map(id=>({exercise:exercises.find(e=>e.id===id),id,stats:statsForExercise(id)})).filter(x=>x.stats).sort((a,b)=>(a.exercise?.name||"").localeCompare(b.exercise?.name||"","it"));
  $("analysisEmpty").classList.toggle("hidden",rows.length>0);$("analysisContent").classList.toggle("hidden",!rows.length);
  $("analysisTableBody").innerHTML=rows.map(x=>`<tr><td><button class="analysis-link" data-detail="${x.id}">${esc(x.exercise?.name||x.stats.sessions[0]?.nameSnapshot||"Esercizio")}</button>${x.exercise?.archived?' <span class="chip">archiviato</span>':""}</td><td>${formatKg(x.stats.maxWeightRecord.set.weight)} <span class="record-date">(${dateFmt.format(parseDate(x.stats.maxWeightRecord.date))})</span></td><td>${formatKg(x.stats.maxSetVolumeRecord.volume)} <span class="record-date">(${dateFmt.format(parseDate(x.stats.maxSetVolumeRecord.date))})</span></td><td>${x.stats.sessions.length}</td><td>${x.stats.last?dateFmt.format(parseDate(x.stats.last)):"—"}</td></tr>`).join("");
  document.querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>showExerciseDetail(b.dataset.detail));
  if(selectedDetailExerciseId&&rows.some(r=>r.id===selectedDetailExerciseId))showExerciseDetail(selectedDetailExerciseId,false);else $("exerciseDetail").classList.add("hidden")
}
function showExerciseDetail(id,scroll=true){
  selectedDetailExerciseId=id;const ex=exercises.find(e=>e.id===id);const st=statsForExercise(id);if(!st)return;
  $("exerciseDetail").classList.remove("hidden");$("detailTitle").textContent=ex?.name||"Esercizio";
  $("detailKpis").innerHTML=[
    ['Massimo peso',`${formatKg(st.maxWeightRecord.set.weight)}<small>(${dateFmt.format(parseDate(st.maxWeightRecord.date))})</small>`],
    ['Max volume singola serie',`${formatKg(st.maxSetVolumeRecord.volume)}<small>(${dateFmt.format(parseDate(st.maxSetVolumeRecord.date))})</small>`],
    ['Volume totale storico',formatKg(st.totalVolume)],
    ['Ultima sessione',st.last?dateFmt.format(parseDate(st.last)):'—']
  ].map(([label,value])=>`<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("detailHistoryBody").innerHTML=[...st.sessions].reverse().map(session=>`<tr><td>${dateFmt.format(parseDate(session.date))}</td><td>${session.workDay}</td><td>${session.sets.length}</td><td>${session.bestWeight?`${formatKg(session.bestWeight.weight)} × ${session.bestWeight.reps}`:'—'}</td><td>${session.bestSetVolume?formatKg(session.bestSetVolume.volume):'—'}</td><td>${formatKg(session.volume)}</td></tr>`).join("");
  drawLineChart($("progressChart"),st.sessions.map(session=>({date:session.date,value:num(session.bestWeight?.weight)})),{label:'kg',color:'#26705d'});
  drawLineChart($("setVolumeChart"),st.sessions.map(session=>({date:session.date,value:num(session.bestSetVolume?.volume)})),{label:'kg',color:'#e1a943'});
  drawLineChart($("volumeChart"),st.sessions.map(session=>({date:session.date,value:session.volume})),{label:'kg',color:'#173e33'});
  if(scroll)$("exerciseDetail").scrollIntoView({behavior:"smooth",block:"start"})
}
function drawLineChart(canvas,points,options){const ctx=canvas.getContext("2d"),dpr=window.devicePixelRatio||1,w=canvas.clientWidth||450,h=300;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);if(!points.length)return;const pad={l:48,r:22,t:24,b:45};const values=points.flatMap(p=>p.secondary!==undefined?[p.value,p.secondary]:[p.value]);let min=Math.min(0,...values),max=Math.max(...values);if(max===min)max=min+1;ctx.strokeStyle="#d8ddd6";ctx.lineWidth=1;ctx.fillStyle="#64716c";ctx.font="11px system-ui";for(let i=0;i<=4;i++){const y=pad.t+(h-pad.t-pad.b)*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const val=max-(max-min)*i/4;ctx.fillText(round(val,1),4,y+4)}const x=i=>pad.l+(points.length===1?(w-pad.l-pad.r)/2:(w-pad.l-pad.r)*i/(points.length-1));const y=v=>pad.t+(max-v)*(h-pad.t-pad.b)/(max-min);function line(key,color){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;ctx.beginPath();points.forEach((p,i)=>{const xx=x(i),yy=y(p[key]);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();points.forEach((p,i)=>{ctx.beginPath();ctx.arc(x(i),y(p[key]),4,0,Math.PI*2);ctx.fill()})}line('value',options.color);if(points.some(p=>p.secondary!==undefined))line('secondary',options.secondaryColor);const step=Math.max(1,Math.ceil(points.length/6));points.forEach((p,i)=>{if(i%step===0||i===points.length-1){ctx.save();ctx.translate(x(i),h-12);ctx.rotate(-.35);ctx.fillStyle="#64716c";ctx.fillText(shortFmt.format(parseDate(p.date)),0,0);ctx.restore()}})}

function exportPayload(){return {app:"Workout Log",version:APP_VERSION,exportedAt:new Date().toISOString(),exercises,workouts,settings:{lastBackupAt:new Date().toISOString()}}}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
async function markBackup(){await setSetting("lastBackupAt",new Date().toISOString());refreshBackupStatus()}
async function exportJson(){downloadBlob(new Blob([JSON.stringify(exportPayload(),null,2)],{type:"application/json"}),`workout-log-backup-${localISODate()}.json`);await markBackup();showMessage("backupMessage","Backup JSON esportato.")}
async function shareJson(){
  const name=`workout-log-backup-${localISODate()}.json`;
  const content=JSON.stringify(exportPayload(),null,2);
  if(typeof navigator.share!=='function'){
    showMessage('backupMessage','La condivisione nativa non è disponibile in questo browser. Usa Esporta JSON.',true);
    return;
  }
  const candidates=[
    new File([content],name,{type:'application/json'}),
    new File([content],name,{type:'text/plain'})
  ];
  const canCheck=typeof navigator.canShare==='function';
  const file=candidates.find(candidate=>!canCheck||navigator.canShare({files:[candidate]}));
  if(!file){
    showMessage('backupMessage','Il dispositivo non consente la condivisione di file JSON. Usa Esporta JSON.',true);
    return;
  }
  try{
    await navigator.share({title:'Backup Workout Log',files:[file]});
    await markBackup();
    showMessage('backupMessage','Backup JSON condiviso.');
  }catch(error){
    if(error?.name==='AbortError'){
      showMessage('backupMessage','Condivisione annullata.');
      return;
    }
    showMessage('backupMessage','Non è stato possibile aprire la condivisione. Usa Esporta JSON.',true);
  }
}
function csvEscape(v){const s=String(v??"");return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function buildCsv(){const rows=[["Data","Work Day","Esercizio ID","Esercizio","Serie","Ripetizioni","Peso kg","Volume","RIR","Note esercizio","Note sessione"]];workouts.forEach(w=>(w.exercises||[]).forEach(e=>(e.sets||[]).forEach((s,i)=>rows.push([w.date,w.workDay,e.exerciseId,e.nameSnapshot||exercises.find(x=>x.id===e.exerciseId)?.name||"",i+1,s.reps,s.weight,round(num(s.reps)*num(s.weight)),s.rir??"",e.notes||"",w.notes||""]))));return '\ufeff'+rows.map(r=>r.map(csvEscape).join(';')).join('\r\n')}
async function exportCsv(){downloadBlob(new Blob([buildCsv()],{type:"text/csv;charset=utf-8"}),`workout-log-${localISODate()}.csv`);await markBackup();showMessage("backupMessage","CSV esportato.")}
function parseCsv(text){const rows=[];let row=[],field="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){field+='"';i++}else if(c==='"')quoted=!quoted;else if(c===';'&&!quoted){row.push(field);field=""}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=""}else field+=c}row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows}
async function importData(file){try{const mode=$("importMode").value;if(mode==='replace'&&!confirm("Sostituire completamente l’archivio locale?"))return;const text=await file.text();let importedExercises=[],importedWorkouts=[];if(file.name.toLowerCase().endsWith('.json')){const data=JSON.parse(text);if(!Array.isArray(data.exercises)||!Array.isArray(data.workouts))throw new Error("Backup JSON non valido.");importedExercises=data.exercises;importedWorkouts=data.workouts}else{const rows=parseCsv(text);if(rows.length<2)throw new Error("CSV vuoto.");const headers=rows[0].map(h=>h.replace(/^\ufeff/,''));const idx=name=>headers.indexOf(name);const workoutMap=new Map();for(const r of rows.slice(1)){const date=r[idx('Data')],wd=r[idx('Work Day')],name=r[idx('Esercizio')];if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validWd(wd)||!name)continue;let exerciseId=r[idx('Esercizio ID')]||exercises.find(e=>e.name.toLowerCase()===name.toLowerCase())?.id||uuid();if(!exercises.some(e=>e.id===exerciseId)&&!importedExercises.some(e=>e.id===exerciseId))importedExercises.push({id:exerciseId,name,workDays:[wd],orderByWd:{[wd]:nextOrderForWd(wd)},defaultSets:3,restSeconds:90,archived:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});if(!workoutMap.has(date))workoutMap.set(date,{date,workDay:wd,exercises:[],notes:r[idx('Note sessione')]||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});const w=workoutMap.get(date);let e=w.exercises.find(x=>x.exerciseId===exerciseId);if(!e){e={exerciseId,nameSnapshot:name,notes:r[idx('Note esercizio')]||'',sets:[]};w.exercises.push(e)}e.sets.push({id:uuid(),number:num(r[idx('Serie')])||e.sets.length+1,reps:num(r[idx('Ripetizioni')]),weight:num(r[idx('Peso kg')]),rir:r[idx('RIR')]===''?null:num(r[idx('RIR')])})}importedWorkouts=[...workoutMap.values()]}
    if(mode==='replace'){await Promise.all([clear('exercises'),clear('workouts')])}
    for(const e of importedExercises){if(!e.id||!e.name)continue;e.workDays=(e.workDays||[]).filter(validWd);e.orderByWd=e.orderByWd||{};e.defaultSets=Math.max(1,num(e.defaultSets)||3);e.archived=!!e.archived;await put('exercises',e)}
    for(const w of importedWorkouts){if(!/^\d{4}-\d{2}-\d{2}$/.test(w.date)||!validWd(w.workDay))continue;await put('workouts',w)}
    await reloadData();renderConfiguration();refreshWdSelect();refreshAnalysis();showMessage('backupMessage',`Importazione completata: ${importedExercises.length} esercizi, ${importedWorkouts.length} allenamenti.`)
  }catch(e){showMessage('backupMessage',e.message||'Importazione non riuscita.',true)}finally{$('importFile').value=''}}
async function configureAutoBackup(){if(!('showSaveFilePicker' in window)){showMessage('backupMessage','Il browser non consente una destinazione persistente. Usa Esporta o Condividi JSON.',true);return}try{const handle=await window.showSaveFilePicker({suggestedName:'workout-log-backup.json',types:[{description:'Backup JSON',accept:{'application/json':['.json']}}]});await setSetting('backupFileHandle',handle);showMessage('backupMessage','Destinazione autorizzata. Il backup verrà controllato all’apertura.');await writeAutoBackup(true)}catch(e){if(e.name!=='AbortError')showMessage('backupMessage','Impossibile configurare la destinazione.',true)}}
async function writeAutoBackup(userInitiated=false){try{const handle=await getSetting('backupFileHandle');if(!handle){if(userInitiated)await configureAutoBackup();return false}let permission=await handle.queryPermission({mode:'readwrite'});if(permission!=='granted'&&userInitiated)permission=await handle.requestPermission({mode:'readwrite'});if(permission!=='granted')return false;const writable=await handle.createWritable();await writable.write(JSON.stringify(exportPayload(),null,2));await writable.close();await markBackup();showMessage('backupMessage','Backup automatico aggiornato.');return true}catch(e){if(userInitiated)showMessage('backupMessage','Backup automatico non riuscito. Esporta manualmente il JSON.',true);return false}}
async function refreshBackupStatus(){const last=await getSetting('lastBackupAt');$('lastBackupBadge').textContent=last?`Ultimo: ${dateFmt.format(new Date(last))}`:'Mai eseguito';const due=!last||(Date.now()-new Date(last).getTime())>=7*86400000;$('backupReminder').classList.toggle('hidden',!due);$('autoBackupSupport').textContent=('showSaveFilePicker'in window)?'Scegli un file di destinazione. Se autorizzato, verrà aggiornato all’apertura quando il backup è scaduto.':'Su questo browser usa il backup manuale o il menu di condivisione.';if(due)await writeAutoBackup(false)}
async function deleteAllData(){await Promise.all([clear('exercises'),clear('workouts'),clear('settings')]);await reloadData();renderConfiguration();refreshWdSelect();refreshAnalysis();refreshBackupStatus();showMessage('backupMessage','Archivio cancellato.')}
function openConfirm(title,text,action,requireWord=false){pendingConfirmAction=action;$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmWordField').classList.toggle('hidden',!requireWord);$('confirmWord').value='';$('confirmActionBtn').disabled=requireWord;$('confirmDialog').showModal()}

function bindEvents(){
  document.querySelectorAll('.tab[data-panel]').forEach(t=>t.onclick=()=>switchPanel(t.dataset.panel));$('menuToggleBtn').onclick=()=>setMenuOpen($('mainMenu').hidden);$('menuBackdrop').onclick=()=>setMenuOpen(false);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('mainMenu').hidden){setMenuOpen(false);$('menuToggleBtn').focus()}});
  $('newExerciseBtn').onclick=()=>openExerciseForm();$('closeExerciseFormBtn').onclick=closeExerciseForm;$('cancelExerciseBtn').onclick=closeExerciseForm;$('exerciseForm').onsubmit=saveExercise;
  $('toggleArchiveBtn').onclick=()=>{const hidden=$('archivedSection').classList.toggle('hidden');$('toggleArchiveBtn').textContent=hidden?'Mostra esercizi archiviati':'Nascondi esercizi archiviati'};
  $('workoutDate').onchange=()=>refreshWdSelect();$('workDaySelect').onchange=()=>{const wd=$('workDaySelect').value;if(wd)loadWorkoutForm($('workoutDate').value,wd);else renderWorkoutExercises([])};$('saveWorkoutBtn').onclick=saveWorkout;$('stickyTimerBtn').onclick=()=>{const card=$('workoutExercises').querySelector('.workout-exercise.timer-active')||$('workoutExercises').querySelector('.workout-exercise');if(card)startTimer(num(card.dataset.restSeconds),card.dataset.name)};$('deleteWorkoutBtn').onclick=()=>openConfirm('Eliminare l’allenamento?',`Verrà eliminata la sessione del ${dateFmt.format(parseDate($('workoutDate').value))}. Per confermare scrivi CANCELLA.`,deleteCurrentWorkout,true);
  $('analysisPeriod').onchange=refreshAnalysis;$('closeDetailBtn').onclick=()=>{$('exerciseDetail').classList.add('hidden');selectedDetailExerciseId=null};window.addEventListener('resize',()=>{if(selectedDetailExerciseId)showExerciseDetail(selectedDetailExerciseId,false)});
  $('exportJsonBtn').onclick=exportJson;$('shareJsonBtn').onclick=shareJson;$('exportCsvBtn').onclick=exportCsv;$('configureBackupBtn').onclick=configureAutoBackup;$('runAutoBackupBtn').onclick=()=>writeAutoBackup(true);$('importFile').onchange=e=>e.target.files[0]&&importData(e.target.files[0]);$('deleteAllBtn').onclick=()=>openConfirm('Cancellare tutto l’archivio?','L’operazione elimina esercizi, allenamenti e impostazioni. Esporta prima un backup.',deleteAllData,true);
  $('confirmWord').oninput=e=>$('confirmActionBtn').disabled=e.target.value.trim().toUpperCase()!=='CANCELLA';$('confirmDialog').addEventListener('close',async()=>{if($('confirmDialog').returnValue==='confirm'&&pendingConfirmAction)await pendingConfirmAction();pendingConfirmAction=null});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').classList.remove('hidden')});$('installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').classList.add('hidden')};
  const updateOnline=()=>{$('connectionBadge').textContent=navigator.onLine?'Offline pronta':'Modalità offline';$('footerStatus').textContent=navigator.onLine?'Connessa · dati locali':'Offline · dati locali'};window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);updateOnline();
  document.addEventListener('visibilitychange',handleVisibilityChange);
  document.addEventListener('pointerdown',()=>{prepareAudio();requestWakeLock()},{once:true});
}
async function registerServiceWorker(){
  if(!('serviceWorker'in navigator))return;
  const hadController=!!navigator.serviceWorker.controller;
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController||reloading)return;
    reloading=true;
    window.location.reload();
  });
  try{
    const registration=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
    if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller)worker.postMessage({type:'SKIP_WAITING'});
      });
    });
    await registration.update();
  }catch(error){console.warn('Aggiornamento offline non disponibile.',error)}
}
async function init(){try{buildWdControls();bindEvents();$('workoutDate').value=localISODate();db=await openDb();await reloadData();renderConfiguration();refreshWdSelect();refreshAnalysis();refreshBackupStatus();updateWakeLockStatus();requestWakeLock();registerServiceWorker()}catch(e){console.error(e);showMessage('trackingMessage','Impossibile inizializzare il database locale.',true)}}
init();

const PATHS = {
  corpus: "../数据处理/processed/v1/frontend/corpus-index.json",
  lineage: "../数据处理/processed/v1/frontend/lineage-summary.json",
  objects: "../数据处理/processed/v2/frontend/object-profiles.json",
  comparisons: "../数据处理/processed/v2/frontend/version-comparison.json",
  cases: "../数据处理/processed/v2/frontend/curated-cases.json",
  versions: "../数据处理/processed/v1/versions.json",
  overlay: (id) => `../数据处理/processed/v2/curated_overlays/${id}.json`,
};

const app = document.querySelector("#app");
const drawer = document.querySelector("#detail-drawer");
const drawerContent = drawer.querySelector(".drawer-content");
const toast = document.querySelector("#toast");
const drawerBackdrop = document.querySelector("#drawer-backdrop");

const state = {
  route: location.hash.replace("#", "") || "lineage",
  data: {},
  lineageSource: null,
  fingerprintObjects: [],
  comparisonGroup: "宇宙锋",
  heartbeatVersion: "80000028",
  heartbeatScene: 1,
  overlayCache: new Map(),
  versionsPromise: null,
  lineageSimulation: null,
  lineageSelectedNode: null,
  lineageSourceFilter: null,
  fingerprintMetric: "mean_aria_char_density",
  heartbeatTracks: new Set(["aria", "speech", "recitation", "action"]),
};

const COLORS = ["#d1ad69", "#4f847d", "#a64a4d", "#b9783e", "#8f7bb0", "#7f9c61"];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function num(value) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

function pct(value, digits = 1) {
  return `${((value ?? 0) * 100).toFixed(digits)}%`;
}

function truncate(value, length = 18) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
  return response.json();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function openDrawer(html) {
  drawerContent.innerHTML = html;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.classList.add("is-visible");
}

function closeDrawer() {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.classList.remove("is-visible");
}

drawer.querySelector(".drawer-close").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

function pdfHref(sourceFile, page) {
  if (!sourceFile) return "";
  return `../${sourceFile}${page ? `#page=${page}` : ""}`;
}

async function getVersions() {
  if (!state.versionsPromise) state.versionsPromise = fetchJSON(PATHS.versions);
  return state.versionsPromise;
}

function pageHead(eyebrow, title, description, method) {
  return `
    <header class="page-head">
      <div>
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1>${esc(title)}</h1>
        <p>${esc(description)}</p>
      </div>
      <div class="method-chip">${esc(method)}</div>
    </header>`;
}

function panel(title, note, body, classes = "") {
  return `
    <section class="panel ${classes}">
      <header class="panel-head">
        <h2 class="panel-title">${esc(title)}</h2>
        <span class="panel-note">${esc(note)}</span>
      </header>
      <div class="panel-body">${body}</div>
    </section>`;
}

function kpis(items) {
  return `<div class="kpi-row">${items.map((item) => `
    <div class="kpi">
      <strong>${esc(item.value)}</strong>
      <span>${esc(item.label)}</span>
      <small>${esc(item.note || "")}</small>
    </div>`).join("")}</div>`;
}

async function loadData() {
  const [corpus, lineage, objects, comparisons, cases] = await Promise.all([
    fetchJSON(PATHS.corpus),
    fetchJSON(PATHS.lineage),
    fetchJSON(PATHS.objects),
    fetchJSON(PATHS.comparisons),
    fetchJSON(PATHS.cases),
  ]);
  state.data = { corpus, lineage, objects, comparisons, cases };
  state.fingerprintObjects = [objects[0].object_id, objects[1].object_id];
}

function setRoute(route) {
  if (!['lineage', 'fingerprint', 'heartbeat'].includes(route)) route = 'lineage';
  state.route = route;
  if (location.hash !== `#${route}`) history.replaceState(null, "", `#${route}`);
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.route === route));
  closeDrawer();
  render();
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
window.addEventListener("hashchange", () => setRoute(location.hash.replace("#", "")));

function sourceRows(sources) {
  const max = Math.max(...sources.map((row) => row.versions), 1);
  return `<div class="source-list">${sources.map((row) => `
    <div class="source-row" data-source="${esc(row.source_collection)}">
      <span title="${esc(row.source_collection)}">${esc(truncate(row.source_collection, 11))}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.versions / max) * 100}%"></div></div>
      <strong>${row.versions}</strong>
    </div>`).join("")}</div>`;
}

function rankRows(rows) {
  return `<div class="rank-list">${rows.slice(0, 18).map((row, index) => `
    <div class="rank-row" data-play-id="${esc(row.play_id)}">
      <span class="rank-num">${String(index + 1).padStart(2, "0")}</span>
      <span title="${esc(row.title)}">${esc(row.title)}</span>
      <span class="rank-count">${row.versions}版本</span>
    </div>`).join("")}</div>`;
}

function polarPoint(cx, cy, radius, angle) {
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function lineageSVG(sources) {
  const width = 760, height = 330, cx = 380, cy = 165;
  const total = sources.reduce((sum, row) => sum + row.versions, 0);
  const top = sources.slice(0, 24);
  const max = Math.max(...top.map((row) => row.versions), 1);
  const lines = [];
  const nodes = [];
  const labels = [];
  top.forEach((row, index) => {
    const angle = (Math.PI * 2 * index) / top.length - Math.PI / 2;
    const inner = polarPoint(cx, cy, 74, angle);
    const outerRadius = 115 + 42 * (row.versions / max);
    const outer = polarPoint(cx, cy, outerRadius, angle);
    const label = polarPoint(cx, cy, outerRadius + 22, angle);
    lines.push(`<path d="M${inner[0].toFixed(1)},${inner[1].toFixed(1)} Q${cx},${cy} ${outer[0].toFixed(1)},${outer[1].toFixed(1)}" fill="none" stroke="${index % 3 === 0 ? '#b99355' : '#5d736b'}" stroke-opacity="${0.22 + .38 * row.versions / max}" stroke-width="${1 + 5 * row.versions / max}"/>`);
    nodes.push(`<circle class="source-node" data-index="${index}" cx="${outer[0].toFixed(1)}" cy="${outer[1].toFixed(1)}" r="${4 + 8 * row.versions / max}" fill="${COLORS[index % COLORS.length]}" fill-opacity=".9" stroke="#ead39d" stroke-opacity=".45"/>`);
    if (row.versions >= max * .08) {
      const anchor = Math.cos(angle) > .2 ? "start" : Math.cos(angle) < -.2 ? "end" : "middle";
      labels.push(`<text class="svg-label" x="${label[0].toFixed(1)}" y="${label[1].toFixed(1)}" text-anchor="${anchor}">${esc(truncate(row.source_collection, 9))}</text>`);
    }
  });
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="来源集合与版本关系图">
      <defs><radialGradient id="core"><stop offset="0" stop-color="#c9a869" stop-opacity=".2"/><stop offset="1" stop-color="#15110d" stop-opacity=".1"/></radialGradient></defs>
      <circle cx="${cx}" cy="${cy}" r="85" fill="url(#core)" stroke="#b69458" stroke-opacity=".5"/>
      <circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="#c9a869" stroke-opacity=".16" stroke-dasharray="2 8"/>
      ${lines.join("")}${nodes.join("")}${labels.join("")}
      <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="#ead39d" font-size="28" font-family="serif">${num(total)}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" class="svg-label">来源记录 · 聚合视图</text>
    </svg>`;
}

async function renderLineage() {
  const { corpus, lineage } = state.data;
  const counts = corpus.counts;
  const sources = lineage.sources;
  const [caseData, allVersions] = await Promise.all([getOverlay("80000028"), getVersions()]);
  const focusPlay = corpus.plays.find((play) => play.play_id === caseData.version.play_id);
  const network = buildLineageNetwork(caseData, focusPlay, allVersions);
  if (state.lineageSimulation) state.lineageSimulation.stop();
  app.innerHTML = `
    ${pageHead("Macro View · 传承与版本", "戏脉总览", "从文献来源进入剧目与版本，观察京剧文本如何在戏考、汇编、名家选本与录音整理本中不断流动。", "聚合关系可下钻至具体版本")}
    ${kpis([
      { value: num(counts.versions), label: "剧本版本", note: "全部PDF" },
      { value: num(counts.plays), label: "剧目家族", note: "按来源标题归并" },
      { value: num(counts.characters), label: "角色实体", note: "含版本内角色" },
      { value: num(counts.scenes), label: "场次", note: "含248个选段伪场次" },
      { value: num(counts.segments), label: "文本段落", note: "唱、白、念与提示" },
      { value: num(lineage.multi_version_plays.length), label: "多版本剧目", note: "同名多来源候选" },
    ])}
    <div class="lineage-workbench">
      <div class="lineage-left">
        ${panel("文献来源矩阵", "点击来源过滤整页", sourceMatrix(sources), "source-matrix-panel")}
        ${panel("多版本剧目", "点击查看版本证据", rankRows(lineage.multi_version_plays), "multi-play-panel")}
      </div>
      ${panel("戏脉关系场", "滚轮缩放 · 拖拽平移 · 点击查看两跳关系", `<div id="lineage-network" class="lineage-network"></div><div class="network-legend"><span><i class="node-key play"></i>剧目</span><span><i class="node-key version"></i>版本</span><span><i class="node-key source"></i>来源</span><span><i class="node-key character"></i>角色</span><span><i class="node-key person"></i>演员</span></div>`, "lineage-main")}
      <div class="lineage-right">
        ${panel("当前选择", "一跳 / 两跳联动", `<div id="lineage-selection" class="selection-story"><p class="eyebrow">FOCUS CASE</p><strong>《四郎探母》· 1947录音整理本</strong><p>点击中央节点，所有视图将同步聚焦。演员与角色之间只使用“饰演”关系。</p></div>`, "selection-panel")}
        ${panel("演员—角色交汇", "1947录音整理证据", `<div id="actor-role-chart" class="actor-role-chart"></div>`, "actor-panel")}
      </div>
      ${panel("来源谱系带", "面积编码版本数量 · 类型而非年代", `<div id="source-treemap" class="source-treemap"></div>`, "lineage-provenance")}
    </div>`;

  const viz = drawLineageNetwork(network, caseData);
  drawActorRoleChart(caseData.credits);
  drawSourceTreemap(sources);
  document.querySelectorAll(".matrix-row").forEach((row) => row.addEventListener("click", () => {
    const source = row.dataset.source;
    state.lineageSourceFilter = state.lineageSourceFilter === source ? null : source;
    document.querySelectorAll(".matrix-row").forEach((item) => item.classList.toggle("is-selected", item.dataset.source === state.lineageSourceFilter));
    viz.filterSource(state.lineageSourceFilter);
  }));
  document.querySelectorAll(".rank-row").forEach((row) => row.addEventListener("click", () => {
    const play = lineage.multi_version_plays.find((item) => item.play_id === row.dataset.playId);
    openPlayDrawer(play);
  }));
}

function sourceMatrix(sources) {
  const max = Math.max(...sources.map((row) => row.versions), 1);
  return `<div class="matrix-head"><span>来源</span><span>剧目</span><span>场</span><span>版本</span></div><div class="matrix-list">${sources.map((row) => `<button class="matrix-row" data-source="${esc(row.source_collection)}"><span title="${esc(row.source_collection)}">${esc(row.source_collection)}</span><i style="--w:${row.plays / Math.max(row.versions, 1) * 100}%"></i><small>${num(row.scenes)}</small><b style="--alpha:${.25 + .75 * row.versions / max}">${row.versions}</b></button>`).join("")}</div>`;
}

function buildLineageNetwork(caseData, play, allVersions) {
  const nodes = [];
  const links = [];
  const addNode = (node) => { if (!nodes.some((item) => item.id === node.id)) nodes.push(node); };
  const addLink = (source, target, type) => links.push({ source, target, type });
  const playId = `play:${caseData.version.play_id}`;
  addNode({ id: playId, label: caseData.version.title_on_source, type: "play", value: 34 });
  const relatedVersions = allVersions.filter((version) => (play?.version_ids || [caseData.version.version_id]).includes(version.version_id));
  relatedVersions.forEach((version) => {
    const versionId = `version:${version.version_id}`;
    const sourceId = `source:${version.source_collection}`;
    addNode({ id: versionId, label: version.version_id, sublabel: version.title_on_source, type: "version", value: 17, sourceCollection: version.source_collection });
    addNode({ id: sourceId, label: version.source_collection.replace(/[《》]/g, ""), type: "source", value: 21, sourceCollection: version.source_collection });
    addLink(sourceId, versionId, "收录");
    addLink(versionId, playId, "版本");
  });
  caseData.characters.filter((character) => caseData.segments.some((segment) => segment.speaker_character_id === character.character_id)).forEach((character) => {
    const charId = `character:${character.character_id}`;
    addNode({ id: charId, label: character.canonical_name, type: "character", value: 12 });
    addLink(`version:${caseData.version.version_id}`, charId, "角色");
  });
  caseData.credits.forEach((credit) => {
    const personId = `person:${credit.person_id}`;
    const charId = `character:${credit.character_id}`;
    addNode({ id: personId, label: credit.person_name, type: "person", value: 14, evidence: credit.evidence_text });
    if (nodes.some((node) => node.id === charId)) addLink(personId, charId, "饰演");
  });
  return { nodes, links };
}

function svgNode(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function drawLineageNetwork(network, caseData) {
  const d3 = globalThis.d3;
  const host = document.querySelector("#lineage-network");
  const width = 860, height = 610;
  const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "剧目、版本、来源、角色与演员关系网" });
  const viewport = svgNode("g");
  const linkLayer = svgNode("g", { class: "network-links" });
  const nodeLayer = svgNode("g", { class: "network-nodes" });
  viewport.append(linkLayer, nodeLayer);
  svg.append(viewport);
  host.append(svg);

  const colors = { play: "#e8c878", version: "#b06b3f", source: "#577f78", character: "#9d3f48", person: "#ddd2bd" };
  const linkEls = network.links.map((link) => {
    const line = svgNode("line", { class: `network-link link-${link.type}`, "data-type": link.type });
    linkLayer.append(line);
    return line;
  });
  const nodeEls = new Map();
  network.nodes.forEach((node) => {
    const group = svgNode("g", { class: `network-node node-${node.type}`, tabindex: "0", role: "button", "aria-label": `${node.type}：${node.label}` });
    const halo = svgNode("circle", { class: "node-halo", r: node.value + 8 });
    const circle = svgNode("circle", { r: node.value, fill: colors[node.type] });
    const label = svgNode("text", { y: node.value + 15, "text-anchor": "middle" });
    label.textContent = node.label;
    group.append(halo, circle, label);
    group.addEventListener("click", () => selectNode(node.id));
    group.addEventListener("keydown", (event) => { if (event.key === "Enter") selectNode(node.id); });
    nodeLayer.append(group);
    nodeEls.set(node.id, group);
  });

  const seed = (() => { let value = 0.42; return () => (value = (value * 9301 + 49297) % 233280) / 233280; })();
  const simulation = d3.forceSimulation(network.nodes)
    .randomSource(seed)
    .force("link", d3.forceLink(network.links).id((node) => node.id).distance((link) => link.type === "饰演" ? 72 : link.type === "角色" ? 92 : 125).strength(.72))
    .force("charge", d3.forceManyBody().strength((node) => node.type === "play" ? -650 : -260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX((node) => ({ source: 110, version: 285, play: 430, character: 610, person: 790 }[node.type])).strength(.18))
    .force("y", d3.forceY(height / 2).strength(.035))
    .force("collision", d3.forceCollide().radius((node) => node.value + 24).iterations(2))
    .on("tick", () => {
      network.links.forEach((link, index) => {
        linkEls[index].setAttribute("x1", link.source.x); linkEls[index].setAttribute("y1", link.source.y);
        linkEls[index].setAttribute("x2", link.target.x); linkEls[index].setAttribute("y2", link.target.y);
      });
      network.nodes.forEach((node) => nodeEls.get(node.id).setAttribute("transform", `translate(${node.x},${node.y})`));
    });
  state.lineageSimulation = simulation;

  let transform = { x: 0, y: 0, k: 1 }, dragStart = null;
  const applyTransform = () => viewport.setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.k})`);
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const next = Math.max(.55, Math.min(2.2, transform.k * (event.deltaY < 0 ? 1.1 : .9)));
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) * width / rect.width, py = (event.clientY - rect.top) * height / rect.height;
    transform.x = px - (px - transform.x) * next / transform.k;
    transform.y = py - (py - transform.y) * next / transform.k;
    transform.k = next; applyTransform();
  }, { passive: false });
  svg.addEventListener("pointerdown", (event) => { if (event.target === svg) dragStart = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y }; });
  svg.addEventListener("pointermove", (event) => { if (dragStart) { transform.x = dragStart.tx + event.clientX - dragStart.x; transform.y = dragStart.ty + event.clientY - dragStart.y; applyTransform(); } });
  window.addEventListener("pointerup", () => { dragStart = null; }, { once: true });

  function neighborhood(id, depth = 2) {
    const found = new Set([id]);
    let frontier = new Set([id]);
    for (let level = 0; level < depth; level += 1) {
      const next = new Set();
      network.links.forEach((link) => {
        const source = link.source.id || link.source, target = link.target.id || link.target;
        if (frontier.has(source)) next.add(target);
        if (frontier.has(target)) next.add(source);
      });
      next.forEach((nodeId) => found.add(nodeId));
      frontier = next;
    }
    return found;
  }

  function selectNode(id) {
    state.lineageSelectedNode = state.lineageSelectedNode === id ? null : id;
    const active = state.lineageSelectedNode ? neighborhood(state.lineageSelectedNode) : new Set(network.nodes.map((node) => node.id));
    nodeEls.forEach((element, nodeId) => element.classList.toggle("is-muted", !active.has(nodeId)));
    network.links.forEach((link, index) => linkEls[index].classList.toggle("is-muted", !(active.has(link.source.id) && active.has(link.target.id))));
    const selected = network.nodes.find((node) => node.id === state.lineageSelectedNode);
    updateLineageSelection(selected, network, caseData);
    drawActorRoleChart(caseData.credits, selected);
  }

  function filterSource(source) {
    if (!source) return selectNode(null);
    const sourceNode = network.nodes.find((node) => node.type === "source" && node.sourceCollection === source);
    if (sourceNode) selectNode(sourceNode.id);
    else {
      nodeEls.forEach((element, nodeId) => element.classList.toggle("is-muted", !network.nodes.find((node) => node.id === nodeId)?.sourceCollection?.includes(source)));
      document.querySelector("#lineage-selection").innerHTML = `<p class="eyebrow">SOURCE FILTER</p><strong>${esc(source)}</strong><p>该来源不在当前《四郎探母》关系子图中；左侧矩阵仍保留全库比较。</p>`;
    }
  }

  return { selectNode, filterSource };
}

function updateLineageSelection(selected, network, caseData) {
  const host = document.querySelector("#lineage-selection");
  if (!selected) {
    host.innerHTML = `<p class="eyebrow">FOCUS CASE</p><strong>《四郎探母》· 1947录音整理本</strong><p>点击中央节点，所有视图将同步聚焦。演员与角色之间只使用“饰演”关系。</p>`;
    return;
  }
  const typeName = { play: "剧目", version: "版本", source: "来源集合", character: "角色", person: "演员" }[selected.type];
  const related = network.links.filter((link) => link.source.id === selected.id || link.target.id === selected.id);
  host.innerHTML = `<p class="eyebrow">${typeName.toUpperCase()}</p><strong>${esc(selected.label)}</strong><p>${selected.evidence ? esc(selected.evidence) : `连接 ${related.length} 条可验证关系。`}</p><div class="relation-chips">${[...new Set(related.map((link) => link.type))].map((type) => `<span>${type}</span>`).join("")}</div>${selected.type === "version" ? `<a class="source-link" href="${esc(pdfHref(caseData.version.source_file))}" target="_blank" rel="noopener">查看证据 PDF <span>↗</span></a>` : ""}`;
}

function drawActorRoleChart(credits, selected) {
  const d3 = globalThis.d3;
  const host = document.querySelector("#actor-role-chart");
  if (!host) return;
  host.innerHTML = "";
  const width = 360, height = 300, actorX = 42, roleX = 315;
  const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "演员与角色饰演关系" });
  const actors = [...new Map(credits.map((credit) => [credit.person_id, credit.person_name])).entries()];
  const roles = [...new Set(credits.map((credit) => credit.character_name))];
  const actorY = new Map(actors.map((item, index) => [item[0], 22 + index * (height - 40) / Math.max(actors.length - 1, 1)]));
  const roleY = new Map(roles.map((name, index) => [name, 38 + index * (height - 76) / Math.max(roles.length - 1, 1)]));
  const link = d3.linkHorizontal().x((point) => point[0]).y((point) => point[1]);
  credits.forEach((credit) => {
    const active = !selected || (selected.type === "person" && selected.id === `person:${credit.person_id}`) || (selected.type === "character" && selected.label === credit.character_name) || !["person", "character"].includes(selected.type);
    svg.append(svgNode("path", { d: link({ source: [actorX + 34, actorY.get(credit.person_id)], target: [roleX - 34, roleY.get(credit.character_name)] }), class: `actor-link${active ? "" : " is-muted"}` }));
  });
  actors.forEach(([id, name]) => {
    const text = svgNode("text", { x: actorX, y: actorY.get(id) + 3, "text-anchor": "middle", class: "actor-label" }); text.textContent = name; svg.append(text);
  });
  roles.forEach((name) => {
    const text = svgNode("text", { x: roleX, y: roleY.get(name) + 3, "text-anchor": "middle", class: "role-label" }); text.textContent = name; svg.append(text);
  });
  host.append(svg);
}

function drawSourceTreemap(sources) {
  const d3 = globalThis.d3;
  const host = document.querySelector("#source-treemap");
  const width = 1480, height = 118;
  const categories = [
    ["传统汇编", /戏考|汇编|丛刊|国剧|传统/], ["名家选本", /剧本选|曲谱|演出本|戏词/], ["录音演出", /录音|唱片|院团/], ["其他文献", /.*/]
  ];
  const used = new Set();
  const children = categories.map(([name, pattern]) => ({ name, children: sources.filter((source) => !used.has(source) && pattern.test(source.source_collection)).map((source) => { used.add(source); return { name: source.source_collection, value: source.versions }; }) })).filter((group) => group.children.length);
  const root = d3.hierarchy({ children }).sum((node) => node.value || 0).sort((a, b) => b.value - a.value);
  d3.treemap().size([width, height]).paddingInner(2).paddingTop(17).round(true)(root);
  const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "文献来源类型面积图" });
  root.children.forEach((group, index) => {
    const title = svgNode("text", { x: group.x0 + 4, y: group.y0 + 12, class: "treemap-group" }); title.textContent = group.data.name; svg.append(title);
    group.children.forEach((leaf) => {
      const rect = svgNode("rect", { x: leaf.x0, y: leaf.y0, width: Math.max(0, leaf.x1 - leaf.x0), height: Math.max(0, leaf.y1 - leaf.y0), class: `treemap-cell category-${index}`, "data-source": leaf.data.name });
      rect.addEventListener("mouseenter", () => document.querySelectorAll(".matrix-row").forEach((row) => row.classList.toggle("is-hovered", row.dataset.source === leaf.data.name)));
      rect.addEventListener("mouseleave", () => document.querySelectorAll(".matrix-row").forEach((row) => row.classList.remove("is-hovered")));
      svg.append(rect);
      if (leaf.x1 - leaf.x0 > 80) { const label = svgNode("text", { x: leaf.x0 + 6, y: leaf.y0 + 18, class: "treemap-label" }); label.textContent = leaf.data.name.replace(/[《》]/g, ""); svg.append(label); }
    });
  });
  host.append(svg);
}

function playExplorer(plays, query = "") {
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  const matches = filterPlays(plays, needle);
  return `<section class="play-explorer" aria-label="剧目检索">
    <label class="play-search"><span>全库检索</span><input id="play-search" class="search-input" type="search" value="${esc(query)}" placeholder="输入剧名或别名，如：空城计" autocomplete="off"></label>
    <div id="play-results" class="play-results">${playResultCards(matches)}</div>
  </section>`;
}

function filterPlays(plays, needle) {
  return plays
    .filter((play) => !needle || [play.title, ...(play.aliases || [])].some((value) => value.toLocaleLowerCase("zh-CN").includes(needle)))
    .sort((a, b) => b.version_count - a.version_count || a.title.localeCompare(b.title, "zh-CN"))
    .slice(0, 8);
}

function playResultCards(matches) {
  if (!matches.length) return `<div class="search-empty">未找到匹配剧目</div>`;
  return matches.map((play) => `<button class="play-result" data-play-id="${esc(play.play_id)}">
    <span><strong>${esc(play.title)}</strong><small>${esc((play.aliases || []).slice(0, 2).join(" · ") || "暂无别名")}</small></span>
    <b>${play.version_count}<small>版本</small></b>
  </button>`).join("");
}

function bindPlayExplorer(plays) {
  const input = document.querySelector("#play-search");
  const results = document.querySelector("#play-results");
  const bindCards = () => results.querySelectorAll(".play-result").forEach((card) => card.addEventListener("click", () => {
    openCorpusPlayDrawer(plays.find((item) => item.play_id === card.dataset.playId));
  }));
  bindCards();
  input.addEventListener("input", () => {
    results.innerHTML = playResultCards(filterPlays(plays, input.value.trim().toLocaleLowerCase("zh-CN")));
    bindCards();
  });
}

async function openCorpusPlayDrawer(play) {
  if (!play) return;
  openDrawer(`<p class="eyebrow">CORPUS PLAY</p><h2>${esc(play.title)}</h2><p>正在调取版本与证据路径……</p>`);
  try {
    const versions = (await getVersions()).filter((version) => play.version_ids.includes(version.version_id));
    openDrawer(`<p class="eyebrow">CORPUS PLAY</p><h2>${esc(play.title)}</h2>
      <p>${play.version_count} 个版本${play.aliases?.length ? ` · 别名：${esc(play.aliases.join("、"))}` : ""}</p>
      <h3>版本与原始文献</h3><div class="evidence-list">${versions.map((version) => `<a class="evidence-row" href="${esc(pdfHref(version.source_file))}" target="_blank" rel="noopener"><span><strong>${esc(version.version_id)} · ${esc(version.title_on_source)}</strong><small>${esc(version.source_collection)} · ${version.source_pages}页</small></span><b>PDF ↗</b></a>`).join("")}</div>
      <h3>数据说明</h3><p>版本归并基于题名与别名字段；点击 PDF 可回到原始文献核查。</p>`);
  } catch (error) {
    openDrawer(`<p class="eyebrow">CORPUS PLAY</p><h2>${esc(play.title)}</h2><p>版本详情加载失败：${esc(error.message)}</p>`);
  }
}

function sourceTypeSummary(sources) {
  const groups = [
    { name: "传统汇编", test: (s) => /戏考|汇编|丛刊|国剧|传统/.test(s.source_collection), color: "#c9a869" },
    { name: "名家选本", test: (s) => /剧本选|演出本|戏词|舞台艺术/.test(s.source_collection), color: "#4d7c78" },
    { name: "录音演出", test: (s) => /录音|唱片|院团/.test(s.source_collection), color: "#a33a3f" },
  ];
  const used = new Set();
  const rows = groups.map((group) => {
    const matched = sources.filter((source) => group.test(source));
    matched.forEach((source) => used.add(source));
    return { name: group.name, value: matched.reduce((sum, row) => sum + row.versions, 0), color: group.color };
  });
  rows.push({ name: "其他来源", value: sources.filter((source) => !used.has(source)).reduce((sum, row) => sum + row.versions, 0), color: "#8b7560" });
  const max = Math.max(...rows.map((row) => row.value));
  return `<div class="metric-bars">${rows.map((row) => `<div class="metric-row"><span>${row.name}</span><div class="bar-track"><div class="bar-fill" style="width:${row.value / max * 100}%;background:${row.color}"></div></div><strong>${row.value}</strong></div>`).join("")}</div>`;
}

function lineageMethod() {
  return `<div class="tag-cloud">
    <span class="tag"><strong>收录</strong> 版本属于来源集合</span>
    <span class="tag"><strong>同题</strong> 标题相同的多个来源版本</span>
    <span class="tag"><strong>饰演</strong> 录音说明中的演员—角色</span>
    <span class="tag"><strong>行当</strong> 版本首页的原始标注</span>
    <span class="tag"><strong>不自动推断</strong> 师承、艺术价值与流派优劣</span>
    <span class="tag"><strong>证据原则</strong> 页面结论可回到版本与PDF页码</span>
  </div>`;
}

function openSourceDrawer(source) {
  openDrawer(`<p class="eyebrow">SOURCE COLLECTION</p><h2>${esc(source.source_collection)}</h2><p>该来源集合在全库中的结构化规模。</p><table class="drawer-table"><tr><td>版本</td><td>${num(source.versions)}</td></tr><tr><td>剧目</td><td>${num(source.plays)}</td></tr><tr><td>场次</td><td>${num(source.scenes)}</td></tr><tr><td>段落</td><td>${num(source.segments)}</td></tr></table><h3>解释边界</h3><p>来源集合说明文本从何处收录，不自动等同于流派归属或师承关系。</p>`);
}

function openPlayDrawer(play) {
  openDrawer(`<p class="eyebrow">MULTI-VERSION PLAY</p><h2>${esc(play.title)}</h2><p>当前找到 ${play.versions} 份同名来源记录，可作为版本比较候选。</p><h3>版本编号</h3><div class="tag-cloud">${play.version_ids.map((id) => `<span class="tag">${esc(id)}</span>`).join("")}</div><h3>下一步</h3><p>进入“流派指纹”页面查看已精标的同剧异本；未精标版本仍可读取全库统一指标。</p>`);
}

function objectRows(objects) {
  return `<div class="object-list">${objects.map((object) => `
    <div class="object-row ${state.fingerprintObjects.includes(object.object_id) ? 'is-selected' : ''}" data-object-id="${object.object_id}">
      <span class="object-glyph">${esc(object.name.slice(0, 1))}</span>
      <span><strong>${esc(object.name)}</strong><small>${object.computed_profile.version_count}部 · ${esc(object.role_focus.join(" / "))}</small></span>
    </div>`).join("")}</div>`;
}

const RADAR_METRICS = [
  ["唱段密度", "mean_aria_char_density"],
  ["念白密度", "mean_speech_char_density"],
  ["舞台提示", "mean_stage_direction_char_density"],
  ["板式丰富", "mean_mode_diversity"],
  ["唱段比例", "aria_segment_ratio"],
  ["角色集中", "mean_character_concentration"],
];

function radarSVG(objects, selectedIds) {
  const d3 = globalThis.d3;
  const selected = selectedIds.map((id) => objects.find((object) => object.object_id === id)).filter(Boolean);
  const width = 620, height = 330, cx = 310, cy = 165, radius = 116;
  const maxima = Object.fromEntries(RADAR_METRICS.map(([, key]) => [key, Math.max(...objects.map((o) => o.computed_profile[key] || 0), 0.0001)]));
  const rings = [0.25, .5, .75, 1].map((level) => {
    const points = RADAR_METRICS.map((_, index) => polarPoint(cx, cy, radius * level, index * Math.PI * 2 / RADAR_METRICS.length - Math.PI / 2).join(",")).join(" ");
    return `<polygon points="${points}" fill="none" stroke="#c9a869" stroke-opacity="${level === 1 ? .25 : .09}"/>`;
  }).join("");
  const axes = RADAR_METRICS.map(([label, key], index) => {
    const end = polarPoint(cx, cy, radius, index * Math.PI * 2 / RADAR_METRICS.length - Math.PI / 2);
    const text = polarPoint(cx, cy, radius + 24, index * Math.PI * 2 / RADAR_METRICS.length - Math.PI / 2);
    const active = key === state.fingerprintMetric;
    return `<line data-metric="${key}" x1="${cx}" y1="${cy}" x2="${end[0]}" y2="${end[1]}" stroke="${active ? '#e8ce92' : '#c9a869'}" stroke-opacity="${active ? '.75' : '.14'}"/><text class="svg-label ${active ? 'is-active' : ''}" x="${text[0]}" y="${text[1]}" text-anchor="middle">${label}</text>`;
  }).join("");
  const radial = d3.lineRadial().angle((_, index) => index * Math.PI * 2 / RADAR_METRICS.length).radius((value) => value).curve(d3.curveLinearClosed);
  const polygons = selected.map((object, objectIndex) => {
    const values = RADAR_METRICS.map(([, key]) => radius * (object.computed_profile[key] || 0) / maxima[key]);
    const color = COLORS[objectIndex];
    return `<path d="${radial(values)}" transform="translate(${cx},${cy})" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="2"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="对象指纹雷达图">${rings}${axes}${polygons}</svg>`;
}

function metricComparison(selected) {
  if (selected.length < 2) return `<div class="empty-state">请选择两个对象进行比较</div>`;
  const [left, right] = selected;
  const rows = RADAR_METRICS.map(([label, key]) => {
    const max = Math.max(left.computed_profile[key] || 0, right.computed_profile[key] || 0, .0001);
    const format = (value) => key.includes('density') || key.includes('ratio') || key.includes('concentration') ? pct(value) : value.toFixed(1);
    return `<button class="metric-row metric-control ${key === state.fingerprintMetric ? 'is-active' : ''}" data-metric="${key}"><span>${label}</span><span class="metric-dual"><i style="width:${(left.computed_profile[key] || 0) / max * 100}%"></i><b style="width:${(right.computed_profile[key] || 0) / max * 100}%"></b></span><strong>${format(left.computed_profile[key] || 0)} / ${format(right.computed_profile[key] || 0)}</strong></button>`;
  }).join("");
  return `<div class="compare-legend"><span><i class="legend-dot" style="background:${COLORS[0]}"></i>${esc(left.name)}</span><span><i class="legend-dot" style="background:${COLORS[1]}"></i>${esc(right.name)}</span></div><div class="metric-bars" style="margin-top:14px">${rows}</div>`;
}

function tuneTags(selected) {
  const merged = new Map();
  selected.forEach((object, index) => {
    Object.entries(object.computed_profile.tune_counts).forEach(([name, value]) => {
      if (!merged.has(name)) merged.set(name, [0, 0]);
      merged.get(name)[index] = value;
    });
  });
  return `<div class="tag-cloud">${[...merged.entries()].sort((a,b) => (b[1][0]+b[1][1])-(a[1][0]+a[1][1])).map(([name, values]) => `<span class="tag">${esc(name)} <strong>${values.join(" / ")}</strong></span>`).join("")}</div>`;
}

function versionCards(group) {
  return `<div class="version-cards">${group.versions.map((version) => `
    <article class="version-card" data-version-id="${version.version_id}">
      <strong>${esc(version.version_id)}</strong>
      <small>${esc(version.source_collection)}</small>
      <div class="mini-stats">
        <span>场次<b>${version.n_scenes}</b></span><span>角色<b>${version.n_roles}</b></span>
        <span>唱段<b>${version.n_aria}</b></span><span>唱段比<b>${pct(version.aria_segment_ratio)}</b></span>
      </div>
    </article>`).join("")}</div>`;
}

function renderFingerprint() {
  const { objects, comparisons } = state.data;
  const selected = state.fingerprintObjects.map((id) => objects.find((object) => object.object_id === id)).filter(Boolean);
  const group = comparisons.find((item) => item.normalized_title === state.comparisonGroup) || comparisons[0];
  app.innerHTML = `
    ${pageHead("Middle View · 文本风格", "流派指纹", "用同一套文本指标比较名家选本，并通过同剧异本回到具体版本。指纹描述文本特征，不代替真实听觉经验。", "12对象 · 143版本 · 统一口径")}
    <div class="dashboard-grid fingerprint">
      ${panel("比较对象", "最多选择两个", objectRows(objects))}
      ${panel("文本指纹纹盘", "字符密度与结构指标", `<div class="radar-stage">${radarSVG(objects, state.fingerprintObjects)}</div><div class="compare-legend" style="position:absolute;left:18px;bottom:12px">${selected.map((o,i)=>`<span><i class="legend-dot" style="background:${COLORS[i]}"></i>${esc(o.name)}</span>`).join("")}</div>`)}
      ${panel("指标对照", "同轴仅比较同一口径", metricComparison(selected))}
      ${panel("声腔分布", "次数：对象一 / 对象二", tuneTags(selected))}
      ${panel("同剧异本", "精标版本比较", `<label class="filter-label">选择剧目<select id="comparison-select" class="select">${comparisons.map((item) => `<option ${item.normalized_title === group.normalized_title ? 'selected' : ''}>${esc(item.normalized_title)}</option>`).join("")}</select></label><div style="height:12px"></div>${versionCards(group)}`, "span-two")}
    </div>`;

  document.querySelectorAll(".object-row").forEach((row) => row.addEventListener("click", () => {
    const id = row.dataset.objectId;
    if (state.fingerprintObjects.includes(id)) {
      if (state.fingerprintObjects.length === 1) return showToast("至少保留一个比较对象");
      state.fingerprintObjects = state.fingerprintObjects.filter((item) => item !== id);
    } else {
      state.fingerprintObjects = [...state.fingerprintObjects.slice(-1), id];
    }
    renderFingerprint();
  }));
  document.querySelector("#comparison-select").addEventListener("change", (event) => {
    state.comparisonGroup = event.target.value;
    renderFingerprint();
  });
  document.querySelectorAll(".version-card").forEach((card) => card.addEventListener("click", () => {
    const version = group.versions.find((item) => item.version_id === card.dataset.versionId);
    openVersionDrawer(version, group);
  }));
  document.querySelectorAll(".metric-control").forEach((control) => control.addEventListener("click", () => {
    state.fingerprintMetric = control.dataset.metric;
    renderFingerprint();
  }));
}

function openVersionDrawer(version, group) {
  const related = group.similarity_pairs.filter((pair) => pair.left_version_id === version.version_id || pair.right_version_id === version.version_id);
  openDrawer(`<p class="eyebrow">CURATED VERSION</p><h2>${esc(version.title)} · ${esc(version.version_id)}</h2><p>${esc(version.source_collection)}</p><table class="drawer-table"><tr><td>页数</td><td>${version.n_pages}</td></tr><tr><td>场次</td><td>${version.n_scenes}</td></tr><tr><td>唱段</td><td>${version.n_aria}</td></tr><tr><td>白段</td><td>${version.n_speech}</td></tr><tr><td>精标匹配率</td><td>${pct(version.match_rate_to_v1)}</td></tr></table><h3>与同题版本相似度</h3>${related.length ? related.map((pair) => `<p>${esc(pair.left_version_id === version.version_id ? pair.right_version_id : pair.left_version_id)}：${pair.char_trigram_cosine == null ? '暂无' : pct(pair.char_trigram_cosine)}</p>`).join("") : '<p>暂无同题对照。</p>'}<h3>方法边界</h3><p>字符三元组相似度只描述文本接近程度，不证明师承或抄袭。</p>`);
}

async function getOverlay(versionId) {
  if (!state.overlayCache.has(versionId)) state.overlayCache.set(versionId, fetchJSON(PATHS.overlay(versionId)));
  return state.overlayCache.get(versionId);
}

function heartbeatData(packageData) {
  const byScene = new Map(packageData.scenes.map((scene) => [scene.scene_id, { scene, counts: Counter(), speakers: new Map(), segments: [] }]));
  packageData.segments.forEach((segment) => {
    const row = byScene.get(segment.scene_id);
    if (!row) return;
    const type = segment.display?.segment_type || segment.segment_type;
    row.counts[type] = (row.counts[type] || 0) + 1;
    row.segments.push(segment);
    if (segment.speaker_name) row.speakers.set(segment.speaker_name, (row.speakers.get(segment.speaker_name) || 0) + 1);
  });
  return [...byScene.values()];
}

function Counter() { return { aria: 0, speech: 0, recitation: 0, stage_direction: 0, entrance_exit: 0, gong_drum_cue: 0, unknown: 0 }; }

function heartbeatSVG(rows) {
  const d3 = globalThis.d3;
  const width = 760, height = 280, left = 44, right = 18, top = 22, bottom = 42;
  const plotW = width - left - right, plotH = height - top - bottom;
  const trackValue = (row, key) => key === "action" ? row.counts.stage_direction + row.counts.entrance_exit : row.counts[key];
  const trackDefs = [["speech", "#4d7c78"], ["aria", "#c9a869"], ["recitation", "#8e6c9e"], ["action", "#a33a3f"]].filter(([key]) => state.heartbeatTracks.has(key));
  const max = Math.max(...rows.map((row) => trackDefs.reduce((sum, [key]) => sum + trackValue(row, key), 0)), 1);
  const x = (index) => left + (rows.length === 1 ? plotW / 2 : index * plotW / (rows.length - 1));
  const y = (value) => top + plotH - value / max * plotH;
  const linePoints = rows.map((row, index) => {
    const weights = { aria: 1.4, speech: .6, recitation: .8, action: 1.1 };
    const composite = trackDefs.reduce((sum, [key]) => sum + trackValue(row, key) * weights[key], 0);
    return [x(index), y(Math.min(composite, max))];
  });
  const bars = rows.map((row, index) => {
    const barW = Math.max(8, Math.min(26, plotW / rows.length * .55));
    let cursor = top + plotH;
    return trackDefs.map(([key, color]) => {
      const h = trackValue(row, key) / max * plotH;
      cursor -= h;
      return `<rect x="${x(index)-barW/2}" y="${cursor}" width="${barW}" height="${Math.max(h, .5)}" fill="${color}" fill-opacity=".48"/>`;
    }).join("");
  }).join("");
  const points = linePoints.map(([px, py], index) => `<circle class="heartbeat-point" data-scene="${rows[index].scene.scene_no}" cx="${px}" cy="${py}" r="5" fill="#e8ce92" stroke="#15110d" stroke-width="2"/>`).join("");
  const labels = rows.map((row, index) => `<text class="svg-label" x="${x(index)}" y="${height - 18}" text-anchor="middle">${row.scene.scene_no}</text>`).join("");
  const path = d3.line().x((point) => point[0]).y((point) => point[1]).curve(d3.curveMonotoneX)(linePoints);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="逐场剧本心跳"><line x1="${left}" y1="${top+plotH}" x2="${width-right}" y2="${top+plotH}" stroke="#c9a869" stroke-opacity=".2"/>${bars}<path d="${path}" fill="none" stroke="#e8ce92" stroke-width="2" stroke-opacity=".86"/>${points}${labels}<text x="10" y="16" class="svg-label">段落密度</text><text x="${width-right}" y="${height-4}" text-anchor="end" class="svg-label">场次</text></svg>`;
}

function roleSVG(rows) {
  const totals = new Counter();
  const speakerTotals = new Map();
  rows.forEach((row) => row.speakers.forEach((count, speaker) => speakerTotals.set(speaker, (speakerTotals.get(speaker) || 0) + count)));
  const speakers = [...speakerTotals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name])=>name);
  const width = 760, height = 285, left = 92, top = 12, rowH = 30, colW = (width-left-16)/rows.length;
  const cells = [];
  const labels = [];
  speakers.forEach((speaker, speakerIndex) => {
    labels.push(`<text class="svg-label" x="${left-9}" y="${top+speakerIndex*rowH+18}" text-anchor="end">${esc(speaker)}</text>`);
    const max = Math.max(...rows.map((row)=>row.speakers.get(speaker)||0),1);
    rows.forEach((row, sceneIndex) => {
      const value = row.speakers.get(speaker) || 0;
      const r = value ? 3 + 8 * Math.sqrt(value/max) : 1.2;
      cells.push(`<circle cx="${left+sceneIndex*colW+colW/2}" cy="${top+speakerIndex*rowH+14}" r="${r}" fill="${value ? '#c9a869' : '#4a4036'}" fill-opacity="${value ? .35+.6*value/max : .2}"/>`);
    });
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="角色场次泳道">${labels.join("")}${cells.join("")}</svg>`;
}

function sceneTabs(rows, selected) {
  return `<div class="scene-tabs">${rows.map((row) => `<button class="scene-tab ${row.scene.scene_no === selected ? 'is-active' : ''}" data-scene="${row.scene.scene_no}">${row.scene.scene_no} · ${esc((row.scene.title_raw || '').replace(/^第.*?[场幕][：:]?/, '') || '场')}</button>`).join("")}</div>`;
}

function textReader(row) {
  if (!row) return `<div class="empty-state">请选择场次</div>`;
  return `<div class="text-reader">${row.segments.map((segment) => {
    const type = segment.display?.segment_type || segment.segment_type;
    const marker = segment.display?.marker || segment.label_raw || type;
    const cls = type === 'aria' ? 'segment-aria' : ['stage_direction','entrance_exit','gong_drum_cue'].includes(type) ? 'segment-stage' : '';
    return `<article class="text-segment ${cls}"><span class="seg-speaker">${esc(segment.speaker_name || '舞台')}</span><span class="seg-marker">${esc(marker)}</span><span class="seg-text">${esc(segment.text)}<small class="seg-page">PDF ${segment.source_page_start}${segment.source_page_end !== segment.source_page_start ? `–${segment.source_page_end}` : ''}</small></span></article>`;
  }).join("")}</div>`;
}

async function renderHeartbeat() {
  const cases = state.data.cases.versions;
  app.innerHTML = `<section class="loading-screen"><div class="loading-ring"></div><p>正在调取精标剧本……</p></section>`;
  const packageData = await getOverlay(state.heartbeatVersion);
  const rows = heartbeatData(packageData);
  if (!rows.some((row) => row.scene.scene_no === state.heartbeatScene)) state.heartbeatScene = rows[0]?.scene.scene_no || 1;
  const selectedRow = rows.find((row) => row.scene.scene_no === state.heartbeatScene);
  app.innerHTML = `
    ${pageHead("Close View · 场次节奏", "剧本心跳", "按场展开唱、白、念、动作和人物出入，点击峰值即可阅读对应原文。复合曲线是阅读导航，不代表艺术价值。", "9个精标版本 · PDF页码可追溯")}
    <div class="dashboard-grid heartbeat">
      ${panel("剧本选择", "精标覆盖层", `<div class="filter-stack"><label class="filter-label">版本<select id="heartbeat-version" class="select">${cases.map((item) => `<option value="${item.version_id}" ${item.version_id === state.heartbeatVersion ? 'selected' : ''}>${esc(item.title)} · ${item.version_id}</option>`).join("")}</select></label><div class="tag-cloud"><span class="tag">匹配率 <strong>${pct(packageData.curation.match_rate)}</strong></span><span class="tag">场次 <strong>${rows.length}</strong></span><span class="tag">段落 <strong>${packageData.segments.length}</strong></span><span class="tag">来源 <strong>精标+v1</strong></span></div><a class="source-link" href="${esc(pdfHref(packageData.version.source_file))}" target="_blank" rel="noopener">打开原始 PDF <span>↗</span></a><p style="color:var(--paper-muted);font-size:11px;line-height:1.8">选择版本后，所有视图共享当前场次。精标分类负责展示，v1负责页码与全库一致性。</p></div>`)}
      ${panel("四轨心跳", "唱 / 白 / 念 / 动作", `<div class="heartbeat-stage">${heartbeatSVG(rows)}</div><div class="compare-legend track-legend" style="position:absolute;left:18px;bottom:10px">${[["aria","#c9a869","唱"],["speech","#4d7c78","白"],["recitation","#8e6c9e","念"],["action","#a33a3f","动作"]].map(([key,color,label]) => `<button class="track-toggle ${state.heartbeatTracks.has(key) ? 'is-active' : ''}" data-track="${key}"><i class="legend-dot" style="background:${color}"></i>${label}</button>`).join("")}</div>`)}
      ${panel("场次导航", `当前第${state.heartbeatScene}场`, `${sceneTabs(rows, state.heartbeatScene)}<div class="metric-bars" style="margin-top:12px">${sceneMetricRows(selectedRow)}</div>`)}
      ${panel("角色泳道", "圆点表示该场发声段落", `<div class="role-stage">${roleSVG(rows)}</div>`, "span-two")}
      ${panel("同步原文", "点击场次后更新", textReader(selectedRow))}
    </div>`;

  document.querySelector("#heartbeat-version").addEventListener("change", async (event) => {
    state.heartbeatVersion = event.target.value;
    state.heartbeatScene = 1;
    await renderHeartbeat();
  });
  document.querySelectorAll(".scene-tab, .heartbeat-point").forEach((element) => element.addEventListener("click", async () => {
    state.heartbeatScene = Number(element.dataset.scene);
    await renderHeartbeat();
  }));
  document.querySelectorAll(".track-toggle").forEach((button) => button.addEventListener("click", async () => {
    const key = button.dataset.track;
    if (state.heartbeatTracks.has(key) && state.heartbeatTracks.size === 1) return showToast("至少保留一条心跳轨道");
    if (state.heartbeatTracks.has(key)) state.heartbeatTracks.delete(key); else state.heartbeatTracks.add(key);
    await renderHeartbeat();
  }));
}

function sceneMetricRows(row) {
  if (!row) return "";
  const values = [
    ["唱段", row.counts.aria, "#c9a869"], ["白段", row.counts.speech, "#4d7c78"], ["念段", row.counts.recitation, "#8e6c9e"], ["动作", row.counts.stage_direction + row.counts.entrance_exit, "#a33a3f"],
  ].filter((_, index) => state.heartbeatTracks.has(["aria", "speech", "recitation", "action"][index]));
  const max = Math.max(...values.map((item)=>item[1]),1);
  return values.map(([label,value,color]) => `<div class="metric-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${value/max*100}%;background:${color}"></div></div><strong>${value}</strong></div>`).join("");
}

async function render() {
  try {
    if (!state.data.corpus) return;
    if (state.route === "lineage") await renderLineage();
    else if (state.route === "fingerprint") renderFingerprint();
    else await renderHeartbeat();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="error-card"><h2>页面数据加载失败</h2><p>${esc(error.message)}</p><p>请确认从本地HTTP服务器打开，而不是直接双击HTML文件。</p></section>`;
  }
}

async function init() {
  try {
    await loadData();
    setRoute(state.route);
  } catch (error) {
    console.error(error);
    app.innerHTML = `<section class="error-card"><h2>系统初始化失败</h2><p>${esc(error.message)}</p><p>运行：<code>python3 -m http.server 4173</code></p></section>`;
  }
}

init();

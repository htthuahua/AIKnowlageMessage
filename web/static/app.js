const SAMPLES = [
  "你会什么？",
  "Dart中如何声明变量？",
  "Flutter中如何配置路由？",
  "Flutter中如何集成和使用Dio网络请求库？",
  "Redis的持久化方式有哪些？区别是什么？",
  "SpringBoot自动配置原理？",
];

const questionEl = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const chatScrollEl = document.getElementById("chatScroll");
const suggestionsEl = document.getElementById("suggestions");
const sidebarSamplesEl = document.getElementById("sidebarSamples");
const modelStatusEl = document.getElementById("modelStatus");
const newChatBtn = document.getElementById("newChatBtn");
const menuBtn = document.getElementById("menuBtn");
const sidebarEl = document.getElementById("sidebar");
const sidebarOverlayEl = document.getElementById("sidebarOverlay");
const cityToggleBtn = document.getElementById("cityToggleBtn");
const citySidebarBtn = document.getElementById("citySidebarBtn");
const cityViewEl = document.getElementById("cityView");
const cityCanvasEl = document.getElementById("cityCanvas");
const cityStatsEl = document.getElementById("cityStats");
const cityPanelEl = document.getElementById("cityPanel");
const cityPanelTitleEl = document.getElementById("cityPanelTitle");
const cityPanelMetaEl = document.getElementById("cityPanelMeta");
const cityPanelListEl = document.getElementById("cityPanelList");
const cityPanelCloseEl = document.getElementById("cityPanelClose");
const cityWelcomeBtn = document.getElementById("cityWelcomeBtn");
const uploadWelcomeBtn = document.getElementById("uploadWelcomeBtn");
const uploadToolbarBtn = document.getElementById("uploadToolbarBtn");
const cityToolbarBtn = document.getElementById("cityToolbarBtn");
const mainEl = document.querySelector(".main");
const uploadToggleBtn = document.getElementById("uploadToggleBtn");
const uploadSidebarBtn = document.getElementById("uploadSidebarBtn");
const uploadViewEl = document.getElementById("uploadView");
const uploadFormEl = document.getElementById("uploadForm");
const uploadKbSelectEl = document.getElementById("uploadKbSelect");
const uploadNewKbFieldEl = document.getElementById("uploadNewKbField");
const uploadKbNameEl = document.getElementById("uploadKbName");
const uploadQuestionEl = document.getElementById("uploadQuestion");
const uploadSummaryEl = document.getElementById("uploadSummary");
const uploadCategoryEl = document.getElementById("uploadCategory");
const uploadCodeEl = document.getElementById("uploadCode");
const uploadSubmitBtn = document.getElementById("uploadSubmitBtn");
const uploadFeedbackEl = document.getElementById("uploadFeedback");
const uploadStatusTextEl = document.getElementById("uploadStatusText");
const uploadHistoryListEl = document.getElementById("uploadHistoryList");
const uploadHistoryRefreshEl = document.getElementById("uploadHistoryRefresh");
const uploadEditIdEl = document.getElementById("uploadEditId");
const uploadEditBannerEl = document.getElementById("uploadEditBanner");
const uploadEditLabelEl = document.getElementById("uploadEditLabel");
const uploadCancelEditEl = document.getElementById("uploadCancelEdit");
const manageKbSelectEl = document.getElementById("manageKbSelect");
const manageSearchInputEl = document.getElementById("manageSearchInput");
const manageRecordsListEl = document.getElementById("manageRecordsList");
const manageRecordsRefreshEl = document.getElementById("manageRecordsRefresh");

let isLoading = false;
let cityMode = false;
let uploadMode = false;
let cityReady = false;
let uploadStatusTimer = null;
let manageSearchTimer = null;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateSendButton() {
  const hasText = questionEl.value.trim().length > 0;
  askBtn.disabled = isLoading || !hasText;
}

function autoResizeTextarea() {
  questionEl.style.height = "auto";
  questionEl.style.height = `${Math.min(questionEl.scrollHeight, 200)}px`;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
  });
}

function setLoading(loading) {
  isLoading = loading;
  askBtn.classList.toggle("loading", loading);
  questionEl.disabled = loading;
  updateSendButton();
}

function hideWelcome() {
  welcomeEl.classList.add("hidden");
}

function showWelcome() {
  welcomeEl.classList.remove("hidden");
  messagesEl.innerHTML = "";
}

function createUserMessage(text) {
  hideWelcome();
  const el = document.createElement("div");
  el.className = "message user";
  el.innerHTML = `
    <div class="message-avatar">你</div>
    <div class="message-body">
      <p class="message-text">${escapeHtml(text)}</p>
    </div>
  `;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function createTypingIndicator() {
  const el = document.createElement("div");
  el.className = "message assistant typing-msg";
  el.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-body">
      <div class="typing"><span></span><span></span><span></span></div>
    </div>
  `;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function buildQuestionCatalogHtml(data) {
  const groups = new Map();
  (data.questions || []).forEach((item) => {
    const category = item.category || "其他";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item.question);
  });

  let html = `<p class="message-text">${escapeHtml(data.summary || "")}</p>`;
  html += `<div class="message-meta">
    <span class="meta-tag success">问题目录</span>
    <span class="meta-tag">共 ${data.questions.length} 条</span>
  </div>`;
  html += `<div class="question-catalog">`;

  [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .forEach(([category, questions]) => {
      html += `
        <section class="catalog-group">
          <h3 class="catalog-title">
            <span>${escapeHtml(category)}</span>
            <em>${questions.length}</em>
          </h3>
          <ul class="catalog-list">
      `;
      questions.forEach((question) => {
        html += `<li><button type="button" class="catalog-item">${escapeHtml(question)}</button></li>`;
      });
      html += `</ul></section>`;
    });

  html += `</div>`;
  return html;
}

function buildAssistantHtml(data) {
  if (data.catalog && data.questions?.length) {
    return buildQuestionCatalogHtml(data);
  }

  if (data.matched) {
    let html = `<p class="message-text">${escapeHtml(data.summary || "")}</p>`;

    html += `<div class="message-meta">
      <span class="meta-tag success">匹配成功</span>
      <span class="meta-tag">相似度 ${data.score}</span>
      <span class="meta-tag">${escapeHtml(data.category || "-")}</span>
    </div>`;

    if (data.code) {
      const codeId = `code-${Date.now()}`;
      html += `
        <div class="code-section">
          <div class="code-header">
            <span class="code-label">代码示例</span>
            <button type="button" class="copy-btn" data-copy="${codeId}">复制</button>
          </div>
          <pre class="code-block"><code id="${codeId}">${escapeHtml(data.code)}</code></pre>
        </div>
      `;
    }
    return html;
  }

  const msg = data.message || data.error || "未找到相关内容，请换个问法试试。";
  let html = `<p class="message-text">${escapeHtml(msg)}</p>`;
  html += `<div class="message-meta">`;
  html += `<span class="meta-tag fail">未匹配</span>`;
  if (data.score) {
    html += `<span class="meta-tag">相似度 ${data.score}</span>`;
  }
  html += `</div>`;
  return html;
}

function createAssistantMessage(data) {
  const el = document.createElement("div");
  el.className = "message assistant";
  el.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-body">${buildAssistantHtml(data)}</div>
  `;

  el.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const codeId = btn.dataset.copy;
      const codeNode = document.getElementById(codeId);
      if (!codeNode) return;
      navigator.clipboard.writeText(codeNode.textContent || "").then(() => {
        btn.textContent = "已复制";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "复制";
          btn.classList.remove("copied");
        }, 2000);
      });
    });
  });

  el.querySelectorAll(".catalog-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      askQuestion(btn.textContent || "");
    });
  });

  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

async function askQuestion(text) {
  const question = (text || questionEl.value).trim();
  if (!question || isLoading) return;

  questionEl.value = "";
  autoResizeTextarea();
  updateSendButton();
  closeSidebar();

  createUserMessage(question);
  const typingEl = createTypingIndicator();
  setLoading(true);

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await response.json();
    typingEl.remove();

    if (!response.ok) {
      createAssistantMessage({
        matched: false,
        score: 0,
        message: data.error || "请求失败",
      });
      return;
    }
    createAssistantMessage(data);
  } catch (error) {
    typingEl.remove();
    createAssistantMessage({
      matched: false,
      score: 0,
      message: `网络错误: ${error.message}`,
    });
  } finally {
    setLoading(false);
    questionEl.focus();
  }
}

function initSamples() {
  SAMPLES.forEach((text) => {
    const sidebarBtn = document.createElement("button");
    sidebarBtn.type = "button";
    sidebarBtn.className = "sample-item";
    sidebarBtn.textContent = text;
    sidebarBtn.title = text;
    sidebarBtn.addEventListener("click", () => askQuestion(text));
    sidebarSamplesEl.appendChild(sidebarBtn);

    const suggestBtn = document.createElement("button");
    suggestBtn.type = "button";
    suggestBtn.className = "suggestion";
    suggestBtn.textContent = text;
    suggestBtn.addEventListener("click", () => askQuestion(text));
    suggestionsEl.appendChild(suggestBtn);
  });
}

function setModelStatus(ready, text) {
  modelStatusEl.classList.remove("ready", "error");
  if (ready === true) modelStatusEl.classList.add("ready");
  if (ready === false) modelStatusEl.classList.add("error");
  modelStatusEl.querySelector(".status-text").textContent = text;
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
}

function openSidebar() {
  sidebarEl.classList.add("open");
}

askBtn.addEventListener("click", () => askQuestion());

questionEl.addEventListener("input", () => {
  autoResizeTextarea();
  updateSendButton();
});

questionEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    askQuestion();
  }
});

newChatBtn.addEventListener("click", () => {
  showWelcome();
  questionEl.value = "";
  autoResizeTextarea();
  updateSendButton();
  closeSidebar();
  questionEl.focus();
});

menuBtn.addEventListener("click", openSidebar);
sidebarOverlayEl.addEventListener("click", closeSidebar);

function hideCityPanel() {
  cityPanelEl.classList.add("hidden");
}

function showCityPanel(building) {
  cityPanelTitleEl.textContent = building.name;
  cityPanelMetaEl.textContent = `${building.count} 条知识 · ${building.categories.length} 个分类`;
  cityPanelListEl.innerHTML = "";

  building.questions.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "city-question-item";
    btn.innerHTML = `${escapeHtml(item.question)}<small>${escapeHtml(item.category)}</small>`;
    btn.addEventListener("click", () => {
      setCityMode(false);
      askQuestion(item.question);
    });
    cityPanelListEl.appendChild(btn);
  });

  cityPanelEl.classList.remove("hidden");
}

function showKnowledgePanel(item) {
  cityPanelTitleEl.textContent = item.question;
  const districtLabel =
    item.districtIndex != null && item.districtIndex >= 0
      ? `知识小区 ${item.districtIndex + 1} · `
      : "";
  cityPanelMetaEl.textContent = `${districtLabel}${item.buildingName || "知识库"} · ${item.category || "其他"}`;
  cityPanelListEl.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "city-knowledge-summary";
  summary.textContent = item.summary || "暂无摘要";
  cityPanelListEl.appendChild(summary);

  if (item.code) {
    const codeBlock = document.createElement("pre");
    codeBlock.className = "city-knowledge-code";
    codeBlock.textContent = item.code;
    cityPanelListEl.appendChild(codeBlock);
  }

  const askBtn = document.createElement("button");
  askBtn.type = "button";
  askBtn.className = "city-question-item city-knowledge-ask";
  askBtn.textContent = "在对话中提问";
  askBtn.addEventListener("click", () => {
    setCityMode(false);
    askQuestion(item.question);
  });
  cityPanelListEl.appendChild(askBtn);

  cityPanelEl.classList.remove("hidden");
}

async function setCityMode(enabled) {
  if (enabled && uploadMode) {
    await setUploadMode(false);
  }
  cityMode = enabled;
  mainEl.classList.toggle("city-mode", enabled);
  cityViewEl.classList.toggle("hidden", !enabled);
  cityViewEl.setAttribute("aria-hidden", enabled ? "false" : "true");

  const label = enabled ? "返回对话" : "知识之城 3D";
  if (cityToggleBtn) cityToggleBtn.textContent = label;
  if (citySidebarBtn) citySidebarBtn.querySelector("span").textContent = label;

  if (!enabled) {
    hideCityPanel();
    if (window.KnowledgeCity) window.KnowledgeCity.close();
    cityReady = false;
    questionEl.focus();
    return;
  }

  closeSidebar();
  hideCityPanel();

  if (cityReady || !window.KnowledgeCity) return;

  cityStatsEl.textContent = "正在构建知识之城...";
  try {
    const data = await window.KnowledgeCity.open({
      canvas: cityCanvasEl,
      onSelect: showCityPanel,
      onCarSelect: showKnowledgePanel,
    });
    cityReady = true;
    cityStatsEl.textContent =
      data.districtCount > 1
        ? `${data.districtCount} 个知识小区 · ${(data.districtSummaries || [])
            .map((item) => `小区${item.index}:${item.carCount}车/${item.buildingCount}楼`)
            .join(" · ")}`
        : `中心环岛 + 外围环路 · ${data.total} 辆知识小车 · ${data.buildings.length} 座楼宇`;
  } catch (error) {
    cityStatsEl.textContent = `加载失败: ${error.message}`;
  }
}

function toggleCityMode() {
  setCityMode(!cityMode);
}

function formatUploadTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderUploadStatus(data) {
  if (!uploadStatusTextEl) return;
  if (data.training) {
    uploadStatusTextEl.textContent = "模型训练中，请稍候...";
    uploadStatusTextEl.classList.add("training");
    return;
  }
  uploadStatusTextEl.classList.remove("training");
  const pending = data.pending_since_train ?? 0;
  const threshold = data.train_threshold ?? 50;
  const remain = Math.max(0, threshold - pending);
  uploadStatusTextEl.textContent =
    remain > 0
      ? `距自动训练还差 ${remain} 条（已累积 ${pending}/${threshold}）`
      : `已达 ${threshold} 条，训练将自动开始`;
}

async function fetchUploadStatus() {
  try {
    const res = await fetch("/api/upload/status");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "状态加载失败");
    renderUploadStatus(data);
    return data;
  } catch (error) {
    if (uploadStatusTextEl) {
      uploadStatusTextEl.textContent = `状态加载失败: ${error.message}`;
    }
    return null;
  }
}

function startUploadStatusPolling() {
  stopUploadStatusPolling();
  uploadStatusTimer = window.setInterval(() => {
    fetchUploadStatus();
  }, 5000);
}

function stopUploadStatusPolling() {
  if (uploadStatusTimer) {
    window.clearInterval(uploadStatusTimer);
    uploadStatusTimer = null;
  }
}

async function loadKnowledgeBases() {
  const res = await fetch("/api/knowledge-bases");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "知识库列表加载失败");

  uploadKbSelectEl.innerHTML = "";
  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "＋ 新建知识库";
  uploadKbSelectEl.appendChild(newOpt);

  if (manageKbSelectEl) {
    manageKbSelectEl.innerHTML = '<option value="">全部知识库</option>';
  }

  (data.bases || []).forEach((base) => {
    const opt = document.createElement("option");
    opt.value = base.id;
    opt.textContent = `${base.name}（${base.count} 条）`;
    uploadKbSelectEl.appendChild(opt);

    if (manageKbSelectEl) {
      const manageOpt = document.createElement("option");
      manageOpt.value = base.id;
      manageOpt.textContent = `${base.name}（${base.count} 条）`;
      manageKbSelectEl.appendChild(manageOpt);
    }
  });

  if (uploadKbSelectEl.options.length === 1) {
    uploadKbSelectEl.value = "__new__";
  }
  toggleNewKbField();
}

function toggleNewKbField() {
  const isEditing = Boolean(uploadEditIdEl?.value);
  const isNew = uploadKbSelectEl.value === "__new__";
  uploadNewKbFieldEl.classList.toggle("hidden", !isNew || isEditing);
  if (uploadKbSelectEl) {
    uploadKbSelectEl.disabled = isEditing;
  }
}

function setUploadFormMode(mode = "create") {
  const isEdit = mode === "edit";
  if (uploadEditBannerEl) uploadEditBannerEl.classList.toggle("hidden", !isEdit);
  if (uploadSubmitBtn) {
    uploadSubmitBtn.textContent = isEdit ? "保存修改" : "保存到知识库";
  }
  toggleNewKbField();
}

function startEditRecord(record) {
  if (!record?.id) return;
  uploadEditIdEl.value = record.id;
  uploadEditLabelEl.textContent = record.question || record.id;

  const kbOption = [...uploadKbSelectEl.options].find((opt) => opt.value === record.kb_id);
  if (kbOption) {
    uploadKbSelectEl.value = record.kb_id;
  }

  uploadQuestionEl.value = record.question || "";
  uploadSummaryEl.value = record.summary || "";
  uploadCategoryEl.value = record.category || "";
  uploadCodeEl.value = record.code || "";
  uploadKbNameEl.value = "";

  setUploadFormMode("edit");
  hideUploadFeedback();
  uploadFormEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEditRecord() {
  uploadEditIdEl.value = "";
  uploadQuestionEl.value = "";
  uploadSummaryEl.value = "";
  uploadCategoryEl.value = "";
  uploadCodeEl.value = "";
  uploadKbNameEl.value = "";
  setUploadFormMode("create");
  hideUploadFeedback();
}

function buildRecordActionsHtml(record) {
  return `
    <div class="record-actions">
      <button type="button" class="record-action-btn edit" data-action="edit" data-id="${escapeHtml(record.id)}">编辑</button>
      <button type="button" class="record-action-btn delete" data-action="delete" data-id="${escapeHtml(record.id)}">删除</button>
    </div>
  `;
}

function bindRecordActionButtons(container) {
  container.querySelectorAll(".record-action-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const recordId = btn.dataset.id;
      const action = btn.dataset.action;
      if (!recordId) return;

      if (action === "edit") {
        await handleEditRecord(recordId);
        return;
      }

      if (action === "delete") {
        const item = container.querySelector(`[data-record-id="${CSS.escape(recordId)}"]`);
        const question = item?.dataset.question || recordId;
        if (!window.confirm(`确定删除这条知识点吗？\n\n${question}`)) return;
        await deleteRecord(recordId);
      }
    });
  });
}

async function fetchRecordById(recordId) {
  const res = await fetch(`/api/knowledge-records?q=${encodeURIComponent(recordId)}&limit=50`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "记录加载失败");
  return (data.records || []).find((row) => row.id === recordId) || null;
}

async function handleEditRecord(recordId) {
  try {
    const record = await fetchRecordById(recordId);
    if (!record) {
      showUploadFeedback("记录不存在或已被删除", "error");
      return;
    }
    startEditRecord(record);
  } catch (error) {
    showUploadFeedback(error.message, "error");
  }
}

async function deleteRecord(recordId) {
  try {
    const res = await fetch(`/api/knowledge-records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除失败");

    if (uploadEditIdEl.value === recordId) {
      cancelEditRecord();
    }

    cityReady = false;
    showUploadFeedback(`已删除「${data.question || recordId}」`, "success");
    await Promise.all([
      loadKnowledgeBases(),
      loadManageRecords(),
      loadUploadHistory(),
      fetchUploadStatus(),
    ]);
  } catch (error) {
    showUploadFeedback(error.message, "error");
  }
}

function renderManageRecords(items) {
  manageRecordsListEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "upload-history-empty";
    empty.textContent = "没有匹配的知识点";
    manageRecordsListEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "upload-manage-item";
    li.dataset.recordId = item.id;
    li.dataset.kbId = item.kb_id || "";
    li.dataset.question = item.question || "";
    li.dataset.summary = item.summary || "";
    li.dataset.category = item.category || "";
    li.dataset.code = item.code || "";
    li.innerHTML = `
      <div class="manage-main">
        <strong>${escapeHtml(item.question)}</strong>
        <p class="manage-summary">${escapeHtml(item.summary || "")}</p>
      </div>
      <div class="history-meta">
        <span>${escapeHtml(item.kb_name || item.kb_id)}</span>
        <span>${escapeHtml(item.category || "其他")}</span>
        <span>${escapeHtml(item.id)}</span>
      </div>
      ${buildRecordActionsHtml(item)}
    `;
    manageRecordsListEl.appendChild(li);
  });

  bindRecordActionButtons(manageRecordsListEl);
}

async function loadManageRecords() {
  if (!manageRecordsListEl) return;
  const kbId = manageKbSelectEl?.value || "";
  const query = manageSearchInputEl?.value.trim() || "";
  const params = new URLSearchParams();
  if (kbId) params.set("kb_id", kbId);
  if (query) params.set("q", query);

  try {
    const res = await fetch(`/api/knowledge-records?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "记录加载失败");
    renderManageRecords(data.records || []);
  } catch (error) {
    manageRecordsListEl.innerHTML = `<li class="upload-history-empty">加载失败: ${escapeHtml(error.message)}</li>`;
  }
}

function showUploadFeedback(text, type = "success") {
  uploadFeedbackEl.textContent = text;
  uploadFeedbackEl.classList.remove("hidden", "success", "error");
  uploadFeedbackEl.classList.add(type);
}

function hideUploadFeedback() {
  uploadFeedbackEl.classList.add("hidden");
}

function renderUploadHistory(items) {
  uploadHistoryListEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "upload-history-empty";
    empty.textContent = "暂无上传记录";
    uploadHistoryListEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "upload-history-item";
    const badge = item.is_new_building
      ? '<span class="history-badge new-building">新楼宇</span>'
      : "";
    li.innerHTML = `
      <div class="history-main">
        <strong>${escapeHtml(item.question)}</strong>
        ${badge}
      </div>
      <div class="history-meta">
        <span>${escapeHtml(item.kb_name || item.kb_id)}</span>
        <span>${escapeHtml(item.category || "其他")}</span>
        <time>${escapeHtml(formatUploadTime(item.time))}</time>
      </div>
      ${item.record_id ? buildRecordActionsHtml({ id: item.record_id }) : ""}
    `;
    if (item.record_id) {
      li.dataset.recordId = item.record_id;
      li.dataset.question = item.question || "";
    }
    uploadHistoryListEl.appendChild(li);
  });

  bindRecordActionButtons(uploadHistoryListEl);
}

async function loadUploadHistory() {
  try {
    const res = await fetch("/api/upload/history");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "历史加载失败");
    renderUploadHistory(data.history || []);
  } catch (error) {
    uploadHistoryListEl.innerHTML = `<li class="upload-history-empty">加载失败: ${escapeHtml(error.message)}</li>`;
  }
}

async function submitUpload(event) {
  event.preventDefault();
  if (uploadSubmitBtn.disabled) return;

  const editingId = uploadEditIdEl?.value.trim() || "";
  const isNew = !editingId && uploadKbSelectEl.value === "__new__";
  const kbId = isNew ? "" : uploadKbSelectEl.value;
  const kbName = isNew ? uploadKbNameEl.value.trim() : "";
  const question = uploadQuestionEl.value.trim();
  const summary = uploadSummaryEl.value.trim();
  const category = uploadCategoryEl.value.trim();
  const code = uploadCodeEl.value.trim();

  if (!question || !summary) {
    showUploadFeedback("请填写问题和回答摘要", "error");
    return;
  }
  if (!editingId && isNew && !kbName) {
    showUploadFeedback("新建知识库需要填写名称", "error");
    return;
  }

  uploadSubmitBtn.disabled = true;
  hideUploadFeedback();

  try {
    let res;
    if (editingId) {
      res = await fetch(`/api/knowledge-records/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, summary, category, code }),
      });
    } else {
      res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kb_id: kbId,
          kb_name: kbName,
          question,
          summary,
          category,
          code,
        }),
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || (editingId ? "修改失败" : "上传失败"));

    if (editingId) {
      cancelEditRecord();
      cityReady = false;
      showUploadFeedback(`已更新「${data.record.question}」`, "success");
      await Promise.all([
        loadKnowledgeBases(),
        loadManageRecords(),
        loadUploadHistory(),
        fetchUploadStatus(),
      ]);
      return;
    }

    uploadQuestionEl.value = "";
    uploadSummaryEl.value = "";
    uploadCategoryEl.value = "";
    uploadCodeEl.value = "";
    if (isNew) uploadKbNameEl.value = "";

    let msg = `已保存到「${data.kb_name}」（${data.record.id}）`;
    if (data.is_new_building) {
      cityReady = false;
      msg += "。新知识库已在知识之城中新建楼宇，进入 3D 地图即可查看。";
    }
    if (data.training_started) {
      msg += " 已累计 50 条，后台训练已开始。";
    }
    showUploadFeedback(msg, "success");

    await Promise.all([
      loadKnowledgeBases(),
      loadManageRecords(),
      loadUploadHistory(),
      fetchUploadStatus(),
    ]);
    if (data.training_started) startUploadStatusPolling();
  } catch (error) {
    showUploadFeedback(error.message, "error");
  } finally {
    uploadSubmitBtn.disabled = false;
  }
}

async function setUploadMode(enabled) {
  if (enabled && cityMode) {
    await setCityMode(false);
  }
  uploadMode = enabled;
  mainEl.classList.toggle("upload-mode", enabled);
  uploadViewEl.classList.toggle("hidden", !enabled);
  uploadViewEl.setAttribute("aria-hidden", enabled ? "false" : "true");

  const label = enabled ? "返回对话" : "上传知识";
  if (uploadToggleBtn) uploadToggleBtn.textContent = label;
  if (uploadSidebarBtn) {
    const span = uploadSidebarBtn.querySelector("span");
    if (span) span.textContent = enabled ? "返回对话" : "上传知识点";
  }

  if (!enabled) {
    stopUploadStatusPolling();
    questionEl.focus();
    return;
  }

  closeSidebar();
  hideUploadFeedback();
  uploadSubmitBtn.disabled = false;

  try {
    await Promise.all([
      loadKnowledgeBases(),
      loadManageRecords(),
      loadUploadHistory(),
      fetchUploadStatus(),
    ]);
    startUploadStatusPolling();
  } catch (error) {
    showUploadFeedback(error.message, "error");
  }
}

function toggleUploadMode() {
  setUploadMode(!uploadMode);
}

if (cityToggleBtn) cityToggleBtn.addEventListener("click", toggleCityMode);
if (citySidebarBtn) citySidebarBtn.addEventListener("click", toggleCityMode);
if (cityWelcomeBtn) cityWelcomeBtn.addEventListener("click", toggleCityMode);
if (cityPanelCloseEl) cityPanelCloseEl.addEventListener("click", hideCityPanel);
if (uploadToggleBtn) uploadToggleBtn.addEventListener("click", toggleUploadMode);
if (uploadSidebarBtn) uploadSidebarBtn.addEventListener("click", toggleUploadMode);
if (uploadWelcomeBtn) uploadWelcomeBtn.addEventListener("click", () => setUploadMode(true));
if (uploadToolbarBtn) uploadToolbarBtn.addEventListener("click", () => setUploadMode(true));
if (cityToolbarBtn) cityToolbarBtn.addEventListener("click", toggleCityMode);
if (uploadFormEl) uploadFormEl.addEventListener("submit", submitUpload);
if (uploadKbSelectEl) uploadKbSelectEl.addEventListener("change", toggleNewKbField);
if (uploadCancelEditEl) uploadCancelEditEl.addEventListener("click", cancelEditRecord);
if (uploadHistoryRefreshEl) uploadHistoryRefreshEl.addEventListener("click", loadUploadHistory);
if (manageRecordsRefreshEl) manageRecordsRefreshEl.addEventListener("click", loadManageRecords);
if (manageKbSelectEl) manageKbSelectEl.addEventListener("change", loadManageRecords);
if (manageSearchInputEl) {
  manageSearchInputEl.addEventListener("input", () => {
    if (manageSearchTimer) window.clearTimeout(manageSearchTimer);
    manageSearchTimer = window.setTimeout(loadManageRecords, 300);
  });
}

initSamples();
updateSendButton();

fetch("/api/health")
  .then((res) => res.json())
  .then((data) => {
    if (data.model_ready) {
      setModelStatus(true, "模型已就绪");
    } else {
      setModelStatus(false, "模型未就绪，请先训练");
    }
  })
  .catch(() => {
    setModelStatus(false, "服务未连接");
  });

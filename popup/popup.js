// =============================================
// Ivy Proxy Switch - Popup Script
// =============================================

// ---- 状态 ----
let state = {
  profiles: [],
  activeProfileId: "direct",
  rules: [],
  editingProfileId: null,
  editingRuleId: null,
  selectedColor: "#3ab54a",
  selectedScheme: "http"
};

// ---- DOM 引用 ----
const $ = id => document.getElementById(id);
const pages = {
  main: $("page-main"),
  edit: $("page-edit"),
  rules: $("page-rules"),
  settings: $("page-settings")
};

// ---- 初始化 ----
async function init() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId", "rules"]);
  state.profiles = data.profiles || [];
  state.activeProfileId = data.activeProfileId || "direct";
  state.rules = data.rules || [];
  renderMain();
  bindEvents();
}

// ---- 页面切换 ----
function showPage(name) {
  Object.values(pages).forEach(p => p.classList.add("hidden"));
  pages[name].classList.remove("hidden");
}

// ---- 渲染主页面 ----
function renderMain() {
  const list = $("profile-list");
  list.innerHTML = "";

  if (state.profiles.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔌</div><p>还没有代理配置</p></div>`;
    return;
  }

  state.profiles.forEach(profile => {
    const isActive = profile.id === state.activeProfileId;
    const item = document.createElement("div");
    item.className = `profile-item${isActive ? " active" : ""}`;
    item.style.setProperty("--profile-color", profile.color || "#7c3aed");
    item.dataset.id = profile.id;

    const desc = getProfileDesc(profile);

    item.innerHTML = `
      <div class="profile-dot" style="background:${profile.color || "#666"}"></div>
      <div class="profile-info">
        <div class="profile-name">${escHtml(profile.name)}</div>
        ${desc ? `<div class="profile-desc">${escHtml(desc)}</div>` : ""}
      </div>
      ${isActive ? '<span class="active-badge">当前</span>' : ""}
      ${!profile.isBuiltin ? `
        <div class="profile-actions">
          <button class="btn-icon btn-edit-profile" data-id="${profile.id}" title="编辑">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button class="btn-icon btn-delete-profile" data-id="${profile.id}" title="删除">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      ` : ""}
    `;

    // 点击切换代理
    item.addEventListener("click", (e) => {
      if (e.target.closest(".profile-actions")) return;
      activateProfile(profile.id);
    });

    list.appendChild(item);
  });
}

function getProfileDesc(profile) {
  if (profile.type === "direct") return "不使用代理";
  if (profile.type === "system") return "使用系统代理设置";
  if (profile.type === "auto") return "PAC 规则分流";
  if (profile.host) {
    return `${(profile.scheme || "http").toUpperCase()} ${profile.host}:${profile.port}`;
  }
  return "";
}

// ---- 激活代理 ----
async function activateProfile(profileId) {
  const result = await chrome.runtime.sendMessage({
    type: "APPLY_PROXY",
    profileId
  });

  if (result?.success) {
    state.activeProfileId = profileId;
    renderMain();
  } else {
    alert("切换失败：" + (result?.error || "未知错误"));
  }
}

// ---- 渲染编辑页 ----
function openEditPage(profileId = null) {
  state.editingProfileId = profileId;
  const isNew = !profileId;

  $("edit-page-title").textContent = isNew ? "新建代理" : "编辑代理";

  if (isNew) {
    $("edit-id").value = "";
    $("edit-name").value = "";
    $("edit-host").value = "";
    $("edit-port").value = "";
    $("edit-bypass").value = "localhost\n127.0.0.1\n*.local";
    setScheme("http");
    setColor("#3ab54a");
  } else {
    const profile = state.profiles.find(p => p.id === profileId);
    if (!profile) return;
    $("edit-id").value = profile.id;
    $("edit-name").value = profile.name;
    $("edit-host").value = profile.host || "";
    $("edit-port").value = profile.port || "";
    $("edit-bypass").value = (profile.bypass || []).join("\n");
    setScheme(profile.scheme || "http");
    setColor(profile.color || "#3ab54a");
  }

  showPage("edit");
}

function setScheme(scheme) {
  state.selectedScheme = scheme;
  document.querySelectorAll(".type-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.scheme === scheme);
  });
}

function setColor(color) {
  state.selectedColor = color;
  document.querySelectorAll(".color-option").forEach(opt => {
    opt.classList.toggle("active", opt.dataset.color === color);
  });
}

// ---- 保存代理配置 ----
function saveProfile(e) {
  e.preventDefault();

  const id = $("edit-id").value || genId();
  const name = $("edit-name").value.trim();
  const host = $("edit-host").value.trim();
  const port = $("edit-port").value.trim();
  const bypassText = $("edit-bypass").value.trim();
  const bypass = bypassText ? bypassText.split("\n").map(s => s.trim()).filter(Boolean) : [];

  const profile = {
    id,
    name,
    type: "proxy",
    scheme: state.selectedScheme,
    host,
    port: parseInt(port),
    bypass,
    color: state.selectedColor,
    isBuiltin: false
  };

  const idx = state.profiles.findIndex(p => p.id === id);
  if (idx >= 0) {
    state.profiles[idx] = profile;
  } else {
    state.profiles.push(profile);
  }

  chrome.runtime.sendMessage({ type: "SAVE_PROFILES", profiles: state.profiles });
  showPage("main");
  renderMain();
}

// ---- 删除代理配置 ----
function deleteProfile(profileId) {
  if (!confirm("确定要删除这个代理配置吗？")) return;
  state.profiles = state.profiles.filter(p => p.id !== profileId);

  if (state.activeProfileId === profileId) {
    activateProfile("direct");
  }

  chrome.runtime.sendMessage({ type: "SAVE_PROFILES", profiles: state.profiles });
  renderMain();
}

// ---- 规则页 ----
function renderRulesPage() {
  const list = $("rule-list");
  list.innerHTML = "";

  state.rules.filter(r => !r.isDefault).forEach(rule => {
    const profile = state.profiles.find(p => p.id === rule.profileId);
    const item = document.createElement("div");
    item.className = "rule-item";
    item.dataset.id = rule.id;

    item.innerHTML = `
      <div class="rule-toggle ${rule.enabled ? "on" : ""}" data-id="${rule.id}"></div>
      <div class="rule-info">
        <div class="rule-name">${escHtml(rule.name || rule.pattern)}</div>
        <div class="rule-pattern">${escHtml(rule.pattern)}</div>
      </div>
      <span class="rule-proxy-tag">${profile ? escHtml(profile.name) : "未知"}</span>
      <button class="btn-icon btn-edit-rule" data-id="${rule.id}" title="编辑">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      </button>
      <button class="btn-icon btn-delete-rule" data-id="${rule.id}" title="删除">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    `;

    list.appendChild(item);
  });

  // 渲染默认代理选项
  const defaultSelect = $("default-profile-select");
  defaultSelect.innerHTML = renderProfileOptions();
  const defaultRule = state.rules.find(r => r.isDefault);
  if (defaultRule) defaultSelect.value = defaultRule.profileId;
}

function renderProfileOptions() {
  return state.profiles.map(p =>
    `<option value="${p.id}">${escHtml(p.name)}</option>`
  ).join("");
}

// ---- 规则模态框 ----
function openRuleModal(ruleId = null) {
  state.editingRuleId = ruleId;
  $("rule-modal-title").textContent = ruleId ? "编辑规则" : "添加规则";

  if (ruleId) {
    const rule = state.rules.find(r => r.id === ruleId);
    if (rule) {
      $("rule-id").value = rule.id;
      $("rule-name").value = rule.name || "";
      $("rule-match-type").value = rule.matchType || "domain";
      $("rule-pattern").value = rule.pattern || "";
      $("rule-profile-select").innerHTML = renderProfileOptions();
      $("rule-profile-select").value = rule.profileId || "";
    }
  } else {
    $("rule-id").value = "";
    $("rule-name").value = "";
    $("rule-match-type").value = "domain";
    $("rule-pattern").value = "";
    $("rule-profile-select").innerHTML = renderProfileOptions();
  }

  $("rule-modal").classList.remove("hidden");
}

function closeRuleModal() {
  $("rule-modal").classList.add("hidden");
}

function saveRule(e) {
  e.preventDefault();
  const id = $("rule-id").value || genId();
  const rule = {
    id,
    name: $("rule-name").value.trim(),
    matchType: $("rule-match-type").value,
    pattern: $("rule-pattern").value.trim(),
    profileId: $("rule-profile-select").value,
    enabled: true,
    isDefault: false
  };

  const idx = state.rules.findIndex(r => r.id === id);
  if (idx >= 0) {
    state.rules[idx] = rule;
  } else {
    state.rules.push(rule);
  }

  saveRules();
  closeRuleModal();
  renderRulesPage();
}

function deleteRule(ruleId) {
  state.rules = state.rules.filter(r => r.id !== ruleId);
  saveRules();
  renderRulesPage();
}

function toggleRule(ruleId) {
  const rule = state.rules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = !rule.enabled;
    saveRules();
    renderRulesPage();
  }
}

function saveRules() {
  chrome.runtime.sendMessage({ type: "SAVE_RULES", rules: state.rules });
  chrome.storage.local.set({ rules: state.rules });
}

// ---- 工具函数 ----
function genId() {
  return "p_" + Math.random().toString(36).slice(2, 10);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- 事件绑定 ----
function bindEvents() {
  // 头部按钮
  $("btn-rules").addEventListener("click", () => {
    renderRulesPage();
    showPage("rules");
  });

  // 设置按钮
  $("btn-settings").addEventListener("click", () => {
    showPage("settings");
  });

  // 返回主页
  $("btn-back-from-settings").addEventListener("click", () => showPage("main"));

  // 添加新代理
  $("btn-add-profile").addEventListener("click", () => openEditPage());

  // 编辑/删除 代理（事件委托）
  $("profile-list").addEventListener("click", e => {
    const editBtn = e.target.closest(".btn-edit-profile");
    const delBtn = e.target.closest(".btn-delete-profile");
    if (editBtn) openEditPage(editBtn.dataset.id);
    if (delBtn) deleteProfile(delBtn.dataset.id);
  });

  // 返回主页
  $("btn-back-from-edit").addEventListener("click", () => showPage("main"));
  $("btn-back-from-rules").addEventListener("click", () => showPage("main"));
  $("btn-cancel-edit").addEventListener("click", () => showPage("main"));

  // 类型选项卡
  $("type-tabs").addEventListener("click", e => {
    const tab = e.target.closest(".type-tab");
    if (tab) setScheme(tab.dataset.scheme);
  });

  // 颜色选择
  $("color-picker").addEventListener("click", e => {
    const opt = e.target.closest(".color-option");
    if (opt) setColor(opt.dataset.color);
  });

  // 保存代理
  $("edit-form").addEventListener("submit", saveProfile);

  // 规则页事件
  $("btn-add-rule").addEventListener("click", () => openRuleModal());
  $("btn-close-rule-modal").addEventListener("click", closeRuleModal);
  $("btn-cancel-rule").addEventListener("click", closeRuleModal);
  $("rule-modal").addEventListener("click", e => {
    if (e.target === $("rule-modal")) closeRuleModal();
  });
  $("rule-form").addEventListener("submit", saveRule);

  // 规则列表事件委托
  $("rule-list").addEventListener("click", e => {
    const toggle = e.target.closest(".rule-toggle");
    const editBtn = e.target.closest(".btn-edit-rule");
    const delBtn = e.target.closest(".btn-delete-rule");
    if (toggle) toggleRule(toggle.dataset.id);
    if (editBtn) openRuleModal(editBtn.dataset.id);
    if (delBtn) deleteRule(delBtn.dataset.id);
  });

  // 默认代理变更
  $("default-profile-select").addEventListener("change", e => {
    const defaultRule = state.rules.find(r => r.isDefault);
    if (defaultRule) {
      defaultRule.profileId = e.target.value;
    } else {
      state.rules.push({
        id: "default",
        isDefault: true,
        profileId: e.target.value,
        enabled: true
      });
    }
    saveRules();
  });

  // ---- 设置页功能 ----

  // 导出配置
  $("settings-export").addEventListener("click", () => {
    const data = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      profiles: state.profiles.filter(p => !p.isBuiltin),
      rules: state.rules
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ivy-proxy-switch-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 导入配置
  $("settings-import").addEventListener("click", () => {
    $("import-file").click();
  });

  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.profiles) throw new Error("格式不正确");

      const newProfiles = [
        ...state.profiles.filter(p => p.isBuiltin),
        ...data.profiles
      ];
      state.profiles = newProfiles;
      if (data.rules) state.rules = data.rules;

      await chrome.storage.local.set({ profiles: state.profiles, rules: state.rules });
      alert(`✅ 导入成功！共导入 ${data.profiles.length} 个配置`);
      showPage("main");
      renderMain();
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  });

  // 清除所有数据
  $("settings-clear").addEventListener("click", async () => {
    if (!confirm("⚠️ 确定要清除所有代理配置和规则吗？此操作不可恢复！")) return;
    const builtins = state.profiles.filter(p => p.isBuiltin);
    state.profiles = builtins;
    state.rules = [];
    state.activeProfileId = "direct";
    await chrome.storage.local.set({
      profiles: state.profiles,
      rules: state.rules,
      activeProfileId: "direct"
    });
    await chrome.runtime.sendMessage({ type: "APPLY_PROXY", profileId: "direct" });
    showPage("main");
    renderMain();
  });
}

// 启动
init();

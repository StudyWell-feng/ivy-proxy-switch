// =============================================
// Ivy Proxy Switch - Background Service Worker
// =============================================

const DEFAULT_PROFILES = [
  {
    id: "direct",
    name: "直连",
    type: "direct",
    color: "#4caf50",
    icon: "🌐",
    isBuiltin: true
  },
  {
    id: "system",
    name: "系统代理",
    type: "system",
    color: "#2196f3",
    icon: "💻",
    isBuiltin: true
  }
];

// 初始化存储
async function initStorage() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId", "rules"]);
  
  if (!data.profiles) {
    await chrome.storage.local.set({
      profiles: DEFAULT_PROFILES,
      activeProfileId: "direct",
      rules: []
    });
  }
}

// 应用代理配置
async function applyProxy(profileId) {
  const data = await chrome.storage.local.get(["profiles", "rules"]);
  const profiles = data.profiles || DEFAULT_PROFILES;
  const rules = data.rules || [];
  
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return { success: false, error: "配置不存在" };

  try {
    let config;

    if (profile.type === "direct") {
      config = { mode: "direct" };
    } else if (profile.type === "system") {
      config = { mode: "system" };
    } else if (profile.type === "auto") {
      // PAC 脚本模式（规则分流）
      const pacScript = buildPACScript(profiles, rules);
      config = {
        mode: "pac_script",
        pacScript: { data: pacScript }
      };
    } else {
      // HTTP / HTTPS / SOCKS5
      const proxyRules = buildProxyRules(profile);
      config = {
        mode: "fixed_servers",
        rules: proxyRules
      };
    }

    await chrome.proxy.settings.set({
      value: config,
      scope: "regular"
    });

    await chrome.storage.local.set({ activeProfileId: profileId });
    updateIcon(profile);
    
    return { success: true, profile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 构建代理规则
function buildProxyRules(profile) {
  const server = {
    scheme: profile.scheme || "http",
    host: profile.host,
    port: parseInt(profile.port)
  };

  const rules = { singleProxy: server };

  // 绕过列表
  if (profile.bypass && profile.bypass.length > 0) {
    rules.bypassList = profile.bypass.filter(b => b.trim() !== "");
  }

  return rules;
}

// 构建 PAC 脚本（支持规则分流）
function buildPACScript(profiles, rules) {
  const lines = ['function FindProxyForURL(url, host) {'];

  // 按规则匹配
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    const profile = profiles.find(p => p.id === rule.profileId);
    if (!profile) continue;

    const proxyStr = getProxyString(profile);
    const condition = buildRuleCondition(rule);
    
    if (condition) {
      lines.push(`  // ${rule.name || rule.pattern}`);
      lines.push(`  if (${condition}) return "${proxyStr}";`);
    }
  }

  // 默认规则
  const defaultProfileId = rules.find(r => r.isDefault)?.profileId || "direct";
  const defaultProfile = profiles.find(p => p.id === defaultProfileId);
  const defaultProxy = getProxyString(defaultProfile || { type: "direct" });
  
  lines.push(`  return "${defaultProxy}";`);
  lines.push('}');
  
  return lines.join('\n');
}

function buildRuleCondition(rule) {
  if (rule.matchType === "domain") {
    const escaped = rule.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return `shExpMatch(host, "${rule.pattern}")`;
  } else if (rule.matchType === "url") {
    return `shExpMatch(url, "${rule.pattern}")`;
  } else if (rule.matchType === "ip") {
    return `isInNet(dnsResolve(host), "${rule.network}", "${rule.mask}")`;
  }
  return null;
}

function getProxyString(profile) {
  if (!profile || profile.type === "direct") return "DIRECT";
  if (profile.type === "system") return "DIRECT";
  
  const scheme = profile.scheme || "http";
  if (scheme === "socks5") {
    return `SOCKS5 ${profile.host}:${profile.port}`;
  } else if (scheme === "socks4") {
    return `SOCKS ${profile.host}:${profile.port}`;
  }
  return `PROXY ${profile.host}:${profile.port}`;
}

// 更新插件图标颜色
function updateIcon(profile) {
  // 根据激活的配置更新 badge
  const badgeText = profile.type === "direct" ? "" : "ON";
  const badgeColor = profile.color || "#666";
  
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  chrome.action.setTitle({ title: `Ivy Proxy Switch - ${profile.name}` });
}

// 获取当前激活配置
async function getActiveProfile() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId"]);
  const profiles = data.profiles || DEFAULT_PROFILES;
  const activeId = data.activeProfileId || "direct";
  return profiles.find(p => p.id === activeId) || profiles[0];
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "APPLY_PROXY") {
    applyProxy(message.profileId).then(sendResponse);
    return true; // 异步响应
  }
  
  if (message.type === "GET_ACTIVE_PROFILE") {
    getActiveProfile().then(sendResponse);
    return true;
  }
  
  if (message.type === "SAVE_PROFILES") {
    chrome.storage.local.set({ profiles: message.profiles }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === "SAVE_RULES") {
    chrome.storage.local.set({ rules: message.rules }).then(async () => {
      // 如果当前是自动模式，重新应用
      const data = await chrome.storage.local.get("activeProfileId");
      if (data.activeProfileId === "auto") {
        await applyProxy("auto");
      }
      sendResponse({ success: true });
    });
    return true;
  }
});

// 插件安装/更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  await initStorage();
  
  if (details.reason === "install") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "../icons/icon48.png",
      title: "Ivy Proxy Switch 已安装",
      message: "点击工具栏图标开始配置代理 🎉"
    });
  }
});

// 启动时恢复代理状态
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get("activeProfileId");
  if (data.activeProfileId) {
    await applyProxy(data.activeProfileId);
  }
});

// 初始化
initStorage();

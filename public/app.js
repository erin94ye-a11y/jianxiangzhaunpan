const codeForm = document.querySelector("#codeForm");
const codeInput = document.querySelector("#codeInput");
const message = document.querySelector("#message");
const welcomeStage = document.querySelector("#welcomeStage");
const wheelStage = document.querySelector("#wheelStage");
const wheel = document.querySelector("#wheel");
const spinButton = document.querySelector("#spinButton");
const campaignTitle = document.querySelector("#campaignTitle");
const resultPanel = document.querySelector("#resultPanel");
const resultImage = document.querySelector("#resultImage");
const resultName = document.querySelector("#resultName");

const segmentColors = [
  "#e11d48",
  "#f97316",
  "#f59e0b",
  "#ef4444",
  "#fb7185",
  "#facc15",
  "#ea580c",
  "#f43f5e",
  "#d97706"
];

const VISITOR_TOKEN_STORAGE_KEY = "jump_quantum_visitor_token";

let activeCampaign = null;
let currentRotation = 0;
let isSpinning = false;
let visitorToken = readStoredVisitorToken();

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultPanel.classList.add("is-hidden");

  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    codeInput.setAttribute("aria-invalid", "true");
    codeInput.focus();
    setMessage("Ingresa tu código.", "error");
    return;
  }

  codeInput.removeAttribute("aria-invalid");
  setMessage("Verificando tu código...", "");

  try {
    await reportVisitor({ code });
    const response = await fetch(`/api/public/campaigns/${encodeURIComponent(code)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Este código no está disponible.");
    }

    activeCampaign = data.campaign;
    renderCampaign(activeCampaign);
    setMessage("Código verificado. Tu giro está listo.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

spinButton.addEventListener("click", async () => {
  if (!activeCampaign || isSpinning) {
    return;
  }

  isSpinning = true;
  spinButton.disabled = true;
  resultPanel.classList.add("is-hidden");
  setMessage("Girando...", "");

  try {
    const response = await fetch("/api/public/draw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: activeCampaign.code,
        visitor_token: visitorToken
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo completar el sorteo. Inténtalo de nuevo.");
    }
    if (data.visitor_token) {
      storeVisitorToken(data.visitor_token);
    }

    spinToPrize(data.prize, data.campaign);
  } catch (error) {
    setMessage(error.message, "error");
    spinButton.disabled = false;
    isSpinning = false;
  }
});

async function bootPublicPage() {
  await loadPrizePool();
  const initialCode = new URLSearchParams(window.location.search).get("code");
  if (initialCode) {
    codeInput.value = initialCode.trim().toUpperCase();
    codeForm.requestSubmit();
  }
}

async function reportVisitor(details = {}) {
  try {
    const visitorInfo = await collectVisitorInfo();
    const response = await fetch("/api/public/visits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        visitor_token: visitorToken,
        ...visitorInfo,
        ...details
      })
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    if (data.visitor_token) {
      storeVisitorToken(data.visitor_token);
    }
  } catch {
    // Visitor logging must never block the prize wheel experience.
  }
}

async function collectVisitorInfo() {
  const userAgent = navigator.userAgent || "";
  const language = navigator.language || navigator.languages?.[0] || "";
  let userAgentData = {};

  if (navigator.userAgentData?.getHighEntropyValues) {
    try {
      userAgentData = await navigator.userAgentData.getHighEntropyValues([
        "model",
        "platform",
        "platformVersion"
      ]);
    } catch {
      userAgentData = navigator.userAgentData || {};
    }
  }

  return {
    device_model: detectDeviceModel(userAgentData, userAgent),
    device_type: detectDeviceType(userAgentData, userAgent),
    system: detectSystem(userAgentData, userAgent),
    language
  };
}

function detectDeviceModel(userAgentData, userAgent) {
  if (userAgentData.model) {
    return userAgentData.model;
  }

  if (/iPhone/i.test(userAgent)) {
    return "iPhone";
  }
  if (/iPad/i.test(userAgent)) {
    return "iPad";
  }

  const androidModel = userAgent.match(/Android [^;)]*;\s*([^;)]+?)\s+Build/i);
  if (androidModel?.[1]) {
    return androidModel[1].trim();
  }

  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return "Mac";
  }
  if (/Windows/i.test(userAgent)) {
    return "Windows PC";
  }
  if (/Linux/i.test(userAgent)) {
    return "Linux Device";
  }

  return "Unknown";
}

function detectDeviceType(userAgentData, userAgent) {
  if (/iPad|Tablet/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) {
    return "Tablet";
  }

  if (userAgentData.mobile || /Mobi|Android|iPhone|iPod/i.test(userAgent)) {
    return "Mobile";
  }

  return "Desktop";
}

function detectSystem(userAgentData, userAgent) {
  const platform = userAgentData.platform || navigator.platform || "";

  const ios = userAgent.match(/(?:iPhone|iPad|iPod).*OS ([\d_]+)/i);
  if (ios?.[1]) {
    return `iOS ${ios[1].replace(/_/g, ".")}`;
  }

  const android = userAgent.match(/Android ([\d.]+)/i);
  if (android?.[1]) {
    return `Android ${android[1]}`;
  }

  const windows = userAgent.match(/Windows NT ([\d.]+)/i);
  if (windows?.[1]) {
    return windows[1] === "10.0" ? "Windows 10/11" : `Windows ${windows[1]}`;
  }

  const mac = userAgent.match(/Mac OS X ([\d_]+)/i);
  if (mac?.[1]) {
    return `macOS ${mac[1].replace(/_/g, ".")}`;
  }

  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return platform || "Unknown";
}

function readStoredVisitorToken() {
  try {
    return window.localStorage.getItem(VISITOR_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeVisitorToken(value) {
  visitorToken = value;
  try {
    window.localStorage.setItem(VISITOR_TOKEN_STORAGE_KEY, value);
  } catch {
    // Some embedded browsers disable local storage.
  }
}

async function loadPrizePool() {
  try {
    const response = await fetch("/api/public/prizes");
    const data = await response.json();
    if (!response.ok || !data.prizes?.length) {
      renderStaticPrizePool(defaultPrizePool());
      return;
    }

    renderStaticPrizePool(data.prizes);
  } catch {
    renderStaticPrizePool(defaultPrizePool());
  }
}

function renderStaticPrizePool(prizes) {
  activeCampaign = null;
  campaignTitle.textContent = "Ruleta de premios";
  welcomeStage.classList.add("is-hidden");
  wheelStage.classList.remove("is-hidden");
  spinButton.disabled = true;
  spinButton.textContent = "Ingresa código";
  renderWheel(prizes);
}

function renderCampaign(campaign) {
  activeCampaign = campaign;
  const remaining = Math.max(0, campaign.max_uses - campaign.used_count);
  campaignTitle.textContent = "Ruleta de premios";
  welcomeStage.classList.add("is-hidden");
  wheelStage.classList.remove("is-hidden");
  spinButton.disabled = remaining <= 0;
  spinButton.textContent = remaining <= 0 ? "Ya usado" : "Girar ahora";
  isSpinning = false;

  const prizes = campaign.prizes.length ? campaign.prizes : [{ name: "Aún no hay premios" }];
  renderWheel(prizes);
}

function renderWheel(prizes) {
  const slice = 360 / prizes.length;
  const dense = prizes.length >= 7;
  const crowded = prizes.length >= 9;
  const gradient = prizes
    .map((_, index) => {
      const color = segmentColors[index % segmentColors.length];
      return `${color} ${index * slice}deg ${(index + 1) * slice}deg`;
    })
    .join(", ");

  wheel.style.background = `conic-gradient(from -90deg, ${gradient})`;
  wheel.classList.toggle("is-dense", dense);
  wheel.classList.toggle("is-crowded", crowded);
  wheel.innerHTML = "";

  const wheelLayout = getWheelLayout();
  prizes.forEach((prize, index) => {
    const angle = index * slice + slice / 2 - 90;

    if (prize.image_url) {
      const imageMetrics = getWheelImageMetrics(prizes.length, angle, wheelLayout);
      const imageFrame = document.createElement("span");
      imageFrame.className = "wheel-prize-image";
      imageFrame.style.setProperty("--wheel-image-size", `${imageMetrics.size}px`);
      imageFrame.style.left = `${imageMetrics.x}px`;
      imageFrame.style.top = `${imageMetrics.y}px`;

      const image = document.createElement("img");
      image.src = prize.image_url;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      imageFrame.append(image);
      wheel.append(imageFrame);
    }

    const label = document.createElement("div");
    label.className = "wheel-label";
    const labelMetrics = getWheelLabelMetrics(prize.name, prizes.length, angle, slice, wheelLayout);
    label.style.setProperty("--label-width", `${labelMetrics.width}px`);
    label.style.setProperty("--label-height", `${labelMetrics.height}px`);
    label.style.setProperty("--label-x", `${labelMetrics.x}px`);
    label.style.setProperty("--label-y", `${labelMetrics.y}px`);
    label.style.setProperty("--label-clip", labelMetrics.clipPath);
    label.style.setProperty("--label-text-rotation", `${labelMetrics.textRotation}deg`);
    label.style.setProperty("--label-font-size", `${labelMetrics.fontSize}px`);
    label.style.setProperty("--label-line-gap", `${labelMetrics.lineGap}px`);
    label.style.setProperty("--label-line-height", labelMetrics.lineHeight);
    label.classList.toggle("is-flipped", labelMetrics.isFlipped);

    const name = document.createElement("span");
    name.className = "wheel-label-text";
    for (const line of labelMetrics.lines) {
      const lineNode = document.createElement("span");
      lineNode.className = "wheel-label-line";
      lineNode.textContent = line;
      name.append(lineNode);
    }
    label.append(name);
    wheel.append(label);
  });
}

function getWheelLayout() {
  const wheelRect = wheel.getBoundingClientRect();
  const wheelSize = wheelRect.width || wheel.offsetWidth || wheel.clientWidth || 320;
  const wheelRadius = wheelSize / 2;

  return {
    wheelRadius
  };
}

const WHEEL_LABEL_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
let wheelLabelMeasureContext = null;

function getWheelLabelMetrics(name, prizeCount, angle, slice, layout) {
  const wheelRadius = layout.wheelRadius;
  const bounds = getWheelLabelBounds(prizeCount, slice, wheelRadius);
  const lines = getAdaptiveWheelLabelLines(name, bounds, prizeCount);
  const fontSize = getAdaptiveWheelLabelFontSize(lines, bounds);
  const labelRadius = Math.round(wheelRadius * bounds.centerRadiusScale);
  const radians = (angle * Math.PI) / 180;
  const clipPath = getWheelSegmentClipPath(angle, slice, bounds);
  const normalizedAngle = normalizeDegrees(angle);
  const isFlipped = normalizedAngle > 90 && normalizedAngle < 270;

  return {
    clipPath,
    fontSize,
    height: Math.round(bounds.height),
    isFlipped,
    lineGap: bounds.lineGap,
    lineHeight: bounds.lineHeight,
    lines,
    textRotation: Number((isFlipped ? angle + 180 : angle).toFixed(3)),
    width: Math.round(bounds.width),
    x: Math.round(wheelRadius + Math.cos(radians) * labelRadius),
    y: Math.round(wheelRadius + Math.sin(radians) * labelRadius)
  };
}

function getWheelLabelBounds(prizeCount, slice, wheelRadius) {
  const crowded = prizeCount >= 9;
  const dense = prizeCount >= 7;
  const innerRadiusScale = crowded ? 0.31 : dense ? 0.29 : 0.27;
  const outerRadiusScale = crowded ? 0.9 : dense ? 0.92 : 0.91;
  const paddingDegrees = crowded ? 2.8 : dense ? 2.6 : 2;
  const centerRadiusScale = Number(((innerRadiusScale + outerRadiusScale) / 2).toFixed(3));
  const usableAngle = Math.max(8, slice - paddingDegrees * 2);
  const radialPadding = Math.max(7, wheelRadius * 0.035);
  const tangentPadding = Math.max(4, wheelRadius * 0.02);
  const width = Math.max(54, (outerRadiusScale - innerRadiusScale) * wheelRadius - radialPadding);
  const height = Math.max(
    36,
    2 * wheelRadius * centerRadiusScale * Math.sin(((usableAngle / 2) * Math.PI) / 180) - tangentPadding
  );

  return {
    centerRadiusScale,
    height,
    innerRadiusScale,
    lineGap: Math.max(1, Math.round(wheelRadius * 0.006)),
    lineHeight: 0.96,
    maxFontSize: getWheelLabelMaxFontSize(prizeCount, wheelRadius),
    outerRadiusScale,
    paddingDegrees,
    width
  };
}

function getWheelLabelMaxFontSize(prizeCount, wheelRadius) {
  if (prizeCount >= 9) {
    return clamp(wheelRadius * 0.066, 10, 13);
  }

  if (prizeCount >= 7) {
    return clamp(wheelRadius * 0.076, 12, 15.5);
  }

  return clamp(wheelRadius * 0.09, 16, 22);
}

function getAdaptiveWheelLabelLines(name, bounds, prizeCount) {
  const label = String(name || "").trim() || "Premio";
  const tokens = getWheelLabelTokens(label);
  if (tokens.length <= 1) {
    return [label];
  }

  const maxLines = Math.min(tokens.length, prizeCount >= 7 ? 4 : 3);
  let bestCandidate = null;

  for (let lineCount = 1; lineCount <= maxLines; lineCount += 1) {
    for (const lines of getWheelLabelLineCandidates(tokens, lineCount)) {
      const fontSize = getAdaptiveWheelLabelFontSize(lines, bounds);
      const measuredWidths = lines.map((line) => measureWheelLabelText(line, fontSize));
      const widestLine = Math.max(...measuredWidths);
      const narrowestLine = Math.min(...measuredWidths);
      const balancePenalty = ((widestLine - narrowestLine) / Math.max(1, bounds.width)) * 0.35;
      const score = fontSize - balancePenalty - lineCount * 0.04;

      if (
        !bestCandidate ||
        score > bestCandidate.score ||
        (Math.abs(score - bestCandidate.score) < 0.05 && lineCount < bestCandidate.lines.length)
      ) {
        bestCandidate = {
          lines,
          score
        };
      }
    }
  }

  return bestCandidate?.lines || [label];
}

function getWheelLabelTokens(label) {
  const rawTokens = label.split(/\s+/).filter(Boolean);
  const tokens = [];
  let groupedTokens = [];

  for (const token of rawTokens) {
    if (groupedTokens.length > 0) {
      groupedTokens.push(token);
      if (token.endsWith(")")) {
        tokens.push(groupedTokens.join(" "));
        groupedTokens = [];
      }
      continue;
    }

    if (token.startsWith("(") && !token.endsWith(")")) {
      groupedTokens = [token];
      continue;
    }

    tokens.push(token);
  }

  if (groupedTokens.length > 0) {
    tokens.push(groupedTokens.join(" "));
  }

  return tokens;
}

function getWheelLabelLineCandidates(tokens, lineCount) {
  const candidates = [];

  function buildLines(startIndex, currentLines) {
    const remainingLines = lineCount - currentLines.length;
    if (remainingLines === 1) {
      candidates.push([...currentLines, tokens.slice(startIndex).join(" ")]);
      return;
    }

    const latestEndIndex = tokens.length - remainingLines + 1;
    for (let endIndex = startIndex + 1; endIndex <= latestEndIndex; endIndex += 1) {
      buildLines(endIndex, [...currentLines, tokens.slice(startIndex, endIndex).join(" ")]);
    }
  }

  buildLines(0, []);

  return candidates;
}

function getWheelSegmentClipPath(angle, slice, options) {
  const start = angle - slice / 2 + options.paddingDegrees;
  const end = angle + slice / 2 - options.paddingDegrees;
  const outerStart = getClipPathPoint(start, options.outerRadiusScale);
  const outerCenter = getClipPathPoint(angle, options.outerRadiusScale);
  const outerEnd = getClipPathPoint(end, options.outerRadiusScale);
  const innerEnd = getClipPathPoint(end, options.innerRadiusScale);
  const innerCenter = getClipPathPoint(angle, options.innerRadiusScale);
  const innerStart = getClipPathPoint(start, options.innerRadiusScale);

  return `polygon(${formatClipPoint(outerStart)}, ${formatClipPoint(outerCenter)}, ${formatClipPoint(outerEnd)}, ${formatClipPoint(innerEnd)}, ${formatClipPoint(innerCenter)}, ${formatClipPoint(innerStart)})`;
}

function getClipPathPoint(angle, radiusScale) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Number((50 + Math.cos(radians) * 50 * radiusScale).toFixed(3)),
    y: Number((50 + Math.sin(radians) * 50 * radiusScale).toFixed(3))
  };
}

function formatClipPoint(point) {
  return `${point.x}% ${point.y}%`;
}

function getAdaptiveWheelLabelFontSize(lines, bounds) {
  let low = 6.5;
  let high = bounds.maxFontSize;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const middle = (low + high) / 2;
    if (doesWheelLabelFit(lines, bounds, middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return Number(low.toFixed(2));
}

function doesWheelLabelFit(lines, bounds, fontSize) {
  const widestLine = Math.max(...lines.map((line) => measureWheelLabelText(line, fontSize)));
  const textHeight = lines.length * fontSize * bounds.lineHeight + Math.max(0, lines.length - 1) * bounds.lineGap;

  return widestLine <= bounds.width && textHeight <= bounds.height;
}

function measureWheelLabelText(text, fontSize) {
  const context = getWheelLabelMeasureContext();
  if (!context) {
    return text.length * fontSize * 0.58;
  }

  context.font = `900 ${fontSize}px ${WHEEL_LABEL_FONT_FAMILY}`;
  return context.measureText(text).width;
}

function getWheelLabelMeasureContext() {
  if (wheelLabelMeasureContext) {
    return wheelLabelMeasureContext;
  }

  const canvas = document.createElement("canvas");
  wheelLabelMeasureContext = canvas.getContext("2d");

  return wheelLabelMeasureContext;
}

function getWheelImageMetrics(prizeCount, angle, layout) {
  const wheelRadius = layout.wheelRadius;
  const crowded = prizeCount >= 9;
  const imageSize = Math.round(
    clamp(wheelRadius * (crowded ? 0.34 : 0.36), crowded ? 60 : 64, crowded ? 78 : 90)
  );
  const maximumOffset = Math.max(wheelRadius * 0.45, wheelRadius - imageSize * 0.62 - 10);
  const centerOffset = Math.round(
    Math.min(Math.max(wheelRadius * (crowded ? 0.55 : 0.58), wheelRadius * 0.45), maximumOffset)
  );
  const radians = (angle * Math.PI) / 180;

  return {
    size: imageSize,
    x: Math.round(wheelRadius + Math.cos(radians) * centerOffset),
    y: Math.round(wheelRadius + Math.sin(radians) * centerOffset)
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function spinToPrize(prize, updatedCampaign) {
  const prizes = activeCampaign.prizes;
  const targetRotation = getSpinRotation(prizes, prize, currentRotation);

  currentRotation = targetRotation;
  wheel.style.transform = `rotate(${currentRotation}deg)`;

  window.setTimeout(() => {
    resultName.textContent = prize.name;
    if (prize.image_url) {
      resultImage.src = prize.image_url;
      resultImage.classList.remove("is-hidden");
    } else {
      resultImage.removeAttribute("src");
      resultImage.classList.add("is-hidden");
    }
    resultPanel.classList.remove("is-hidden");
    renderCampaign(updatedCampaign);
    wheel.style.transform = `rotate(${currentRotation}deg)`;
    setMessage("Giro completado.", "success");
  }, 4200);
}

function getSpinRotation(prizes, prize, rotation) {
  const selectedIndex = Math.max(
    0,
    prizes.findIndex((item) => item.id === prize.id || item.name === prize.name)
  );
  const slice = 360 / prizes.length;
  const segmentCenter = selectedIndex * slice + slice / 2;
  const desiredRotation = normalizeDegrees(-segmentCenter);
  const normalizedRotation = normalizeDegrees(rotation);
  const delta = normalizeDegrees(desiredRotation - normalizedRotation);
  return rotation + 2160 + delta;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type || ""}`.trim();
}

function defaultPrizePool() {
  return [
    { name: "Acceso al plan anual + 2.000€ en bonificaciones", image_url: "", available: null },
    { name: "iPhone 17 Pro Max", image_url: "", available: null },
    { name: "Lingote de oro de inversión de 5g", image_url: "", available: null },
    { name: "Cafetera Cecotec", image_url: "", available: null },
    { name: "Libro de formación sobre inversión (a elegir)", image_url: "", available: null },
    { name: "Selección de acciones de alta calidad", image_url: "", available: null },
    { name: "Gracias por participar", image_url: "", available: null }
  ];
}

bootPublicPage();

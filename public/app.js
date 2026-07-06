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
  const labelCanvas = document.createElement("canvas");
  labelCanvas.className = "wheel-label-canvas";
  wheel.append(labelCanvas);

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
  });

  drawWheelLabels(prizes, slice, wheelLayout, labelCanvas);
}

function getWheelLayout() {
  const wheelRect = wheel.getBoundingClientRect();
  const wheelSize = wheel.clientWidth || wheelRect.width || wheel.offsetWidth || 320;
  const wheelRadius = wheelSize / 2;

  return {
    wheelSize,
    wheelRadius
  };
}

const WHEEL_LABEL_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
let wheelLabelMeasureContext = null;

function drawWheelLabels(prizes, slice, layout, canvas) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const wheelSize = Math.round(layout.wheelSize);
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(wheelSize * pixelRatio);
  canvas.height = Math.round(wheelSize * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, wheelSize, wheelSize);

  const debugLabels = [];
  prizes.forEach((prize, index) => {
    const angle = index * slice + slice / 2 - 90;
    const labelMetrics = getWheelLabelMetrics(prize.name, prizes.length, angle, slice, layout);
    drawWheelLabel(context, labelMetrics);
    debugLabels.push({
      angle: labelMetrics.angle,
      blockHeight: Number(labelMetrics.blockHeight.toFixed(2)),
      fontSize: labelMetrics.fontSize,
      labelHeight: Number(labelMetrics.bounds.labelHeight.toFixed(2)),
      labelWidth: Number(labelMetrics.bounds.labelWidth.toFixed(2)),
      lines: labelMetrics.lines,
      prize: prize.name
    });
  });

  canvas.dataset.labelCount = String(debugLabels.length);
  canvas.dataset.minFontSize = String(Math.min(...debugLabels.map((item) => item.fontSize)));
  canvas.dataset.maxBlockRatio = String(
    Math.max(...debugLabels.map((item) => item.blockHeight / Math.max(1, item.labelHeight))).toFixed(3)
  );
  window.__wheelLabelDebug = debugLabels;
}

function getWheelLabelMetrics(name, prizeCount, angle, slice, layout) {
  const wheelRadius = layout.wheelRadius;
  const bounds = getWheelLabelBounds(prizeCount, slice, wheelRadius);
  const lines = getAdaptiveWheelLabelLines(name, bounds, prizeCount);
  const fontSize = getAdaptiveWheelLabelFontSize(lines, bounds);
  const lineHeightPx = fontSize * bounds.lineHeight;
  const blockHeight = lines.length * lineHeightPx + Math.max(0, lines.length - 1) * bounds.lineGap;
  const labelRadius = bounds.centerRadius;
  const radians = (angle * Math.PI) / 180;

  return {
    angle,
    blockHeight,
    bounds,
    fontSize,
    labelRadius,
    lineHeightPx,
    lines,
    slice,
    textRotation: getRadialWheelLabelRotation(angle),
    wheelRadius,
    x: wheelRadius + Math.cos(radians) * labelRadius,
    y: wheelRadius + Math.sin(radians) * labelRadius
  };
}

function getWheelLabelBounds(prizeCount, slice, wheelRadius) {
  const crowded = prizeCount >= 9;
  const dense = prizeCount >= 7;
  const innerRadiusScale = crowded ? 0.42 : dense ? 0.4 : 0.36;
  const outerRadiusScale = crowded ? 0.85 : dense ? 0.87 : 0.88;
  const paddingDegrees = crowded ? 8 : dense ? 7.5 : 5;
  const usableAngle = Math.max(8, slice - paddingDegrees * 2);
  const radialPadding = Math.max(7, wheelRadius * 0.035);
  const tangentPadding = Math.max(8, wheelRadius * 0.052);
  const innerRadius = innerRadiusScale * wheelRadius + radialPadding / 2;
  const outerRadius = outerRadiusScale * wheelRadius - radialPadding / 2;
  const radialLength = Math.max(44, outerRadius - innerRadius);
  const centerRadius = (innerRadius + outerRadius) / 2;
  const labelHeight = Math.max(36, radialLength * 0.76);
  const labelWidth = Math.max(
    30,
    2 * centerRadius * Math.sin(((usableAngle / 2) * Math.PI) / 180) - tangentPadding
  );

  return {
    centerRadius,
    innerRadiusScale,
    innerRadius,
    labelHeight,
    labelWidth,
    lineGap: Math.max(0, Math.round(wheelRadius * 0.002)),
    lineHeight: 0.92,
    maxFontSize: getWheelLabelMaxFontSize(prizeCount, wheelRadius),
    outerRadiusScale,
    outerRadius,
    paddingDegrees,
    radialLength,
    tangentPadding,
    usableAngle,
    wheelRadius
  };
}

function drawWheelLabel(context, metrics) {
  const { angle, blockHeight, bounds, fontSize, lineHeightPx, lines, slice, textRotation, wheelRadius, x, y } = metrics;
  const firstLineY = -blockHeight / 2 + lineHeightPx / 2;

  context.save();
  clipWheelLabelSegment(context, angle, slice, bounds, wheelRadius);
  context.translate(x, y);
  context.rotate((textRotation * Math.PI) / 180);
  context.font = `900 ${fontSize}px ${WHEEL_LABEL_FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.miterLimit = 2;

  lines.forEach((line, index) => {
    const lineY = firstLineY + index * (lineHeightPx + bounds.lineGap);
    context.save();
    context.shadowColor = "rgba(74, 18, 6, 0.5)";
    context.shadowBlur = 3;
    context.shadowOffsetY = 1;
    context.fillStyle = "#fff7d6";
    context.fillText(line, 0, lineY, bounds.labelWidth);
    context.restore();

    context.lineWidth = Math.max(1.2, fontSize * 0.14);
    context.strokeStyle = "rgba(74, 18, 6, 0.86)";
    context.strokeText(line, 0, lineY, bounds.labelWidth);
    context.fillStyle = "#fff7d6";
    context.fillText(line, 0, lineY, bounds.labelWidth);
  });

  context.restore();
}

function clipWheelLabelSegment(context, angle, slice, options, wheelRadius) {
  const start = angle - slice / 2 + options.paddingDegrees;
  const end = angle + slice / 2 - options.paddingDegrees;
  const outerStart = getCanvasPoint(start, options.outerRadius);
  const outerCenter = getCanvasPoint(angle, options.outerRadius);
  const outerEnd = getCanvasPoint(end, options.outerRadius);
  const innerEnd = getCanvasPoint(end, options.innerRadius);
  const innerCenter = getCanvasPoint(angle, options.innerRadius);
  const innerStart = getCanvasPoint(start, options.innerRadius);

  context.beginPath();
  context.moveTo(wheelRadius + outerStart.x, wheelRadius + outerStart.y);
  context.lineTo(wheelRadius + outerCenter.x, wheelRadius + outerCenter.y);
  context.lineTo(wheelRadius + outerEnd.x, wheelRadius + outerEnd.y);
  context.lineTo(wheelRadius + innerEnd.x, wheelRadius + innerEnd.y);
  context.lineTo(wheelRadius + innerCenter.x, wheelRadius + innerCenter.y);
  context.lineTo(wheelRadius + innerStart.x, wheelRadius + innerStart.y);
  context.closePath();
  context.clip();
}

function getRadialWheelLabelRotation(angle) {
  const baseRotation = angle - 90;
  const normalizedRotation = normalizeDegrees(baseRotation);
  const readableRotation =
    normalizedRotation > 90 && normalizedRotation < 270 ? baseRotation + 180 : baseRotation;

  return Number(readableRotation.toFixed(3));
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

  const maxLines = Math.min(tokens.length, prizeCount >= 7 ? 5 : 3);
  let bestCandidate = null;

  for (let lineCount = 1; lineCount <= maxLines; lineCount += 1) {
    for (const lines of getWheelLabelLineCandidates(tokens, lineCount)) {
      const fontSize = getAdaptiveWheelLabelFontSize(lines, bounds);
      const measuredWidths = lines.map((line) => measureWheelLabelText(line, fontSize));
      const widestLine = Math.max(...measuredWidths);
      const narrowestLine = Math.min(...measuredWidths);
      const balancePenalty = ((widestLine - narrowestLine) / Math.max(1, bounds.labelWidth)) * 0.2;
      const score = fontSize - balancePenalty - lineCount * 0.06;

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

    tokens.push(...splitWheelLabelToken(token));
  }

  if (groupedTokens.length > 0) {
    tokens.push(groupedTokens.join(" "));
  }

  return tokens;
}

function splitWheelLabelToken(token) {
  if (token.length < 12 || /[0-9€()+]/.test(token)) {
    return [token];
  }

  const splitIndex = Math.ceil(token.length / 2);
  return [`${token.slice(0, splitIndex)}-`, token.slice(splitIndex)];
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

function getCanvasPoint(angle, radius) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius
  };
}

function getAdaptiveWheelLabelFontSize(lines, bounds) {
  let low = 7.8;
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
  const textHeight = lines.length * fontSize * bounds.lineHeight + Math.max(0, lines.length - 1) * bounds.lineGap;
  const widestLine = Math.max(...lines.map((line) => measureWheelLabelText(line, fontSize)));

  return textHeight <= bounds.labelHeight && widestLine <= bounds.labelWidth;
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
